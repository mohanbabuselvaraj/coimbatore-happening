import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revalidatePosts } from '../lib/revalidate-posts.ts';
import type { Post } from '../lib/product.ts';
test('revalidation updates all loaded pages and removes unavailable entries in bounded batches',async()=>{
 const posts:Post[]=Array.from({length:205},(_,i)=>({id:String(i),kind:'note',body:'Old text',place:'Old place',lng:76.96,lat:11,createdAt:1700000000000,startsAt:null,endsAt:null,votes:0}));
 const batches:number[]=[];
 const current=await revalidatePosts(posts,async ids=>{batches.push(ids.length);return {posts:ids.filter(id=>id!=='150').map(id=>({...posts[Number(id)],body:'Updated text',place:'Updated place',lng:76.98,lat:11.02,votes:3}))};});
 assert.deepEqual(batches,[100,100,5]);assert.equal(current.length,204);assert.ok(!current.some(p=>p.id==='150'));assert.equal(current.at(-1)?.id,'204');assert.ok(current.every(p=>p.body==='Updated text'&&p.lng===76.98&&p.votes===3));
});
import { matchesPostQuery } from '../lib/post-query.ts';
test('revalidated place previews exclude moved entries and preserve kind, archive and event filters',()=>{
 const now=Date.now(),post:Post={id:'location-test',kind:'note',body:'Current note.',place:'Racecourse',lng:76.97756,lat:11.00108,createdAt:now,startsAt:null,endsAt:null,votes:0};
 const query=new URLSearchParams('archive=0&kind=note&lng=76.97756&lat=11.00108');
 assert.equal(matchesPostQuery(post,query,now),true);
 assert.equal(matchesPostQuery({...post,lng:76.98},query,now),false);
 assert.equal(matchesPostQuery({...post,lat:11.02},query,now),false);
 assert.equal(matchesPostQuery({...post,kind:'event'},query,now),false);
 assert.equal(matchesPostQuery({...post,createdAt:now-8*86400000},query,now),false);
 assert.equal(matchesPostQuery(post,new URLSearchParams('when=now'),now),false);
});
