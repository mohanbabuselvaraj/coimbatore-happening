# Coimbatore

A real 3D, OpenStreetMap-based city map with anonymous place notes, events, upvotes, and a browsable archive. Local time and Open-Meteo conditions affect the view. The map takes its spatial reference from SF Life; the labels and controls are independently built for this product.

## Run locally

Requires Node.js 22.13 or newer. In PowerShell, use `npm.cmd` if PowerShell blocks npm scripts.

```powershell
cd "C:\Users\91989\OneDrive\Documents\ChatGPT\Coimbatore 3D map\city-map"
npm.cmd ci
node scripts/init-local.mjs
npm.cmd run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_previous_thing.sql
npm.cmd run dev -- --host 127.0.0.1
```

Apply the initial migration once to a new local database. Do not replay it against an already initialized database. The development server prints its URL, normally `http://127.0.0.1:5173/`. Local data stays under ignored `.wrangler/state`; the local service secret stays in ignored `.dev.vars`. A full build can be previewed with `npm.cmd start`.

The `predev` and `prebuild` scripts synchronize MapLibre's worker and its licence into `public/maplibre`. Keeping that worker outside Vite's development transformation prevents worker/HMR conflicts.

## Implementation

- React + TypeScript, Vite/Vinext, and MapLibre GL JS.
- React Router handles the Current/Archive view through `?view=archive`, including refresh and browser history. `components/MapViewTabs.tsx` uses Tailwind 4 utilities with the `tw:` prefix; Tailwind's reset is omitted to preserve the established map controls. Server API routes stay in Vinext.
- Typography follows the user's Sotazine reference using approved free alternatives: Barlow Condensed headings, Barlow controls, and EB Garamond prose. Used Latin weights are self-hosted with `font-display: swap`; other scripts use platform fallbacks. Font OFL licences are included under `public/fonts/`.
- Cloudflare Worker routes in `lib/api.ts`; shared D1 storage through the `DB` binding.
- Schema in `db/schema.ts`; immutable generated SQL and Drizzle metadata under `drizzle/`.
- Map style, vector data, fonts, and sprite traffic proxy through `/api/map/`; the browser does not contact the tile provider directly.
- Search runs against `public/data/places.json`, an ODbL snapshot of 2,795 OSM-derived places. Unindexed places can be selected directly on the map.
- Weather is fetched by the server and checked every five minutes. Open-Meteo is primary; MET Norway supplies an explicitly labelled forecast fallback when the primary fails. Provider payloads respect their Expires headers, concurrent fetches are shared, and Open-Meteo 429 responses trigger a Retry-After cooldown (one hour if omitted). No visitor location, address or browser headers are forwarded. The UI labels forecast, stale and unavailable states; data are modeled conditions, not local weather-station measurements.
- Each public field is screened on the server before storage. The browser repeats checks for immediate feedback. Event dates and coordinates remain structured data.

## Starting policies

`lib/product.ts` contains the adjustable working defaults: notes enter Archive after seven days, events after they end, and ten upvotes retain current visibility. These implement the user's archive/popularity model; the exact thresholds are not confirmed permanent policy. Archived posts are retained. An ended event remains labeled ended even when popular.

The initial Coimbatore service area is the bounding box in that file, not a surveyed municipal polygon. Source building heights are used when available, otherwise a nine-metre approximation. The map discloses estimated heights.

## Anonymity and abuse controls

There are no visitor application accounts, public profiles, or author identifiers. Anonymous map activity totals are described below. Public posts include a chosen place, text, event timing where applicable, and a vote count. A user can still identify themselves through their own text; anonymity is not a promise that public content reveals nothing.

Phone screening covers known English, Tamil, and Tanglish number words, mixed digits/words, repeated number words, common leetspeak, Unicode decimal forms, separators, and invisible characters. It also rejects contact links and email addresses. Arbitrary encoding cannot be perfectly detected. Do not market this as a universal or mathematically complete filter; keep expanding the regression corpus and reviewing reports.

