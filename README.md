# Playhouse

Pittsburgh Planning Studio

by Hack the House

**Plan homes. Test infrastructure. Compare tradeoffs.**

Playhouse helps planners, developers and communities test housing and infrastructure proposals on a 3D map of Pittsburgh, using public data and explicit assumptions.

[Open Playhouse](https://playhouse-pittsburgh.vercel.app)  · [Hackathon challenge](https://ai-horizons-2026-ai-for-housing-hackathon.brandon831577.chatgpt.site/challenges/typology-equity-climate)



The screenshots show the citywide branch. The preview may require team sign-in; production follows `main`.

## Try it for yourself 

### **Live app:** https://playhouse-pittsburgh.vercel.app :point_left:

**Demo video (3 min):** https://youtu.be/ggot7Uslx28

https://github.com/user-attachments/assets/041714fe-86ed-4cd0-b937-b1fbd1365784



Open the link, click any Pittsburgh lot (or search a parcel ID such as 0056F00338000000), and compare housing options side by side. Address search covers the city and loads a small index only when you type. No sign-in needed.

![A single-family proposal previewed among existing buildings on Wylie Avenue in Middle Hill](docs/images/studio-housing.jpg)

## Try it

1. **Pick a place.** Choose a neighborhood, then a parcel. Use **Find sites** to filter records and sort by lot size, vacancy, City ownership, tax delinquency or transit walk. Every match is reachable through pages. Turn on **Highlight empty sites** to find screened vacant candidates that also pass your current filters; click one to try a fitting template.
2. **Try housing types.** Preview houses, duplexes, triplexes and apartments. Place several to form a plan.
3. **Compare options.** Open **Rankings → Compare to**. See scores, factor differences and zoning checks side by side.
4. **Set your priorities.** Use **Priorities** to change what matters. Relative weights matter: all 1s and all 100s produce the same ranking.
5. **Test infrastructure.** Add bus service, a walking/street connection or a park. Compare the baseline with your proposal.

Adjust income, rent, utilities and dimensions under **Advanced**. **Tour** walks through a real Hazelwood example, then restores your plan. Edits save on this device automatically; **Export scenario** keeps a portable backup. Storage failures are shown explicitly. **Print / View 1-Page Site Brief** opens a one-page letter brief of the current draft: a site and massing diagram, the zoning and reform table, the pro forma and tax ledger, the permit pathway and the seven-factor receipts. [What the brief contains](docs/PLANNER.md).

The sidebar keeps its width between sections. Drag its divider or use **Widen / Reset**; the comparison table scrolls sideways when needed. Keyboard users can skip directly to planning controls.

Dropdowns stay open after a click so you can browse before choosing. Use arrow keys and Enter, or type a neighborhood name; Escape closes without changing your choice.

![Single-family, duplex and triplex scenarios compared on the same Middle Hill parcel, with scores and evidence labels](docs/images/studio-comparison.jpg)

Compare alternatives for the same parcel, rather than declaring one universally correct housing type.

<details>
<summary>See priority sliders and a transit scenario</summary>

Your priorities are value judgments. The sliders show each factor's share of the score.

![Adjustable priorities beside the 3D map, including market fit, affordability and displacement risk](docs/images/studio-priorities.jpg)

Adding 60 assumed departures to this stop's 88 scheduled departures reduces estimated walk-plus-wait from 12.9 to 10.8 minutes. This is a scenario calculation, not a reliability forecast.

![A transit scenario showing recorded stop service, proposed extra departures and before-and-after access estimates](docs/images/studio-transit.jpg)

</details>

## The seven-factor screen

The hackathon asks for housing alternatives, explained tradeoffs, adjustable priorities and a clear separation of data from value judgments. Playhouse supports that workflow across these seven factors:

| Challenge factor | What Playhouse uses today |
| --- | --- |
| Household demand | Market activity and lot-size fit proxies; not a demand forecast. |
| Physical feasibility | Building footprints, parcel fit and supported Title Nine zoning checks. |
| Affordability | Housing-cost burden, scored only after the user confirms rent, utilities and income. HUD income-band references are available in Advanced. |
| Displacement risk | A Census tract screening signal; not a prediction of displacement. |
| Infrastructure capacity | Scheduled transit service × assumed spare places. Utility capacity is unknown. |
| Access to opportunity | Walking routes, transit service and park proximity; not travel to jobs. |
| Marginal carbon | A relative per-home carbon proxy; not marginal tonnes of CO₂. |

**Evidence, proxies and assumptions are labeled.** Supported zoning conflicts and failed physical fit remove the Studio housing score. Missing evidence stays unassessed. Infrastructure changes update supported calculations, such as walking access and available land. Rankings may stay the same when improvements benefit every housing type equally.

## Reading the results

Scores describe preferences under your assumptions, not development approval. The comparison shows completed and unassessed zoning checks beside the totals. Small score differences are not proof of a better project; the model has no validated uncertainty margin. Compare marks a **Close call (±X pts)** when the top two types are within 3.0 points, or when another priority stance would change the leader, and names that stance.

Priorities and Compare offer five stances: **Balanced**, **Anti-Displacement & Affordability**, **Transit-Oriented Density**, **Climate & Low-Carbon** and **Fast Market Infill**. They are team-authored value judgments, not surveyed stakeholder preferences. Each factor is labelled **Observed Data** or **Value Judgment / Assumption**; its **Receipt** gives the source dataset, the formula, this draft's inputs and a High, Medium or Low confidence rating. The displacement factor rewards lower **existing neighborhood vulnerability**; it does not estimate a proposal’s displacement or tenant protections, and is not an investment strategy for high-need areas.

**Flood evidence is visible.** Find sites offers any status, no mapped overlap, mapped overlap and unknown. Selected parcels show their recorded overlap with [FEMA's National Flood Hazard Layer](https://www.fema.gov/flood-maps/national-flood-hazard-layer), retrieved **September 27, 2026**, plus a source link. The screen covers Special Flood Hazard Areas and 0.2% annual-chance zones. “No mapped overlap” requires both recorded fractions to be zero; missing evidence stays unknown. It does not mean flood-free. The download date is not a map panel's effective date, which this dataset does not retain.

Empty-site highlights follow the active Find sites filters, including flood. Their count can be lower than the list: highlights also require an empty-space fit and are limited to the map's visible neighborhood scope.

## Affordability reference

**Advanced → Household costs** includes [HUD’s FY2026 Pennsylvania HOME income limits](https://www.huduser.gov/portal/datasets/home-datasets/files/HOME_IncomeLmts_State_PA_2026.pdf) (Pittsburgh area, page 2; effective June 1, 2026). Choose 1–8 household members and compare the published 30%, 50%, 60% and 80% bands. The table is included locally; no account or live API is needed. [Provenance and program distinctions](docs/DATA_SOURCES.md).

Starting Census rents describe existing stock, not new construction. Housing-cost scoring starts **excluded**. Confirm the exact rent, utilities and income to include it; changing those inputs requires confirmation again. Placed buildings retain their own assumptions. Compared housing types deliberately share the draft’s costs, so equal cost-burden scores do not demonstrate equal construction economics.

The displayed 30%-of-income budget is a planning benchmark, **not a HOME/LIHTC rent ceiling**. Build's pro forma screens construction and acquisition costs, break-even rent, residual land value, a capital-stack guide and the annual property tax ledger. These figures come from labelled cost assumptions and the last recorded sale; they are not a lender's underwriting. Actual financing terms, subsidy awards, vouchers, tenant occupancy and project displacement effects remain unassessed. Existing inclusionary-zoning checks still need district coverage, project inputs and legal review; the HUD table does not certify compliance.

## Policy follow-up

Advanced shows the parcel’s recorded City inventory, vacancy and tax-delinquency flags, with links to the [Pittsburgh Land Bank’s acquisition routes](https://pghlandbank.org/how-to-buy-vacant-blighted-or-tax-delinquent-property-in-pittsburgh/), [URA property purchase process](https://www.ura.org/pages/property-disposition) and [tenant/homeowner support](https://www.ura.org/pages/housing). These are investigation leads, not proof that a property or program is available to you.

The **Permit & Acquisition Pathway** card in Build and Advanced names the likely acquisition channel (URA, City or a private sale; Playhouse never shows private owner names or private tax-delinquency records), the zoning route (by right, special exception or ZBA variance) and a pre-filled § 922.09.E variance worksheet. It is a planning aid, not legal advice.

Follow [City housing policy updates](https://engage.pittsburghpa.gov/implementing-housing-needs-assessment) for proposed reforms. The **Pittsburgh Policy Reform Simulator** in Compare tests the pending Council Bill 2025-1545 and two hypothetical reforms against the parcel. Their scores are labelled with each preset's legal status and never rank; proposals are not treated as enacted zoning. No citywide housing-target progress metric is shown without a verified adopted target and comparable outcome data.

## Coverage and limits

- **All 90 Pittsburgh neighborhoods:** 142,571 identified parcels plus 294 shared-ground/anonymous polygons.
- **116,502 building outlines:** recorded locations with estimated heights. Colours show recorded use, not recommended redevelopment.
- **Public sources:** county parcels/assessments, Census ACS, HUD CHAS, PRT schedules, OpenStreetMap, zoning and environmental layers. [Sources and provenance](docs/DATA_SOURCES.md).
- **Small address search:** the initial manifest is about 140 KB; a search fetches one address-only file (largest 99 KB). No citywide parcel details are downloaded for search. Records without searchable addresses remain accessible by parcel ID.
- **Fast browsing:** detailed geometry loads for the selected neighborhood and visible adjoining neighborhoods. Zooming out hides detail without simplifying the source geometry.
- **Responsive controls:** priorities reuse existing calculations, map movement updates only changed features, and empty-site candidates are prepared with the data.

This is a planning screen, not development approval. Utility capacity, traffic, actual transit occupancy and causal changes to rents, displacement or emissions are not modeled. [Validation and known gaps](docs/VALIDATION.md).

Studio is at `/`; the original Explorer remains at `/explore` for reference.

## Run locally

Node.js 22 or newer:

```bash
cd web
npm ci
npm run dev
```

Open http://localhost:3000. Prepared data is included. Keep the repository root available: startup generates browser chunks from compressed sources.

Checks: `npm test` and `npm run build` in `web/`. Pipeline checks: `python -m unittest discover -s pipeline -p 'test_*.py'` after installing [pipeline dependencies](pipeline/requirements.txt).

**Deploy:** import the repo into Vercel with **web** as the root directory. No database or AI credentials are required. Optional AI explains calculated facts; it does not calculate housing scores. [Web setup](web/README.md).

## More detail

[Studio guide](docs/PLANNER.md) · [Model card](docs/MODEL_CARD.md) · [Title Nine checks](docs/TITLE_NINE.md) · [Data pipeline](pipeline/README.md) · [AI tool disclosure](docs/AI_TOOLS.md)

Built by **Tejas Chaudhari** (data and scoring), **Chris Severns** (zoning), and **Yoon Yik Ng** (map and frontend), with AI coding assistance under the team's direction.
