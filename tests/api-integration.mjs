import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const base='http://127.0.0.1:5173';
const key=()=>randomBytes(24).toString('hex');
async function call(path,body,expected=200,headers={}){
 const response=await fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}:undefined);
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={error:text};}assert.equal(response.status,expected,JSON.stringify(data));return data;
}
const created=[];
try{
 for(const body of ['Call 9876543210','nine eight seven six five four three two one zero','9a8b7c6d5e4f3g2h1i0','ஒன்பது எட்டு ஏழு ஆறு ஐந்து நான்கு மூன்று இரண்டு ஒன்று பூஜ்யம்'])
   await call('/api/posts',{kind:'note',body,place:'Local test place',lng:76.96,lat:11.01,deleteToken:key()},400);
 await call('/api/posts',{kind:'note',body:'Testing a cross origin request.',place:'Local test place',lng:76.96,lat:11.01,deleteToken:key()},403,{Origin:'https://example.org'});
 const deletion=key();const {post}=await call('/api/posts',{kind:'note',body:'Local verification post. This will be removed.',place:'Local test place',lng:76.96,lat:11.01,deleteToken:deletion},201);created.push({id:post.id,token:deletion});
 assert.ok((await call('/api/posts')).posts.some(p=>p.id===post.id));
 const vote=key();assert.equal((await call(`/api/posts/${post.id}/vote`,{token:vote})).votes,1);
 assert.equal((await call(`/api/posts/${post.id}/vote`,{token:vote})).votes,1);
 await call(`/api/posts/${post.id}/delete`,{token:key()},403);
 await call(`/api/posts/${post.id}/report`,{token:key(),reason:'spam'});
 const cutoff=Date.now()-8*86400000;
 const command=`UPDATE posts SET created_at=${cutoff} WHERE id='${post.id}'`;
 const migration=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',command],{encoding:'utf8'});
 assert.equal(migration.status,0,migration.stderr);
 assert.ok((await call('/api/posts?archive=1')).posts.some(p=>p.id===post.id));
 assert.ok(!(await call('/api/posts')).posts.some(p=>p.id===post.id));
 for(let i=1;i<10;i++)await call(`/api/posts/${post.id}/vote`,{token:key()});
 assert.ok((await call('/api/posts')).posts.some(p=>p.id===post.id&&p.votes===10));
 assert.ok(!(await call('/api/posts?archive=1')).posts.some(p=>p.id===post.id));
 const ist=ms=>new Date(ms+19800000).toISOString().slice(0,16);
 const eventToken=key();const event=await call('/api/posts',{kind:'event',body:'Local event verification. This will be removed.',place:'Local test place',lng:76.96,lat:11.01,startsAt:ist(Date.now()+3600000),endsAt:ist(Date.now()+7200000),deleteToken:eventToken},201);created.push({id:event.post.id,token:eventToken});
 assert.ok(event.post.endsAt>event.post.startsAt);
 console.log('PASS: server phone checks, cross-origin rejection, shared posts, idempotent votes, reports, author deletion, archive, retention threshold, and IST event creation.');
}finally{
 for(const post of created){try{await call(`/api/posts/${post.id}/delete`,{token:post.token});}catch(error){console.error('Local test cleanup failed:',error.message);process.exitCode=1;}}
}
