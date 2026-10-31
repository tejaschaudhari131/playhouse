import { useMemo } from 'react'
import { POLICY_SCENARIOS, SCENARIO_STATUS_TEXT, buildingMetrics, lvtOutcome, scenarioById, stairOutcome, zoningOutcome } from '../lib/policyScenarios.js'
import { RATIO_RANGE, CITY_MILLAGE, splitRates } from '../lib/lvtShift.js'
import { presetById } from '../lib/policyReform.js'
import { EGRESS_RULES } from '../lib/singleStair.js'
import { externalLinkLabel } from '../lib/links.js'

const dollars = value => `${value < 0 ? '−' : ''}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`
const signed = value => `${value > 0 ? '+' : ''}${dollars(value)}`
const span = (range, format = dollars) => {
  if (!Array.isArray(range)) return '—'
  const [a, b] = [Math.min(...range), Math.max(...range)]
  return Math.round(a) === Math.round(b) ? format(a) : `${format(a)} to ${format(b)}`
}
const count = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`
const homes = n => `${n} ${n === 1 ? 'home' : 'homes'}`

function reachText(reach) {
  if (!reach) return '—'
  return reach.band ? `A household at ${reach.band}% AMI or above (size ${reach.householdSize})` : `Above 80% AMI (size ${reach.householdSize})`
}

function buildingRows(before, after) {
  return [
    ['Net homes on this parcel', m => m ? (m.net === null ? `${homes(m.homes)} (existing homes unknown)` : count(m.net)) : '0'],
    ['Rent needed per home to break even', m => m?.breakEven ? `${span(m.breakEven)} / month` : '—'],
    ['Affordable at that rent to', m => reachText(m?.reach)],
    ['Property tax change, all levies', m => m?.tax ? `${span(m.tax, signed)} / year` : '—'],
    ['Feasibility', m => m?.feasibility?.label || '—'],
  ].map(([label, cell]) => ({ label, before: cell(before), after: cell(after) }))
}

function Table({ caption, columns = ['Current rules', 'With reform'], rows }) {
  return <table className="scenario-table">
    <caption>{caption}</caption>
    <thead><tr><th scope="col"><span className="sr-only">Measure</span></th>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.before}</td><td>{r.after}</td></tr>)}</tbody>
  </table>
}

/** Before/after rows for one scenario on the selected parcel. `impactFor(typeId, overrides)` is a redevelopment impact. */
function useOutcome(scenario, { options, code, parcel, impactFor, fitFor, metricsContext, draft, lvt, taxBase }) {
  return useMemo(() => {
    if (scenario.kind === 'tax') {
      const ratio = lvt?.ratio ?? RATIO_RANGE.default
      const rates = taxBase?.parcels ? splitRates(taxBase, ratio) : null
      const impact = impactFor(draft.typeId)
      const outcome = rates ? lvtOutcome(parcel, rates, impact?.cost?.beforeLand) : null
      return { kind: 'tax', ratio, rates, outcome, units: impact?.replacement.units ?? 1, label: impact?.replacement.label ?? null }
    }
    if (!options) return null
    if (scenario.kind === 'stair') {
      const outcome = stairOutcome(options, fitFor)
      const metric = (best, row) => best ? buildingMetrics(impactFor(best.typeId, best.typeId === 'small_apartment' && row.fit ? { width: row.fit.width, depth: row.fit.depth } : {}), metricsContext) : null
      return { kind: 'stair', outcome, before: metric(outcome.before, outcome.rows[0]), after: metric(outcome.after, outcome.rows[1]) }
    }
    const outcome = zoningOutcome(scenario.preset, Object.values(options), code)
    const metric = best => best ? buildingMetrics(impactFor(best.typeId), metricsContext) : null
    return { kind: 'zoning', outcome, before: metric(outcome.before), after: metric(outcome.after) }
  }, [scenario, options, code, parcel, impactFor, fitFor, metricsContext, draft.typeId, lvt?.ratio, taxBase])
}

function TaxResult({ result }) {
  const { outcome, rates, ratio, units, label } = result
  if (!rates) return <p className="compact-help">Assessed land and building values are not available in this data build.</p>
  const built = outcome?.built, perHome = key => built ? `${span(built.map(b => b[key] / Math.max(1, units) / 12))} / month` : '—'
  return <Table caption={`City levy only, ${ratio.toFixed(1)} : 1 land to building, revenue-neutral citywide`} columns={['Today', 'With the shift']} rows={[
    { label: 'City rate', before: `${CITY_MILLAGE} mills on land and buildings`, after: `${rates.landMills.toFixed(2)} on land · ${rates.buildingMills.toFixed(2)} on buildings` },
    { label: 'This parcel’s City bill', before: outcome?.own ? `${dollars(outcome.own.current)} / year` : 'Exempt or no recorded value', after: outcome?.own ? `${dollars(outcome.own.proposed)} / year (${signed(outcome.own.change)})` : 'No change' },
    { label: 'City tax on the land alone', before: outcome?.holding ? `${dollars(outcome.holding.current)} / year` : '—', after: outcome?.holding ? `${dollars(outcome.holding.proposed)} / year (${signed(outcome.holding.change)})` : '—' },
    { label: `City tax on a new ${label ? label.toLowerCase() : 'building'} here`, before: built ? `${span(built.map(b => b.current))} / year` : '—', after: built ? `${span(built.map(b => b.proposed))} / year` : '—' },
    { label: 'City tax per new home', before: perHome('current'), after: perHome('proposed') },
    { label: 'Net homes', before: 'Zoning unchanged', after: 'Zoning unchanged' },
  ]}/>
}

function StairResult({ result }) {
  const { outcome, before, after } = result
  const [two, one] = outcome.rows
  const core = row => row.fits ? `Fits at ${row.fit.width} × ${row.fit.depth} m; about ${Math.round(row.efficiency * 100)}% of each floor is homes` : `Doesn’t fit: a ${row.stairs === 1 ? 'single-stair' : 'two-stair corridor'} core needs about ${row.minimum.width} m across`
  return <>
    <Table caption="12-home, 4-story apartment on this lot" rows={[
      { label: 'One stair allowed up to', before: `${two.maxStories} stories (${EGRESS_RULES['two-stair'].source})`, after: `${one.maxStories} stories, ≤ 4 homes per floor` },
      { label: 'Stair core on this lot', before: core(two), after: core(one) },
      { label: 'Most homes that pass every check', before: outcome.before ? `${homes(outcome.homesBefore)} (${outcome.before.label})` : 'None', after: outcome.after ? `${homes(outcome.homesAfter)} (${outcome.after.label})` : 'None' },
      ...buildingRows(before, after),
    ]}/>
    {!outcome.allowed && <p className="compact-help">Zoning here does not permit the 12-home apartment by right, so the stair rule alone adds no homes.</p>}
  </>
}

function ZoningResult({ result, scenario }) {
  const { outcome, before, after } = result
  const height = outcome.height
  return <>
    <Table caption={presetById(scenario.preset).label} rows={[
      ...(scenario.id === 'bill-2025-1545' && height ? [{ label: 'Height limit, 4+ homes', before: `${height.beforeFt} ft${height.beforeStories ? ` · ${height.beforeStories} stories` : ''}`, after: height.bonusFt ? `${height.afterFt} ft${height.afterStories ? ` · ${height.afterStories} stories` : ''} if 10% of homes rent at ≤ 50% AMI` : `${height.afterFt} ft: no bonus in this district` }] : []),
      { label: 'Most homes that pass every check', before: outcome.before ? `${homes(outcome.homesBefore)} (${outcome.before.label})` : 'None', after: outcome.homesAfter ? `${homes(outcome.homesAfter)}${outcome.after ? ` (${outcome.after.label}${outcome.adu?.withSingleUnit && outcome.homesAfter > outcome.after.units ? ' plus 2 ADUs' : ''})` : ''}` : 'None' },
      ...buildingRows(before, after),
    ]}/>
    {outcome.rules.length ? <ul className="scenario-rules">{outcome.rules.map(r => <li key={r.id}>§ {r.section} {r.text}: clears {r.checks.join(', ')} for {r.types.join(', ')}.</li>)}</ul>
      : <p className="compact-help">No screened conflict on this parcel is lifted by this scenario. Try the example parcel.</p>}
  </>
}

/**
 * Named policy scenarios: what each would enable, Current rules against the reform on the selected parcel, how to
 * judge the result, and one-click example parcels. The LVT card also holds the citywide map controls (`children`).
 */
export default function PolicyScenarios({ active, onActive, applied = {}, onApply, onExample, pending = false, children, ...inputs }) {
  const scenario = scenarioById(active)
  const result = useOutcome(scenario, inputs)
  return <div className="policy-scenarios">
    <div className="scenario-picker" role="group" aria-label="Named policy scenarios">
      {POLICY_SCENARIOS.map(s => <button key={s.id} type="button" aria-pressed={s.id === scenario.id} onClick={() => onActive(s.id)}>{s.label}</button>)}
    </div>
    <section className="scenario-card" aria-labelledby={`scenario-${scenario.id}`}>
      <div className="policy-scenario-head"><h3 id={`scenario-${scenario.id}`}>{scenario.label}</h3><span className={`reform-status ${scenario.status}`}>{SCENARIO_STATUS_TEXT[scenario.status]}</span></div>
      <h4>What it would enable</h4>
      <p className="scenario-enables">{scenario.enables}</p>
      <div className="scenario-actions">
        <button type="button" className="scenario-example" onClick={() => onExample(scenario)}>Try an example <small>{scenario.example.label}</small></button>
        {scenario.kind !== 'tax' && <button type="button" aria-pressed={!!applied[scenario.id]} title={scenario.kind === 'stair' ? 'Switch the stair rule for the draft and its 3D model' : 'Use this reform for the height envelope and the Compare tab'} onClick={() => onApply(scenario.id, !applied[scenario.id])}>{applied[scenario.id] ? 'Applied to this plan' : 'Apply to this plan'}</button>}
      </div>
      <h4 id="scenario-results">Before and after on this parcel</h4>
      <div aria-busy={pending}>
        {pending || !result ? <p className="compact-help" role="status">Calculating this parcel…</p>
          : result.kind === 'tax' ? <TaxResult result={result}/>
          : result.kind === 'stair' ? <StairResult result={result}/>
          : <ZoningResult result={result} scenario={scenario}/>}
      </div>
      <h4>How to evaluate it</h4>
      <ul className="scenario-evaluate">{scenario.evaluate.map(line => { const [head, ...rest] = line.split(': '); return <li key={line}><strong>{head}:</strong> {rest.join(': ')}</li> })}</ul>
      <p className="scenario-note">Illustrative screen on the County parcel record and team cost assumptions. Not a tax bill, appraisal, permit or code determination. Fit counts existing buildings; demolish them in Build to test a cleared lot.</p>
      {children}
    </section>
    <PriorWork/>
  </div>
}

export const PRIOR_WORK = [
  { label: 'University of Pittsburgh Urban Planning Club', url: 'https://experience.pitt.edu/upc/', text: 'Pitt student community for urban planning; Showcase feedback credited Pitt’s urban policy students.' },
  { label: 'Allegheny County Property Assessments (WPRDC)', url: 'https://data.wprdc.org/dataset/property-assessments', text: 'Assessed land and building values, land use and tax status behind the tax shift and building types.' },
  { label: 'Center for Land Economics: LVTShift', url: 'https://landeconomics.org/lvtshift', text: 'Open toolkit for modelling revenue-neutral land value tax shifts; the method here is a simplified version.', extra: { label: 'How to model a shift', url: 'https://blog.landeconomics.org/p/want-to-model-a-land-value-tax-shift' } },
  { label: 'Courtyard Urbanist', url: 'https://courtyardurbanist.com/', text: 'Examples and policy tracking for courtyard housing, point-access single-stair blocks and missing-middle reform.', extra: { label: 'Point-access blocks in the ROAD to Housing Act', url: 'https://courtyardurbanist.com/p/the-road-to-housing-act-creates-a' } },
]

export function PriorWork() {
  return <details className="prior-work">
    <summary>Learn more / prior work</summary>
    <ul>{PRIOR_WORK.map(item => <li key={item.url}>
      <a href={item.url} target="_blank" rel="noreferrer" aria-label={externalLinkLabel(item.label)}>{item.label}</a>
      <span>{item.text}{item.extra && <> <a href={item.extra.url} target="_blank" rel="noreferrer" aria-label={externalLinkLabel(item.extra.label)}>{item.extra.label}</a>.</>}</span>
    </li>)}</ul>
  </details>
}
