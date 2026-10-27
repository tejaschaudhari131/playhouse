import { REFORM_PRESETS, REFORM_STATUS_TEXT, presetById, reformSummary, simulateReform } from '../lib/policyReform.js'

/** Named Title Nine reform scenarios. A what-if over the screened checks: never current law, never a ranking. */
export default function PolicyReformSimulator({ presetId = 'current', onPreset, options = [], code, focusTypeId = null, compact = false }) {
  const preset = presetById(presetId)
  const summary = reformSummary(options, preset.id, code)
  const focus = focusTypeId ? options.find(o => o.typeId === focusTypeId) : null
  const draft = focus ? simulateReform(focus, preset.id, code) : null
  return <section className={`reform-simulator${compact ? ' compact' : ''}`} aria-label="Pittsburgh Policy Reform Simulator">
    <div className="reform-head"><strong>Pittsburgh Policy Reform Simulator</strong><span className={`reform-status ${preset.status}`}>{REFORM_STATUS_TEXT[preset.status]}</span></div>
    <div className="reform-presets" role="group" aria-label="Zoning scenario">
      {REFORM_PRESETS.map(p => <button key={p.id} type="button" aria-pressed={p.id === preset.id} className={p.id === preset.id ? 'active' : ''} onClick={() => onPreset?.(p.id)}>{p.label}</button>)}
    </div>
    <p className="compact-help">{preset.summary}{preset.url ? <> <a href={preset.url} target="_blank" rel="noreferrer">Bill text ↗</a></> : null}</p>
    {preset.id !== 'current' && <>
      {draft && <p className="reform-draft"><strong>Current draft:</strong> {draft.lifted.length ? `lifts ${draft.lifted.map(l => `${l.check.label} (§ ${l.rule.section})`).join(', ')}` : 'no conflict this scenario lifts'}{draft.remaining.length ? `; still conflicts: ${draft.remaining.map(c => `${c.label} (§ ${c.section})`).join(', ')}` : ''}{draft.placedReview ? `; ${draft.placedReview} placed building(s) still need review` : ''}. {draft.eligible ? (draft.newlyEligible ? 'Would pass every assessed check by right.' : 'Already passes every assessed check.') : 'Would still need a variance or approval.'}</p>}
      {summary.rules.length ? <ul className="reform-rules">{summary.rules.map(r => <li key={r.id}><a href={r.url} target="_blank" rel="noreferrer">§ {r.section}</a> {r.text}{r.condition ? ` (${r.condition})` : ''}: clears {r.checks.join(', ')} for {r.types.join(', ')}.</li>)}</ul>
        : <p className="compact-help">No screened conflict on this parcel is lifted by this scenario.</p>}
      {summary.adu && <p className="compact-help">§ {summary.adu.section}: {summary.adu.text}{summary.adu.withSingleUnit ? ' alongside a single-unit home here.' : '; needs a permitted single-unit home first.'}</p>}
      <p className="reform-count"><strong>{summary.addedTypes.length ? `+${summary.addedTypes.length} ${summary.addedTypes.length === 1 ? 'type' : 'types'} by right` : 'No additional types by right'}</strong>{summary.addedTypes.length ? ` (${summary.addedTypes.join(', ')})` : ''} · {summary.permittedBefore} → {summary.permittedAfter} of {options.length} scored types pass every assessed check · most homes by right {summary.maxHomesBefore} → {summary.maxHomesAfter}{summary.adu?.withSingleUnit ? ' (incl. 2 ADUs)' : ''}.</p>
    </>}
    {!compact && <small>Applies only to the screened Title Nine checks. Fit, other standards and unsupported checks still apply. Simulated scores are labelled and never ranked.</small>}
  </section>
}
