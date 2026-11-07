import { inCity, localEventTime, MAX_BODY, MAX_PLACE_LENGTH } from './product.ts';

const zeroPoints = [0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0xf20, 0x1040, 0x1090, 0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0, 0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0, 0xa9f0, 0xaa50, 0xabf0, 0xff10, 0x104a0, 0x11066, 0x110f0, 0x11136, 0x111d0, 0x112f0, 0x11450, 0x114d0, 0x11650, 0x116c0, 0x11730, 0x118e0, 0x11950, 0x11c50, 0x11d50, 0x11da0, 0x16a60, 0x16ac0, 0x16b50, 0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6, 0x1e140, 0x1e2f0, 0x1e950, 0x1fbf0];
const words: Record<string, string> = {
  zero:'0', oh:'0', one:'1', two:'2', three:'3', four:'4', five:'5', six:'6', seven:'7', eight:'8', nine:'9',
  onnu:'1', ondru:'1', rendu:'2', irandu:'2', moonu:'3', moondru:'3', naalu:'4', nalu:'4', naangu:'4', anju:'5', aindhu:'5', ainthu:'5', aaru:'6', aru:'6', ezhu:'7', elu:'7', ettu:'8', onbadhu:'9', onpathu:'9', poojyam:'0', poojiyam:'0',
  'பூஜ்ஜியம்':'0', 'பூஜ்யம்':'0', 'சுழியம்':'0', 'ஒன்று':'1', 'ஒண்ணு':'1', 'இரண்டு':'2', 'ரெண்டு':'2', 'மூன்று':'3', 'மூணு':'3', 'நான்கு':'4', 'நாலு':'4', 'ஐந்து':'5', 'அஞ்சு':'5', 'ஆறு':'6', 'ஏழு':'7', 'எட்டு':'8', 'ஒன்பது':'9',
};
const sortedWords = Object.keys(words).sort((a, b) => b.length - a.length);
const wordPattern = new RegExp(sortedWords.join('|'), 'gu');

export function normalizeText(input: string) {
  return [...input.normalize('NFKC').toLowerCase().replace(/[\p{Cf}\uFE00-\uFE0F]/gu, '')].map(char => {
    const code = char.codePointAt(0)!;
    for (const zero of zeroPoints) if (code >= zero && code < zero + 10) return String(code - zero);
    return char;
  }).join('');
}

export function hasPhoneNumber(input: string) {
  const text = normalizeText(input);
  // Inspect the entire submission, catching numbers interrupted by ordinary text.
  if ((text.match(/\d/g) ?? []).length >= 10) return true;
  if (/(?:\d[\s\p{P}\p{S}]*){7,}/u.test(text)) return true;
  const repeatDigit = (_:string,repeat:string,digit:string) => digit.repeat(repeat==='double'?2:3);
  // Convert complete number tokens and joined number runs, not fragments of
  // ordinary words such as "everyone", "stone" or "height". Literal digits
  // remain inspected across the entire submission, including inside words.
  const wordDigits = text.replace(/[\p{L}\p{M}\d]+/gu, token => {
    const encoded = token.replace(wordPattern, match => words[match]);
    return /^(?:(?:double|triple)?\d)+$/u.test(encoded)
      ? encoded.replace(/(double|triple)(\d)/gu,repeatDigit)
      : token;
  }).replace(/\b(double|triple)[\s._-]*(\d)/gu,repeatDigit);
  if ((wordDigits.match(/\d/g) ?? []).length >= 10) return true;
  // Common digit homographs and leetspeak in a phone-like sequence.
  for (const candidate of text.match(/[\doilzsbg][\doilzsbg+()._\-\s]{8,}[\doilzsbg]/gu) ?? []) {
    const compact = candidate.replace(/[\s+()._\-]/g, '');
    if (compact.length >= 10 && compact.length <= 15 && /^[\doilzsbg]+$/u.test(compact)
      && (compact.match(/\d/g) ?? []).length >= 5) return true;
  }
  return false;
}

export function contentError(input: string): string | null {
  if (hasPhoneNumber(input)) return 'Remove the phone number, including written-out or hidden digits.';
  if (/(?:https?:|www\.|mailto:|tel:|wa\.me|t\.me|[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu.test(input))
    return 'Keep contact details and links out of your post.';
  if (/\p{Cc}/u.test(input.replace(/[\n\r\t]/g, ''))) return 'Remove the unsupported characters.';
  return null;
}

export function validatePost(raw: unknown, now = Date.now(), options: { allowPastEvents?: boolean } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Add a note or event.' } as const;
  const data = raw as Record<string, unknown>;
  const body = typeof data.body === 'string' ? data.body.normalize('NFC').trim() : '';
  const place = typeof data.place === 'string' ? data.place.normalize('NFC').trim() : '';
  if (data.kind !== 'note' && data.kind !== 'event') return { error: 'Choose Note or Event.' } as const;
  if (body.length < 3 || body.length > MAX_BODY) return { error: `Write 3–${MAX_BODY} characters.` } as const;
  if (!place || place.length > MAX_PLACE_LENGTH) return { error: `Choose a place name of up to ${MAX_PLACE_LENGTH} characters.` } as const;
  const error = contentError(`${place}\n${body}`);
  if (error) return { error } as const;
  if (typeof data.lng !== 'number' || typeof data.lat !== 'number' || !inCity(data.lng, data.lat))
    return { error: 'Choose a place within the Coimbatore area.' } as const;
  let startsAt: number | null = null, endsAt: number | null = null;
  if (data.kind === 'event') {
    startsAt = typeof data.startsAt === 'string' ? localEventTime(data.startsAt) : null;
    endsAt = typeof data.endsAt === 'string' ? localEventTime(data.endsAt) : null;
    if (startsAt === null || endsAt === null) return { error: 'Add a valid start and end time in IST.' } as const;
    if (endsAt <= startsAt) return { error: 'End the event after it starts.' } as const;
    if (!options.allowPastEvents && endsAt <= now) return { error: 'The event must end in the future.' } as const;
    if (!options.allowPastEvents && (startsAt > now + 90 * 86400000 || endsAt > now + 91 * 86400000))
      return { error: 'Choose an event within the next 90 days.' } as const;
    if (endsAt - startsAt > 7 * 86400000) return { error: 'Keep an event within seven days.' } as const;
  }
  return { value: { kind: data.kind, body, place, lng: data.lng, lat: data.lat, startsAt, endsAt } } as const;
}
