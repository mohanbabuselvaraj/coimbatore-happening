'use client';
import { RotateCcw } from 'lucide-react';
import type { EventWindow, PostKindFilter } from '../lib/post-query';

type Props = { kind: PostKindFilter; when: EventWindow; archive: boolean; loading: boolean; onChange: (kind: PostKindFilter, when: EventWindow) => void; onRefresh: () => void };
export default function PostFilters({ kind, when, archive, loading, onChange, onRefresh }: Props) {
  return <div className="feed-filters">
    <div className="post-filters" role="group" aria-label="Filter posts">
      {(['all', 'note', 'event'] as const).map(value => <button key={value} aria-pressed={kind === value} onClick={() => onChange(value, value === 'event' ? when : 'any')}>{value === 'all' ? 'All' : value === 'note' ? 'Notes' : 'Events'}</button>)}
      <button className="refresh-posts icon-button" aria-label="Refresh posts" disabled={loading} onClick={onRefresh}><RotateCcw size={15} /></button>
    </div>
    {kind === 'event' && <div className="event-filters tw:flex tw:flex-wrap tw:gap-1" role="group" aria-label="Event time in Coimbatore">
      {([['any', 'Any time'], ...(!archive ? [['now', 'Happening now']] : []), ['today', 'Today']] as [EventWindow, string][]).map(([value, label]) => <button key={value} aria-pressed={when === value} onClick={() => onChange('event', value)}>{label}</button>)}
    </div>}
  </div>;
}
