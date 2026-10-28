# Playhouse

Pittsburgh Planning Studio

by Hack the House

# Model card: Playhouse suitability screen

Archived source reference: score model v1 (`web/public/data/score_model.json`), data pulled 2026-09-26/27. The legacy Explorer interface, comparison controls and optional AI endpoint have been removed; their implementation remains in Git history. Code: https://github.com/tejaschaudhari131/playhouse.

## What it is

A transparent weighted-average screen that ranks four housing types (single-family; townhouse/duplex; small apartment, 3–19 units; large apartment, 20+ units) on each of 142,865 parcels across all 90 City of Pittsburgh neighborhoods, plus a triplex (3-unit) building that uses the small-apartment score and the §911.02 Three-Unit permission row. It is arithmetic on published data with team-chosen anchors and weights. No neighborhood is omitted. Parcels are assigned by largest boundary overlap, with deterministic ties; the whole parcel outline is retained after the city-membership check. Missing source evidence remains unknown. There is no trained model. A language model, when a credential is configured, only writes a prose explanation of numbers the app has already computed.

**Intended use:** help CDC staff and municipal planners choose which real parcel and housing option to investigate next, see why options rank differently, and list what must be verified. **Not for:** permits, zoning determinations, feasibility or financial decisions, appraisal, affordability commitments, predicting displacement, or ranking people.

## Live Studio model — planner-screen-3.0

Studio evaluates five housing prototypes, including triplex. It uses five weighted preferences plus independent physical and transit-capacity checks. Archived six-factor parcel totals are never used as the live final total.

| Preference | Live calculation and evidence |
| --- | --- |
| Market fit | Archived sales/lot proxy, with its exact piecewise lot curve exposed in receipts. Sales activity is shared; the type-specific curve is a team assumption, not measured household demand. |
| Affordability | `(rent + utilities) × 12 / target income`; score falls linearly from 100 at 20% burden to 0 at 50%. Prototype rents are assumptions; HUD bands are published income references selected as scenario targets. |
| Displacement | `risk = 100 × [vulnerability + (1 − vulnerability) × pressure]`; preference is `100 − risk`. Vulnerability averages anchored renter share (0.25–0.75) and CHAS burden (0.30–0.80); pressure anchors relative rent growth at 0–0.30. Missing components are disclosed, not zero-filled. |
| Access | Routed walking plus half the average scheduled departure interval, scaled against a 30-minute anchor. Optional mapped-park access uses a 15-minute anchor. Destinations, actual arrivals and safe crossings are unassessed. |
| Carbon | Existing-stock energy, an assumed embodied tier and deduplicated baseline transit service. Relative per home, not marginal tonnes or a forecast of induced travel. |

Balanced weights are **25 / 25 / 15 / 20 / 15** in the order above. Only ratios matter. All compared options and infrastructure states use the same available positive-weight factors; missing evidence changes the shared denominator. Fit and capacity weights are ignored even in older saved inputs. Close results within **3 points** say “No clear winner”; this is an editorial caution band, not calibrated uncertainty.

Physical fit is pass/fail/unknown. Unsupported geometry or supported zoning conflicts withhold the total. Transit reserve is a separate conditional check, not a housing veto or score. Defaults: four daily boardings/home (sensitivity 2–6), one spare place/existing departure (0.5–2), ten usable places/added departure (5–20). Zero reserve is unknown. Daily totals cannot establish peak capacity or service feasibility.

