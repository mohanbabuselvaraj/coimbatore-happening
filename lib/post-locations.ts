import type { Post } from './product.ts';

export type PostLocation = { key: string; place: string; lng: number; lat: number };
export type PostGroup = PostLocation & { posts: Post[] };

// About a metre: repeated posts at an entrance share one selectable pin.
export const postLocationKey = (post: Pick<Post,'lng'|'lat'>) => `${post.lng.toFixed(5)}:${post.lat.toFixed(5)}`;

export function groupPostsByLocation(posts: Post[]): PostGroup[] {
  const groups = new Map<string,PostGroup>();
  for (const post of posts) {
    const key = postLocationKey(post);
    let group = groups.get(key);
    if (!group) {
      group = { key, place: post.place, lng: post.lng, lat: post.lat, posts: [] };
      groups.set(key,group);
    }
    group.posts.push(post);
  }
  return [...groups.values()];
}
