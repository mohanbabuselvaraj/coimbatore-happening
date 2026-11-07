import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { publicResponse } from '../lib/public-cache.ts';

const request = new Request('https://city.example/api/map?v=2');
const fresh = () => Promise.resolve(Response.json({ version: 8 }, { headers: { 'Cache-Control': 'public,max-age=300' } }));

function hostedCache(t: TestContext, cache: Partial<Cache>, open?: () => Promise<Cache>) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const names: string[] = [];
  const storage = {
    get default(): Cache { throw new Error('caches.default is not available in untrusted Workers'); },
    async open(name: string) { names.push(name); return open ? open() : cache as Cache; },
  };
  Object.defineProperty(globalThis, 'caches', { value: storage, configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'caches', original);
    else Reflect.deleteProperty(globalThis, 'caches');
  });
  return names;
}

test('map and weather responses load when the hosted runtime disables caches.default', async t => {
  let writes = 0;
  const names = hostedCache(t, { match: async () => undefined, put: async () => { writes++; } });
  for (const path of ['/api/map?v=2', '/api/weather']) {
    const response = await publicResponse(new Request(new URL(path, request.url)), fresh);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { version: 8 });
  }
  assert.equal(writes, 2);
  assert.ok(names.every(name => name === 'coimbatore-public-v1'));
});

test('an unavailable cache does not prevent a fresh provider response', async t => {
  hostedCache(t, {}, async () => { throw new Error('Cache unavailable'); });
  assert.equal((await publicResponse(request, fresh)).status, 200);
});

test('cache read and write failures do not turn a provider success into a 503', async t => {
  hostedCache(t, {
    match: async () => { throw new Error('Cache read unavailable'); },
    put: async () => { throw new Error('Cache write unavailable'); },
  });
  const response = await publicResponse(request, fresh);
  assert.deepEqual(await response.json(), { version: 8 });
});

test('a failed cache write leaves the fresh response readable', async t => {
  hostedCache(t, { match: async () => undefined, put: async () => { throw new Error('Cache full'); } });
  assert.deepEqual(await (await publicResponse(request, fresh)).json(), { version: 8 });
});

test('cached headers can be changed by the hosting response wrapper', async t => {
  hostedCache(t, { match: async () => Response.redirect('https://city.example/map', 302) });
  const response = await publicResponse(request, async () => { throw new Error('Provider must not run on a cache hit'); });
  response.headers.set('Referrer-Policy', 'no-referrer');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
});

test('provider failures still propagate; private and stale responses are not cached', async t => {
  let writes = 0;
  hostedCache(t, { match: async () => undefined, put: async () => { writes++; } });
  await assert.rejects(publicResponse(request, async () => { throw new Error('Provider unavailable'); }), /Provider unavailable/);
  for (const cacheControl of ['no-store', 'private,max-age=300']) {
    await publicResponse(request, async () => Response.json({ stale: true }, { headers: { 'Cache-Control': cacheControl } }));
  }
  assert.equal(writes, 0);
});
