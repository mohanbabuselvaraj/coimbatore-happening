import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAccess } from '../lib/admin-access.ts';
import { adminRoutes } from '../lib/admin-api.ts';
import { validatePost } from '../lib/content.ts';
const owner='owner@example.test';
test('admin authorization fails closed for missing identity, wrong identity and missing configuration',()=>{
 assert.equal(adminAccess(new Headers(),owner).status,401);
 assert.equal(adminAccess(new Headers({'oai-authenticated-user-email':owner}),owner).status,401);
 assert.equal(adminAccess(new Headers({'oai-authenticated-user-id':'viewer','oai-authenticated-user-email':'viewer@example.test'}),owner).status,403);
 assert.equal(adminAccess(new Headers({'oai-authenticated-user-id':'owner','oai-authenticated-user-email':owner}),undefined).status,503);
 assert.equal(adminAccess(new Headers({'oai-authenticated-user-id':'owner','oai-authenticated-user-email':owner}),owner).status,200);
});
test('every admin read and mutation rejects a non-owner before touching the database',async()=>{
 const db=new Proxy({},{get(){throw Error('Unauthorized database access');}}) as D1Database;
 for(const method of ['GET','POST'])for(const path of ['/api/admin/auth/status','/api/admin/auth/setup','/api/admin/auth/login','/api/admin/auth/logout','/api/admin/session','/api/admin/overview','/api/admin/posts','/api/admin/posts/aaaaaaaa-0000-4000-8000-000000000001','/api/admin/posts/aaaaaaaa-0000-4000-8000-000000000001/history','/api/admin/posts/aaaaaaaa-0000-4000-8000-000000000001/change']){
  const url=new URL('https://map.test'+path),headers=new Headers({'oai-authenticated-user-id':'viewer','oai-authenticated-user-email':'viewer@example.test'});
  await assert.rejects(()=>adminRoutes(new Request(url,{method,headers}),url,db,owner),(e:unknown)=>typeof e==='object'&&e!==null&&'status' in e&&e.status===403);
 }
});
test('editing an ended event preserves validation while creation still rejects it',()=>{
 const raw={kind:'event',place:'Town Hall',body:'A finished reading circle.',lng:76.96,lat:11,startsAt:'2025-11-06T10:00',endsAt:'2025-11-06T11:00'};
 assert.ok(validatePost(raw).error);
 assert.ok(validatePost(raw,Date.now(),{allowPastEvents:true}).value);
 assert.ok(validatePost({...raw,body:'Call 1234567890'},Date.now(),{allowPastEvents:true}).error);
 assert.ok(validatePost({...raw,endsAt:raw.startsAt},Date.now(),{allowPastEvents:true}).error);
});
