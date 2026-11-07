import { inCity, isArchived, KEEP_VOTES, NOTE_ARCHIVE_DAYS, type Post } from './product.ts';

export type PostKindFilter = 'all' | 'note' | 'event';
export type EventWindow = 'any' | 'now' | 'today';
export const istDay = (at: number) => Math.floor((at + 19800000) / 86400000) * 86400000 - 19800000;

// Conditions run before LIMIT, so a matching event is discoverable even when
// hundreds of newer notes precede it. The first page's time anchors later pages.
export function postQuery(params: URLSearchParams, now = Date.now()) {
  const kind = params.get('kind') ?? 'all', when = params.get('when') ?? 'any';
  if (!['all', 'note', 'event'].includes(kind) || !['any', 'now', 'today'].includes(when)) throw new Error('Choose a valid post filter.');
  const atValue = params.get('at');
  if (atValue && !/^\d{13}$/.test(atValue)) throw new Error('Refresh the posts to continue.');
  const at = atValue ? Number(atValue) : now;
  const archive = params.get('archive') === '1';
  const old = `((p.kind='note' AND p.created_at<=?) OR (p.kind='event' AND p.ends_at<=?)) AND (SELECT COUNT(*) FROM votes v WHERE v.post_id=p.id) < ?`;
  const conditions = ['p.hidden_at IS NULL', archive ? `(${old})` : `NOT (${old})`];
  const values: (string | number)[] = [at - NOTE_ARCHIVE_DAYS * 86400000, at, KEEP_VOTES];
  if (when !== 'any') {
    conditions.push("p.kind='event'");
    if (when === 'now') { conditions.push('p.starts_at<=? AND p.ends_at>?'); values.push(at, at); }
    else { const start = istDay(at); conditions.push('p.starts_at<? AND p.ends_at>?'); values.push(start + 86400000, start); }
  } else if (kind !== 'all') { conditions.push('p.kind=?'); values.push(kind); }
  const lngValue = params.get('lng'), latValue = params.get('lat');
  if (lngValue !== null || latValue !== null) {
    const lng = Number(lngValue), lat = Number(latValue);
    if (lngValue === null || latValue === null || !inCity(lng, lat)) throw new Error('Choose a place in Coimbatore.');
    conditions.push('ROUND(p.lng,5)=? AND ROUND(p.lat,5)=?');
    values.push(Number(lng.toFixed(5)), Number(lat.toFixed(5)));
  }
  const cursor = params.get('cursor'), match = cursor?.match(/^(\d{13}):([a-f0-9-]{36})$/);
  if (cursor && !match) throw new Error('This page could not be loaded. Refresh the posts.');
  if (match) { conditions.push('(p.created_at < ? OR (p.created_at = ? AND p.id < ?))'); values.push(Number(match[1]), Number(match[1]), match[2]); }
  return { where: conditions.map(condition => `(${condition})`).join(' AND '), values, at };
}

export function eventInWindow(post: Post, window: EventWindow, at: number) {
  if (window === 'any') return true;
  if (post.kind !== 'event' || post.startsAt === null || post.endsAt === null) return false;
  if (window === 'now') return post.startsAt <= at && post.endsAt > at;
  const start = istDay(at);
  return post.startsAt < start + 86400000 && post.endsAt > start;
}

export function matchesPostQuery(post:Post,params:URLSearchParams,at=Date.now()){
 if(isArchived(post,at)!==(params.get('archive')==='1'))return false;
 const when=(params.get('when')??'any') as EventWindow,kind=params.get('kind')??'all';
 if(!eventInWindow(post,when,at)||(when==='any'&&kind!=='all'&&post.kind!==kind))return false;
 if(params.has('lng')&&post.lng.toFixed(5)!==Number(params.get('lng')).toFixed(5))return false;
 if(params.has('lat')&&post.lat.toFixed(5)!==Number(params.get('lat')).toFixed(5))return false;
 return true;
}
