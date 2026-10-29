# Playhouse

Pittsburgh Planning Studio

by Hack the House

# Validation

What has been checked, how, and what has not. Run everything with:

```bash
python -m unittest discover -s pipeline -p 'test_*.py'
cd web && npm ci && npm test && npm run build
```

The release records below are historical. Explorer and its explanation endpoint were retired on October 27, 2026; prior checks do not describe current routes.

## Citywide release — September 27, 2026

- **Coverage:** all 90 Pittsburgh neighborhoods; 142,865 mapped records (142,571 identified parcels plus 294 anonymous/shared-ground polygons with internal map IDs). No neighborhood omitted. 140,983 records match assessment evidence. Unknown parcel-ID-based property flags stay unknown.
- **Buildings/network:** 116,502 recorded outlines; 371,689 walking nodes, 845,872 directed edges, 311 mapped parks with walking access. 94 park ways lacked a valid polygon or mapped access; relation-only parks remain out of scope. Recorded outlines and estimated heights are not a verified current dwelling inventory.
- **Automated checks:** 49 Python tests pass. **30 web test files pass**. They cover original study regressions plus all 90 canonical-to-browser parcel round trips, unique IDs, lookup, hashes, chunk failures/aborts, graph remapping and cache behavior. Build succeeds in **53.46 seconds**, including data preparation. Routing tests cover curved/same-edge routes, disconnected crossings, foot direction, bridge snapping exclusions, fractional new junctions, immutable baselines and no score/land effect from saving existing routes.
- **Transport:** no citywide parcel/building/graph download on entry. Hashed parcel/building parts target 12 MiB, with one buffered routing region per active site. The manifest is **57,246 bytes** (11,328 gzip). The largest individual file is a regional graph at **15,460,400 bytes**. Static public assets total **838,256,997 bytes**; the explanation function trace totals **34,903,169 bytes**, below the ordinary 250 MB function limit. This is CDN storage, not a per-visit download. Each file is below 50 MB. Canonical compressed sources total about 46.5 MB; the original study files are test fixtures outside the public directory. Map assets are excluded from the explanation function, which reads only requested compressed neighborhoods.

### Local browser checks and preview handoff

Checked the production build locally in the desktop browser, using the same default parcel in both views. Every row below loaded scores, zoning and public-source evidence. Studio successfully added one single-family building at each site and compared it with all other templates. Explorer successfully placed its A/B comparison options. No browser console errors were captured in either view.

| Neighborhood | Parcel PIN | Studio single-family score | Explorer A / B scores |
| --- | --- | --- | --- |
| Squirrel Hill North | `0085L00096000000` | 80.3 | Single-family 69.7 / large apartment 75.4 |
| East Liberty | `0083F00297000000` | 71.5 | Townhouse/duplex 69.3 / single-family 65.4 |
| Carrick | `0060A00150000000` | 62.8 | Single-family 63.8 / small apartment 68.6 |
| Middle Hill | `0010G00045000000` | 75.5 | Townhouse/duplex 66.7 / small apartment 65.9 |
| Brookline | `0062S00279000000` | 73.7 | Single-family 59.8 / townhouse/duplex 63.1 |

These are separate models, not expected cross-view score parity. Studio retains one draft plus type comparisons, as requested; it has no A/B slots. Middle Hill also produced eligible Studio duplex/triplex scores of 77.6/75.7. Unsupported or conflicting alternatives had no Studio score. Squirrel Hill North's selected parcel lacked a mapped walking connection: access/capacity stayed excluded (5/7 factors), not zero. Explorer is preserved as a reference: its original comparison still displays scores alongside zoning exclusions or special-approval labels.

Neighborhood switching and direct PIN links were exercised. Public-source drawers showed the actual PRT stop, routes and service date for each Explorer parcel. The local `/api/explain` endpoint returned HTTP 200 for all five PINs using the compressed neighborhood sources; the inspected response identified the deterministic template fallback.

The infrastructure UI snapped two Hazelwood points (`-79.943814, 40.411423` → `-79.944191, 40.410018`) and saved a **225 m / 2.8 minute** route. Its underlying network route has ten vertices. Saving it left the displayed stop/park access unchanged, as expected for existing infrastructure. Automated tests additionally cover new connections into edge interiors; visual road crossings alone do not create junctions.

