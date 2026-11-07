import { isPast, type Post } from './product.ts';

const numbers = new Intl.NumberFormat('en-IN');
const plurals = new Intl.PluralRules('en-IN');

export const formatCount = (count: number) => numbers.format(count);
export function voteCountLabel(count: number) {
  return `${formatCount(count)} ${plurals.select(count) === 'one' ? 'upvote' : 'upvotes'}`;
}

const localDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const clock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
export function eventLabel(post: Post, now: number) {
  if (post.kind === 'note') return localDate.format(post.createdAt);
  if (isPast(post, now)) return 'Ended · ' + localDate.format(post.endsAt!);
  if (post.startsAt !== null && post.startsAt <= now) return 'Happening now · until ' + clock.format(post.endsAt!);
  return localDate.format(post.startsAt!);
}
