'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { revalidatePosts } from '../lib/revalidate-posts';
import { matchesPostQuery } from '../lib/post-query';
import { request } from '../lib/client-request';
import { createLatestRequest } from '../lib/latest-request';
import type { Post } from '../lib/product';

type Page = { posts: Post[]; nextCursor: string | null; asOf?: number };

export function usePostFeed(query: string, fixture: string | null) {
  const key = `${query}:${fixture ?? ''}`, currentKey = useRef(key);
  currentKey.current = key;
  const [requests] = useState(createLatestRequest);
  const [posts, setPosts] = useState<Post[]>([]), [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [moreLoading, setMoreLoading] = useState(false), [error, setError] = useState('');
  const currentPosts=useRef(posts);currentPosts.current=posts;
  const extra = useRef(false), morePending = useRef(false), asOf = useRef<number | undefined>(undefined);
  const refresh = useCallback(async (quiet = false) => {
    if (quiet && morePending.current) return;
    const ticket = requests.begin(), current = () => ticket.isCurrent() && currentKey.current === key;
    morePending.current = false; setMoreLoading(false);
    if (!quiet) setLoading(true);
    setError('');
    try {
      if(quiet&&extra.current){
        const refreshed=await revalidatePosts(currentPosts.current,ids=>request<{posts:Post[]}>('/api/posts/revalidate',{ids},ticket.signal));
        const params=new URLSearchParams(query),at=Date.now();
        if(current())setPosts(refreshed.filter(post=>matchesPostQuery(post,params,at)));
        return;
      }
      const data = await request<Page>(`/api/posts?${query}`, undefined, ticket.signal);
      if (current()) { setPosts(data.posts); setNextCursor(data.nextCursor); asOf.current = data.asOf; extra.current = false; }
    } catch (failure) { if (current()) setError((failure as Error).message); }
    finally { if (current()) setLoading(false); }
  }, [key, query, requests]);
  const loadMore = useCallback(async () => {
    if (!nextCursor || loading || morePending.current) return;
    const ticket = requests.begin(), current = () => ticket.isCurrent() && currentKey.current === key;
    morePending.current = true; setMoreLoading(true); setError('');
    const params = new URLSearchParams(query);
    params.set('cursor', nextCursor);
    if (asOf.current !== undefined) params.set('at', String(asOf.current));
    try {
      const data = await request<Page>(`/api/posts?${params}`, undefined, ticket.signal);
      if (current()) { setPosts(previous => [...new Map([...previous, ...data.posts].map(post => [post.id, post])).values()]); setNextCursor(data.nextCursor); extra.current = true; }
    } catch (failure) { if (current()) setError((failure as Error).message); }
    finally { if (current()) { morePending.current = false; setMoreLoading(false); } }
  }, [key, loading, nextCursor, query, requests]);
  useEffect(() => {
    setPosts([]); setNextCursor(null); extra.current = false;
    void refresh(); const timer = setInterval(() => void refresh(true), 60000);
    return () => { clearInterval(timer); requests.cancel(); };
  }, [refresh, requests]);
  return { posts, setPosts, loading, moreLoading, error, nextCursor, refresh, loadMore };
}