Vercel successfully deployed feature commit `c3540f0` at the [branch preview](https://hack-the-house-git-playhouse-citywide-tej-fff0.vercel.app). The preview requires the team's login, so these browser checks were **local, not preview checks**. The owner has assigned manual preview testing to a teammate. [PR #7](https://github.com/tejaschaudhari131/playhouse/pull/7) is prepared for review and must remain unmerged until the team decides to merge.

For the teammate: open each PIN above on `/` and `/explore`, check sources and zoning, add a building in Studio, compare types (A/B in Explorer), and try **Infra → Route between two points**. Confirm camera panning and neighborhood switching on the actual deployed site. No screenshots were generated.

### Neighborhood-scoped rendering follow-up

Zooming out can no longer expand detail loading to every neighborhood. The selected neighborhood plus its immediate polygon-adjacent neighbors defines the maximum display scope (at most nine neighbors in this release). Only members intersecting the current view are requested. The final viewport triggers downloads, with a two-neighborhood concurrency limit and cancellation of obsolete queued work. Collision-context buildings outside that display scope are filtered without dropping them from evidence. Repeated pointer/UI updates no longer rebuild the parcel search catalogue or upload unchanged feature sets. Infra uses the graph already in memory instead of fetching its separate roads file.

All 30 web test files pass, including bounded concurrency/cancellation, one-hop neighborhood scope, unchanged full-resolution coordinates/heights for all 116,502 building outlines, and unchanged graph vertices/costs. A local production-browser check recorded:

- Hazelwood close view: 219 buildings and 521 parcel outlines; selected neighborhood only.
- Wider view: 6,811 buildings and 8,980 parcel outlines, confined to Hazelwood and its four adjoining neighborhoods.
- City overview: **0 buildings, 0 parcel outlines, 0 road segments**; housing score remained **80.1**.
- Zoom back into Infra: 772 buildings, 1,293 parcel outlines and 1,458 road segments across the two visible allowed neighborhoods. The same two-point route still returned **225 m / 2.8 minutes**.
- Switched to Middle Hill and panned: scope changed to Middle Hill and its adjoining neighborhoods, duplex score stayed **77.6**, and adding a duplex produced a one-building/two-home plan. No browser console errors were captured.

Counts depend on camera size and position. These verify bounded work and correct behavior, not an FPS guarantee on every device. No coordinate simplification, height rounding, scoring change or routing-graph pruning was introduced. Explorer already loads a single neighborhood and retains its reference UI.

### Original-study parity and explicit source corrections

`python pipeline/audit_citywide.py` reproduces [CITY_DATA_AUDIT.json](CITY_DATA_AUDIT.json) against the frozen `527d963` parcel release (unchanged by transit fix `9cf9ce1`). All **8,644 real original PINs** remain. The old ambiguous `COMMON GROUND` record is retained geographically as `SITEB02FAC2205E6ED69`; it is no longer used as a shared parcel identifier.

**6,019 retained PINs have identical score dictionaries; 2,625 differ.** Scoring formulas, type multipliers and weights have not changed. The release regression test requires evidence/factor changes to accompany any score change. Differences are not presented as exact production parity:

- The complete safe-column county assessment extract recovers **307 previously unmatched study records**, including 25 valid sales. Lower Lawrenceville's valid-sale count changes 81 → 106 and median sale price per finished square foot 274.3 → 270.6. This changes neighborhood market inputs and related type scores. The example `0049N00010000000` duplex market score changes 39.9 → 40.9 and equity 26.8 → 26.6; its other scored factors are unchanged.
- Full source coverage retains anonymous polygons separately and applies maximum-overlap neighborhood assignment. Study counts become Hazelwood 3,604; Lower Lawrenceville 1,352; Central Lawrenceville 2,220; Upper Lawrenceville 1,476. Denominators and rounded market factors can therefore change. PIN `0026C00112000000` moves to Bloomfield and `0120P00222000000` to Stanton Heights, with their actual locations retained.
- Expanded hazard coverage corrects the long parcel `0080C00250000900`: flood/steep-slope overlaps extend beyond the old study query area. Its single-family hazard score changes 31.5 → 35.1. Two flood-overlap properties also change without necessarily changing rounded scores.
- The Hazelwood example `0056F00338000000` retains identical parcel scores. Studio access can change with refreshed OSM context; transit capacity additionally uses the explicitly disclosed schedule × spare-place assumption from `9cf9ce1`. These are separate from the parcel score model.

### Remaining limits

Regional routing buffers can omit long detours; unmapped/disconnected access stays unknown. PRT schedules do not establish actual occupancy or utility capacity. Expert zoning, engineering, current occupancy, practitioner validation, mobile frame-rate and 30-user load testing remain unverified. No new paid services or secrets were added.

The initial Studio data for the default Hazelwood site is about **4.77 MB gzip**; the five new-neighborhood examples range from 3.80 to 5.69 MB gzip. These are local file measurements assuming compressed delivery, excluding JS/CSS, basemap tiles and adjacent neighborhoods fetched after camera movement. The benchmark script reproduces them. The largest tracked Git file is the old 27.85 MB regression fixture; no tracked file exceeds 50 MB. Derived browser chunks are generated at build time rather than stored in Git.

## Antialiasing trial — September 27, 2026

Studio now requests `canvasContextAttributes: { antialias: true }`. The local browser confirmed **4× MSAA**, versus zero samples in the previous configuration. Screenshots showed smoother building silhouettes. No geometry, heights, detail thresholds, data loading, scores or Explorer rendering changed.

All **34 web test files pass**, including full-resolution city geometry/height preservation and score parity checks. The production build used for the benchmark also passes.

The production-build browser benchmark ran on an AMD Radeon 780M using Chromium 154/ANGLE on Linux, with an **832 × 644 drawing canvas at device-pixel ratio 1**. Each mode used one warm-up orbit followed by three measured six-second pan/rotation orbits. Pitch stayed at 55°. Hazelwood ran OFF then ON; East Liberty ran ON then OFF. Both modes followed the same camera path over the same source data, with ordinary viewport culling and React updates active.

| View | Median run FPS, OFF → ON | Median run p95 frame interval, OFF → ON |
| --- | --- | --- |
| Hazelwood, zoom 17.6, about 123 buildings at rest | 59.31 → 59.61 | 19.7 → 19.4 ms |
| East Liberty and visible adjoining neighborhoods, zoom 16.2, about 2,600–2,700 buildings | 56.05 → 56.69 | 30.4 → 28.3 ms |

These differences are within ordinary run-to-run variation, **not evidence that antialiasing improves performance**. No meaningful regression was observed in these views, so antialiasing remains enabled for the trial. The wider view had occasional 50–84 ms frame intervals and main-thread long tasks in both modes. The measurements are delivered MapLibre render intervals, not GPU execution time; the close view is refresh-rate limited. GPU memory, power use, phones and larger/high-DPI canvases were not measured. Counts in the [raw results](benchmarks/antialiasing.json) are live DOM snapshots and can lag a final camera frame while React publishes viewport updates.

To repeat, use a disposable local tab and a production build with the diagnostic explicitly enabled:

```bash
cd web
NEXT_PUBLIC_MAP_BENCHMARK=1 npm run build
npm run start -- --port 3001
```

Open `http://localhost:3001/?pin=0056F00338000000&renderBenchmark=1&antialias=off`, dismiss the tour if present, wait for the map and scores, then press **Run close camera benchmark**. Repeat with `antialias=on`. Use PIN `0083F00297000000` and **Run wide camera benchmark** for East Liberty. Keep the tab active, canvas size unchanged and avoid other GPU/CPU-heavy work during measurement. The diagnostic prints context attributes, sample count, render intervals, long tasks and visible-feature counts. It is absent from ordinary builds; rebuild without the environment variable for normal use. Antialiasing is isolated in its own feature commit for rollback.

## Building zoom stability — September 27, 2026

Repeated zoom changes in East Liberty reproduced disappearing buildings: all 486 selected building records remained in the source, but 8 previously rendered IDs disappeared and a rendered feature had no ID. A render buffer alone did not resolve that mismatch. The installed `@maplibre/geojson-vt` 6.1.1 returns immediately when an update includes `removeAllProperties`, ignoring the replacement properties. Overlapping neighborhood chunks can supply new object copies of the same building; those updates then lose height, colour and promoted ID in worker tiles even though the main-thread source remains correct.

Map patches now remove only obsolete property keys before setting the current values. The regression test runs against the actual installed tiler: it fails with the old patch and passes with the corrected patch, retaining IDs, fractional heights and colours while removing obsolete properties. No dependency update or full-source replacement is required.

Studio also retains a 25% geographic margin around each camera edge, reuses it through small movements, shrinks it on substantial zoom-in, and restores cached neighborhood display during movement independently of settled-camera downloads. Detail enters at zoom 14 and exits below 13.5; 3D still starts at 16. The active-neighborhood-plus-immediate-neighbors limit remains in force. Tests cover buffered pan/zoom selection, cutoff hysteresis, cached restoration, neighborhood limits and exact feature retention.

In the corrected production build, four rapid East Liberty zoom cycles (crossing 16, 14 and alternating 13.95/13) returned all **309 originally rendered building IDs** each time, with no unidentified rendered features. The buffered source contained 975 buildings at rest, including offscreen context. Both full overview stops cleared the detailed source to zero. These checks use MapLibre's rendered-feature queries and source data at the same camera pose; they do not compare a rendered count directly with the larger buffered source count.

Hazelwood also restored all **94 originally rendered IDs** on each of four cycles, with 289 buffered source buildings and zero detailed features at both overview stops. No browser console errors were observed. The wider East Liberty camera benchmark used the same desktop, canvas and three-run orbit protocol as the antialiasing trial: median **57.53 FPS** and **26.2 ms p95** versus the earlier 56.69 FPS / 28.3 ms. This is comparable performance, not a demonstrated speed increase. One run still had a 107.7 ms interval; mobile and larger canvases remain unmeasured. [Counts, ID hashes and frame timings](benchmarks/zoom-stability.json) retain both the failing and corrected observations.

All **35 web test files pass**, including citywide coordinate/height preservation and score parity; the production build passes. To repeat the browser check, use the opt-in benchmark build described above and press **Check zoom restoration** after loading the site. This diagnostic is omitted from ordinary builds.

## Historical checkpoints

At the Checkpoint 3 commit: JS 66/66 pass; Python `test_score` 18, `test_pii` 5, `test_sites` 5 pass; `next build` succeeds.

## What the automated tests prove (spec section L)

| Check | Tests |
| --- | --- |
| L.1 Python/JS composite and rank parity | `shared/rank_vector.json` (4-factor, 6-factor, and edge cases) is read by `pipeline/test_score.py` (`test_shared_rank_vector*`) and `web/lib/factors.test.js`, `rank.test.js`. |
| L.2 Inversion, normalization, zero weights, absent and non-finite data, rounding | `factors.test.js`: ties to even (62.25 → 62.2), no early rounding of 100 − risk, all-zero weights → no score, `""`/NaN/Infinity/numeric strings skipped, coverage text, weight shares, transit's total share. |
| L.3 Contributions reconcile; zero weight is never a driver | `comparison.test.js`. |
| L.4 Unequal coverage disclosed; missing layers fail mandatory filters | `comparison.test.js` (coverage warning), `sites.test.js` (unknown data fails a filter that asks about it), `test_score.py` (missing hazards are not zero risk). |
| L.5 Shared factors constant on one parcel; claimed reversals reproduce; ties explicit | `comparison.test.js` (held constant, tie), `robustness.test.js` (the flip just before the reported weight keeps the winner; solved crossing makes the unrounded scores equal; shared factors cannot reorder). |
| L.6 Permission categories | `zoning.test.js` (P, A/S special approval, blank, P/S, Three-Unit vs Multi-Unit, districts outside the table, unknown never permitted), `comparison.test.js` (neither permitted). |
| L.7 Triplex keeps three-unit semantics | `comparison.test.js` (guided example), `explain.test.js` (compare facts: 3 homes, Three-Unit row; CSV label). |
| L.8 AI facts match the screen for six factors; no PII | `explain.test.js` (facts' weighted totals equal `rankTypes`; displacement/carbon labels; no owner fields), `test_pii.py`, `factors.test.js` (evidence drawer). |
| L.9 AI success and fallbacks | `explain.test.js` with the AI SDK mock model: streaming, cache, errors, missing credentials, rate limit, invalid input, provider plan (gateway key / `LLM_*` / OIDC), 401 fall-through, all-fail template, redacted logs. A local HTTP server speaking the OpenAI streaming protocol exercised the real `createOpenAICompatible` path (Checkpoint 2). |
| L.10 Stale and out-of-order summaries | `explainClient.test.js`. |
| Scenario state | `scenarioState.test.js` (round trip incl. triplex and what-if; bad input rejected; version warnings). |

## Browser checks (headless Chrome over the DevTools protocol)

- Checkpoint 1 (local production build): fresh load → onboarding → guided shortlist (25 matches, top PIN 0056F00338000000) → triplex vs townhouse (72.6 vs 72.9) → priority change reverses → brief printed to PDF (2 pages: brief + source/version footer). No page exceptions.
- Checkpoint 2: sweep table, evidence drawer, share link restore (603 characters), stale-version warnings, bad-link rejection, Tab order from the skip link with visible outlines, 0 px horizontal overflow at 390 px.
- Checkpoint 3: the recorded walkthrough of production (`/opt/cursor/artifacts/cp3/`) follows `docs/DEMO_SCRIPT.md`.
- Owner's production checks after the Checkpoint 2 merge: title, share link, and the six-factor compare sentence verified on https://playhouse-pittsburgh.vercel.app.

## Performance (measured, not estimated)

Headless Chrome on the build VM, local `next start`, three runs each. `parcels.geojson` is 27.8 MB decoded and 1.66–1.78 MB brotli-compressed on production. Before the Checkpoint 2 change, five slider moves caused 5–6 long tasks totaling 324–429 ms; after, one long task of 54–57 ms. First map draw 856–877 ms before, 835–873 ms after. These are not real-device timings.

## Known gaps (not validated)

- **Expert zoning review pending.** No qualified reviewer has checked the §911.02 mapping, overlays, or the R1D lot-width rule. Every badge says it needs expert review.
- **No practitioner validation.** Rankings have not been compared with CDC or planner judgment; see `docs/PILOT_PLAN.md`.
- **No outcome validation.** There is no ground truth for "best housing type"; the scores are a transparent screen, not a prediction.
- **Map keyboard access.** Leaflet and MapLibre parcel maps are not keyboard-operable; address search, Find Sites results, the guided example, and share links are the keyboard path.
- **Accessibility audit** beyond the checks above (screen-reader walkthrough, contrast measurement) has not been done.
- **Data currency.** Layers were pulled 2026-09-26/27; the app does not refresh them. CHAS 2018–2022 lags the ACS 2020–2024 inputs.

## October 2026 trust and usability update

- All 43 web test files pass, including saved-plan validation/recovery, explicit cost confirmation, relative priority invariance and citywide address source parity. All 53 pipeline tests pass using the repository virtual environment, including the HUD reference and provenance checks.
- Production build succeeds. Browser checks cover exact fractional input restoration, placed-building restoration, tour return, cost-confirmation invalidation, stable sidebar sizing and citywide address selection.
- Scores remain a preference screen without validated model uncertainty. HOME income references do not establish program rent limits or financial feasibility. Missing construction, acquisition, financing and tenant-level evidence remains unassessed.

## Flood evidence follow-up (2026-10-27)

The flood selector is visible without opening the zoning disclosure. Site results and the selected parcel show the same status used by filtering. Parcel evidence includes the fraction of parcel area intersecting Special Flood Hazard Areas (SFHA) and 0.2% annual-chance zones, with the [FEMA NFHL source](https://www.fema.gov/flood-maps/national-flood-hazard-layer) and the recorded retrieval date, **2026-09-27**, from `web/public/data/sources.json`.

The shared filter has four meanings:

- **Any flood status:** includes parcels with missing evidence.
- **No mapped flood overlap:** both overlap fractions are valid, known zeroes.
- **Mapped flood overlap:** at least one valid fraction is positive. A known overlap remains visible even if the other fraction is missing.
- **Unknown flood status:** no known positive overlap, and at least one required fraction is absent or invalid.

Unknown evidence is no longer allowed through the no-overlap filter when SFHA is zero but the 0.2% field is missing. The existing Explorer “no SFHA” option continues to require a known zero for SFHA only. Empty-site highlights use the active site filters across loaded neighborhoods; the highlight count remains a subset because it also requires pre-screened physical fit and the map's visible neighborhood scope. Sorting never changes filter membership.

`floodEvidence.test.js`, `studioSiteDiscovery.test.js` and `sites.test.js` pass. They cover zero versus missing/invalid fractions, both mapped categories, partial evidence, precise percentage display, source-date provenance, combination with vacancy/tax-delinquency flags and applying the same filters across neighboring areas, preserving fitting template IDs and intersecting empty-site candidates with active filters. Existing restricted-record exclusions and caution tags are preserved. A read-only check of the saved parcel partitions confirms 14 mapped-overlap parcels in Hazelwood; the current default record exclusions leave 3,168 sites, and the no-overlap filter leaves 3,154. In South Side Flats the corresponding list changes from 3,378 to 3,202 (176 removed). No flood geometries or parcel observations were changed.

**Limits:** percentages describe parcel area, not the probability that a parcel floods. The saved export retains SFHA/0.2% categories, not detailed FEMA zone codes or map panel effective dates. Minimal-hazard Zone X polygons are outside the source query; no overlap is not proof of safety. Current FEMA maps, amendments and site-specific review remain necessary before a development decision. These changes expose existing evidence; they do not refresh or certify it.

Browser checks on the production build confirmed Hazelwood's 3,168 → 3,154 list change and South Side Flats' 3,378 → 3,202. Selecting Lower Lawrenceville screens the grouped Lawrenceville area and shows 323 mapped-overlap results. South Side Flats' visible empty highlights changed from 3 for mapped overlap to 1 for no overlap. The selected riverfront parcel at 1 Vesuvius St showed 6.5% SFHA and 0.9% 0.2%-zone overlap, its FEMA link and retrieval date. The unknown-status filter shows an empty result where all saved records are known.


## Dropdown pointer dismissal (2026-10-27)

Closing a dropdown with an outside pointer gesture consumes that gesture's compatibility mouse/click events, so it cannot also select a map parcel. The guard releases after the click, cancellation, blur or the next pointerdown; wheel and touch scrolling remain native. `dismissPointer.test.js` and `selectMenu.test.js` pass. Browser check: opening Neighborhood then clicking an existing building kept PIN 0056F00336000000 unchanged while closing the menu; a second click at the same point selected PIN 0056F00332000000. Keyboard selection and Escape remain available. Resize events whose target is Window or VisualViewport no longer reach `Node.contains`.


## Search, inspector and notification keyboard follow-up (2026-10-27)

Citywide suggestions close on Escape from either the input or a result, and on outside interaction, without clearing the query. Arrow keys navigate suggestions; Escape returns focus to the search field without reopening results. Inspect moves focus to the building heading, and closing details returns to its Inspect button (or the address search if that button no longer exists). Closing detail actions and a focused expiring toast also recover focus. A focused toast consumes Escape before workspace tools; open map-key and modal interactions keep their own dismissal priority.

Production-browser checks: search text survived input/result Escape and outside click; building Inspect → Escape returned to the same Inspect control; toast Escape dismissed the toast while leaving building details open. All four street tools and building placement still cancelled with Escape, and the tour returned focus to Tour. No browser errors were captured. Full web suite passed (55 files before the added dialog-focus test), all 53 pipeline tests passed with the existing virtual environment, and production compilation passed. No source records, housing scores or geometry were changed by these keyboard fixes.


## Site brief dialog follow-up (2026-10-27)

The Studio's 1-page site brief is a native modal with explicit forward/reverse Tab wrapping for embedded browsers, initial Close focus, Escape handling and trigger-focus restoration. Backdrop gestures dismiss it without selecting the map; clicks on the report stay inside. Keyboard events in the brief cannot trigger map rotation or placement shortcuts. The scrollable standards and receipts tables are keyboard-focusable. Narrow screens stack the diagram, proposal and pro forma, with wide tables scrolling inside the report. Print-specific rules preserve the existing letter-page layout and override the global hidden-dialog print rule.

`dialogFocus.test.js` covers forward/reverse wrapping, hidden/disabled controls, non-control focus recovery, browser shortcut passthrough and empty-dialog fallback; it and `siteBrief.test.js` pass. Browser checks confirm initial focus, Tab/Shift+Tab containment, Escape/Close/backdrop restoration and unchanged parcel selection after backdrop dismissal. At 390×844 the modal's scroll width equals its client width (375 px); wide tables scroll within the 319 px report column. Desktop layout was visually checked. Physical printing was not performed; print preservation was checked in the CSS. Production build passes after these changes.

## Distinguishing buildings within a parcel (2026-10-27)

The Studio numbers the complete set of site outlines north-to-south, then west-to-east, with source identity as a tie-break. The list and map use the same numbers; demolition, restoration and Undo change status without renumbering. Numbers identify outlines within the selected site, not addresses or verified individual occupancies. The recorded parcel use can still apply to multiple footprints.

Rows show footprint area and a compact height label. Mapped, estimated, inferred and placeholder heights remain distinct, with full source context under Building evidence. Selecting a row focuses the map and highlights the matching outline; clicking a crossing outline's numbered badge keeps the current parcel workflow. The small label layer only covers the selected site and hides during placement, street drawing, overview browsing or when existing buildings are hidden. Source geometry, heights and scores are unchanged.

`buildingIdentity.test.js` and `siteBuildingLabels.test.js` cover stable ordering, duplicate chunk records, matched/crossing/unmatched identity, demolition/restoration, missing evidence, unchanged source records, and marker positions inside concave, courtyard and multipart outlines. A read-only check of all 6,660 Hazelwood context outlines found every marker on its roof and no missing footprint areas. The full web suite passes (58 test files).

Production-browser checks covered three same-use apartments at 554 Bigelow St (`0055G00282000000`), the crossing single-family outline at 5415 Glenwood Ave (`0057C00388000000`), and two unmatched outlines at 5037 Steele Ct (`0056L00279000000`). List and map selection agree; crossing-badge selection keeps the original site; demolition/Undo preserves numbers; Escape returns to the originating list button. Hiding existing buildings also hides their selection outline. At 390×844 the page width is 390 px and every building row's scroll width equals its client width (352 px). No browser warnings or errors were captured, and the production build passes.

Native symbol collision handling gives the selected number priority and omits overlapping unselected badges until there is room; the complete numbered list remains available. This prevents an adjacent badge's invisible hitbox from selecting the wrong building. Roof markers use the existing display height, without turning illustrative heights into measured evidence. The address marker hides while building labels are displayed to avoid covering them.

### Numeric input validation

Number edits are applied on Enter or blur. Out-of-range dimensional and filter values show a correction message; fractional stories and invalid rent/income are rejected without changing the scenario. `node --test lib/numberInput.test.js` covers these cases. The income minimum is a simulator input guardrail, not a household eligibility rule.

## Studio v3 policy and usability review (2026-10-27)

The 66-file web suite passed (51.0 seconds), including whole-city equality checks; all 58 pipeline tests passed. Follow-up targeted regressions also pass for missing optional import metadata, retaining manual capacity/direct access, preserving excluded costs during parcel changes, and inspecting off-site draft blockers without altering the numbered site inventory. Tests cover five-factor normalization, separate physical/capacity checks, zero reserve, unique GTFS trips, frozen-feed provenance, displacement without the flat-rent cap, prototype affordability, close results, scenario imports and malformed exports.

Data preparation retains all 142,865 parcel records across 90 neighborhoods and all recorded building coordinates/heights. The manifest is 148,917 bytes (54,688 gzip); the largest parcel/building part is 862,256 bytes. Hazelwood uses eight parcel and four building parts, totaling 9,111,474 uncompressed bytes. Its complete initial evidence, including the regional walking graph and shared sources, is 26,453,601 bytes (4,841,863 gzip). Gzip is a local compression measurement, not a guaranteed Vercel transfer size. The largest file is still a 15,460,400-byte regional graph: preserving reachability requires more context than the visible neighborhood. The old unused road files are excluded from the browser output. Geometry is not simplified.

Measured warm parcel/building parse plus reconstruction p50/p95 was 67.6/88.5 ms; small parts yield between parses. This is not a claim of lower total CPU time or a mobile FPS guarantee. OpenFreeMap supplies the contextual basemap; the local evidence layers remain unchanged.

The production build passed before and after patching Next.js to 15.5.28. The full `npm run build`, including data preparation, took 46.9 seconds; a subsequent compile of the final scenario-state guards took 13.1 seconds. The later inspection/layout build also passed. `npm audit` reports zero known vulnerabilities after compatible dependency patches.

Production-build browser checks covered Studio and Explorer with OpenFreeMap; prototype rent and HUD-band controls; blocked types and comparison cards; preset and Add-button focus; Ctrl+Z/Ctrl+Shift+Z; confirmation before New plan; JSON export/import and reload; stop-specific +60 departures, switching stops and resetting additions; explicit invalid income/rent/story messages; site-brief keyboard containment, outside-click dismissal and focus restoration; numbered building inspection and Escape; and East Liberty-first Penn Avenue results with distinct PINs. Negative minimum lot size visibly corrects to zero without removing valid results. No browser warning/error logs were captured in those checks.

The 640×360 and 426×240 CSS-viewport checks represent the available space at roughly 200% and 300% zoom on a 1280×720 window. They are layout-equivalent tests, not a claim that browser zoom itself was instrumented. Header actions wrap without horizontal page overflow; short views scroll vertically and keep a nonzero map area. Native screen-reader, mobile-GPU and real 30-user load testing remain unverified.

An additional East Liberty regression check on `0083F00297000000` confirmed that **Inspect first** opens nearby outline `415479` while retaining the selected parcel. It shows its 187 m² footprint, inferred 7.5 m height and unmatched/outside-site provenance; Escape returns to Inspect first. The final compact map track is 320 px, with controls above the attribution area. These changes do not assign neighboring buildings to the selected parcel.

The desktop widened-sidebar check also keeps bottom map controls above wrapped attribution when the map pane becomes narrower than 640 px. This uses the map container width, independent of the browser viewport breakpoint.


## Legacy Explorer retirement — October 27, 2026

Removed the Explorer UI, its optional AI endpoint, obsolete UI/model helpers and their feature-specific tests, plus Leaflet and AI SDK dependencies. Shared source-score, zoning and parcel helpers remain covered; no source records, geometry, Studio formulas or plan schema changed. Historical Explorer validation above is retained as a release record.

- All **61 remaining web test files pass**, including new compatibility-link regressions (valid parcels, old encoded A/B links, malformed input, oversized input and unsupported versions).
- Full `npm run build` passes; a final Next build confirms the home page remains static. `/explore` is only a server redirect, not a second interface. `/api/explain` returns 404.
- Local production browser: old parcel bookmarks and encoded `/?s=…` links redirect to Studio with the correct PIN; legacy weights/options are not applied. Studio shows a retirement notice. The Hazelwood map, housing scores, Add to plan, Undo and comparison cards work. The header contains no Explorer link. No browser warnings/errors were captured.
- README, setup and model documentation now describe one live interface. No deployment or production smoke test was performed for this change.

## Pro forma and placement QA — October 27, 2026

All 63 web test files passed (58.2 seconds). Eight focused suites passed again after the final financial/import and brief corrections. Full `npm run build`, including city data preparation, passed. No source geometry or parcel scores were regenerated with changed formulas in this work; financial assumptions have their own `pro-forma-2.0` export version.

Local production-browser checks on Hazelwood PIN `0056F00338000000` covered editable cap rate, rejection of a reversed construction range, explicit budget/NOI rows, and absence of automatic credit/abatement awards. Placement checks covered R/Shift+R, arrow-key movement, retaining placement mode while selecting Triplex, adding a building, editing its width from 10 m to 9 m, saving, undoing back to 10 m, and undoing the placement itself. Cancelling a shape edit preserves the original plan. The saved-plan banner is limited to a restored plan that already contains buildings or demolitions. No console warning/error logs were captured.

The brief preview shows mapped ground-level walking-network context from the already loaded graph, plus updated NOI, costs and unassessed benefits. Diagram tests check edge coordinates/deduplication and exclude elevated links. The diagram does not establish street width, legal frontage or setbacks. The existing Letter print stylesheet remains in use; the updated screen preview was inspected, but a new native PDF/page-count check was not performed. Browser headers/footers remain a user print setting, explained above the Print button.

Program eligibility, actual restricted units/eligible basis, financing commitments, abatements and lender underwriting remain unassessed. Automatic legal-frontage/setback snapping is not implemented without suitable evidence. Scenario download code is only called by explicit export/recovery buttons; device autosave does not trigger downloads. These local changes have not been pushed or deployed.

## Compact housing cards — October 27, 2026

Four targeted test files pass: build controls, Studio presentation, draft status and Title Nine. New cases preserve blocked scores, distinguish unknown fit from failure, count conditional checks as unassessed and retain aggregate plan scope. The Next.js production build passes. Browser checks on Hazelwood confirmed equal 129 px card heights without horizontal overflow at 420 px and 600 px sidebar widths, arrow-key selection/focus, the information disclosure and Escape dismissal, and selected-type conflict details with code links. No browser warnings/errors were captured. This is presentation only: scoring, source data and eligibility rules are unchanged.

## Procedural 3D architecture and block streetscape — October 29, 2026

All 364 web tests pass, including 24 new 3D cases. They cover:

- footprint frames and the front guess from nearest lot line and street gap;
- every typology staying inside its footprint and under its height, with one plate per story;
- typology features and preview warning hues;
- existing-building tones;
- equinox sun angles and shadow direction and length;
- yard pads, inset refusal, the front walk, park, path and yard trees;
- envelope height per reform preset, the setback pad and envelope posts.

The Next.js production build passes.

Headless Chrome (SwiftShader WebGL) on Hazelwood PIN `0056F00338000000` checked:

- the duplex, single-family, triplex and red small-apartment previews;
- Add to plan with material tones and yard trees;
- Morning, Noon and Afternoon shadow direction;
- Street view toward the guessed front facade, and back to aerial;
- the Bill 2025-1545 envelope at 45 → 75 ft with the current-code ghost frame;
- 390 px and 900 px layouts.

No browser warnings or errors were captured. Park and path trees are covered by unit tests, not by a browser check. Scores, eligibility, source data and plan schema are unchanged. The draft preview adds display-only `typeId`, `floors` and `state` properties.
