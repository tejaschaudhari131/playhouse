import { BUILDINGS, BUILDING_IDS } from '../lib/buildings.js'
import TitleNineChecks from './TitleNine.js'
import { housingSpec } from '../lib/titleNine.js'
import { simulatedColor } from '../lib/buildingUses.js'
import { FACTOR_LABELS, templateTradeoffs, zoningBadge, comparisonScore, zoningReviewLabel, proposalChecks } from '../lib/studioPresentation.js'
import { simulateReform, presetById, REFORM_STATUS_TEXT } from '../lib/policyReform.js'
import PolicyReformSimulator from './PolicyReformSimulator.js'
import Glossary from './Glossary.js'
import { StancePills, CloseCall } from './PriorityStances.js'
import { EvidenceBadge, FactorReceipt } from './FactorReceipt.js'
import { closeCall } from '../lib/priorityStances.js'
import { factorReceipt } from '../lib/factorReceipts.js'
import { PREFERENCE_FACTOR_IDS } from '../lib/scoringPolicy.js'

const number = n => Number.isFinite(n) ? n.toFixed(1) : '—'
const dollars = n => Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : 'unknown'

/** Each type is a complete card: no mandatory sideways scrolling in a narrow inspector. */
export default function HousingComparison({ comparison, draft, selectedTypes = [], onSelection, proposed, pending, expanded, onExpand, area, onUse, onAssumptions, reform = 'current', onReform, zoningCode = null, costControl = null, weights = null, onWeights = null }) {
  const state = proposed ? 'proposal' : 'baseline'
  const entries = comparison?.entries || []
  const factors = (comparison?.factors || []).filter(f => PREFERENCE_FACTOR_IDS.includes(f.id))
  const included = factors.filter(f => f.included)
  const call = !pending && comparison && weights ? closeCall({ baseline: Object.fromEntries(entries.map(e => [e.id, e.baseline])), proposal: Object.fromEntries(entries.map(e => [e.id, e.proposal])) }, weights, state) : null
  function toggle(id) { onSelection(selectedTypes.includes(id) ? selectedTypes.filter(type => type !== id) : [...selectedTypes, id]) }
  return <section data-tour="comparison" className="studio-rankings housing-comparison" aria-label="Housing type comparison" aria-busy={pending}>
    <div className="section-heading"><h3>{area ? 'Your plan + next building' : 'Compare housing types'}</h3>{!expanded && <button onClick={onExpand}>Widen comparison</button>}</div>
    <p className="compact-help">Current draft: <strong>{housingSpec(draft).label}</strong>. {area ? 'Scores include your placed plan, averaged per proposed home.' : 'Same parcel and priorities; each type keeps its stated costs.'}</p>
    <fieldset className="comparison-picker"><legend>Compare to</legend>
      <div>{BUILDING_IDS.filter(id => id !== draft.typeId).map(id => <label key={id}><input type="checkbox" checked={selectedTypes.includes(id)} onChange={() => toggle(id)}/>{BUILDINGS[id].label}</label>)}</div>
      <button onClick={() => onSelection(BUILDING_IDS.filter(id => id !== draft.typeId))}>All types</button>
      <button onClick={() => onSelection([])}>Clear comparisons</button>
    </fieldset>
    {!comparison ? <p role="status">Calculating the current comparison…</p> : <>
      {pending && <p role="status" className="compact-help">Updating scores…</p>}
      <p className="coverage-pill">{included.length}/{PREFERENCE_FACTOR_IDS.length} preference factors · {proposed ? 'Proposed' : 'Existing'} infrastructure <button onClick={onAssumptions}>Advanced</button></p>
      {costControl}
      {weights && onWeights && <StancePills weights={weights} onChange={onWeights}/>}
      <CloseCall call={call}/>
      <PolicyReformSimulator presetId={reform} onPreset={onReform} options={entries.map(entry => entry[state])} code={zoningCode} focusTypeId={draft.typeId}/>
      {entries.length === 1 && <p className="compact-help">Select another type above to compare.</p>}
      {!included.length && <p className="planner-warning" role="status">No ranking: all priorities are off or shared evidence is missing.</p>}
      <div className="housing-comparison-cards" aria-label="Housing scores and checks">
        {entries.map(entry => {
          const option = entry[state], simulation = reform === 'current' ? null : simulateReform(option, reform, zoningCode)
          const score = comparisonScore(option, simulation), badge = zoningBadge(option)
          const trade = templateTradeoffs(entry, entries, factors, state), checks = proposalChecks(option)
          const diagnostic = score.kind === 'underlying'
          return <article key={entry.id} className="housing-score-card" style={{ '--type-color': simulatedColor(entry.id) }}>
            <header><h4>{option.label}</h4><small>{entry.id === draft.typeId ? 'Current draft · your dimensions' : 'Standard template'}</small></header>
            <div className={`housing-score-head score-${score.kind}`}><strong>{pending ? 'Updating…' : diagnostic || score.value === null ? 'Not ranked' : `${number(score.value)} / 100`}</strong>
              <span>{diagnostic ? `Not eligible: ${option.gate}` : score.kind === 'reform' ? `Simulated by-right · ${REFORM_STATUS_TEXT[presetById(reform).status].toLowerCase()}` : 'Preference under your priorities'}</span>
              <span className={`zoning-badge ${badge.tone}`}>{badge.text}</span>
              <small className="zoning-review-status">{zoningReviewLabel(option)}</small>
            </div>
            <ul className="proposal-checks" aria-label="Separate feasibility checks">{checks.map(check => <li key={check.id} className={check.status}><strong>{check.label}</strong><span>{check.status === 'pass' ? 'Pass' : check.status === 'fail' ? 'Does not pass' : 'Not assessed'}</span><small>{check.detail}</small>{check.range && !(check.members?.length > 1) && <small>Sensitivity range: {Math.round(check.range.low)}–{Math.round(check.range.high)} assumed daily places{check.demandRange ? ` against ${Math.round(check.demandRange.low)}–${Math.round(check.demandRange.high)} boardings` : ''}. {check.sensitivity === 'depends-on-assumptions' ? 'Result depends on these assumptions.' : ''}</small>}</li>)}</ul>
            <p className="housing-card-dimensions">{option.units} homes · {entry.option.width} × {entry.option.depth} m · {entry.option.height} m high · {option.floors} stories{area ? ` · ${option.area?.units} homes in plan` : ''}</p>
            <p className="housing-card-dimensions">Assumed monthly cost: {dollars(option.rent)} rent + {dollars(option.utilities)} utilities{Number.isFinite(option.burden) ? ` · ${(option.burden * 100).toFixed(1)}% of target income` : ' · income or costs not assessed'}.</p>
            {[...(option.costValidation?.issues || []), ...(option.costValidation?.warnings || [])].map(issue => <p className="planner-warning" key={issue.field}>{issue.message}</p>)}
            <dl className="housing-card-factors">{factors.map(f => <div key={f.id} className={f.included ? '' : 'excluded'}><dt>{FACTOR_LABELS[f.id]}<small>{f.included ? `${(f.effectiveWeight * 100).toFixed(1)}% of score` : 'Excluded'}</small></dt><dd>{number(option.scores[f.id])}</dd></div>)}</dl>
            {trade.reference && <div className="card-tradeoffs"><small>Compared with {trade.reference}</small>{trade.pros.map(f => <p key={f.id} className="pro">+ {f.label}: +{f.points.toFixed(1)} pts</p>)}{trade.cons.map(f => <p key={f.id} className="con">− {f.label}: {f.points.toFixed(1)} pts</p>)}{!trade.pros.length && !trade.cons.length && <p>Weighted differences round to zero.</p>}</div>}
            <details className="housing-card-evidence"><summary>Evidence, assumptions & checks</summary>
              {diagnostic && Number.isFinite(score.value) && <p><strong>Diagnostic preference: {number(score.value)}</strong>. This is the weighted calculation before feasibility and zoning checks; it is not an eligible score or recommendation.</p>}
              {factors.map(f => { const receipt = factorReceipt(f.id, option); return <div key={f.id}><strong>{FACTOR_LABELS[f.id]}</strong> <EvidenceBadge receipt={receipt}/><FactorReceipt receipt={receipt}/></div> })}
              {option.rentRange && <p>Rent sensitivity: {dollars(option.rentRange.low)}–{dollars(option.rentRange.high)} per month. This is an assumed range, not a confidence interval.</p>}
              <p>{option.massing?.reason}</p><p>{option.permission?.label}</p>
              <TitleNineChecks result={option.titleNine} compact/>
              {option.area?.invalid.map(b => <p key={b.id}>{b.pin}: {b.gate}</p>)}
              <p>Infrastructure effect: {entry.baseline.eligible && entry.proposal.eligible && Number.isFinite(entry.delta) ? `${entry.delta >= 0 ? '+' : ''}${number(entry.delta)} points` : 'not ranked in both states'}.</p>
            </details>
            <button className="housing-card-use" disabled={pending || entry.id === draft.typeId} onClick={() => onUse(entry.option)}>{entry.id === draft.typeId ? 'Current draft' : 'Use this type'}</button>
          </article>
        })}
      </div>
      <p className="compact-help">Higher factor values are preferred. Physical fit and transit capacity are separate checks, not weighted points. <button className="comparison-assumptions" onClick={onAssumptions}>Why these scores?</button></p>
      <Glossary label="What do these terms mean?"/>
    </>}
  </section>
}
