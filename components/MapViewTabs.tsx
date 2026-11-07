'use client';

import { Link, useSearchParams } from 'react-router';
import { Archive } from 'lucide-react';

/** URL-backed post views; changing a view keeps the WebGL map mounted. */
export default function MapViewTabs() {
  const [searchParams] = useSearchParams();
  const archived = searchParams.get('view') === 'archive';
  const linkClass = 'tw:-mb-px tw:inline-flex tw:min-h-11 tw:max-w-full tw:items-center tw:gap-1.5 tw:border-x-0 tw:border-t-0 tw:border-b-2 tw:border-solid tw:bg-transparent tw:px-0 tw:py-2.5 tw:font-ui tw:text-control tw:font-semibold tw:uppercase tw:tracking-label tw:no-underline tw:transition-colors';

  function destination(archive: boolean) {
    const next = new URLSearchParams(searchParams);
    if (archive) { next.set('view', 'archive'); if (next.get('when') === 'now') next.delete('when'); }
    else next.delete('view');
    return { pathname: '/', search: next.size ? `?${next}` : '' };
  }

  return (
    <nav aria-label="Post views" className="post-views tw:flex tw:flex-wrap tw:gap-x-6 tw:gap-y-0 tw:border-x-0 tw:border-t-0 tw:border-b tw:border-solid tw:border-line">
      <Link to={destination(false)} aria-current={!archived ? 'page' : undefined}
        className={`${linkClass} ${!archived ? 'tw:border-ink tw:text-ink!' : 'tw:border-transparent tw:text-muted! tw:hover:text-ink!'}`}>
        Current
      </Link>
      <Link to={destination(true)} aria-current={archived ? 'page' : undefined}
        className={`${linkClass} ${archived ? 'tw:border-ink tw:text-ink!' : 'tw:border-transparent tw:text-muted! tw:hover:text-ink!'}`}>
        <Archive size={15} aria-hidden="true" />Archive
      </Link>
    </nav>
  );
}
