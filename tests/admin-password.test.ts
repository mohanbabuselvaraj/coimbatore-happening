import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {hashPassword,verifyPassword,passwordError,adminPasswordRoutes,hasAdminSession,ADMIN_IDLE_MS} from '../lib/admin-password.ts';
import {adminRoutes} from '../lib/admin-api.ts';
const headers=new Headers({'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'});
test('passwords accept long Unicode and spaces without truncation; reject short or unbounded input',()=>{
 assert.equal(passwordError('A long local test passphrase 🏞️'),null);assert.equal(passwordError('அ'.repeat(16)),null);
 for(const value of ['short',' '.repeat(20),'a'.repeat(129),null,7])assert.ok(passwordError(value));
});
test('password hashes use independent salts and standard scrypt; wrong passwords fail',async()=>{
 const password='Disposable local unit test passphrase',a=await hashPassword(password),b=await hashPassword(password);assert.notEqual(a,b);assert.ok(!a.includes(password));
 const parts=a.split(':');assert.equal(parts[5],scryptSync(password,parts[4],32,{N:32768,r:8,p:3,maxmem:48*1024*1024}).toString('hex'));
 assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword(password+'x',a),false);assert.equal(await verifyPassword(password,'broken hash'),false);
});
test('password setup and login fail closed before reading storage for any non-owner',async()=>{
 const db=new Proxy({},{get(){throw Error('Unauthorized DB access');}}) as D1Database;
 for(const action of ['setup','login','logout','status']){
  const url=new URL('https://map.test/api/admin/auth/'+action);
  await assert.rejects(()=>adminPasswordRoutes(new Request(url,{method:action==='status'?'GET':'POST'}),url,db,'owner@example.test'),{status:401});
 }
 const url=new URL('https://map.test/api/admin/auth/login');
 await assert.rejects(()=>adminPasswordRoutes(new Request(url,{method:'POST',headers:new Headers([...headers,['Origin','https://other.test']])}),url,db,'owner@example.test'),{status:403});
});
test('an authenticated owner cannot read admin data without a valid password session',async()=>{
 const db={prepare(sql:string){if(sql.includes('FROM admin_credentials'))return {first:async()=>({ownerId:'owner',passwordHash:'not-a-public-secret'})};throw Error('Locked owner reached private entries');}} as unknown as D1Database;
 for(const path of ['/api/admin/overview','/api/admin/posts','/api/admin/session']){const url=new URL('https://map.test'+path);const r=await adminRoutes(new Request(url,{headers}),url,db,'owner@example.test');assert.equal(r.status,401);assert.equal((await r.json() as {code:string}).code,'ADMIN_LOCKED');}
});

test('production logout clears only a Secure host-only HttpOnly strict session cookie',async()=>{
 const url=new URL('https://map.test/api/admin/auth/logout'),h=new Headers(headers);h.set('Origin',url.origin);
 const db=new Proxy({},{get(){throw Error('No cookie must not touch storage');}}) as D1Database;
 const response=await adminPasswordRoutes(new Request(url,{method:'POST',headers:h}),url,db,'owner@example.test');
 assert.equal(response.headers.get('set-cookie'),'__Host-admin-unlock=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure');
 assert.deepEqual(await response.json(),{ok:true});
});
test('session validation is atomic, owner-bound, password-version-bound and expires at the idle boundary',async()=>{
 const now=1800000000000,token='a'.repeat(64);let seen=now-ADMIN_IDLE_MS+1,owner='owner',tag='version';
 const db={prepare(sql:string){assert.match(sql,/UPDATE admin_sessions/);return {bind(...args:unknown[]){const [time,,uid,version,cutoff,expiry]=args as [number,string,string,string,number,number];return {first:async()=>{if(uid!==owner||version!==tag||seen<=cutoff||now+1<=expiry)return null;seen=Math.max(seen,time);return {token_hash:'digest'};}};}};}} as unknown as D1Database;
 const h=new Headers({cookie:'__Host-admin-unlock='+token});assert.equal(await hasAdminSession(h,db,'owner','version',false,now),true);
 seen=now-ADMIN_IDLE_MS;assert.equal(await hasAdminSession(h,db,'owner','version',false,now),false);
 seen=now;owner='someone-else';assert.equal(await hasAdminSession(h,db,'owner','version',false,now),false);
 owner='owner';tag='changed';assert.equal(await hasAdminSession(h,db,'owner','version',false,now),false);
 const noStorage=new Proxy({},{get(){throw Error('Malformed cookie reached storage');}}) as D1Database;
 for(const cookie of ['__Host-admin-unlock=forged','admin_unlock_local='+token,'__Host-admin-unlock='+token+'; __Host-admin-unlock='+token])assert.equal(await hasAdminSession(new Headers({cookie}),noStorage,'owner','version',false,now),false);
});
