// Racecourse and Valankulam, framed together in the opening city view.
export const CITY_CENTER: [number, number] = [76.9778, 10.9991];
// Initial service area, not a claim about the municipal boundary.
export const CITY_BOUNDS: [[number, number], [number, number]] = [[76.87, 10.90], [77.13, 11.17]];
export const NOTE_ARCHIVE_DAYS = 7;
export const KEEP_VOTES = 10;
export const MAX_BODY = 420;
export const MAX_PLACE_LENGTH = 256;

export type Place = { id?: string; name: string; lng: number; lat: number; category?: string; nativeName?: string };
export type Post = {
  id: string; kind: 'note' | 'event'; body: string; place: string;
  lng: number; lat: number; createdAt: number;
  startsAt: number | null; endsAt: number | null; votes: number;
};
export type Weather = {
  temperature: number; code: number; cloud: number; rain: number;
  sunrise: number; sunset: number; observedAt: number; fetchedAt: number;
  source?: 'open-meteo' | 'met-norway'; label?: string;
};

export function inCity(lng: number, lat: number) {
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= CITY_BOUNDS[0][0] && lng <= CITY_BOUNDS[1][0]
    && lat >= CITY_BOUNDS[0][1] && lat <= CITY_BOUNDS[1][1];
}

export function isPast(post: Post, now = Date.now()) {
  return post.kind === 'event' && post.endsAt !== null && post.endsAt <= now;
}

export function isArchived(post: Post, now = Date.now()) {
  if (post.votes >= KEEP_VOTES) return false;
  return post.kind === 'event' ? isPast(post, now) : post.createdAt <= now - NOTE_ARCHIVE_DAYS * 86400000;
}

export function localEventTime(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const result = Date.parse(`${value}:00+05:30`);
  if (!Number.isFinite(result)) return null;
  // Reject normalized invalid dates such as February 31.
  const roundtrip = new Date(result + 19800000).toISOString().slice(0, 16);
  return roundtrip === value ? result : null;
}

export function weatherName(code: number) {
  if (code === 0) return 'Clear';
  if (code <= 3) return code === 1 ? 'Mostly clear' : 'Cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorms';
}
