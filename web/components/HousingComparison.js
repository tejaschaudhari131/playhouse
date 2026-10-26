import { BUILDINGS, BUILDING_IDS } from '../lib/buildings.js'
import TitleNineChecks from './TitleNine.js'
import { housingSpec } from '../lib/titleNine.js'
import { simulatedColor } from '../lib/buildingUses.js'
import { FACTOR_LABELS, templateTradeoffs, zoningBadge, comparisonScore } from '../lib/studioPresentation.js'

const number = n => Number.isFinite(n) ? n.toFixed(1) : '—'
export default function HousingComparison({ comparison, draft, selectedTypes = [], onSelection, proposed, pending, expanded, onExpand, onBack, area, onUse, onAssumptions, reform = false, onReform }) {
  const state = proposed ? 'proposal' : 'baseline'
  const entries = comparison?.entries || []
  const totals = entries.map(entry => entry[state]).filter(option => option.eligible && Number.isFinite(option.total)).map(option => option.total)
  const useBlocked = entries.filter(entry => zoningBadge(entry[state]).tone === 'reform' && entry[state].reformEligible).length
  function toggle(id) { onSelection(selectedTypes.includes(id) ? selectedTypes.filter(type => type !== id) : [...selectedTypes, id]) }
  return <section data-tour="comparison" className="studio-rankings housing-comparison" aria-label="Housing type comparison" aria-busy={pending}>
    <div className="section-heading"><h3>{area ? 'Your plan + next building' : 'Compare housing types'}</h3>{!expanded && <button onClick={onExpand}>Expand comparison</button>}</div>
    <p className="compact-help">Current draft: <strong>{housingSpec(draft).label}</strong>. {area ? 'Scores include your placed plan, averaged per proposed home.' : 'Same parcel, costs and priorities.'}</p>
    <fieldset className="comparison-picker"><legend>Compare to</legend>
      <div>{BUILDING_IDS.filter(id => id !== draft.typeId).map(id => <label key={id}><input type="checkbox" checked={selectedTypes.includes(id)} onChange={() => toggle(id)}/>{BUILDINGS[id].label}</label>)}</div>
      <button onClick={() => onSelection(BUILDING_IDS.filter(id => id !== draft.typeId))}>All types</button>
      <button onClick={() => onSelection([])}>Clear comparisons</button>
    </fieldset>
    {pending || !comparison ? <p role="status">Calculating the current comparison…</p> : <>
      <p className="coverage-pill">{comparison.included.length}/7 factors weighted · {proposed ? 'Proposed' : 'Existing'} infrastructure <button onClick={onAssumptions}>Advanced</button></p>
      <label className="reform-toggle"><input type="checkbox" role="switch" checked={reform} onChange={event => onReform?.(event.target.checked)}/><span><strong>Simulate zoning reform (by-right)</strong><small>Treats the proposed use as permitted where the §911.02 use row is the only zoning conflict{useBlocked ? ` (${useBlocked} of ${entries.length} types here)` : ''}. Fit, height, area and evidence checks still apply. A what-if, not current law; rankings are unchanged.</small></span></label>
      {totals.length > 1 && <p className="compact-help">Modeled scores span {number(Math.min(...totals))}–{number(Math.max(...totals))}. Small gaps are not proof of a better project: the model has no validated uncertainty margin.</p>}
      {entries.length === 1 && <p className="compact-help">Select another type above to compare side by side.</p>}
      {entries.some(entry => !entry[state].eligible) && <p className="compact-help">Types that are not eligible still show their underlying score (greyed) so you can see the tradeoff; that score is not a ranking. Eligibility applies to that proposal, not every possible building on this parcel. Check the reason below; <button onClick={onAssumptions}>adjust dimensions and assumptions</button> to test another fit.</p>}
      {!comparison.included.length && <p className="planner-warning" role="status">No ranking: all priorities are off or shared evidence is missing.</p>}
      <div className="housing-table-scroll" tabIndex={0} role="region" aria-label="Side-by-side housing scores">
        <table className="housing-comparison-table" style={{ minWidth: `${150 + entries.length * 175}px` }}>
          <caption>Factor scores: higher is preferred. Shared evidence and relative weights apply to every column.</caption>
          <thead><tr><th scope="col">Housing type</th>{entries.map(entry => <th scope="col" key={entry.id} style={{ borderTopColor: simulatedColor(entry.id) }}><strong>{entry[state].label}</strong><small>{entry.id === draft.typeId ? 'Current draft · your dimensions' : 'Standard template'}</small></th>)}</tr></thead>
          <tbody>
            <tr className="comparison-total"><th scope="row">Modeled preference<small>Under your priorities{reform ? ' · reform simulated' : ''}</small></th>{entries.map(entry => {
              const option = entry[state], score = comparisonScore(option, reform), badge = zoningBadge(option)
              return <td key={entry.id} className={`score-${score.kind}`}><strong>{score.value === null ? 'No score' : number(score.value)}</strong>
                <small className="score-kind">{score.kind === 'score' ? 'Eligible score' : score.kind === 'reform' ? 'Simulated by-right score · not current law' : `Underlying score · not eligible: ${option.gate}`}</small>
                <span className={`zoning-badge ${badge.tone}`}>{badge.text}</span>
                <small>{option.titleNine?.assessed.length ?? 0} zoning checks completed · {option.titleNine?.excluded.length ?? 0} not checked</small></td>
            })}</tr>
            <tr><th scope="row">Homes added</th>{entries.map(entry => <td key={entry.id}>{entry[state].units}{area && <small>{entry[state].area?.units} in whole plan</small>}</td>)}</tr>
            <tr><th scope="row">Dimensions</th>{entries.map(entry => <td key={entry.id}>{entry.option.width} × {entry.option.depth} m<small>{entry.option.height} m high · {entry[state].floors} stories</small></td>)}</tr>
            {comparison.factors.map(f => <tr key={f.id} className={f.included ? '' : 'excluded'}><th scope="row">{FACTOR_LABELS[f.id]}<small>{f.included ? `${(f.effectiveWeight * 100).toFixed(1)}% of score` : 'Excluded'} · {f.id === 'displacement' ? 'Neighborhood context' : f.kind}</small>{f.id === 'displacement' && <small>Not the proposal’s displacement impact</small>}{f.id === 'affordability' && !f.included && <button onClick={onAssumptions}>Review cost inputs</button>}</th>{entries.map(entry => <td key={entry.id}><span className={`comparison-factor${entry[state].eligible ? '' : ' ineligible'}`}><b>{number(entry[state].scores[f.id])}</b><span className="factor-track"><i style={{ width: `${entry[state].scores[f.id] ?? 0}%`, background: simulatedColor(entry.id) }}/></span></span></td>)}</tr>)}
            <tr><th scope="row">Physical fit & zoning</th>{entries.map(entry => <td key={entry.id}><details><summary>{entry[state].eligible ? 'Fits this simulation · approval not assessed' : entry[state].gate}</summary><p>{entry[state].massing.reason}</p><p>{entry[state].permission.label}</p><TitleNineChecks result={entry[state].titleNine} compact/>{entry[state].area?.invalid.map(b => <p key={b.id}>{b.pin}: {b.gate}</p>)}</details></td>)}</tr>
            <tr><th scope="row">Tradeoffs</th>{entries.map(entry => {
              const trade = templateTradeoffs(entry, entries, comparison.factors, state)
              return <td key={entry.id}>{!trade.reference ? <small>{entry[state].eligible ? 'Choose another eligible type to compare.' : 'No score: physical or zoning conflict, or missing physical evidence.'}</small> : <div className="card-tradeoffs"><small>vs {trade.reference}</small>{trade.pros.map(f => <p key={f.id} className="pro">+ {f.label}: +{f.points.toFixed(1)} pts</p>)}{trade.cons.map(f => <p key={f.id} className="con">− {f.label}: {f.points.toFixed(1)} pts</p>)}{!trade.pros.length && !trade.cons.length && <p>Weighted differences round to zero.</p>}</div>}</td>
            })}</tr>
            <tr><th scope="row">Infrastructure effect</th>{entries.map(entry => <td key={entry.id}>{entry.baseline.eligible && entry.proposal.eligible && Number.isFinite(entry.delta) ? `${entry.delta >= 0 ? '+' : ''}${number(entry.delta)} points` : 'No score'}</td>)}</tr>
            <tr><th scope="row">Next building</th>{entries.map(entry => <td key={entry.id}><button disabled={pending || entry.id === draft.typeId} onClick={() => onUse(entry.option)}>{entry.id === draft.typeId ? 'Current draft' : 'Use this type'}</button></td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="compact-help">Current draft keeps your custom size and placement. Other columns use standard templates. Unsupported zoning checks are excluded, not passed. <button className="comparison-assumptions" onClick={onAssumptions}>Why these scores?</button></p>
    </>}
  </section>
}