Per-post random vote tokens and author removal keys stay on the device. The server stores hashes, not those keys. Clearing browser storage loses author removal access. Token-based idempotency plus rate limits cannot prove one human/one vote.

The Worker uses an hourly, action-specific HMAC of the network address for abuse budgets; it does not store the raw address. Expired budget records are removed when the next limited action runs. Hosting and network providers may still receive connection metadata. `RATE_LIMIT_SECRET` must be a private runtime secret; Sites has been configured with it, and local setup creates a separate local value.

Reports are saved in the D1 `reports` table for operator review. There is no claim of instant or staffed moderation. The owner can review reports and hide or restore entries in the private administration dashboard. Establish an operating moderation policy before an unrestricted public launch.

## Verification

```powershell
npm.cmd run test
npm.cmd run typecheck
node tests/api-integration.mjs
npm.cmd run build
```

The API integration script requires the local server on port 5173 and local D1 access. It creates disposable local fixtures, tests phone checks, cross-origin rejection, persistence, idempotent voting, reporting, author controls, archive transitions, and retention, then removes its fixtures. It must not target production. Browser QA covers desktop, the observed 870px viewport, and a 390px phone, including day/night, search, note creation, voting, phone rejection, and event entry. Review evidence lives outside this application checkout under the parent `.impeccable/review/`.

## Hosting

`.openai/hosting.json` identifies the private Sites project and declares `d1: "DB"`. Publish through the Sites workflow so migrations and the exact source/build state travel together. Source credentials and runtime secrets must not be committed.

The first deployment is owner-private by default. The application's anonymous posting model does not bypass that hosting access gate. Public anonymous access requires changing the Site's audience deliberately. Local and hosted databases are independent; test posts are not seeded into the live database.

Open-Meteo's public endpoint is selected for a non-commercial preview. Reassess terms and capacity before commercial use. No paid map, weather, or hosting plan has been purchased.

## Sources

