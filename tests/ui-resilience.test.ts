import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLatestRequest } from '../lib/latest-request.ts';
import { formatCount, voteCountLabel } from '../lib/presentation.ts';
import { groupPostsByLocation, postLocationKey } from '../lib/post-locations.ts';
import type { Post } from '../lib/product.ts';

test('a late Current response cannot replace the newer Archive result, even if transport ignores abort', async () => {
  const requests=createLatestRequest();
  let releaseCurrent!:(value:string[])=>void;
  const delayed=new Promise<string[]>(resolve=>{releaseCurrent=resolve;});
  let displayed:string[]=[];
  const current=requests.begin();
  const pending=delayed.then(posts=>{if(current.isCurrent())displayed=posts;});
  const archive=requests.begin();
  assert.equal(current.signal.aborted,true);
  if(archive.isCurrent())displayed=['old community notice'];
  releaseCurrent(['current evening walk']);await pending;
  assert.deepEqual(displayed,['old community notice']);
});

test('refresh invalidates an older page request and cancelling invalidates pending updates', () => {
  const requests=createLatestRequest();
  const page=requests.begin(),refresh=requests.begin();
  assert.equal(page.isCurrent(),false);
  assert.equal(refresh.isCurrent(),true);
  requests.cancel();
  assert.equal(refresh.signal.aborted,true);
  assert.equal(refresh.isCurrent(),false);
  assert.equal(requests.begin().isCurrent(),true);
});

test('coincident posts share one pin while every post remains available in its location list', () => {
  const posts:Post[]=Array.from({length:1000},(_,i)=>({id:String(i),kind:i%2?'note':'event',place:'Community garden',body:'Bring a book.',lng:76.96+(i%4)*.0003,lat:11.01+(i%3)*.0003,createdAt:Date.now(),startsAt:null,endsAt:null,votes:1}));
  const groups=groupPostsByLocation(posts);
  assert.equal(groups.length,12);
  assert.equal(groups.reduce((sum,group)=>sum+group.posts.length,0),1000);
  assert.equal(new Set(groups.flatMap(group=>group.posts.map(post=>post.id))).size,1000);
  for(const group of groups)assert.deepEqual(posts.filter(post=>postLocationKey(post)===group.key),group.posts);
  assert.equal(groupPostsByLocation([]).length,0);
  assert.deepEqual(groupPostsByLocation([posts[0]])[0].posts,[posts[0]]);
});

test('vote counts use Indian grouping and singular or plural accessibility text', () => {
  assert.equal(formatCount(1284),'1,284');
  assert.equal(formatCount(1000000),'10,00,000');
  assert.equal(voteCountLabel(0),'0 upvotes');
  assert.equal(voteCountLabel(1),'1 upvote');
  assert.equal(voteCountLabel(1284),'1,284 upvotes');
});
