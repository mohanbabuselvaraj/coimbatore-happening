import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const count=305,now=Date.now(),ids=[];
await mkdir('work',{recursive:true});
const file='work/pagination-fixtures.sql';
async function sql(text){await writeFile(file,text);const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
const inserts=[];
for(const archive of [false,true])for(let i=0;i<count;i++){
 const id=randomUUID();ids.push(id);
 // Equal timestamps deliberately test the UUID tie-breaker.
 const created=archive?now-8*86400000:now;
 inserts.push(`INSERT INTO posts (id,kind,body,place,lng,lat,created_at,delete_hash) VALUES ('${id}','note','Disposable pagination fixture.','Pagination test',76.96,11.01,${created},'not-a-real-author-key');`);
}
try{
 await sql(inserts.join('\n'));
 for(const archive of [false,true]){
  let cursor=null,pages=0;const found=new Set();
  do{const response=await fetch(`http://127.0.0.1:5173/api/posts?archive=${archive?1:0}${cursor?'&cursor='+encodeURIComponent(cursor):''}`);assert.equal(response.status,200);const data=await response.json();for(const post of data.posts){if(ids.includes(post.id)){assert.ok(!found.has(post.id),'Duplicate post between pages');found.add(post.id);}}cursor=data.nextCursor;pages++;assert.ok(pages<12,'Cursor did not terminate');}while(cursor);
  assert.equal(found.size,count);console.log(`PASS: ${archive?'Archive':'Current'} retrieves all ${count} tied-timestamp fixtures in ${pages} pages, including posts beyond the former 300-post cutoff.`);
 }
 const invalid=await fetch('http://127.0.0.1:5173/api/posts?cursor=invalid');assert.equal(invalid.status,400);
 if(process.argv.includes('--hold')){
  console.log('Pagination fixtures ready for UI capture. Send a newline to clean up.');
  process.stdin.resume();await new Promise(resolve=>process.stdin.once('data',resolve));process.stdin.pause();
 }
}finally{
 for(let i=0;i<ids.length;i+=100)await sql(`DELETE FROM posts WHERE id IN (${ids.slice(i,i+100).map(id=>`'${id}'`).join(',')});`);
 await unlink(file);
 console.log('Disposable pagination fixtures removed.');
}