New plans use the HUD FY2026 HOME 60% one-person reference ($46,380/year), $150 utilities and labeled prototype rents. See [README affordability sources](../README.md#affordability-reference) and `web/lib/rentAssumptions.js` for cited owner listings, assumed type differences and ranges. Rents are not estimates of representative new-build prices by type. Earlier-model saved values remain intact, explicitly legacy, and unscored until reviewed. Receipts distinguish observed inputs, assumed choices and fallback values; parcel confidence never certifies a proposed rent.

Unique boardable GTFS trip IDs are unioned by route across stops within 400 m. The source snapshot is 2026-09-25, feed validity through 2026-10-14. Studio walk/wait uses one selected stop; it does not add the same bus at neighboring stops. Opposite-direction stops retain separate identities. `stops.sources.json` records the source hash and correction method. Original six-factor score snapshots are archived, so they do not silently change with this transit correction.

## Archived Explorer and source-model factors (`web/lib/factors.js`)

| Factor | Direction on 0–100 | Geography | What goes in | Main assumptions |
| --- | --- | --- | --- | --- |
| Market activity & lot fit (`demand`) | higher is better | Neighborhood sales + this lot | Median valid sale price per sq ft, valid sales per 100 parcels (assessment file, valid sales since 2021-09-26), lot area | $80–$350/sq ft and 5–30 per 100 anchors; 50/50 blend with an assumed lot-fit curve by type. Not demand for a type, absorption, or viability. |
| Transit access (`transit`) | higher is better | Place (same for every type) | Weekday scheduled trips within 400 m, distance to nearest stop (PRT GTFS, 2026-09-25) | 800 m walk anchor, 250-trip cap, 55/45 frequency/proximity blend. Scheduled service, not reliability. |
| Equity (`equity`) | higher is better | Block group / tract, then type rule | Income vs county median (ACS 2020–2024), ACS rent burden, CHAS 2018–2022 low-income renter cost burden | Need averaged over available measures; team-chosen production and displacement-exposure multipliers by type (assumptions, not measured effects). |
| Climate hazard (`climate_risk`) | higher is worse | Parcel overlap | FEMA NFHL flood zones, 25%+ slopes (landslide-risk proxy), undermined areas | 50/30/20 blend, SFHA floor of 70, small type multiplier. A map screen, not a survey. |
| Displacement risk (`displacement_risk`) | higher is worse | Tract (same for every type) | Renter share (ACS B25003 2020–2024), CHAS cost burden, tract rent growth minus county (B25064 2015–2019 vs 2020–2024) | Anchors; 50/50 vulnerability/pressure. A screening signal, not a prediction. Ranking prefers lower risk, which differs from targeting high-need areas; the CDC anti-displacement example sets its weight to 0. |
| Carbon-related proxy (`carbon_index`) | higher is worse | Building type + place | RECS 2020 Northeast site energy by building type; embodied-carbon direction from published studies; transit score | 60/40 building/transport split; embodied tier 1.0 single-family, 0.6 multi-unit. Relative, per home; not tonnes, not an emissions inventory, no project baseline. |

Factors overlap: transit enters directly and through the carbon proxy's transport term (with complete data and default weights, transit's total share is (25 + 0.4 × 15) / 130 ≈ 23.8%); need indicators feed equity and displacement.

## Archived Explorer composite and comparison

- Suitability for a higher-is-worse factor is 100 minus the value. The score is the weighted average over factors with a finite value and a positive weight; missing factors are skipped and the weights renormalize ("N of M weighted factors available"). No usable weight → no score, with a message.
- Default relative weights 25/25/25/25/15/15 (demand, transit, equity, climate, displacement, carbon). Raw weights are relative, not percentages.
- Rounding: one decimal, ties to even, in both Python (`round`) and JavaScript (`round1`). Shared vectors in `shared/rank_vector.json` check both.
- Historical Explorer comparison: contribution = weight × suitability ÷ that scenario's usable weight. Differences sum to the unrounded gap. Zero-weight factors are never drivers. Held-constant, negligible (rounds to 0.0), and uneven-coverage factors are named. Permission is reported separately from the score.
- Permission (`web/lib/zoning.js`): the §911.02 row for the building's unit count (triplex → Three-Unit; 12 and 40 units → Multi-Unit). States: permitted, partial, special approval (A/S/C, not a variance), not permitted under the checked row, unknown (never permitted). Every reading needs expert review.

## Historical Explorer sensitivity

Five team-authored illustrative priorities (Balanced, Transit, Housing-need, Lower-hazard, Lower-carbon emphasis), not measured stakeholder preferences. The one-factor sweep moves one raw weight 0–100 in steps of 1 with the others fixed; the exact crossing is solved (polynomial of degree ≤ 2 in the weight) and reported with the first sampled change. On one parcel, transit and displacement cannot reorder options.

## Explanations

Studio uses deterministic factor receipts and evidence explanations. The legacy Explorer AI endpoint and provider dependencies have been removed. No model credentials are needed. Historical implementation and checkpoint validation remain in Git history.

## Data and privacy

Sources, vintages, and caveats: README "Data Sources", `docs/DATA_NOTES.md`, `web/public/data/sources.json`. No owner names, mailing addresses, deed parties, or debt amounts are requested or published (`pipeline/test_pii.py`). Site records (City-owned, vacant, tax-delinquent, condemned) are not availability or title.

## Known limitations

See README "Limitations" and `docs/VALIDATION.md`. Most important: no expert zoning review yet; Studio applies supported Title Nine checks, with unassessed rules explicitly excluded. Studio does not evaluate utilities or geotechnical conditions; scores use fixed anchors, not citywide percentiles; ACS margins of error; the CHAS vintage lags; Studio uses routed walking estimates; no practitioner validation of the rankings.

Coverage note: the 142,865 mapped records include 142,571 identified parcels and 294 county polygons without a unique PIN. Those polygons have stable `SITE…` map IDs, retain the source label, and disclose that assessment and parcel-ID-based property flags are unknown. No neighborhood is omitted.
