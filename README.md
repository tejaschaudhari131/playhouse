# Playhouse

Pittsburgh Planning Studio

by Hack the House

**Plan homes. Test infrastructure. Compare tradeoffs.**

Playhouse helps planners, developers and communities test housing and infrastructure proposals on a 3D map of Pittsburgh, using public data and explicit assumptions.

[Open Playhouse](https://playhouse-pittsburgh.vercel.app)  · [Hackathon challenge](https://ai-horizons-2026-ai-for-housing-hackathon.brandon831577.chatgpt.site/challenges/typology-equity-climate)



Screenshots illustrate the workflow; labels may differ from the latest release. Production follows `main`.

## Try it for yourself 

### **Live app:** https://playhouse-pittsburgh.vercel.app :point_left:

**Demo video (3 min):** https://youtu.be/ggot7Uslx28

https://github.com/user-attachments/assets/041714fe-86ed-4cd0-b937-b1fbd1365784



Open the link, click any Pittsburgh lot (or search a parcel ID such as 0056F00338000000), and compare housing options side by side. Address search covers the city and loads a small index only when you type. No sign-in needed.

![A single-family proposal previewed among existing buildings on Wylie Avenue in Middle Hill](docs/images/studio-housing.jpg)

## Try it

1. **Pick a place.** Choose a neighborhood, then a parcel. Use **Find sites** to filter records and sort by lot size, vacancy, City ownership, tax delinquency or transit walk. Every match is reachable through pages. Turn on **Highlight empty sites** to find screened vacant candidates that also pass your current filters; click one to try a fitting template.
2. **Try housing types.** Preview houses, duplexes, triplexes and apartments. Place several to form a plan.
3. **Compare options.** Open **Compare → Compare to**. See scores, factor differences and zoning checks side by side.
4. **Set your priorities.** Use **Priorities** to change what matters. Relative weights matter: all 1s and all 100s produce the same ranking.
5. **Test infrastructure.** Add bus service, a walking/street connection or a park. Compare the baseline with your proposal.

Adjust income, rent, utilities and dimensions under **Advanced**. **Tour** walks through a real Hazelwood example, then restores your plan. Edits save on this device automatically; **Export scenario** and **Import scenario** let someone reload the full plan, including drawn changes. Storage failures are shown explicitly. **Print / View 1-Page Site Brief** opens a one-page letter brief of the current draft: a site and massing diagram, the zoning and reform table, the pro forma and tax ledger, the permit pathway and five score receipts and separate fit/capacity checks. [What the brief contains](docs/PLANNER.md).

Buildings on the selected parcel have matching numbers in the list and on the map. Click a row to focus and highlight that outline; footprint sizes and height labels help tell similar buildings apart. Numbers stay the same through demolition and Undo. Full evidence stays under **Building evidence**.

The sidebar keeps its width between sections. Drag its divider or use **Widen / Reset**; comparison cards wrap to fit the available width. Keyboard users can skip directly to planning controls.

Dropdowns stay open after a click so you can browse before choosing. Use arrow keys and Enter, or type a neighborhood name; Escape closes without changing your choice.

![Single-family, duplex and triplex scenarios compared on the same Middle Hill parcel, with scores and evidence labels](docs/images/studio-comparison.jpg)

Compare alternatives for the same parcel, rather than declaring one universally correct housing type.

<details>
<summary>See priority sliders and a transit scenario</summary>

Your priorities are value judgments. The sliders show each factor's share of the score.

![Adjustable priorities beside the 3D map, including market fit, affordability and displacement risk](docs/images/studio-priorities.jpg)

In this earlier screenshot, adding 60 assumed departures to a stop's 88 scheduled departures reduced estimated walk-plus-wait from 12.9 to 10.8 minutes. Current values depend on the selected stop and saved schedule snapshot. This is a scenario calculation, not a reliability forecast.

![A transit scenario showing recorded stop service, proposed extra departures and before-and-after access estimates](docs/images/studio-transit.jpg)

</details>

## Seven considerations, five scoring factors

The hackathon asks for housing alternatives, explained tradeoffs, adjustable priorities and a clear separation of data from value judgments. Playhouse supports that workflow across these seven factors:

| Challenge factor | What Playhouse uses today |
| --- | --- |
| Household demand | Market activity and lot-size fit proxies; not a demand forecast. |
| Physical feasibility | Pass/fail/unknown fit and supported Title Nine zoning checks; not a weighted score. |
| Affordability | Housing-cost burden using labeled prototype rents and a chosen HUD income band; editable or excluded. |
| Displacement risk | A Census tract screening signal; not a prediction of displacement. |
| Infrastructure capacity | Separate pass/fail/unknown transit reserve check, with an assumption range. Utility capacity is unknown. |
| Access to opportunity | Walking routes, transit service and park proximity; not travel to jobs. |
| Marginal carbon | A relative per-home carbon proxy; not marginal tonnes of CO₂. |

**Evidence, proxies and assumptions are labeled.** Supported zoning conflicts and failed physical fit remove the Studio housing score. Missing evidence stays unassessed. Infrastructure changes update supported calculations, such as walking access and available land. Rankings may stay the same when improvements benefit every housing type equally.

## Reading the results

Scores describe preferences under your assumptions, not development approval. The comparison shows completed and unassessed zoning checks beside the totals. Small score differences are not proof of a better project; the model has no validated uncertainty margin. Compare says **No clear winner** when the leading options are within 3 points. This is a team-chosen caution band, not a statistical confidence interval. It also shows when the result depends on priorities.

Priorities and Compare offer five stances: **Balanced**, **Anti-Displacement & Affordability**, **Transit-Oriented Density**, **Climate & Low-Carbon** and **Fast Market Infill**. They are team-authored value judgments, not surveyed stakeholder preferences. Each factor distinguishes **Observed Data**, **Measured + assumed**, **Value Judgment / Assumption** or **Fallback / archived value**; its **Receipt** gives the source dataset, the formula, this draft's inputs and a High, Medium or Low confidence rating. The displacement factor rewards lower **existing neighborhood vulnerability**; it does not estimate a proposal’s displacement or tenant protections, and is not an investment strategy for high-need areas.

**Flood evidence is visible.** Find sites offers any status, no mapped overlap, mapped overlap and unknown. Selected parcels show their recorded overlap with [FEMA's National Flood Hazard Layer](https://www.fema.gov/flood-maps/national-flood-hazard-layer), retrieved **September 27, 2026**, plus a source link. The screen covers Special Flood Hazard Areas and 0.2% annual-chance zones. “No mapped overlap” requires both recorded fractions to be zero; missing evidence stays unknown. It does not mean flood-free. The download date is not a map panel's effective date, which this dataset does not retain.

Empty-site highlights follow the active Find sites filters, including flood. Their count can be lower than the list: highlights also require an empty-space fit and are limited to the map's visible neighborhood scope.

## Affordability reference

**Advanced → Household costs** includes [HUD’s FY2026 Pennsylvania HOME income limits](https://www.huduser.gov/portal/datasets/home-datasets/files/HOME_IncomeLmts_State_PA_2026.pdf) (Pittsburgh area, page 2; effective June 1, 2026). Choose 1–8 household members and compare the published 30%, 50%, 60% and 80% bands. The table is included locally; no account or live API is needed. [Provenance and program distinctions](docs/DATA_SOURCES.md).

New plans include housing costs using **editable prototype rent assumptions**, $150/month utilities and the **60% AMI, one-person HUD income reference ($46,380/year)**. Each type starts with its own rent: house $2,200, duplex $1,800, triplex $1,750, small apartment $2,000 and large apartment $2,100. These are illustrative one-bedroom scenarios, not measured market averages by type. At lower income bands, several can correctly score zero because the target is unaffordable. Change the band or costs to test another scenario.

Public owner listings at [Glasshouse](https://www.glasshouseapts.com/floor-plans/apartments?bed=one_bed&order=ASC&param=avail) and [Albion Lawrenceville](https://albionlawrenceville.com/floorplans/) anchor the scale of recent apartment asking rents; [Albion’s developer record](https://albionresidential.com/projects/albion-lawrenceville/) identifies its recent construction. They do **not** establish representative prices for every type. Assumed discounts, ranges and sources stay under **Advanced → Rent assumptions & sources**. Editing rent switches comparison to that custom rent across types; the reset button restores type-specific defaults.

Zero rent, annual income below $5,000 (including $1,000), and fractional stories are rejected with a message. These are simulator guardrails, not household eligibility rules. Earlier-model saved cost inputs are preserved as legacy assumptions and excluded until reviewed; new defaults never silently overwrite an old plan.

The displayed 30%-of-income budget is a planning benchmark, **not a HOME/LIHTC rent ceiling**. Build's pro forma screens construction and acquisition costs, break-even rent, residual land value, a capital-stack guide and the annual property tax ledger. These figures come from labelled cost assumptions and the last recorded sale; they are not a lender's underwriting. Actual financing terms, subsidy awards, vouchers, tenant occupancy and project displacement effects remain unassessed. Existing inclusionary-zoning checks still need district coverage, project inputs and legal review; the HUD table does not certify compliance.

## Model changes for policy review

- **Five relative weights:** market fit, affordability, displacement, access and carbon. Physical fit and transit capacity remain visible checks and no longer dilute the weighted score. Supported zoning or physical conflicts still withhold a score; uncertain transit capacity does not veto housing.
- **Trips counted once:** the same GTFS trip is counted once per route across nearby stops. The frozen service date is **September 25, 2026**, with the feed valid through **October 14, 2026**; this is historical scenario evidence, not live service. Opposite-direction stops remain separate and show direction/IDs.
- **Capacity is conditional:** default four daily boardings per proposed home, one assumed spare place per existing departure, ten per added departure. Advanced shows sensitivity ranges. Zero reserve means unassessed. Scheduled service cannot establish occupancy or peak capacity.
- **Market fit is a proxy:** sales activity is blended 50/50 with a team-chosen lot-size curve. The receipt shows the curve and this parcel’s inputs; it is not housing demand or developer profit.
- **Displacement:** observed vulnerability provides the risk floor; rising rents can raise it. Flat rents no longer cap the risk at 50. This remains a normative screen, not a prediction of project displacement.
- **One live model:** Studio uses `planner-screen-3.0`. The legacy Explorer and its AI explanation endpoint have been removed. Archived six-factor source fields remain for data provenance; they are not Studio’s final scores.

## Policy follow-up

Advanced shows the parcel’s recorded City inventory, vacancy and tax-delinquency flags, with links to the [Pittsburgh Land Bank’s acquisition routes](https://pghlandbank.org/how-to-buy-vacant-blighted-or-tax-delinquent-property-in-pittsburgh/), [URA property purchase process](https://www.ura.org/pages/property-disposition) and [tenant/homeowner support](https://www.ura.org/pages/housing). These are investigation leads, not proof that a property or program is available to you.

The **Permit & Acquisition Pathway** card in Build and Advanced names the likely acquisition channel (URA, City or a private sale; Playhouse never shows private owner names or private tax-delinquency records), the zoning route (by right, special exception or ZBA variance) and a pre-filled § 922.09.E variance worksheet. It is a planning aid, not legal advice.

Follow [City housing policy updates](https://engage.pittsburghpa.gov/implementing-housing-needs-assessment) for proposed reforms. The **Pittsburgh Policy Reform Simulator** in Compare tests the pending Council Bill 2025-1545 and two hypothetical reforms against the parcel. Their scores are labelled with each preset's legal status and never rank; proposals are not treated as enacted zoning. No citywide housing-target progress metric is shown without a verified adopted target and comparable outcome data.

## Coverage and limits

- **All 90 Pittsburgh neighborhoods:** 142,571 identified parcels plus 294 shared-ground/anonymous polygons.
- **116,502 building outlines:** recorded locations with estimated heights. Colours show recorded use, not recommended redevelopment.
- **Public sources:** county parcels/assessments, Census ACS, HUD CHAS, PRT schedules, OpenStreetMap, zoning and environmental layers. [Sources and provenance](docs/DATA_SOURCES.md).
- **Small address search:** the initial manifest is about 149 KB; a search fetches one address-only file (largest 99 KB). No citywide parcel details are downloaded for search. Records without searchable addresses remain accessible by parcel ID.
- **Fast browsing:** detailed geometry loads for the selected neighborhood and visible adjoining neighborhoods. Zooming out hides detail without simplifying the source geometry.
- **Responsive controls:** priorities reuse existing calculations, map movement updates only changed features, and empty-site candidates are prepared with the data.

This is a planning screen, not development approval. Utility capacity, traffic, actual transit occupancy and causal changes to rents, displacement or emissions are not modeled. [Validation and known gaps](docs/VALIDATION.md).

Studio is at `/`. Old `/explore` bookmarks redirect to Studio and retain the parcel when available. Old Explorer weights and A/B scenarios are not imported; Studio explains this on arrival. Use Studio’s JSON export/import to transfer current plans.

The basemap uses [OpenFreeMap](https://openfreemap.org/), an open-source, free hosted service with no API key or account. County building geometry and height evidence still supply the planning visualization. The provider has no uptime guarantee; its basemap is context, not a new scoring source.

## Run locally

Node.js 22 or newer:

```bash
cd web
npm ci
npm run dev
```

Open http://localhost:3000. Prepared data is included. Keep the repository root available: startup generates browser chunks from compressed sources.

Checks: `npm test` and `npm run build` in `web/`. Pipeline checks: `python -m unittest discover -s pipeline -p 'test_*.py'` after installing [pipeline dependencies](pipeline/requirements.txt).

**Deploy:** import the repo into Vercel with **web** as the root directory. No database or AI credentials are required. Scores and explanations are calculated locally. [Web setup](web/README.md).

## More detail

[Studio guide](docs/PLANNER.md) · [Model card](docs/MODEL_CARD.md) · [Title Nine checks](docs/TITLE_NINE.md) · [Data pipeline](pipeline/README.md) · [AI tool disclosure](docs/AI_TOOLS.md)

Built by **Tejas Chaudhari** (data and scoring), **Chris Severns** (zoning), and **Yoon Yik Ng** (map and frontend), with AI coding assistance under the team's direction.

## Development screening

**Advanced → Development costs & valuation** lets you change construction ranges, site work, design/legal costs, developer fee, contingency, construction interest, reserves, vacancy, operating expenses and cap rate. Inputs save and export with the plan. The pro forma shows the cost breakdown and annual **net operating income (NOI)**; these financial assumptions do not change the housing preference weights.

Defaults are editable screening assumptions. [IRR's August 2026 Pittsburgh report](https://www.irr.com/research/32403/2026-mid-year-viewpoint-pittsburgh-pa-multifamily-report) reports 6–8% metro cap rates and 5–6% vacancy; Playhouse starts at 7.25% and 5.5%, not a Hazelwood appraisal. [Terrapin's 2026 construction guide](https://terrapincg.com/news/multi-family-wood-frame-construction-cost-per-unit-2026) distinguishes low-rise and taller construction. Its national examples inform story-based ranges; they do not certify a prototype's structural system, local price, or unit mix. Model floor area is gross, while prototype rents use one-bedroom examples—review both for a real project.

**No tax-credit equity, subsidy award or abatement is assumed.** A target household income and mapped QCT do not establish project eligibility. [IRS Form 8609 instructions](https://www.irs.gov/instructions/i8609), [PHFA's allocation program](https://www.phfa.org/mhp/developers/lihtc.aspx) and [City abatement requirements](https://www.pittsburghpa.gov/City-Government/Finance-Budget/Taxes/Real-Estate-Taxes/Real-Estate-Forms) remain linked for project review. [Novogradac's September 2026 pricing](https://www.novoco.com/resource-centers/affordable-housing-tax-credits) reports national averages of $0.81 for 9% credits and $0.82 for 4%; a market price alone cannot establish an equity award. The 9%/4% rates are statutory floors for qualifying cases, not a promise of allocation.

The tax illustration retains **27.307 mills** and uses total development cost, including known acquisition, as an explicitly assumed value. This is not an assessment or revenue forecast. Operating expenses already include taxes; the tax illustration is not deducted from NOI again. Acquisition, retained building values, financing commitments and program qualification need project evidence.
