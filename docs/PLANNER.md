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

## Placement and editing

Position on map stays active when cycling housing types. The colored preview and Add control use the same live fit/zoning screen. While full scores recalculate, dimensions update immediately in a grey preview and placement stays unavailable. R rotates +15°; Shift+R rotates −15°. Arrow keys move east/west/north/south by 1 metre (Shift: 5 metres), except when editing text or using a control's own keyboard navigation. Exact offsets and bearing remain in Advanced. Automatic alignment follows the parcel; the source data does not establish legal street frontage or setbacks for automatic snapping.

**Drag to move.** In Build, press on the draft preview or on a building already in the plan, then drag it.
- **While dragging.** The map does not pan. The draft re-runs the live fit and zoning screen as it moves. A placed building turns red wherever it would not fit.
- **Dropping.** Positions snap to 0.5 m and keep the building's bearing, and the grab offset is kept so the building does not jump under the cursor.
  - **Draft:** a drop that crosses the parcel boundary is refused, and the draft stays put. A drop onto an existing building is allowed, so **Demolish & replace** can follow.
  - **Placed building:** a drop is refused if it crosses the boundary or overlaps another building or reserved area.
- **Undo.** Every accepted drop is one undo step.
- **Limits.** Only buildings on the selected parcel can be dragged; select another parcel to move its buildings. A short press without movement is still a click (inspect or select). Touch works with one finger. Code: `web/lib/dragPlacement.js`.

Inspect a proposed building and choose **Edit shape & position**. Change the shape at its existing location, then Save or Cancel. The saved plan is unchanged until Save, which is one undoable action and keeps the building's ID and list position. Changing sites requires saving or cancelling first. Scenario export is explicit; autosave writes only to this device's local storage and does not download files.

## Highlight building types

**Highlight building types** on the map recolours existing buildings by the County assessment use of the parcel they stand on (`land_use` = `USEDESC`, `land_use_class` = `CLASSDESC`). Rules are checked in this order (`web/lib/buildingTypes.js`):

| Category | County uses |
| --- | --- |
| Vacant lot | Any `VACANT …` use, builder's lots, developmental land and common greenbelt; also public or unclassified parcels flagged as vacant lots. Drawn as a green lot fill, never as a building. A building on land recorded as vacant shows as *Use unknown*. |
| Single-family | `SINGLE FAMILY`, `ROWHOUSE`, `TOWNHOUSE`, mobile homes, houses used as offices or shops; other unmatched residential uses. |
| Two-family / duplex | `TWO FAMILY`. |
| Small multifamily · 3–4 | `THREE FAMILY`, `FOUR FAMILY`, `DWG APT CONVERSION`. |
| Apartments · 5+ | Every `APART…` use, apartment condominiums, condominiums, independent living, housing authority and HUD projects. |
| Commercial / mixed-use | Shops or offices with apartments over, and any remaining commercial, industrial or agricultural class. |
| Institutional / other | Churches, schools, colleges, hospitals, nursing and group homes, government, fire, parks, cemeteries, utilities and outbuilding/common-area records. |

Uses the County records as `UNKNOWN`, or that match no rule, show as *Use unknown*. The colours apply to the 2D overview, 3D extrusions (façade and roof) and the Three.js meshes, whose walls and roofs mix 78% toward the category colour while glass, doors and trim keep their own. Unchecking a type hides those footprints on every layer; the inspected building keeps its teal highlight. Proposed and placed buildings use a 40%-lighter tint of their typology's category: house and ADU as single-family, duplex as two-family, triplex as small multifamily and both apartment types as apartments. With highlighting on, a preview's placement status stays visible in its ground rim. Highlighting never changes scores.

## Land value tax shift

**Scenarios → Land value tax shift** is an illustrative estimate of how each parcel's City real estate bill could change if the City taxed land at a higher rate than buildings while raising the same revenue. Code: `web/lib/lvtShift.js` (math), `components/LvtShiftPanel.js` (panel). Data: `pipeline/refresh_assessed_values.py`.

