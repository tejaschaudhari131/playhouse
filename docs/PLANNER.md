# Planning Studio guide

Playhouse helps people compare housing and infrastructure ideas for a real Pittsburgh site. It is a screening tool, not a permit, a market forecast or a finding that a property is available.

The Studio at `/` uses **five preference factors and separate feasibility checks**. The legacy Explorer has been removed. Old links open Studio at the linked parcel; old weights and A/B options are not imported. Archived six-factor source fields remain available for provenance, not as another live recommendation model.

See [MODEL_CARD.md](MODEL_CARD.md) for formulas and limitations, [TITLE_NINE.md](TITLE_NINE.md) for supported zoning rules, and [DATA_SOURCES.md](DATA_SOURCES.md) for the source inventory.

## Start with a place

Choose a neighborhood, search an address or enter a parcel ID. Citywide address search puts matching addresses in the current neighborhood first. Separate records with the same address keep their own PINs; they are not silently merged.

The release covers **142,865 mapped records across all 90 Pittsburgh neighborhoods**: 142,571 identified parcels and 294 County polygons without a unique PIN. The latter use stable `SITE…` IDs and disclose missing assessment evidence. The parcel snapshot is September 27, 2026; individual sources have their own dates.

**Find sites** filters public-record flags, lot size, transit walk, zoning use and mapped flood conditions. It supports sorting and pagination. It does not rank development potential. By default it hides cemetery, rights-only, institutional public-land and HUD-assisted records; the restriction toggle can show these again. Zero-area condo unit records are excluded because they do not describe an independently developable lot. Large ordinary lots are not excluded merely because of their size.

**Highlight empty sites** marks conservative existing-condition candidates: affirmative vacancy evidence, positive lot area, no contradictory mapped building use or overlap, and at least one standard template that fits and has no supported zoning conflict. It follows the active site filters, including flood. It does not establish availability, ownership rights, utility capacity or approval. Unhighlighted sites may support other designs or explicit redevelopment.

Flood status is available in **Site facts, zoning & flood**, with the source and source date. Missing flood data stays unknown; “no mapped overlap” is not a guarantee of no flood risk.

## Build, demolish and replace

1. Pick a housing type in **Build**. Its preview appears automatically.
2. Change width, depth, stories or rotation. **Advanced** keeps exact dimensions and positions. Stories must be whole numbers; other supported dimensions retain fractional values.
3. Use **Position on map** to choose a location, or keep the automatically aligned placement. Green/red preview outlines show the current placement check.
4. Choose **Add to plan**. The preview pauses so it does not cover the new building. Choose **Preview another building** to continue.

A plan can contain up to 40 proposed buildings. Every placed building retains its own saved dimensions, rent, utilities and target income. The **Your plan** bar distinguishes proposed homes from estimated net new homes and shows the placed plan’s score separately from next-building comparisons.

Existing footprints have stable numbers shared by their list and map labels. The list shows footprint area and the height method; selecting a row focuses the matching building. Numbers identify mapped outlines, not postal addresses. Colors describe the matched parcel assessment use, not an independently verified use of every footprint.

Choose an existing outline and select **Demolish only** or **Demolish & replace**. Only that source footprint is removed from the scenario; County records stay unchanged. Restore and Undo bring it back. Supported zoning checks still apply after demolition. A replacement can still fail because of another building, the parcel boundary, height, coverage or another evidenced rule.

Planned buildings use lighter housing colors and a dashed outline. Short construction and demolition effects respect reduced-motion preferences. Housing starts in an angled view; Transit and Streets start top-down. The view button states the current view and offers the other one.

## Read a comparison

There is one editable next-building draft, not Studio A/B slots. **Compare to** adds any of the other types. Cards stack in a narrow sidebar and sit alongside each other when space permits. Widen the sidebar when useful.

The five preference factors are:

| Factor | What it means |
| --- | --- |
| Market fit | Neighborhood sales activity blended with a team-chosen lot-size curve. It is not observed demand for a proposed type. |
| Housing-cost burden | Assumed rent plus utilities compared with the chosen target household income. |
| Lower neighborhood displacement risk | Existing tract vulnerability and rent pressure, shared by types on the same site. It does not predict project-caused displacement. |
| Access | Modeled walking time and average wait for scheduled transit; optional park access uses an explicit preference share. |
| Carbon estimate | A relative per-home proxy using existing-stock energy, a team embodied tier and deduplicated transit-service evidence. It is not marginal tonnes of CO₂. |

**Physical fit** and **transit capacity** are separate pass/fail/unknown checks. They receive no weight. A supported physical or zoning conflict removes a proposal from ranking. Transit reserve is an assumed diagnostic check, not a legal eligibility rule; an unknown or failed reserve does not turn every preference score into zero.

A proposal that cannot rank says **Not ranked**. Its diagnostic calculation may be inspected under evidence, clearly separated from an eligible score. “Use permitted” describes the use-table reading only. The score also shows **Zoning review incomplete: X checks not assessed** when evidence is missing. The brief distinguishes zoning-only findings from physical overlap.

