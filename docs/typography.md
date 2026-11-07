# Sotazine typography adaptation

The user supplied https://www.sotazine.com/ and chose free, self-hosted close matches on 5 November 2026. The current reference was its issue-two teaser, not an older archived layout.

The live browser's computed styles showed:

| Reference face | Observed role | Treatment |
| --- | --- | --- |
| Trade Gothic Next | Labels and signup action | 400–800 weights; short capitals with approximately 0.1em tracking |
| Trade Gothic Next Compressed | Contributor display and supporting display lines | 400/800; narrow proportions and approximately 0.1em tracking |
| Hightower Text | Prose and introductory line | 400; signup prose approximately 21px/25px at the observed desktop width |
| Cooper Black Std | Signup heading | 400; wide, rounded display contrast |

These names were measured from rendered DOM styles. The large illustrated masthead and script artwork are graphic assets rather than a reusable interface text system. The page loads an Adobe Fonts stylesheet, along with additional Google/CDN font options; listing those options alone would not identify which faces it actually uses.

## Implemented roles

| Our face | Use | Reason |
| --- | --- | --- |
| Barlow Condensed 700 | City identity and panel/place headings | Carries the compressed display character at map-control sizes |
| Barlow 400/600/700 | Controls, labels, input fields, timestamps | A readable sans counterpart for the Trade Gothic role |
| EB Garamond Variable | Full notes, excerpts, information, and note entry | Supplies the editorial serif contrast of Hightower Text |

These are deliberately close alternatives, not identical fonts. A separate Cooper-style face would add another display voice without a useful role in this map. Natural case is preserved in place names and user prose; tracking is reserved for short fixed labels.

Used Latin faces are bundled through Fontsource with `font-display: swap`. Font licences ship in `/fonts/LICENSE-barlow.txt`, `/fonts/LICENSE-barlow-condensed.txt`, and `/fonts/LICENSE-eb-garamond.txt`. Other scripts fall back to installed platform fonts, including Tamil. The application sends no font requests to Adobe, Google Fonts or Sotazine.

The React Router component is `components/MapViewTabs.tsx`. Its Tailwind utilities use the `tw:` prefix and shared type/color tokens from `app/globals.css`. Current and Archive are real links; Archive uses `?view=archive`, and refresh and browser history retain the view without resetting the map during a view change. Vinext continues to serve the Worker API and root document.

## Verification

Rendered at 1280px, 870px, 390px and 320px, with a long OSM place title, Latin/Tamil draft text, event fields, a scrolling composer, and a reachable Publish action. Drafts were discarded without publishing. Browser navigation verified Current/Archive, Back/Forward, and a fresh Archive reload. TypeScript and the 13 existing domain/cache tests passed; Impeccable's final mechanical detector returned no findings.

The independent typography assessment found no blocking issue in the supplied captures. Font-swap movement and actual 200% browser zoom were not independently verified. Existing optional map-sprite warnings are outside this typography change.

Primary references: https://sotazine.com/, https://fontsource.org/fonts/barlow, https://fontsource.org/fonts/barlow-condensed, https://fontsource.org/fonts/eb-garamond, https://reactrouter.com/7.18.5/api/hooks/useSearchParams, https://tailwindcss.com/docs/preflight.
