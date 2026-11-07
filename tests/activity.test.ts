import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityDay,activityLocation,recordActivity } from '../lib/activity.ts';
import indexed from '../public/data/places.json' with {type:'json'};
test('activity days turn at midnight in Kolkata, not UTC',()=>{
 assert.equal(activityDay(Date.parse('2026-11-06T18:29:59Z')),'2026-11-06');
 assert.equal(activityDay(Date.parse('2026-11-06T18:30:00Z')),'2026-11-07');
});
test('indexed activity uses canonical geography and ignores supplied labels',()=>{
 const p=indexed.places[0];
 assert.deepEqual(activityLocation({type:'place',placeId:p.id,place:'private arbitrary text',lng:0,lat:0}),{key:p.id,place:p.name,lng:p.lng,lat:p.lat});
 assert.throws(()=>activityLocation({type:'place',placeId:'invented'}));
});
test('free pins are bounded and coarsened without retaining submitted names',()=>{
 assert.deepEqual(activityLocation({type:'place',lng:76.97756,lat:11.00108,place:'arbitrary text'}),{key:'pin:76.978:11.001',place:'Map pin',lng:76.978,lat:11.001});
 for(const lng of [NaN,Infinity,0])assert.throws(()=>activityLocation({type:'place',lng,lat:11}));
 assert.throws(()=>activityLocation({type:'person'}));
});
test('privacy signals skip both storage and budgets; cross-origin tracking fails',async()=>{
 const db=new Proxy({},{get(){throw Error('Unexpected storage access');}}) as D1Database;
 const limit=async()=>{throw Error('Unexpected budget access');};
 for(const signal of ['dnt','sec-gpc']){
  const r=await recordActivity(new Request('https://map.test/api/activity',{method:'POST',headers:{Origin:'https://map.test',[signal]:'1'}}),db,limit);
  assert.equal(r.status,204);
 }
 await assert.rejects(()=>recordActivity(new Request('https://map.test/api/activity',{method:'POST',headers:{Origin:'https://other.test'}}),db,limit),{status:403});
});
