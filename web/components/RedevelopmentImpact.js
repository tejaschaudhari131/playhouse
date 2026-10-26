import { IMPACT_ASSUMPTIONS, homesText } from '../lib/redevelopmentImpact.js'

const money = value => {
  const sign = value < 0 ? '−' : '', v = Math.abs(value)
  return `${sign}$${v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : Math.round(v)}`
}
const span = ([lo, hi]) => Math.round(lo) === Math.round(hi) ? money(lo) : `${money(lo)}–${money(hi)}`
const sqft = value => `${Math.round(value).toLocaleString()} sq ft`
function gapText([lo, hi]) {
  if (lo >= 0) return `covers the cost range with ${span([lo, hi])} to spare`
  if (hi < 0) return `leaves a funding gap of ${span([-hi, -lo])}`
  return 'falls inside the cost range, so it may or may not cover costs'
}
const Tag = ({ kind }) => <span className={`data-badge${kind === 'Observed' ? ' observed' : ''}`}>{kind}</span>

/** Screening view of one parcel's redevelopment. Every figure carries its evidence type. */
export default function RedevelopmentImpact({ impact, hypothetical = false, open = false }) {
  const { existing, replacement, cost, value, affordability, displacement, carbon, vacant } = impact
  return <details className="impact-panel" open={open}>
    <summary><strong>Redevelopment Feasibility & Impact</strong><span>Screening estimate</span></summary>
    <p className="compact-help">{hypothetical ? 'If this building is demolished' : `${existing.buildings} demolished ${existing.buildings === 1 ? 'building' : 'buildings'} on this site`} and replaced with the current draft: {replacement.label}, {replacement.units} {replacement.units === 1 ? 'home' : 'homes'}, {sqft(replacement.sqft)}.</p>
    <dl>
      <div><dt>Existing <Tag kind="Observed"/></dt><dd>{existing.landUse || 'Use unknown'}{existing.yearBuilt ? ` · built ${existing.yearBuilt}` : ''}{existing.livingSqft ? ` · ${sqft(existing.livingSqft)} living area` : ''}. Homes (estimate from land use): {homesText(existing.homes)}.{existing.sale ? ` Last valid sale ${money(existing.sale.price)}${existing.sale.year ? ` (${existing.sale.year})` : ''}, not a current value.` : ' No valid sale on record.'}</dd></div>
      <div><dt>Net homes <Tag kind="Calculated"/></dt><dd>{replacement.netUnits === null ? `${replacement.units} proposed; existing homes unknown, so net change is unknown.` : `${replacement.netUnits > 0 ? '+' : replacement.netUnits < 0 ? '−' : ''}${Math.abs(replacement.netUnits)} (${replacement.units} proposed − ${existing.homes.homes}${existing.homes.basis === 'minimum' ? '+' : ''} replaced)`}</dd></div>
      <div><dt>Cost <Tag kind="Assumption"/></dt><dd>Demolition {span(cost.demolition)} ({money(IMPACT_ASSUMPTIONS.demolitionPerSqft[0])}–{money(IMPACT_ASSUMPTIONS.demolitionPerSqft[1])}/sq ft × {sqft(existing.demolishedSqft)} estimated floor area, outline × stories). Construction {span(cost.construction)} ({money(cost.constructionRate[0])}–{money(cost.constructionRate[1])}/sq ft). Total {span(cost.total)}, {span(cost.perHome)} per home. Land, financing and fees excluded.</dd></div>
      <div><dt>Rent vs cost <Tag kind="Calculated"/></dt><dd>At {money(value.rent)}/month per home, rent capitalized at {(IMPACT_ASSUMPTIONS.capRate * 100).toFixed(1)}% after {(IMPACT_ASSUMPTIONS.operatingShare * 100).toFixed(0)}% operating costs is worth about {money(value.capitalized)}, which {gapText(value.gap)}.</dd></div>
      <div><dt>Affordability benchmark <Tag kind="Calculated"/></dt><dd>{affordability ? <>A household earning {money(affordability.targetIncome)}/year can pay {money(affordability.affordableRent)}/month in rent at 30% of income after utilities; the draft rent plus utilities is {(affordability.rentBurden * 100).toFixed(0)}% of income. At that affordable rent the building is worth about {money(affordability.capitalized)}, which {gapText(affordability.gap)}.</> : 'Enter a target household income to compare with the 30% benchmark.'}</dd></div>
      <div><dt>Displacement <Tag kind="Observed"/></dt><dd>{displacement.homes === 0 ? 'No dwelling use is recorded on the demolished parcel(s).' : displacement.renterHouseholds !== null ? `About ${displacement.renterHouseholds.toFixed(displacement.renterHouseholds < 10 ? 1 : 0)} renter households could be displaced (${displacement.homes} homes × ${(displacement.renterShare * 100).toFixed(0)}% tract renter share). Occupancy is unverified.` : 'Existing homes or renter share unknown; displacement cannot be estimated.'}{displacement.screen !== null ? ` Tract displacement screen: ${Math.round(displacement.screen)} / 100 (context, not a prediction).` : ''}</dd></div>
      <div><dt>Embodied carbon <Tag kind="Assumption"/></dt><dd>New construction: about {Math.round(carbon.newTonnes[0])}–{Math.round(carbon.newTonnes[1])} t CO₂e upfront ({IMPACT_ASSUMPTIONS.embodiedKgPerM2[0]}–{IMPACT_ASSUMPTIONS.embodiedKgPerM2[1]} kg/m²). {carbon.demolishedFloorM2 > 0 ? `Demolition discards about ${Math.round(carbon.demolishedFloorM2).toLocaleString()} m² of existing building and its materials; that loss and demolition waste are not quantified.` : 'No existing building is demolished.'}</dd></div>
      <div><dt>Compared with vacant land</dt><dd>{vacant.savedDemolition[1] > 0 ? `Building the same draft on a vacant lot would skip ${span(vacant.savedDemolition)} of demolition, displace no households and keep existing buildings standing.` : 'This site has no demolition in the plan, so it compares like vacant land.'}</dd></div>
    </dl>
    <small>Screening only: not a bid, appraisal or pro forma. Ranges are scenario assumptions; subsidies, tax credits and acquisition are not evaluated.</small>
  </details>
}
