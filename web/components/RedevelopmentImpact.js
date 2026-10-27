import { IMPACT_ASSUMPTIONS, homesText } from '../lib/redevelopmentImpact.js'
import { AREA_BASIS_TEXT, PRO_FORMA_ASSUMPTIONS } from '../lib/proForma.js'

export const money = value => {
  const sign = value < 0 ? '−' : '', v = Math.abs(value)
  return `${sign}$${v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : Math.round(v)}`
}
export const dollars = value => `${value < 0 ? '−' : ''}$${Math.round(Math.abs(value)).toLocaleString()}`
export const span = ([lo, hi], format = money) => format(lo) === format(hi) ? format(lo) : `${format(lo)}${lo < 0 || hi < 0 ? ' to ' : '–'}${format(hi)}`
const sqft = value => `${Math.round(value).toLocaleString()} sq ft`
const pct = value => `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`
function gapText([lo, hi]) {
  if (lo >= 0) return `covers the total development cost with ${span([lo, hi])} to spare`
  if (hi < 0) return `leaves a funding gap of ${span([-hi, -lo])}`
  return 'falls inside the cost range, so it may or may not cover costs'
}
const residualText = ([lo, hi]) => hi < 0 ? `negative (${span([lo, hi])}): the land has no value for this use at this rent` : lo < 0 ? `${span([lo, hi])}: may be negative` : span([lo, hi])
const Tag = ({ kind }) => <span className={`data-badge${kind === 'Observed' ? ' observed' : ''}`}>{kind}</span>
const STATUS = { eligible: 'Screens in', conditional: 'Conditional', not_eligible: 'Does not screen in' }
const ACQUISITION_TAG = { public: 'Assumption', sale: 'Observed', estimate: 'Calculated', old_sale: 'Observed', not_offered: 'Observed', unknown: 'Observed' }

function AcquisitionRow({ acquisition }) {
  return <div><dt>Acquisition <Tag kind={acquisition.parcels.length === 1 ? ACQUISITION_TAG[acquisition.parcels[0].basis] : 'Calculated'}/></dt><dd>
    {acquisition.parcels.map((p, i) => <span key={p.pin || i} className="impact-line">{acquisition.parcels.length > 1 ? `${i ? 'Neighbor parcel' : 'Site'}: ` : ''}{p.range ? span(p.range) : 'not counted'} · {p.text}{p.basis === 'public' ? ` (${money(PRO_FORMA_ASSUMPTIONS.publicNominal[0])}–${money(PRO_FORMA_ASSUMPTIONS.publicNominal[1])} screening range)` : ''}{p.basis === 'sale' || p.basis === 'old_sale' ? ', not a current appraisal' : ''}.</span>)}
    {!acquisition.complete && <span className="impact-line">Parcels without a value are left out of the total, so it is understated.</span>}
  </dd></div>
}

function CostTable({ cost }) {
  return <table className="impact-table">
    <tbody>
      <tr><th scope="row">Demolition</th><td>{span(cost.demolition)}</td></tr>
      <tr><th scope="row">Construction</th><td>{span(cost.construction)}</td></tr>
      <tr className="subtotal"><th scope="row">Hard Redevelopment Cost (Demolition + Construction)</th><td>{span(cost.hard)}</td></tr>
      <tr><th scope="row">Soft costs ({pct(cost.softShare)} of hard: design, permits, financing)</th><td>{span(cost.soft)}</td></tr>
      <tr><th scope="row">Acquisition{cost.acquisition.complete ? '' : ' (partial)'}</th><td>{span(cost.acquisition.range)}</td></tr>
      <tr className="total"><th scope="row">Total Development Cost incl. Acquisition</th><td>{span(cost.development)}</td></tr>
      <tr><th scope="row">Per home</th><td>{span(cost.perHome)}</td></tr>
    </tbody>
  </table>
}

function CapitalStack({ stack, affordability }) {
  return <section className="capital-stack" aria-label="Pittsburgh Subsidy & Capital Stack Guide">
    <h4>Pittsburgh Subsidy & Capital Stack Guide <Tag kind="Program screen"/></h4>
    <p><strong>Subsidy gap: {span(stack.gapPerUnit)} per home</strong> ({span(stack.gap)} total) {affordability ? `at the affordable rent for ${affordability.band?.band ? `a ${affordability.band.band}% AMI household` : 'this income'}` : 'at the draft rent'}.{stack.band === null && affordability ? ' This income is above 80% AMI, so the programs below do not screen in.' : ''}</p>
    <ul>{stack.programs.map(p => <li key={p.id} className={`program ${p.status}`}>
      <span className="program-status">{STATUS[p.status]}</span>
      <a href={p.url} target="_blank" rel="noreferrer" aria-label={`${p.name} (opens in a new tab)`}><strong>{p.name}</strong></a> <small>{p.sponsor}</small>
      <p>{p.note}</p>
      {p.estimate && <p>Equity estimate: 9% credits {span(p.estimate.nine)}; 4% credits {span(p.estimate.four)}. <small>{p.assumption}</small></p>}
      {p.links?.map(url => <a key={url} className="program-link" href={url} target="_blank" rel="noreferrer" aria-label={`${url.replace(/^https:\/\/(www\.)?/, '')} (opens in a new tab)`}>{url.replace(/^https:\/\/(www\.)?/, '')} ↗</a>)}
    </li>)}</ul>
    <small>Eligibility is screened only by the target income band. Awards are competitive and terms change; confirm with PHFA and the URA.</small>
  </section>
}

