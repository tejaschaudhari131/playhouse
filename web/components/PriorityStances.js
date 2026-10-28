import { CLOSE_CALL_POINTS } from '../lib/scoringPolicy.js'
import { PRIORITY_STANCES, stanceFor } from '../lib/priorityStances.js'

export function StancePills({ weights, onChange, disabled = false }) {
  const active = stanceFor(weights)
  return <div className="stance-pills" role="group" aria-label="Priority stance">
    {PRIORITY_STANCES.map(s => <button key={s.id} type="button" disabled={disabled} aria-pressed={active?.id === s.id} title={s.description} onClick={() => onChange({ ...s.weights })}>{s.label}</button>)}
    {!active && <span className="stance-custom">Custom weights</span>}
  </div>
}

/** Margin between the top two eligible types and whether another stance changes the leader. */
export function CloseCall({ call }) {
  if (!call) return null
  return <div className={`close-call${call.close ? ' is-close' : ''}`} role="status">
    <span className="close-call-badge">{call.close ? call.badge : `Modeled lead (+${call.margin.toFixed(1)} pts)`}</span>
    <p>{call.text}</p>
    <ul className="stance-winners">{call.stances.map(s => <li key={s.id} className={s.winner && s.winner !== (call.numericalLeader || call.winner) ? 'flips' : ''}>{s.label}{s.active ? ' (current)' : ''}: <strong>{s.margin !== null && s.margin <= CLOSE_CALL_POINTS ? 'no clear winner' : s.winnerLabel || 'no eligible type'}</strong>{s.margin !== null ? ` +${s.margin.toFixed(1)}` : ''}</li>)}</ul>
    <small>Stances are team-authored weightings, not measured preferences. Scores have no validated uncertainty margin.</small>
  </div>
}