Within the team’s **3-point comparison band**, the display says **No clear winner**. It also shows when alternative priority stances change the result. This band is not a statistical confidence interval, and a larger gap does not prove a project is better.

With buildings already in the plan, Compare evaluates **the placed plan plus each next-building alternative**. Factor scores are averages weighted by proposed homes, using the same available-factor coverage across candidates and both infrastructure states. This aggregation is a value choice. The dimensions and rent shown on a type card describe its next building; existing plan members retain their own inputs. Any supported conflict in a plan member can withhold the whole alternative’s score.

## Set priorities and inspect evidence

Only relative weights matter: all 1s, all 50s and all 100s produce the same preference ranking. Five sliders show each included factor’s share. A factor without evidence for every compared alternative is excluded from all their totals. All-off priorities produce no ranking.

Stances are team-authored examples, not surveyed stakeholder preferences. The information button explains their purpose and the fact that the exact numbers are judgments.

| Stance | Market | Costs | Displacement | Access | Carbon |
| --- | ---: | ---: | ---: | ---: | ---: |
| Balanced | 25 | 25 | 15 | 20 | 15 |
| Anti-Displacement & Affordability | 5 | 40 | 40 | 10 | 5 |
| Transit-Oriented Density | 10 | 15 | 5 | 50 | 20 |
| Climate & Low-Carbon | 5 | 15 | 10 | 25 | 45 |
| Fast Market Infill | 55 | 20 | 5 | 10 | 10 |

Receipts give the dataset, formula, inputs, confidence and whether evidence is measured, assumed, mixed or a fallback. Market-fit receipts expose the complete piecewise lot curve and explain why it can put a duplex below a detached house on a large lot. Geometry is checked separately. Displacement uses vulnerability as a floor; flat local rents no longer halve highly vulnerable areas’ risk.

A source parcel’s confidence is not confidence in an assumed proposed rent. Legacy fallback income and rent are labeled as such. **Planning terms** explains LNC, proxy, schematic, screen, diagnostic score, AMI and not assessed.

## Housing costs and income bands

New Studio plans start with housing costs included as explicit assumptions. They use a **60% HUD HOME income-band target for one person**, not the selected tract’s median income. The 30%, 50%, 60% and 80% buttons use the official FY2026 Pittsburgh-area household-size limits. These are target scenarios, not actual residents’ incomes or eligibility decisions.

The starting monthly rents are illustrative new-construction scenarios:

| Prototype | Rent per home |
| --- | ---: |
| Detached home | $2,200 |
| Duplex | $1,800 |
| Triplex | $1,750 |
| Small apartment | $2,000 |
| Large apartment | $2,100 |

Utilities start at $150 per month. These are comparable one-bedroom assumptions, not a claim that every structure contains one-bedroom homes. Two owner listings anchor the scale of recent apartment rents; differences between the five types and the sensitivity ranges are explicit team assumptions, not measured type premiums. The references, limitations and ranges are available in Advanced and the repository README.

Choose another income band or enter exact costs and income. Entering a custom rent applies that common assumption to comparison types; switching back to prototype rents restores the disclosed type assumptions. A burden score falls from 100 at 20% of income to 0 at 50%; these anchors are normative choices. At lower incomes, all unsubsidized prototypes may legitimately be unaffordable.

The screen rejects rent of $0 and income of $1,000. Input errors do not silently reach the model. Bounds and correction messages are visible; unusually low valid inputs also receive a warning. The guardrails are modeling limits, not income-program eligibility rules.

Turning **Housing costs in score** off excludes the factor from the draft and placed buildings. Older saved plans retain their inputs but need cost review before those legacy assumptions count in the current model. Nothing about a rent-burden score establishes construction feasibility, financing or a subsidy.

## Test transit, paths and amenities

The default stop minimizes the modeled straight-line walk plus average wait among nearby stops. It can be farther away but have more service. The interface explains that choice. It does not compare destinations, transfers or actual waiting time. You can choose another stop.

The service evidence comes from a published weekday GTFS snapshot; dates appear beside the transit controls. A catchment count unions boardable trip identities by route/direction, so a trip serving several nearby stops is counted once. Transit-access preference uses one selected stop rather than adding every stop’s departures together. Co-located aliases with identical trip evidence share a display name; distinct platforms, directions and stop IDs remain distinguishable.

Extra departures belong to the stop where they were assigned. Switching stops shows that stop’s own value; clearing the investment removes its stale warning. **Current infrastructure / With changes** covers all infrastructure edits, including a walking path.

Transit reserve defaults are scenarios, not observed spare seats:

- 4 daily boardings per proposed home; test the disclosed 2–6 range.
- 1 spare boarding place per existing departure; test 0.5–2.
- 10 usable places per additional departure; test 5–20.

The check shows daily supply, demand and sensitivity. A zero reserve means unassessed, not proven zero capacity. Daily totals cannot establish peak loads, operational feasibility or utility capacity. Proposed homes sharing a stop draw on the same reserve; existing riders must already be allowed for in the assumed spare places.

