'use client';
import { ArrowUpRight, ChevronUp, StickyNote } from 'lucide-react';
import { PLACE_SHORTCUTS } from '../lib/place-search';
import type { Place } from '../lib/product';

export default function DiscoveryDock({ places, onSelect, onBrowse }: { places: Place[]; onSelect: (place: Place) => void; onBrowse: () => void }) {
  const shortcuts = PLACE_SHORTCUTS.flatMap(shortcut => {
    const place = places.find(place => place.name === shortcut.name);
    return place ? [{ ...shortcut, place }] : [];
  });
  return <section className="discovery-dock" aria-label="Explore Coimbatore">
    {!!shortcuts.length && <nav aria-label="Places to explore" className="place-shortcuts tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-0">
      {shortcuts.map(({ label, place }) => <button key={place.id ?? place.name} onClick={() => onSelect(place)} className="tw:inline-flex tw:min-h-11 tw:items-center tw:gap-1 tw:border-0 tw:bg-transparent tw:px-0 tw:py-2 tw:text-control tw:font-semibold">
        {label}<ArrowUpRight size={14} aria-hidden="true" />
      </button>)}
    </nav>}
    <button className="browse-posts tw:flex tw:min-h-12 tw:w-full tw:items-center tw:gap-2.5 tw:border-0 tw:bg-transparent tw:px-0 tw:py-2.5 tw:text-control tw:font-semibold" onClick={onBrowse} aria-expanded={false} aria-controls="post-panel">
      <StickyNote size={18} aria-hidden="true" /><span>Notes & events</span><ChevronUp size={18} className="tw:ml-auto" aria-hidden="true" />
    </button>
  </section>;
}
