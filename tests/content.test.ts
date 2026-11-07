import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentError, hasPhoneNumber, validatePost } from '../lib/content.ts';
import { isArchived, isPast, KEEP_VOTES, localEventTime, MAX_PLACE_LENGTH, type Post } from '../lib/product.ts';

test('blocks plain, separated, embedded, Unicode, zero-width, and worded numbers', () => {
  for (const value of [
    'Call 9876543210', '+91 98765 43210', '9a8b7c6d5e4f3g2h1i0',
    '９８７６５４３２１０', '௯௮௭௬௫௪௩௨௧௦', '٩٨٧٦٥٤٣٢١٠', '9\u200b8\u200b76543210',
    'nine eight seven six five four three two one zero', 'nine8seven6five4three2one0',
    'nine-eight-seven-six-five-four-three-two-one-zero',
    'ஒன்பது எட்டு ஏழு ஆறு ஐந்து நான்கு மூன்று இரண்டு ஒன்று பூஜ்யம்',
    'onbadhu ettu ezhu aaru anju naalu moonu rendu onnu poojyam',
    '98765 43210', '98765432IO', 'Call me at 98765432IO please',
    'double nine eight seven six five four three two one',
    'triple nine seven six five four three two one',
    '9️⃣8️⃣7️⃣6️⃣5️⃣4️⃣3️⃣2️⃣1️⃣0️⃣',
    'nineeightsevensixfivefourthreetwoonezero',
    'nine near eight the seven gate six five four three two one zero',
    'ninedoublenineeightsevensixfivefourthreetwo',
  ]) assert.equal(hasPhoneNumber(value), true, value);
});
test('ordinary notes and useful short numbers are accepted', () => {
  for (const value of ['Tea by the lake this evening.', 'Meet at gate 2 at 6 pm.', 'மாலை பூங்காவில் சந்திப்போம்.', 'Bring two books.', 'Community cleanup this Sunday.'])
    assert.equal(contentError(value), null, value);
});
test('number-word fragments in ordinary prose do not block a harmless note', () => {
  const note='Everyone is welcome. Someone will open the gate. Anyone can bring a book. No one needs to book. Everyone can read, and someone will help anyone find a seat. One volunteer will stay by the entrance so no one is left waiting. Everyone can take a break.';
  for(const value of [note, 'Stone paths and bright lights beside the neighbourhood library. '.repeat(5)])
    assert.equal(contentError(value),null,value);
  assert.ok(validatePost({kind:'note',body:note,place:'Community reading room',lng:76.96,lat:11.0}).value);
  assert.ok(contentError(`${note} 9a8b7c6d5e4f3g2h1i0`));
});
test('the full indexed place name and the shared limit are accepted without truncation', () => {
  const place='Ortho One Orthopaedic Speciality Center(A Unit Of Spine Arthroscopic and Joint Replacement Center Pvt Ltd)';
  const base={kind:'note',body:'Please use the main entrance beside the garden.',place,lng:76.96,lat:11.0};
  assert.equal(place.length,106);
  assert.equal(validatePost(base).value?.place,place);
  const limitName=('Coimbatore community environmental restoration garden entrance ').repeat(5).slice(0,MAX_PLACE_LENGTH);
  assert.equal(validatePost({...base,place:limitName}).value?.place,limitName.trim());
  assert.match(validatePost({...base,place:limitName+' West'}).error!,/256/);
});
test('all public fields are inspected together, outside structured timing', () => {
  const result = validatePost({kind:'note',body:'43210 come here',place:'98765 Park',lng:76.96,lat:11.0});
  assert.ok('error' in result);
  assert.match(result.error!, /phone/);
});
test('links and email contact routes are rejected', () => {
  for (const value of ['Go to https://example.com', 'Mail me: person@example.com', 'wa.me/123']) assert.ok(contentError(value));
});
test('IST times are interpreted independently of the host timezone', () => {
  assert.equal(localEventTime('2026-11-03T18:30'), Date.parse('2026-11-03T13:00:00Z'));
  assert.equal(localEventTime('2026-02-31T18:30'), null);
  assert.equal(localEventTime('not a date'), null);
});
test('rejects out-of-area locations and invalid or past event schedules', () => {
  const base = {kind:'event',body:'An evening of music.',place:'Community hall',lng:76.96,lat:11.0,startsAt:'2026-11-04T18:00',endsAt:'2026-11-04T20:00'};
  const now = Date.parse('2026-11-03T00:00:00Z');
  assert.ok(validatePost(base, now).value);
  assert.ok(validatePost({...base,lat:12},now).error);
  assert.ok(validatePost({...base,endsAt:'2026-11-04T17:00'},now).error);
  assert.ok(validatePost(base,Date.parse('2026-11-05T00:00:00Z')).error);
});
test('archive retains old posts; enough upvotes keep them current without changing ended status', () => {
  const now = Date.now();
  const note: Post = {id:'1',kind:'note',body:'A quiet place.',place:'Park',lng:76.96,lat:11.0,createdAt:now - 8*86400000,startsAt:null,endsAt:null,votes:0};
  assert.equal(isArchived(note, now), true);
  assert.equal(isArchived({...note,votes:KEEP_VOTES}, now), false);
  const event: Post = {...note,kind:'event',startsAt:now-7200000,endsAt:now-3600000,votes:KEEP_VOTES};
  assert.equal(isArchived(event,now), false);
  assert.equal(isPast(event,now), true);
});