**Streets** can route between points on the existing walking network, add a walking connection or street, or place a park entrance. Existing-route traces follow the mapped graph and do not create new infrastructure or change scores. New connections snap endpoints to eligible edges; a disconnected existing route does not receive a fabricated straight-line substitute. Proposed paths and streets remain schematic new links. New paths reserve 3 m, streets 12 m and parks 20 × 20 m. Their buildability, slopes, bridges, access rights and engineering remain unassessed.

Infrastructure edits can change modeled access, boarding checks and housing eligibility where geometry conflicts. They do not forecast household demand, rents, actual displacement, induced travel or construction emissions. A shared improvement need not change which housing type ranks first.

## Zoning and policy scenarios

Supported Title Nine checks use the mapped district, the proposed design and available source evidence. Unassessed rules are never treated as passes. Consult [TITLE_NINE.md](TITLE_NINE.md) for the exact implemented sections, source dates, limitations and reform rules.

The reform simulator separates current adopted code, the cited pending bill and hypothetical reforms. A preset lifts only the conflicts its stated rules address; it does not waive physical fit or unsupported checks. Simulated scores are labeled and do not become current-law recommendations. Verify a proposal and the current status of any legislation with the City.

The permit/acquisition pathway uses public-record evidence and the screened design. The pro forma, tax ledger and funding-program screens remain conditional estimates. Neither guarantees availability, a variance, acquisition terms, financing, tax treatment or program eligibility. Private owner names are not displayed.

## Save, share and recover

Edits save locally in this browser. Reloading restores scenario inputs and loads the referenced evidence before recalculating; stored or imported scores are not trusted.

Use **Export scenario** for a JSON file and **Import scenario** to load it. Import validates the file and asks before replacing the current plan. It carries the chosen type, priorities, stop, departures, buildings, demolitions and drawn changes. The ordinary parcel URL still identifies a place, not the entire plan.

**New plan** asks before clearing. Undo can restore it. Ctrl/Command+Z undoes, and Ctrl/Command+Shift+Z redoes, when focus is outside a text-editing field. Selecting a parcel in the same area retains the plan; switching study areas starts a new plan and can be undone. Recovery downloads remain available when saved data cannot be safely loaded.

The Hazelwood tour uses temporary example inputs and restores the prior plan on exit. Its comparison step names the Anti-Displacement stance and the example’s additional 60 weekday departures. It does not overwrite your saved scenario.

## Brief, accessibility and loading

The site brief includes a scaled diagram, proposal checks, factor receipts, Title Nine checks, pathway and conditional financial figures. It is print-oriented; the on-screen version scrolls. Escape, Close and clicking outside dismiss it, and keyboard focus returns to its opener. Building details return focus to their Inspect control.

The sidebar precedes the map in keyboard navigation. It can be resized, collapsed and widened. Short-height browser-zoom layouts keep a nonzero map area and allow page scrolling. Routine notifications expire; errors remain dismissible. See [Accessibility & contact](https://playhouse-pittsburgh.vercel.app/accessibility) in the running app for controls, current pointer-only limitations and issue reporting.

The browser loads compact neighborhood data on demand. Rendered detail is bounded to the active neighborhood and visible neighbors; distant detail is released and zoomed-out views omit it. Dictionary encoding reduces repeated parcel-property payload without rounding geometry or changing scores. The unused parallel road download is omitted; mapped routing uses the walking graph. OpenFreeMap provides the hosted vector basemap without an API key; its map data comes from OpenStreetMap.

See [VALIDATION.md](VALIDATION.md) for the current test/build record and observed browser limits. This guide describes the current interface, not a promise of parcel-level engineering accuracy or a causal policy forecast.

If a draft extends beyond the parcel, **Inspect first** can show a nearby building that overlaps it. The panel labels it **Outside selected parcel** and retains its recorded identity and height evidence. Removing that outline in a scenario does not enlarge the selected lot.

## Financial assumptions

The editable `pro-forma-2.0` screen separates vertical construction, site work, demolition, contingency, design/permits/legal, developer fee, construction interest, initial reserves and acquisition. Inputs are saved under `scenario.proForma` and validated on import. Low/high construction overrides belong to each housing type; other assumptions apply across the plan. Finance-only edits do not recompute geometry or preference factors.

NOI = annual scheduled rent × (1 − vacancy) × (1 − operating-expense share). Expenses include taxes but exclude debt service. Capitalized income = NOI ÷ cap rate. Break-even rent reverses that same equation against total development cost; it is not a financing or debt-service test. Reserves here are an upfront allowance. Construction interest uses a financed-cost share, annual rate, term and average drawn balance; it is not a lender draw schedule.

Defaults beyond the cited market/cost ranges are team assumptions: site work 10% of vertical cost; contingency 5% of hard; design/permits/legal 12% of hard; developer fee 10% of hard + contingency + design/permits/legal; initial reserves $3,000/home; 65% financed, 7.5% annual interest, 18 months, 50% average draw; operating expenses 40% of collected rent. These are separated to avoid hiding them in a single soft-cost percentage. No credit equity or abatement is counted without project evidence. The whole-plan tax proxy counts acquisition once per parcel and omits demolition from its aggregate cost basis; its caveat is visible.