- **Inputs.** County assessed `LOCALLAND` and `LOCALBUILDING` (values for City and school taxes) and `TAXCODE` from the [WPRDC property assessments](https://data.wprdc.org/dataset/property-assessments). Parcels with tax code `T` and both values form the base: 123,074 City parcels, $4.73B land and $15.61B buildings, so land is 23% of the value. Exempt (`E`) and PURTA (`P`) parcels are left out and drawn grey.
- **Levy.** [City of Pittsburgh 2026 millage, Code §263.01](https://ecode360.com/45440133): 9.67 mills. Only this levy is shifted. Pittsburgh's two-rate tax (1913–2001) was a City tax. [Pittsburgh Public Schools](https://www.wesanews.org/education/2025-12-17/pittsburgh-public-schools-2026-tax-increase-approved) (10.457 mills) and [Allegheny County](https://alleghenycountytreasurer.us/real-estate-tax/local-and-school-district-tax-millage/) (6.43 mills) stay uniform. The 0.5-mill Parks Trust Fund levy is not modelled.
- **Revenue-neutral split rate.** Current revenue = 9.67 × (ΣL + ΣB) / 1000. The building rate is 9.67 × (ΣL + ΣB) / (k × ΣL + ΣB), and the land rate is k times that, where k is the land:building ratio. A parcel's bill falls exactly when its land share is below the citywide 23%. The slider runs from 1:1 to 6:1 in 0.5 steps and starts at 4:1, the toolkit's typical example. Pittsburgh used 2:1 after the 1913 phase-in ([Dye & England](https://www.lincolninst.edu/app/uploads/legacy-files/pubfiles/assessing-theory-practice-land-value-taxation-full_0.pdf)) and reached a high of 5.8:1 ([Banzhaf & Lavery 2008, Table 2](https://www.lincolninst.edu/app/uploads/legacy-files/pubfiles/banzhaf-wp08sb1.pdf)).

| Ratio | Land mills | Building mills |
| --- | --- | --- |
| 1:1 (today) | 9.67 | 9.67 |
| 2:1 | 15.69 | 7.85 |
| 4:1 | 22.79 | 5.70 |
| 5.8:1 | 26.51 | 4.57 |

- **Map.** Classes are on the percent change of the City bill: falls 25% or more, falls 5–25%, within ±5%, rises 5–50%, rises 50% or more. Exempt parcels and parcels without values are grey. In 2D the colours cover each whole parcel, including its buildings; in 3D they are a thin ground slab under the buildings.
- **Panel.** The selected parcel's City bill now and under the shift, with its land share. For the selected neighbourhood: the share of taxable parcels that would pay less, the median dollar change, and the median by recorded use (the Highlight building types categories).
- **Methodology inspiration.** The Center for Land Economics' open [LVTShift toolkit](https://landeconomics.org/lvtshift) ([code](https://github.com/gregmiller00/LVTShift), [write-up](https://blog.landeconomics.org/p/want-to-model-a-land-value-tax-shift)) rebuilds the current levy from assessor data and solves for a revenue-neutral split rate parcel by parcel. Playhouse is simpler: it does not reallocate exemptions, reconcile against the certified levy, model an abatement alternative or join income and race data for progressivity. The reconstructed $196.6M is assessed value × millage before appeals, abatements and collection losses; it is not the City's budgeted revenue.
- **Not modelled.** LERTA and other abatements, homestead and senior relief, appeals, reassessment, collection rates, changes in land prices or construction, and tenants' pass-through. Assessed value is not market value.

## Single-stair reform

**Build → Stairs** switches the apartment egress rule (`scenario.egress`, saved and exported with the plan). Code: `web/lib/singleStair.js`.

- **Current code.** [2024 IBC Table 1006.3.4(1)](https://up.codes/s/single-exits) allows a single exit for R-2 apartments only through the third story, with at most 4 homes per story, 125 ft of exit-access travel and sprinklers. Pennsylvania's UCC adopts the IBC. The [2027 IBC change](https://centerforbuilding.org/article/2027-ibc-single-exit-height-limit-to-be-raised-to-four-stories) raises this to 4 stories, but it is not yet in force.
- **Single-stair reform (hypothetical).** One stair up to 6 stories, at most 4 homes per floor, 125 ft of travel and NFPA 13 sprinklers. This is the common core of [Seattle's §1006.3.4 item 7](https://www.seattle.gov/documents/Departments/SDCI/Codes/SeattleBuildingCode/2021SBCChapter10.pdf), [Texas SB 2835](https://capitol.texas.gov/tlodocs/89R/billtext/html/SB02835F.htm) and Montana SB 213. Those laws add conditions this screen does not check: construction type, stair pressurization or enclosure rating, and Seattle's 20 ft from unit door to stair. See [Pew's 2025 summary](https://www.pew.org/en/research-and-analysis/articles/2025/11/04/states-advance-single-stairway-reforms-to-expand-housing).

Stairs needed: triplexes (1 home per floor, 3 stories) need one under both rules. The 12-home, 4-story small apartment (3 per floor) needs **two** under current code and **one** under the reform. The 40-home, 8-story large apartment needs two under both. Travel is approximated as half the floor-plate diagonal.

Core geometry is a team planning assumption, not a design:

| | Stair core | Minimum footprint | Small apartment default |
| --- | --- | --- | --- |
| Two stairs | Two 2.8 × 5.8 m stairs joined by a 1.5 m corridor (double-loaded plan) | 12 × 18 m | 14 × 20 m |
| One stair | One 2.8 × 5.8 m stair plus a 4 m² landing (point access) | 7.5 × 14 m | 11 × 18 m |

The small apartment's default footprint and the **Fit dimensions to lot** minimum follow the rule. Under current code, the fit search no longer shrinks a 4-story small apartment below 12 m wide (it previously allowed 9 m). Cards and details show the stair count and whether the footprint meets the core minimum. The check is shown beside the score and never vetoes it. Zoning height, coverage and setbacks still apply, so 5–6 stories usually also need a zoning change. Proposed apartments draw one rooftop stair bulkhead per stair in both the Three.js meshes and the extrusion massing.

## 3D buildings, block and shadows

### Real-world building meshes

When **3D** is on and the map is at zoom 16 or closer, a Three.js layer draws buildings as textured meshes rather than extrusions. It runs inside MapLibre as a custom WebGL layer (`CustomLayerInterface`), sharing the map's WebGL context and depth buffer. Every mesh stays inside its footprint and at or below its modelled or recorded height, so fit, overlap and zoning screens still describe exactly what is drawn.

Proposed buildings (the live preview and every placed building) follow the exact footprint, rotation and guessed front:

- **Single-family and ADU:** a gable or hip shingle roof with eaves, a ridge cap and a chimney. Gable ends get an attic vent or window. Walls are clapboard or brick over a stone foundation, with corner trim. Windows have frames, sills and shutters. The door has a warm transom and a porch light, under a porch with columns, a railing and its own roof.
- **Duplex:** a Pittsburgh double house, with either twin front gables or an Italianate cornice (always the cornice above 11.6 m). It has a brick party wall, twin stoops with railings, paired doors, bay windows and windows on all four sides.
- **Triplex:** a brick walk-up on a rusticated stone base, with limestone lintels and sills, front balconies and a bracketed cornice.
- **Apartments:** a storefront or lobby podium with mullions, canopies and piers. Above it are articulated window bays with warm recessed windows and balconies, then a parapet, a penthouse and a solar array tilted toward the south.

Variation in siding colour, roof form and door tone comes from a stable seed and never feeds a score. A blocked preview gets a red roof and trim; a pending one gets a grey roof. Every preview gets a red, grey or green ground rim. Placed buildings take their legend colour on the roof.

The nearest 140 recorded buildings within 260 m of the view centre are also meshed. Demolished footprints are excluded. Their walls follow the recorded outline:

- **Residential, up to about 13.5 m and 16 m wide, and close to rectangular:** brick or siding with window grids, under a gable or hip roof laid along the outline's minimum-area oriented box. Roofs and eaves may overhang a notch in an L-shaped outline.
- **Commercial and larger buildings:** window or storefront facades, a cornice band, a parapet with flat roof, and rooftop units.

Buildings further out stay as extrusions. Meshes are cached per building, merged into one draw per material, and disposed when replaced.

Directional and sky lights follow **Morning / Noon / Afternoon**. Clicks still hit-test the existing map layers: proposed and placed extrusions turn invisible but stay queryable, and an invisible hit layer covers the meshed neighbours. An inspected neighbour turns teal. Without WebGL2, in 2D or when zoomed out, the procedural extrusion massing below is drawn instead.

Code: `web/lib/threeBuildingMeshes.js` (geometry, no Three.js dependency), `threeMaterials.js` (procedural canvas textures) and `threeBuildingsLayer.js` (the custom layer and scene).

### Extrusion massing

Without the mesh layer, the angled view draws proposed buildings as procedural extrusions rather than plain boxes. They obey the same footprint and height limits. Each story is a floor plate with a darker 0.35 m recessed band. The parts by type are:

- **Single-family and ADU:** a 1-story front porch, 1.8–2.2 m deep, and a stepped pitched-look roof.
- **Duplex:** side-by-side bays in alternating tones, party-wall trim, stoops and a cornice cap.
- **Triplex:** a masonry base, front balcony ledges and a capped roof.
- **Apartments:** a 3.8 m podium, recessed upper stories, a parapet, a rooftop penthouse and a solar array.

A pending, invalid or review preview keeps its warning color on every part, with a ground rim in the same color. Placed buildings use material tones.

The front is a display guess; Playhouse has no legal frontage data. With nearby parcels loaded, the front faces the wider open gap beyond the lot line: a street right-of-way rather than an alley or a back-to-back neighbour. Otherwise it is the width edge nearer a lot line. Porches, stoops, doors, balconies, storefronts, the paved front walk and **Street** view all use that guess. A footprint that spills past its lot can get its front on the wrong side.

Existing footprints keep their recorded-use colors as warmed facades with a charcoal roof cap on the top 0.45 m. Lighting follows the selected sun. The selected lot and lots with placed buildings get raised yard turf, a curb and a paved walk. Procedural trees grow in proposed parks, along newly drawn paths, and as up to three yard trees on placed-building lots, kept clear of footprints. They are scenery, not a canopy or stormwater estimate.

**Build** and **Compare** show the selected lot's zoning envelope as an inset buildable pad plus height-limit corner posts and a top frame. The pad is an estimate. Its narrow ends are inset by the larger of the district's front and rear yards, and its long sides by the interior side yard. Corner-lot and legal-frontage yards are not classified. The height follows the **Policy Reform Simulator** preset. Only Council Bill 2025-1545's conditional Affordable Housing Bonus changes it: +30 ft for 4+ homes in eligible districts. A grey ghost frame then marks the current-code height, and the map note states the condition and that the bill is not law. Other presets leave height unchanged.

The map's sun control casts semi-transparent ground shadows from existing and proposed buildings. **Winter / Equinox / Summer** choose the representative day, and **Morning / Noon / Afternoon** choose 9:00, 12:00 or 15:00 solar time at Pittsburgh's latitude; the **Shadow study** slider sets any quarter hour. Each shadow is the convex outline of the footprint and its cast roof: exact for rectangles and slightly generous for L-shapes. Shadows ignore trees, and are computed on flat ground even when terrain is shown. **Street** pitches the camera to about 72°, close to the parcel, facing the guessed front facade. Press it again to return to the 55° aerial view.

Code: `web/lib/architecture3d.js`, `streetscape3d.js`, `zoningEnvelope.js`, `sunShadows.js` and `localFrame.js`.

## Terrain

**Terrain** (map toggle) shows Pittsburgh's real topography:
- **3D view.** MapLibre `raster-dem` terrain at 1× exaggeration, plus hillshade.
- **2D view.** Hillshade only.
- **Contours** (optional). 5 m lines, with an index line labelled every 25 m.
- **Parcel slope** (optional). Each parcel is coloured by its typical slope: under 15%, 15–25% steep, or 25%+ very steep.

The selected parcel's panel always shows its elevation (m and ft), the rise across the lot, typical and steepest slope, and the share of the lot at 15%+ and 25%+. It also shows the existing City 25%+ steep-slope overlap. When either source finds steep ground, the panel adds a caution: 25%+ is the City's landslide-risk proxy, the §915.02.A cut/fill limit, and a reason for geotechnical review. 15% is where §915.02.B slope planting starts.

**Source and licence.** Tiles come from [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/), Terrarium PNG encoding (`elevation = R × 256 + G + B ÷ 256 − 32768` m), at `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`.
- No key is needed. CORS is open (`Access-Control-Allow-Origin: *`, checked 2026-10-31).
- For Pittsburgh the tile metadata names USGS NED 1/9 arc-second, 2006 (about 3 m).
- The [required attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) for US data is "3DEP (formerly NED) … courtesy of the U.S. Geological Survey". 3DEP is public domain.
- The map attribution shows "Terrain Tiles on AWS · USGS 3DEP", and the terrain panel links both pages.

**Slope method.**
- **Horn's estimator.** Slope uses Horn's estimator, the same one GDAL and ArcGIS use, on a 3 × 3 window 4 m apart. The window is sampled bilinearly from z15 tiles, about 3.6 m per pixel at this latitude.
- **Parcel statistics.** About 24 evenly spaced points inside the lot (10 for the map overlay) give the mean elevation, the median ("typical") slope and the steep shares.
- **Contours.** Contours use marching squares on an 8 m grid over the view, capped at 1.5 km × 1.5 km, and segments are stitched into lines.
- **Accuracy.** Retaining walls, cuts and post-2006 grading are not in the model. It is a screen, not a survey.

**Alignment on terrain.** MapLibre places fill-extrusions (buildings, the draft, zoning envelope, yard pads, trees) and draped fills (parcels, shadows, overlays) on the terrain surface. The Three.js mesh layer is a custom WebGL layer drawn on MapLibre's flat Mercator plane, so its alignment with terrain cannot be guaranteed. While 3D terrain is on, **Detailed** therefore falls back to the extrusion renderer and the panel says so. Ground shadows are computed on flat ground and then draped, so on steep slopes they are approximate.

**If the DEM fails.** Failed tiles are remembered and never retried in a loop. The sampler returns no data, so the parcel panel says elevation is unavailable and the overlays stay empty. After three MapLibre tile errors the map turns 3D terrain and hillshade off and shows flat ground; every other tool keeps working. Code: `web/lib/terrain.js`, `terrainTiles.js`; tests in `terrain.test.js`.

## Seasonal shadow study

**Build → Shadow study** estimates which neighbouring lots the proposed buildings shade, and for how long, on one representative day.

| Day | Declination | Daylight at 40.44° N | Analysis window (solar time) |
| --- | --- | --- | --- |
| Winter solstice (Dec 21) | −23.44° | 9.1 h | about 8:57–15:03 |
| Equinox (Mar 21 / Sep 21) | 0° | 12 h | 7:30–16:30 |
| Summer solstice (Jun 21) | +23.44° | 14.9 h | about 6:03–17:57 |

- **Sun.** Altitude and azimuth come from the standard declination and hour-angle formulas. Sunrise and sunset are geometric (no refraction). Times are local solar time; solar noon in Pittsburgh is about 12:20 EST, varying by about ±15 minutes with the equation of time.
- **Window and days.** These follow the [NYC CEQR Technical Manual, chapter 8](https://www.nyc.gov/assets/oec/technical-manual/08_Shadows_2025.pdf): from 1.5 hours after sunrise to 1.5 hours before sunset, because earlier and later shadows are long, fast-moving and blend with existing ones. Its May 6 / Aug 6 day is not offered.
- **Counting.** The sun is sampled every 15 minutes. At each sample, the shadow of every placed building, plus the current preview, is the convex hull of its footprint and cast roof outline. About 60 evenly spaced points inside each nearby parcel test whether that parcel is shaded. A parcel counts as shaded when at least 10% of its points are in shadow. Its hours are the number of shaded samples × 15 minutes; the panel also shows the first and last shaded time and the peak share.
- **Scope.** The building's own parcels are excluded. Only parcels within the longest shadow in the window are checked.
- **Limits.**
  - It shows the project's shadow footprint, not the incremental shadow: shadows existing buildings already cast, trees and terrain are ignored (shadows are computed on flat ground).
  - "Shaded" is a lot-level share, not a window or solar-panel study.

Code: `web/lib/shadeStudy.js` and `sunShadows.js`; tests in `shadeStudy.test.js` and `sunShadows.test.js`.

## Financial assumptions

The editable `pro-forma-2.0` screen separates vertical construction, site work, demolition, contingency, design/permits/legal, developer fee, construction interest, initial reserves and acquisition. Inputs are saved under `scenario.proForma` and validated on import. Low/high construction overrides belong to each housing type; other assumptions apply across the plan. Finance-only edits do not recompute geometry or preference factors.

**Small infill costing.** Single-family, duplex and triplex drafts use one Pittsburgh wood-frame band per type, whatever the story count: $190–265, $170–240 and $170–250 per sq ft. Gross floor area is costed up to 2,200, 1,300 and 1,200 sq ft per home. The drawn box is a zoning envelope, so a slim, deep footprint from **Fit dimensions to lot** keeps its full massing on the map, but area above the cap is not priced. The panel says when the cap applies. On 4822 Chatsworth Ave the fitted 6 × 21 m, 3-story duplex draws about 4,070 sq ft and is costed at 2,600 sq ft: $442k–$624k to build and $736k–$1.10M total with acquisition at Hazelwood sale prices. Apartments keep the story-based national bands at their full drawn area. Code: `SMALL_INFILL` in `web/lib/financeInputs.js`.

NOI = annual scheduled rent × (1 − vacancy) × (1 − operating-expense share). Expenses include taxes but exclude debt service. Capitalized income = NOI ÷ cap rate. Break-even rent reverses that same equation against total development cost; it is not a financing or debt-service test. Reserves here are an upfront allowance. Construction interest uses a financed-cost share, annual rate, term and average drawn balance; it is not a lender draw schedule.

Defaults beyond the cited market/cost ranges are team assumptions: site work 10% of vertical cost; contingency 5% of hard; design/permits/legal 12% of hard; developer fee 10% of hard + contingency + design/permits/legal; initial reserves $3,000/home; 65% financed, 7.5% annual interest, 18 months, 50% average draw; operating expenses 40% of collected rent. These are separated to avoid hiding them in a single soft-cost percentage. No credit equity or abatement is counted without project evidence. The whole-plan tax proxy counts acquisition once per parcel and omits demolition from its aggregate cost basis; its caveat is visible.

The site brief adds grey ground-level walking-network lines from the loaded local graph. They provide orientation without a tile request and are not surveyed street widths or legal frontage. The brief includes NOI and the explicit cost allowances; credit awards and abatements remain unassessed. For printing, choose US Letter and turn off the browser's headers/footers. Colour is optional; the diagram retains outlines and labels.

## Compact housing choices

Housing cards show the type, dimensions, one score/eligibility line and the unassessed-check count. A blocked type has no score; missing fit evidence says **Fit unassessed**, not **Doesn’t fit**. With a placed plan, the count is marked **plan**. Expand **[type] · Details** below the cards for conflict reasons and code links. The circular **i** explains scores, use permission and remaining review. Arrow keys still select a type; source data, scoring and eligibility rules are unchanged.