export function TaxLedger({ tax, title = 'Annual Local Property Tax Ledger' }) {
  return <section className="tax-ledger" aria-label={title}>
    <h4>{title} <Tag kind="Calculated"/></h4>
    <table className="impact-table">
      <thead><tr><th scope="col">Taxing body (mills)</th><th scope="col">New building</th><th scope="col">Replaced</th><th scope="col">Net new</th></tr></thead>
      <tbody>
        {tax.bodies.map(b => <tr key={b.id}><th scope="row">{b.body} ({b.mills}){b.id === 'city' ? <small>{b.detail}</small> : null}</th><td>{span(b.newTax, dollars)}</td><td>{span(b.replacedTax, dollars)}</td><td>{span(b.net, dollars)}</td></tr>)}
        <tr className="total"><th scope="row">Total ({tax.mills.toFixed(3)} mills)</th><td>{span(tax.newTax, dollars)}</td><td>{span(tax.replacedTax, dollars)}</td><td><strong>{span(tax.net, dollars)}</strong></td></tr>
      </tbody>
    </table>
    <p><strong>Net New Annual Tax Revenue: {span(tax.net, dollars)}</strong> per year.</p>
    <small>
      New assessment uses construction cost as a proxy; County assessments often run lower. Replaced tax uses the whole parcel's sale or estimated value, which is conservative because the land stays taxed.
      {tax.exempt ? ` ${tax.exempt} public parcel${tax.exempt === 1 ? ' is' : 's are'} tax-exempt today.` : ''}{tax.unknown ? ` ${tax.unknown} parcel${tax.unknown === 1 ? '' : 's'} with no value ${tax.unknown === 1 ? 'is' : 'are'} not subtracted.` : ''}
      {' '}{tax.abatement.applies
        ? <>Abatement: new residential construction may qualify for the City's <a href={tax.abatement.url} target="_blank" rel="noreferrer">{tax.abatement.program}{tax.abatement.enhanced ? ' Enhanced' : ''} real estate tax credit</a> (consolidated from Act 42 / LERTA in 2020): {tax.abatement.years} years, up to {money(tax.abatement.cap)} a year{tax.abatement.enhanced ? ', because the target income is at or below 80% AMI (needs ≥10% of homes at 50% AMI or ≥60% at 80% AMI)' : '; Enhanced 10-year terms need ≥10% of homes at 50% AMI or ≥60% at 80% AMI'}. If the City share is abated, net new tax is about {span(tax.abatement.netDuring, dollars)} a year during the abatement. Owner-occupied or for-sale homes use Chapter 265 instead. School and County abatements are separate.</>
        : 'Abatement: no assessment increase to abate.'}
    </small>
  </section>
}

