import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchPlaces, PLACE_SHORTCUTS } from '../lib/place-search.ts';
import { istDay, postQuery } from '../lib/post-query.ts';
import { eventLabel } from '../lib/presentation.ts';
import type { Place, Post } from '../lib/product.ts';
const places = JSON.parse(readFileSync(new URL('../public/data/places.json', import.meta.url), 'utf8')).places as Place[];

test('familiar lake spellings and Tamil names resolve to the genuine indexed place', () => {
  const lake = places.find(place => place.name === 'Valaan Kulam')!;
  for (const query of ['Valankulam', 'valan kulam', 'Valankulam Lake', 'வாளங்குளம்']) assert.equal(searchPlaces(places, query)[0], lake);
  assert.equal(searchPlaces(places, 'Race Course')[0].name, 'Racecourse');
  for (const shortcut of PLACE_SHORTCUTS) assert.ok(places.some(place => place.name === shortcut.name));
  assert.deepEqual(searchPlaces(places, ''), []);
  assert.deepEqual(searchPlaces(places, 'not a real indexed place xyz'), []);
});

test('Today starts at Coimbatore midnight across UTC date and year boundaries', () => {
  assert.equal(istDay(Date.parse('2026-11-06T18:45:00Z')), Date.parse('2026-11-06T18:30:00Z'));
  assert.equal(istDay(Date.parse('2026-12-31T18:29:59Z')), Date.parse('2026-12-30T18:30:00Z'));
  assert.equal(istDay(Date.parse('2026-12-31T18:30:00Z')), Date.parse('2026-12-31T18:30:00Z'));
});

test('invalid filters, cursors and out-of-city location scopes fail before querying', () => {
  for (const query of ['kind=anything', 'when=tomorrow', 'at=NaN', 'cursor=invalid', 'lng=76.96', 'lat=11', 'lng=0&lat=0']) assert.throws(() => postQuery(new URLSearchParams(query)));
});

test('a popular ended event remains explicitly ended', () => {
  const ended: Post = { id: 'test', kind: 'event', body: 'A finished event.', place: 'Town Hall', lng: 76.96, lat: 11, createdAt: 1700000000000, startsAt: 1700000000000, endsAt: 1700003600000, votes: 100 };
  assert.match(eventLabel(ended, 1700007200000), /^Ended · /);
});
