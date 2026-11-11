import {scrypt,timingSafeEqual} from 'node:crypto';
import {adminAccess} from './admin-access.ts';
import {ApiError,json,payload} from './http.ts';
export const ADMIN_IDLE_MS=15*60000,ADMIN_SESSION_MS=8*3600000;
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async(value:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
export function passwordError(value:unknown){return typeof value!=='string'||Array.from(value).length<16||Array.from(value).length>128||new TextEncoder().encode(value).length>512||!value.trim()?'Use a password of 16 to 128 characters.':null;}
// OWASP's 32 MiB scrypt configuration fits the Worker isolate; native crypto
// avoids a slow JavaScript KDF and Cloudflare's native PBKDF2 iteration ceiling.
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:48*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password:string){const salt=random();return `scrypt:32768:8:3:${salt}:${hex(await derive(password,salt))}`;}
export async function verifyPassword(password:string,stored:string){const m=/^scrypt:32768:8:3:([a-f0-9]{64}):([a-f0-9]{64})$/.exec(stored);if(!m)return false;return timingSafeEqual(await derive(password,m[1]),Buffer.from(m[2],'hex'));}
export const adminCookieName=(local=false)=>local?'admin_unlock_local':'__Host-admin-unlock';
const localRequest=(url:URL)=>url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
function cookie(headers:Headers,local=false){const matches=(headers.get('cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(adminCookieName(local)+'='));if(matches.length!==1)return null;const value=matches[0].slice(matches[0].indexOf('=')+1);return /^[a-f0-9]{64}$/.test(value)?value:null;}
function sessionCookie(value:string,local:boolean,clear=false){return `${adminCookieName(local)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:ADMIN_SESSION_MS/1000}${local?'':'; Secure'}`;}
async function credentials(db:D1Database,userId:string){const row=await db.prepare("SELECT owner_id AS ownerId,password_hash AS passwordHash FROM admin_credentials WHERE id='owner'").first<{ownerId:string;passwordHash:string}>();if(row&&row.ownerId!==userId)throw new ApiError('The admin password belongs to a different owner.',403);return row;}
export async function hasAdminSession(headers:Headers,db:D1Database,userId:string,passwordTag:string,local=false,now=Date.now()){
 const token=cookie(headers,local);if(!token)return false;
 const row=await db.prepare('UPDATE admin_sessions SET last_seen_at=MAX(last_seen_at,?) WHERE token_hash=? AND owner_id=? AND password_tag=? AND last_seen_at>? AND expires_at>? RETURNING token_hash').bind(now,await digest(token),userId,passwordTag,now-ADMIN_IDLE_MS,now).first();return !!row;
}
export async function adminPasswordStatus(headers:Headers,db:D1Database,userId:string,local=false){const row=await credentials(db,userId);return {configured:!!row,unlocked:!!row&&await hasAdminSession(headers,db,userId,await digest(row.passwordHash),local)};}
async function attempts(db:D1Database,userId:string){const now=Date.now(),hour=Math.floor(now/3600000);const count=await db.prepare('INSERT INTO budgets(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind('admin-login:'+userId+':'+hour,(hour+1)*3600000).first<{count:number}>();if(!count||count.count>8)throw new ApiError('Too many login attempts. Try again in an hour.',429);}
async function unlock(db:D1Database,userId:string,passwordHash:string,local:boolean){const token=random(),now=Date.now();await db.batch([db.prepare('DELETE FROM admin_sessions WHERE expires_at<=? OR last_seen_at<=?').bind(now,now-ADMIN_IDLE_MS),db.prepare('INSERT INTO admin_sessions(token_hash,owner_id,password_tag,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?)').bind(await digest(token),userId,await digest(passwordHash),now,now,now+ADMIN_SESSION_MS)]);const response=json({ok:true});response.headers.set('Set-Cookie',sessionCookie(token,local));return response;}
// Defense in depth: this endpoint checks platform ownership itself, before database access.
export async function adminPasswordRoutes(request:Request,url:URL,db:D1Database|undefined,ownerEmail:string|undefined){
 const access=adminAccess(request.headers,ownerEmail);if(access.status!==200)throw new ApiError(access.message,access.status);if(!db)throw new ApiError('Administration is temporarily unavailable.',503);
 const local=localRequest(url),action=url.pathname.slice('/api/admin/auth/'.length);
 if(action==='status'&&request.method==='GET')return json(await adminPasswordStatus(request.headers,db,access.userId,local));
 if(request.method!=='POST'||!['setup','login','logout'].includes(action))throw new ApiError('Not found.',404);
 if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')throw new ApiError('Use the admin login form.',403);
 if(action==='logout'){const token=cookie(request.headers,local);if(token)await db.prepare('DELETE FROM admin_sessions WHERE token_hash=? AND owner_id=?').bind(await digest(token),access.userId).run();const response=json({ok:true});response.headers.set('Set-Cookie',sessionCookie('',local,true));return response;}
 await attempts(db,access.userId);const data=await payload(request),error=passwordError(data.password);if(error)throw new ApiError(error,422);
 const existing=await credentials(db,access.userId);let passwordHash=existing?.passwordHash;
 if(action==='setup'){
  if(existing)throw new ApiError('An admin password already exists. Sign in instead.',409);
  passwordHash=await hashPassword(data.password as string);
  const result=await db.prepare("INSERT INTO admin_credentials(id,owner_id,password_hash) VALUES('owner',?,?) ON CONFLICT(id) DO NOTHING").bind(access.userId,passwordHash).run();
  if(!result.meta.changes)throw new ApiError('An admin password was just set. Sign in instead.',409);
 }else if(!existing||!await verifyPassword(data.password as string,existing.passwordHash))throw new ApiError('Password not accepted.',401);
 return unlock(db,access.userId,passwordHash!,local);
}