/** Screening pro forma for one parcel. Every figure carries its evidence type. */
export default function RedevelopmentImpact({ impact, hypothetical = false, open = false }) {
  const { existing, replacement, cost, value, affordability, displacement, carbon, vacant, capitalStack, tax } = impact
  const demolishing = existing.buildings > 0
  return <details className="impact-panel" open={open}>
    <summary><strong>{demolishing ? 'Redevelopment Feasibility & Impact' : 'Development Feasibility & Pro Forma'}</strong><span>Screening estimate</span></summary>
    <p className="compact-help">{demolishing ? `${hypothetical ? 'If this building is demolished' : `${existing.buildings} demolished ${existing.buildings === 1 ? 'building' : 'buildings'} on this site`} and replaced with the current draft` : 'Building the current draft on this lot'}: {replacement.label}, {replacement.units} {replacement.units === 1 ? 'home' : 'homes'}, {sqft(replacement.sqft)}.</p>
    <dl>
      <div><dt>Existing <Tag kind="Observed"/></dt><dd>{existing.landUse || 'Use unknown'}{existing.yearBuilt ? ` · built ${existing.yearBuilt}` : ''}{existing.livingSqft ? ` · ${sqft(existing.livingSqft)} living area` : ''}. Homes (estimate from land use): {homesText(existing.homes)}.{existing.sale ? ` Last valid sale ${money(existing.sale.price)}${existing.sale.year ? ` (${existing.sale.year})` : ''}.` : ' No valid sale on record.'}</dd></div>
      <div><dt>Net homes <Tag kind="Calculated"/></dt><dd>{replacement.netUnits === null ? `${replacement.units} proposed; existing homes unknown, so net change is unknown.` : `${replacement.netUnits > 0 ? '+' : replacement.netUnits < 0 ? '−' : ''}${Math.abs(replacement.netUnits)} (${replacement.units} proposed − ${existing.homes.homes}${existing.homes.basis === 'minimum' ? '+' : ''} replaced)`}</dd></div>
      {demolishing && <div><dt>Demolished floor area <Tag kind={existing.area.basis === 'observed' ? 'Observed' : 'Calculated'}/></dt><dd>{sqft(existing.demolishedSqft)} · {AREA_BASIS_TEXT[existing.area.basis]}{existing.area.parts.length > 1 ? `: ${existing.area.parts.map(p => `${sqft(p.sqft)} ${p.basis} (${p.reason})`).join('; ')}` : existing.area.parts[0]?.basis === 'calculated' ? ` (${existing.area.parts[0].reason})` : ''}.</dd></div>}
      <AcquisitionRow acquisition={cost.acquisition}/>
      <div className="impact-wide"><dt>Cost breakdown <Tag kind="Assumption"/></dt><dd><CostTable cost={cost}/><small>Demolition {money(IMPACT_ASSUMPTIONS.demolitionPerSqft[0])}–{money(IMPACT_ASSUMPTIONS.demolitionPerSqft[1])}/sq ft of demolished floor area; construction {money(cost.constructionRate[0])}–{money(cost.constructionRate[1])}/sq ft. Hard cost per home {span(cost.hardPerHome)}.</small></dd></div>
      <div><dt>Break-even rent <Tag kind="Calculated"/></dt><dd><strong>{span(value.breakEvenRent, dollars)} per home per month</strong> covers the total development cost, capitalized at {(IMPACT_ASSUMPTIONS.capRate * 100).toFixed(1)}% after {(IMPACT_ASSUMPTIONS.operatingShare * 100).toFixed(0)}% operating costs. The draft rent is {dollars(value.rent)}.</dd></div>
      <div><dt>Rent vs cost <Tag kind="Calculated"/></dt><dd>At {dollars(value.rent)}/month per home the building is worth about {money(value.capitalized)}, which {gapText(value.gap)}. Residual land value: {residualText(value.residualLand)}.</dd></div>
      <div><dt>Affordability benchmark <Tag kind="Calculated"/></dt><dd>{affordability ? <>A household earning {money(affordability.targetIncome)}/year{affordability.band ? ` (about ${Math.round(affordability.band.percent)}% AMI, ${affordability.band.band ? `${affordability.band.band}% band` : 'above 80%'} for ${affordability.band.householdSize} ${affordability.band.householdSize === 1 ? 'person' : 'people'}, HUD FY${affordability.band.fiscalYear})` : ''} can pay {dollars(affordability.affordableRent)}/month in rent at 30% of income after utilities; the draft rent plus utilities is {(affordability.rentBurden * 100).toFixed(0)}% of income. At that rent the building is worth about {money(affordability.capitalized)}, which {gapText(affordability.gap)}. Residual land value: {residualText(affordability.residualLand)}.</> : 'Enter a target household income to compare with the 30% benchmark.'}</dd></div>
      {demolishing && <div><dt>Displacement <Tag kind="Observed"/></dt><dd>{displacement.homes === 0 ? 'No dwelling use is recorded on the demolished parcel(s).' : displacement.renterHouseholds !== null ? `About ${displacement.renterHouseholds.toFixed(displacement.renterHouseholds < 10 ? 1 : 0)} renter households could be displaced (${displacement.homes} homes × ${(displacement.renterShare * 100).toFixed(0)}% tract renter share). Occupancy is unverified.` : 'Existing homes or renter share unknown; displacement cannot be estimated.'}{displacement.screen !== null ? ` Tract displacement screen: ${Math.round(displacement.screen)} / 100 (context, not a prediction).` : ''}</dd></div>}
      <div><dt>Embodied carbon <Tag kind="Assumption"/></dt><dd>New construction: about {Math.round(carbon.newTonnes[0])}–{Math.round(carbon.newTonnes[1])} t CO₂e upfront ({IMPACT_ASSUMPTIONS.embodiedKgPerM2[0]}–{IMPACT_ASSUMPTIONS.embodiedKgPerM2[1]} kg/m²). {carbon.demolishedFloorM2 > 0 ? `Demolition discards about ${Math.round(carbon.demolishedFloorM2).toLocaleString()} m² of existing building and its materials; that loss and demolition waste are not quantified.` : 'No existing building is demolished.'}</dd></div>
      {demolishing && <div><dt>Compared with vacant land</dt><dd>Building the same draft on a vacant lot would skip {span(vacant.savedDemolition)} of demolition, displace no households and keep existing buildings standing.</dd></div>}
    </dl>
    {capitalStack && <CapitalStack stack={capitalStack} affordability={affordability}/>}
    <TaxLedger tax={tax}/>
    <small>Screening only: not a bid, appraisal or lender pro forma. Cost, soft-cost, cap-rate and assessment figures are scenario assumptions; program terms must be confirmed with the administering agency.</small>
  </details>
}
