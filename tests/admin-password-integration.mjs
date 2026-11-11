import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
const base='http://127.0.0.1:5173',password='Disposable local password test phrase only',file='work/password-fixtures.sql';
let session='',created=false;
await mkdir('work',{recursive:true});
async function sql(query){await writeFile(file,query);const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',file,'--json'],{encoding:'utf8'});assert.equal(r.status,0,'Local database command failed.');return JSON.parse(r.stdout)[0].results;}
async function call(path,{body,status=200,owner=true,unlock=true,origin=base}={}){const r=await fetch(base+path,{headers:{...(owner?{Cookie:'__sites_local_auth=1'+(unlock&&session?'; '+session:'')}:{}),...body?{'Content-Type':'application/json',Origin:origin}:{}},...body?{method:'POST',body:JSON.stringify(body)}:{}});const raw=await r.text();assert.equal(r.status,status,raw);if(status===403&&!r.headers.get('content-type')?.includes('application/json'))return {data:{error:raw},cookie:r.headers.get('set-cookie')};const data=JSON.parse(raw);assert.doesNotMatch(JSON.stringify(data),/passwordHash|password_hash|token_hash|password_tag|local_seedy/);return {data,cookie:r.headers.get('set-cookie')};}
try{
 for(const action of ['status','setup','login','logout'])await call('/api/admin/auth/'+action,{owner:false,status:401,...action==='status'?{}:{body:{password}}});
 const start=await call('/api/admin/auth/status');assert.equal(start.data.configured,false,'This test needs an unconfigured disposable local admin database. Existing passwords are never overwritten.');
 for(const path of ['/api/admin/session','/api/admin/posts','/api/admin/overview'])assert.equal((await call(path,{status:401})).data.code,'ADMIN_LOCKED');
 await call('/api/admin/auth/setup',{body:{password},origin:'https://evil.test',status:403});
 await call('/api/admin/auth/setup',{body:{password:'short'},status:422});
 const outcomes=await Promise.all([0,1].map(()=>fetch(base+'/api/admin/auth/setup',{method:'POST',headers:{Cookie:'__sites_local_auth=1',Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password})})));
 created=outcomes.some(r=>r.status===200);assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
 session=outcomes.find(r=>r.status===200).headers.get('set-cookie').split(';')[0];
 assert.equal((await call('/api/admin/auth/status')).data.unlocked,true);
 assert.match(outcomes.find(r=>r.status===200).headers.get('set-cookie'),/HttpOnly/);assert.match(outcomes.find(r=>r.status===200).headers.get('set-cookie'),/SameSite=Strict/);
 await call('/api/admin/auth/login',{body:{password:password+' wrong'},status:401});
 await call('/api/admin/overview',{owner:false,status:401});
 const child=spawnSync(process.execPath,['tests/admin-integration.mjs'],{encoding:'utf8',env:{...process.env,LOCAL_ADMIN_UNLOCK_COOKIE:session}});assert.equal(child.status,0,child.stdout+'\n'+child.stderr);process.stdout.write(child.stdout);
 const activity=spawnSync(process.execPath,['tests/activity-integration.mjs'],{encoding:'utf8',env:{...process.env,LOCAL_ADMIN_UNLOCK_COOKIE:session}});assert.equal(activity.status,0,activity.stdout+'\n'+activity.stderr);process.stdout.write(activity.stdout);
 await sql(`UPDATE admin_sessions SET last_seen_at=${Date.now()-16*60000} WHERE owner_id='local_seedy';`);
 await call('/api/admin/posts',{status:401});
 session=(await call('/api/admin/auth/login',{body:{password}})).cookie.split(';')[0];await call('/api/admin/session');
 await sql(`UPDATE admin_sessions SET expires_at=${Date.now()-1} WHERE owner_id='local_seedy';`);
 await call('/api/admin/posts',{status:401});
 session=(await call('/api/admin/auth/login',{body:{password}})).cookie.split(';')[0];
 const logout=await call('/api/admin/auth/logout',{body:{}});assert.match(logout.cookie,/Max-Age=0/);await call('/api/admin/overview',{status:401});
 await sql("INSERT INTO budgets(key,count,expires_at) VALUES('admin-login:local_seedy:"+Math.floor(Date.now()/3600000)+"',8,"+(Date.now()+3600000)+") ON CONFLICT(key) DO UPDATE SET count=8;");
 await call('/api/admin/auth/login',{body:{password},status:429});
 console.log('PASS: owner-only password setup, concurrent setup, CSRF, input limits, no password-session bypass, wrong password, persisted unlock, idle expiry, absolute expiry, logout revocation, attempt limits, and no credentials in responses.');
}finally{
 if(created)await sql("DELETE FROM admin_sessions WHERE owner_id='local_seedy'; DELETE FROM admin_credentials WHERE owner_id='local_seedy'; DELETE FROM budgets WHERE key LIKE 'admin-login:local_seedy:%';");
 await unlink(file).catch(()=>{});console.log('Disposable local password and sessions removed.');
}
