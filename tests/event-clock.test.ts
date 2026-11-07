import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventInWindow } from '../lib/post-query.ts';
import type { Post } from '../lib/product.ts';

test('a visible event leaves Happening now when its end time arrives', () => {
  const start=Date.parse('2026-11-06T18:00:00Z'),end=Date.parse('2026-11-06T19:00:00Z');
  const post:Post={id:'clock-test',kind:'event',body:'A reading circle.',place:'Town Hall',lng:76.96,lat:11,createdAt:start,startsAt:start,endsAt:end,votes:10};
  assert.equal(eventInWindow(post,'now',start-1),false);
  assert.equal(eventInWindow(post,'now',start),true);
  assert.equal(eventInWindow(post,'now',end-1),true);
  assert.equal(eventInWindow(post,'now',end),false);
  assert.equal(eventInWindow(post,'today',Date.parse('2026-11-06T18:45:00Z')),true);
  assert.equal(eventInWindow(post,'today',Date.parse('2026-11-07T18:30:00Z')),false);
});
