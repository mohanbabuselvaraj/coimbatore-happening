import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const base='http://127.0.0.1:5173',now=Date.now(),ids=Array.from({length:32},()=>randomUUID()),file='work/admin-fixtures.sql';
await mkdir('work',{recursive:true});
async function sql(text){await writeFile(file,text);const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
async function call(path,{body,status=200,auth=true,headers={}}={}){const r=await fetch(base+path,{headers:{...(auth?{Cookie:'__sites_local_auth=1; '+(process.env.LOCAL_ADMIN_UNLOCK_COOKIE??'')}:{}),...body?{'Content-Type':'application/json',Origin:base}:{},...headers},...body?{method:'POST',body:JSON.stringify(body)}:{}});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={error:text};}assert.equal(r.status,status,JSON.stringify(data));assert.doesNotMatch(JSON.stringify(data),/delete_hash|deleteHash|token_hash|tokenHash|actor_id|actorId|local_seedy/);return data;}
const seed=ids.map((id,i)=>`INSERT INTO posts(id,kind,body,place,lng,lat,created_at,starts_at,ends_at,delete_hash) VALUES('${id}','${i===1?'event':'note'}','Local dashboard test entry. Nothing here is a real community post.','${i===0?'Racecourse · local test':i===1?'Town Hall · ended event':i===2?'கோயம்புத்தூர் — உள்ளூர் சோதனை':i===3?'Ortho One Orthopaedic Speciality Center(A Unit Of Spine Arthroscopic and Joint Replacement Center Pvt Ltd)':'Dashboard test place'}',76.97756,11.00108,${now-i*1000},${i===1?now-7200000:'NULL'},${i===1?now-3600000:'NULL'},'disposable-key');`);
seed.push(`INSERT INTO reports(post_id,token_hash,reason,created_at) VALUES('${ids[0]}','disposable-report','spam',${now});`);
try{
 await sql(seed.join('\n'));
 for(const path of ['/api/admin/session','/api/admin/posts',`/api/admin/posts/${ids[0]}`,`/api/admin/posts/${ids[0]}/history`])await call(path,{auth:false,status:401});
 await call('/api/admin/posts',{auth:false,status:401,headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'seedy@sites.test'}});
 await call(`/api/admin/posts/${ids[0]}/change`,{auth:false,status:401,body:{action:'hide',revision:0}});
 await call(`/api/admin/posts/${ids[0]}/change`,{status:403,body:{action:'hide',revision:0},headers:{Origin:'https://evil.test'}});
 const list=await call('/api/admin/posts?q=dashboard');assert.ok(list.total>=31);assert.equal(list.posts.length,25);assert.ok(list.nextCursor);
 const next=await call('/api/admin/posts?q=dashboard&cursor='+encodeURIComponent(list.nextCursor));assert.ok(!next.posts.some(p=>list.posts.some(q=>q.id===p.id)));
 let detail=await call(`/api/admin/posts/${ids[0]}`);
 await call(`/api/admin/posts/${ids[0]}/change`,{status:422,body:{action:'edit',revision:0,place:'Racecourse',body:'Call 1234567890',lng:76.97756,lat:11.00108}});
 const draft={action:'edit',revision:0,place:'Racecourse · local test',body:'Everyone is welcome to read near the lake. Local test.',lng:76.97756,lat:11.00108};
 const outcomes=await Promise.all([draft,{...draft,body:'An alternate simultaneous local edit.'}].map(body=>fetch(base+`/api/admin/posts/${ids[0]}/change`,{method:'POST',headers:{Cookie:'__sites_local_auth=1; '+(process.env.LOCAL_ADMIN_UNLOCK_COOKIE??''),'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)})));
 assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
 detail=await call(`/api/admin/posts/${ids[0]}`);assert.equal(detail.history.length,1);assert.equal(detail.post.revision,1);
 await call(`/api/admin/posts/${ids[0]}/change`,{body:{action:'hide',revision:1}});
 assert.deepEqual((await call('/api/posts/revalidate',{auth:false,body:{ids:[ids[0]]}})).posts,[]);
 for(const archive of [0,1]){const result=await call('/api/posts?archive='+archive,{auth:false});assert.ok(!result.posts.some(p=>p.id===ids[0]));}
 await call(`/api/admin/posts/${ids[0]}/change`,{body:{action:'restore',revision:2}});
 assert.ok((await call('/api/posts',{auth:false})).posts.some(p=>p.id===ids[0]));
 assert.equal((await call('/api/posts/revalidate',{auth:false,body:{ids:[ids[0]]}})).posts[0].body,(await call(`/api/admin/posts/${ids[0]}`)).post.body);
 await call('/api/posts/revalidate',{auth:false,status:400,body:{ids:Array(101).fill(ids[0])}});
 await call(`/api/admin/posts/${ids[0]}/change`,{body:{action:'resolve',revision:3}});
 detail=await call(`/api/admin/posts/${ids[0]}`);assert.equal(detail.post.openReports,0);const resolution=detail.history.find(h=>h.action==='resolve');
 await call(`/api/admin/posts/${ids[0]}/change`,{body:{action:'reopen',revision:4,historyId:resolution.id}});
 assert.equal((await call(`/api/admin/posts/${ids[0]}`)).post.openReports,1);
 const editHistory=detail.history.find(h=>h.action==='edit');
 await call(`/api/admin/posts/${ids[0]}/change`,{body:{action:'version',revision:5,historyId:editHistory.id}});
 assert.equal((await call(`/api/admin/posts/${ids[0]}`)).post.body,editHistory.before.body);
 const ist=n=>new Date(n+19800000).toISOString().slice(0,16);
 await call(`/api/admin/posts/${ids[1]}/change`,{body:{action:'edit',revision:0,place:'Town Hall · ended event',body:'Corrected description for a past event. Local test.',lng:76.96,lat:11,startsAt:ist(now-7200000),endsAt:ist(now-3600000)}});
 assert.ok((await call(`/api/admin/posts/${ids[1]}`)).post.archived);
 console.log('PASS: unauthenticated and spoofed identity denial; CSRF; real D1 pagination; validation; concurrent 200/409 atomic edit and audit; persistent hide/restore on public map; reports resolve/reopen; version reversal; historical IST event edit; no internal fields in responses.');
}finally{await sql(`DELETE FROM posts WHERE id IN (${ids.map(id=>`'${id}'`).join(',')});`);await unlink(file);console.log('Disposable admin fixtures removed.');}
