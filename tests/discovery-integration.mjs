import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Disposable local D1 fixtures only. Never run this against a hosted database.
const base = 'http://127.0.0.1:5173', at = Date.parse('2026-11-06T18:45:00Z');
const dayStart = Date.parse('2026-11-06T18:30:00Z'), nextDay = dayStart + 86400000;
const ids = [], notes = [], ongoing = [];
await mkdir('work', { recursive: true });
const file = 'work/discovery-fixtures.sql';
async function sql(text) {
  await writeFile(file, text);
  const result = spawnSync(process.execPath, ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', '.wrangler/state', '--file', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
const inserts = [];
function add(kind, starts = null, ends = null, created = at - 86400000, lng = 76.97756) {
  const id = randomUUID(); ids.push(id);
  inserts.push(`INSERT INTO posts (id,kind,body,place,lng,lat,created_at,starts_at,ends_at,delete_hash) VALUES ('${id}','${kind}','Disposable discovery verification.','Discovery test',${lng},11.00108,${created},${starts ?? 'NULL'},${ends ?? 'NULL'},'local-disposable');`);
  return id;
}
for (let i = 0; i < 130; i++) notes.push(add('note', null, null, at));
for (let i = 0; i < 205; i++) ongoing.push(add('event', at - 1800000, at + 1800000));
const laterToday = add('event', at + 36000000, at + 39600000);
const tomorrow = add('event', nextDay, nextDay + 3600000);
const endsAtMidnight = add('event', dayStart - 3600000, dayStart);
const endedToday = add('event', dayStart, at - 1);
const popularEnded = add('event', dayStart, at - 1);
for (let i = 0; i < 10; i++) inserts.push(`INSERT INTO votes (post_id,token_hash) VALUES ('${popularEnded}','discovery-${i}-${popularEnded}');`);
const otherPlace = add('event', at - 1000, at + 3600000, at - 86400000, 76.98);
async function pages(params) {
  let cursor = null, count = 0; const found = new Set();
  do {
    const query = new URLSearchParams({ at: String(at), ...params });
    if (cursor) query.set('cursor', cursor);
    const response = await fetch(`${base}/api/posts?${query}`);
    assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.asOf, at);
    for (const post of data.posts) if (ids.includes(post.id)) { assert.ok(!found.has(post.id), 'Duplicate between pages'); found.add(post.id); }
    cursor = data.nextCursor; assert.ok(++count < 10, 'Pagination failed to terminate');
  } while (cursor);
  return found;
}
try {
  await sql(inserts.join('\n'));
  assert.deepEqual(await pages({ kind: 'event', when: 'now' }), new Set([...ongoing, otherPlace]));
  assert.deepEqual(await pages({ kind: 'event', when: 'today' }), new Set([...ongoing, laterToday, popularEnded, otherPlace]));
  assert.deepEqual(await pages({ kind: 'event', when: 'today', archive: '1' }), new Set([endedToday]));
  assert.deepEqual(await pages({ kind: 'note' }), new Set(notes));
  assert.deepEqual(await pages({ kind: 'event', when: 'now', lng: '76.97756', lat: '11.00108' }), new Set(ongoing));
  const first = await (await fetch(`${base}/api/posts?kind=event&when=now`)).json();
  assert.ok(Number.isFinite(first.asOf), 'The server must return its pagination time');
  for (const query of ['kind=invalid', 'when=invalid', 'lng=0&lat=0', 'cursor=invalid']) assert.equal((await fetch(`${base}/api/posts?${query}`)).status, 400);
  console.log('PASS: server filters find 205 older matching events beyond 130 newer notes; all cursor pages, IST midnight overlap, archive/retention, exact place scope and invalid queries verified.');
} finally {
  for (let i = 0; i < ids.length; i += 100) await sql(`DELETE FROM posts WHERE id IN (${ids.slice(i, i + 100).map(id => `'${id}'`).join(',')});`);
  await unlink(file);
  console.log('Disposable local discovery fixtures removed.');
}