- [OpenStreetMap contributors / ODbL](https://www.openstreetmap.org/copyright)
- [OpenFreeMap](https://openfreemap.org/) and [OpenMapTiles](https://openmaptiles.org/)
- [Open-Meteo](https://open-meteo.com/) current conditions, attributed under CC BY 4.0
- [MET Norway](https://api.met.no/) fallback forecasts and solar times, [CC BY 4.0](https://api.met.no/license_data.html). Provider symbols are normalized to short condition labels for this interface.
- MapLibre GL JS is vendored only for its public worker files, with its licence.

`scripts/fetch-places-from-tiles.mjs` refreshes the local place snapshot from a bounded tile set using at most four concurrent requests and 50 MB. The earlier Overpass extraction script remains an optional alternative; the initial Overpass services were unavailable. Do not substitute fabricated place data.

## Owner dashboard

Open /admin and sign in through Sites. ADMIN_OWNER_EMAIL is a private runtime configuration value matching the verified Site owner's platform email. Every admin request requires the platform user ID and matching email, followed by a separate password session; signing in alone grants no admin access. Missing configuration fails closed. The local Sites mock uses seedy@sites.test; its cookie and identity injection are loopback-only development behavior and absent from production.

On the first authorized visit, the owner sets a separate 16–128 character password privately in the form. Store it in a password manager; never put it in chat, source code, or runtime logs. D1 stores only a randomly salted scrypt hash (`N=32768, r=8, p=3`, 32 MiB), using native server cryptography and an [OWASP recommended configuration](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). Password setup is atomic so concurrent requests cannot replace an existing password. Login and setup share a limit of eight attempts per owner per clock hour.

The dashboard locks after 15 minutes without a successful admin request, with an eight-hour absolute session limit. Lock dashboard revokes the current session immediately. Production sessions use a Secure, HttpOnly, SameSite=Strict, host-only cookie; D1 stores the token hash, bound to the platform owner and current password hash. Password hashes and session metadata never appear in dashboard responses. A local HTTP preview uses a separate development cookie name.

There is no public password-reset endpoint. If the owner loses the password, use authenticated, private D1 operator access to delete the owner's `admin_sessions` and singleton `admin_credentials` row together in a transaction, after confirming the owner ID. The next authorized owner visit offers setup again. Never expose that operation as a public route. Replacing or removing a password hash invalidates existing sessions; the platform owner check always remains required. This recovery changes only the admin gate, preserving community entries and reports.

The dashboard searches and pages real D1 entries, edits public text/location/IST times, hides/restores posts independently of Archive, resolves/reopens report batches, and records private before/after history. Restoring a historical version revalidates public content and records a new change. All mutations use a revision check and an atomic D1 batch; stale edits return 409. Vote counts and contributor identity remain outside the editor.

Migration 0001 adds nullable visibility/report-resolution columns, a constant revision default and admin_history. It preserves existing entries and tables. For an existing local database, apply this migration once using wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_slippery_cobalt_man.sql. Hosted Sites applies pending migrations during publication. Never reapply the SQL to a database where it has already run.

Migration `0003_eager_firelord.sql` adds only `admin_credentials`, `admin_sessions` and a session-expiry index. Apply it once to an existing local database using the same Wrangler command pattern. Hosted publication applies pending migrations; it does not set a password.

Run `node tests/admin-password-integration.mjs` against the local preview on port 5173 with an unconfigured disposable local admin database. It checks password setup races, owner authorization, CSRF, validation, login limits, idle/absolute expiry and logout. It also runs `tests/admin-integration.mjs` and `tests/activity-integration.mjs` with a temporary local session to verify moderation, audit history, public visibility and activity behavior. Test passwords, sessions and fixtures are removed in finally; it refuses to overwrite an existing local password. These scripts must never target production.

## Anonymous map activity

The redesigned `/admin` opens on Overview, with Map visits, Place views and distinct Places explored. The last count is places, never unique people. Rankings search and paginate real daily D1 aggregates. Periods are 7, 30 or 90 calendar days in Asia/Kolkata. Days before the first recorded activity show Not measured. No historical activity is backfilled.

A map visit is counted once per document load. Explicit selections count as place views; repeated selections of the same place are suppressed for 30 seconds in memory. Returning/reloading can count again. Indexed places resolve on the server against the bundled OSM snapshot. Unindexed selections are grouped to three decimal coordinate cells (roughly 100m), named Map pin. Counts describe exploration on the map, not visitors' device locations or physical visits. Privacy signals and abuse limits can reduce totals; these are activity counts, not a precise audience measurement.

No analytics visitor ID, analytics cookie, fingerprint, raw IP log or user-agent log is added. Existing platform access cookies and hourly keyed abuse budgets still apply. Browser DNT and Global Privacy Control skip recording on both client and server. `/api/activity` accepts same-origin POSTs; `/api/admin/overview` remains owner-only. Daily aggregates are retained for 90 days; expired rows are pruned on the next recorded activity. Admin screens themselves do not count as map visits.

Migration `0002_flippant_gambit.sql` adds only activity_daily and activity_meta. For an existing local database apply it once, as with 0001. Hosted publication applies pending migrations. Run `node tests/activity-integration.mjs` with the local preview for tracking, privacy, atomic counters, rankings, pagination and IST windows. Fixtures are local and removed in finally.

The chart metric selector follows the Vercel customizable widget interaction: a button-anchored picker with real current values and a 200ms vertical opacity transition when selecting a metric with a pointer. Keyboard actions are immediate and reduced-motion preferences disable movement. Charts and data do not animate decoratively. The owner dashboard keeps Barlow Condensed, Barlow and EB Garamond, with Phosphor SVG icons and cream surfaces; public map styling is preserved.
