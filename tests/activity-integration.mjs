import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,unlink,readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const base='http://127.0.0.1:5173',file='work/activity-fixtures.sql',prefix='test:'+randomUUID()+':';
const index=JSON.parse(await readFile('public/data/places.json','utf8')),place=index.places[0];
await mkdir('work',{recursive:true});
async function sql(query){await writeFile(file,query);const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',file,'--json'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)[0].results;}
async function call(path,{body,status=200,auth=true,headers={}}={}){const r=await fetch(base+path,{headers:{...(auth?{Cookie:'__sites_local_auth=1; '+(process.env.LOCAL_ADMIN_UNLOCK_COOKIE??'')}:{}),...body?{'Content-Type':'application/json',Origin:base}:{},...headers},...body?{method:'POST',body:JSON.stringify(body)}:{}});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={error:text};}assert.equal(r.status,status,JSON.stringify(data));assert.doesNotMatch(JSON.stringify(data),/token_hash|delete_hash|actor_id|local_seedy/);return data;}
const day=new Date(Date.now()+19800000).toISOString().slice(0,10),keys=['@map',place.id,'pin:76.978:11.001'],quoted=keys.map(k=>`'${k}'`).join(',');
const original=await sql(`SELECT * FROM activity_daily WHERE day='${day}' AND location_key IN (${quoted});`),meta=await sql("SELECT * FROM activity_meta WHERE key='started';");
try{
 await call('/api/admin/overview',{auth:false,status:401});
 await call('/api/activity',{auth:false,status:404});
 await call('/api/activity',{auth:false,status:403,body:{type:'visit'},headers:{Origin:'https://evil.test'}});
 await call('/api/activity',{auth:false,status:400,body:{type:'place',placeId:'invented'}});
 const before=await call('/api/admin/overview');
 for(const signal of ['DNT','Sec-GPC'])await call('/api/activity',{auth:false,status:204,body:{type:'visit'},headers:{[signal]:'1'}});
 assert.deepEqual((await call('/api/admin/overview')).totals,before.totals);
 await Promise.all(Array.from({length:8},()=>call('/api/activity',{auth:false,status:204,body:{type:'visit'}})));
 await call('/api/activity',{auth:false,status:204,body:{type:'place',placeId:place.id,place:'ignored text'}});
 await call('/api/activity',{auth:false,status:204,body:{type:'place',lng:76.97756,lat:11.00108}});
 const after=await call('/api/admin/overview');assert.equal(after.totals.visits,before.totals.visits+8);assert.equal(after.totals.placeViews,before.totals.placeViews+2);assert.ok(after.startedAt);assert.equal(after.daily.at(-1).day,day);
 const rows=Array.from({length:23},(_,i)=>`INSERT INTO activity_daily(day,location_key,place,lng,lat,views) VALUES('${day}','${prefix}${String(i).padStart(2,'0')}','Local activity fixture ${i}',76.97,11,${i+1});`);
 await sql(rows.join('\n'));
 const page=await call('/api/admin/overview?q=Local%20activity%20fixture');assert.equal(page.placeTotal,23);assert.equal(page.places.length,20);assert.equal(page.places[0].views,23);assert.equal(page.nextOffset,20);
 const next=await call('/api/admin/overview?q=Local%20activity%20fixture&offset=20');assert.equal(next.places.length,3);assert.equal(next.nextOffset,null);assert.ok(!next.places.some(p=>page.places.some(q=>q.key===p.key)));
 const window=await call('/api/admin/overview?days=90');assert.equal(window.daily.length,90);assert.ok(window.daily.slice(0,-1).some(p=>p.visits===null));
 await call('/api/admin/overview?days=365',{status:400});await call('/api/admin/overview?offset=-1',{status:400});
 console.log('PASS: owner-only analytics; same-origin recording; privacy opt-out; atomic counters; canonical and coarse places; real D1 rankings, search, pagination and IST windows; invalid queries; private response fields.');
}finally{
 const restore=original.map(r=>`INSERT INTO activity_daily(day,location_key,place,lng,lat,views) VALUES('${r.day}','${r.location_key}','${r.place.replaceAll("'","''")}',${r.lng??'NULL'},${r.lat??'NULL'},${r.views});`).join('\n');
 await sql(`DELETE FROM activity_daily WHERE location_key LIKE '${prefix}%' OR (day='${day}' AND location_key IN (${quoted}));\n${restore}\n${meta.length?'':"DELETE FROM activity_meta WHERE key='started';"}`);
 await unlink(file);console.log('Disposable local activity fixtures removed; earlier totals restored.');
}
