'use client';
import { useState } from 'react';
import { ArrowUpRight, CalendarDays, ChevronDown, LoaderCircle, StickyNote } from 'lucide-react';
import { placeCategory } from '../lib/place-search';
import { eventLabel } from '../lib/presentation';
import type { Place, Post } from '../lib/product';
import { usePostFeed } from './usePostFeed';

export default function PlacePreview({ place, now, fixture, onPost, onCompose }: { place: Place; now: number; fixture: string | null; onPost: (post: Post) => void; onCompose: (kind: 'note' | 'event') => void }) {
  const [archive, setArchive] = useState(false);
  const feed = usePostFeed(`archive=${archive ? 1 : 0}&lng=${place.lng.toFixed(5)}&lat=${place.lat.toFixed(5)}`, fixture);
  return <div className="place-preview">
    <p className="place-category">{placeCategory(place)}</p>
    <div className="place-preview-actions tw:grid tw:gap-2">
      <button className="primary-button" onClick={() => onCompose('note')}><StickyNote size={16} />Add a note</button>
      <button className="secondary-button" onClick={() => onCompose('event')}><CalendarDays size={16} />Mark an event</button>
    </div>
    <div className="place-post-tabs tw:flex tw:flex-wrap tw:gap-x-5" role="group" aria-label="Posts at this place">
      <button aria-pressed={!archive} onClick={() => setArchive(false)}>Current</button>
      <button aria-pressed={archive} onClick={() => setArchive(true)}>Archive</button>
    </div>
    <div className="place-posts" aria-busy={feed.loading}>
      {feed.loading ? <p className="place-status" role="status"><LoaderCircle size={15} className="spin" />Loading posts</p> : <>
        {feed.posts.map(post => <button className="place-post-row tw:flex tw:w-full tw:items-start tw:gap-2.5 tw:border-0 tw:bg-transparent tw:px-0 tw:py-3 tw:text-left" key={post.id} onClick={() => onPost(post)}>
          <span className={`row-kind ${post.kind}`}>{post.kind === 'event' ? <CalendarDays size={16} /> : <StickyNote size={16} />}</span>
          <span className="tw:min-w-0 tw:flex-1"><span className="row-body" dir="auto">{post.body}</span><small>{eventLabel(post, now)}</small></span><ArrowUpRight size={15} />
        </button>)}
        {!feed.posts.length && !feed.error && <p className="place-status">{archive ? 'No archived posts here.' : 'No notes or events here yet.'}</p>}
      </>}
      {feed.error && <div className="feed-error" role="alert"><p>{feed.error}</p><button className="text-button" onClick={() => void feed.refresh()}>Try again</button></div>}
      {feed.nextCursor && <button className="load-more" disabled={feed.moreLoading} onClick={() => void feed.loadMore()}>{feed.moreLoading ? <LoaderCircle size={15} className="spin" /> : <ChevronDown size={15} />}Older posts here</button>}
    </div>
  </div>;
}
