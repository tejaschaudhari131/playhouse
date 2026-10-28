import { PLANNER_FACTORS, INITIAL_WEIGHTS } from './plannerState.js'
import { BUILDING_IDS } from './buildings.js'
import { samePriorityRatios } from './priorityWeights.js'
import { preferenceFactor, CLOSE_CALL_POINTS } from './scoringPolicy.js'
export { CLOSE_CALL_POINTS } from './scoringPolicy.js'

/** Team-authored value judgments, not surveyed stakeholder preferences. */
export const PRIORITY_STANCES = [
  { id: 'balanced', label: 'Balanced', description: 'Spreads weight across five preferences, with more on market fit and housing costs. Fit and capacity are separate checks. A starting point, not an agreed public priority.', weights: { ...INITIAL_WEIGHTS } },
  { id: 'anti-displacement', label: 'Anti-Displacement & Affordability', description: 'Puts most weight on lower housing-cost burden and lower existing neighborhood displacement vulnerability. It does not model tenant protections or displacement caused by the project.', weights: { demand: 5, physical: 0, affordability: 40, displacement: 40, capacity: 0, access: 10, carbon: 5 } },
  { id: 'transit', label: 'Transit-Oriented Density', description: 'Puts most weight on walk-and-wait access to scheduled transit and the carbon proxy that rewards it. More homes draw down the assumed transit reserve, shown as a separate check.', weights: { demand: 10, physical: 0, affordability: 15, displacement: 5, capacity: 0, access: 50, carbon: 20 } },
  { id: 'climate', label: 'Climate & Low-Carbon', description: 'Puts most weight on the relative carbon proxy per home, then access. Neither measures actual emissions or travel behavior.', weights: { demand: 5, physical: 0, affordability: 15, displacement: 10, capacity: 0, access: 25, carbon: 45 } },
  { id: 'market', label: 'Fast Market Infill', description: 'Puts most weight on the market proxy, then housing costs. Physical fit remains a separate eligibility check. Approval time is not scored: check the zoning route in Build. It does not estimate cost, financing or profit.', weights: { demand: 55, physical: 0, affordability: 20, displacement: 5, capacity: 0, access: 10, carbon: 10 } },
]

export const stanceFor = weights => PRIORITY_STANCES.find(s => samePriorityRatios(weights, s.weights)) || null

const numeric = n => typeof n === 'number' && Number.isFinite(n)

/** Same aggregation as the planner screen: factors with weight and evidence for every option in both states. */
export function rescore({ baseline, proposal }, weights) {
  const values = [...Object.values(baseline), ...Object.values(proposal)]
  const included = PLANNER_FACTORS.map(f => f.id).filter(id => preferenceFactor(id) && numeric(weights[id]) && weights[id] > 0 && values.every(o => numeric(o.scores?.[id])))
  const denominator = included.reduce((sum, id) => sum + weights[id], 0)
  const total = option => option.eligible && denominator > 0 ? included.reduce((sum, id) => sum + option.scores[id] * weights[id], 0) / denominator : null
  const totals = state => Object.fromEntries(Object.entries(state).map(([id, option]) => [id, total(option)]))
  return { included, baseline: totals(baseline), proposal: totals(proposal) }
}

const ranked = (totals, order) => Object.keys(totals).filter(id => numeric(totals[id])).sort((a, b) => totals[b] - totals[a] || order.indexOf(a) - order.indexOf(b))

/**
 * Close call when the leader and runner-up are within CLOSE_CALL_POINTS, or when another stance picks a different leader.
 * `states` are the planner's {baseline, proposal} options; `state` picks the infrastructure view.
 */
export function closeCall(states, weights, state = 'proposal', stances = PRIORITY_STANCES) {
  const order = [...BUILDING_IDS, ...Object.keys(states[state]).filter(id => !BUILDING_IDS.includes(id))]
  const current = rescore(states, weights)[state]
  const [first, second] = ranked(current, order)
  if (!first || !second) return null
  const label = id => states[state][id].label
  const margin = current[first] - current[second]
  const byStance = stances.map(stance => {
    const totals = rescore(states, stance.weights)[state], [leader, next] = ranked(totals, order)
    const stanceMargin = leader && next ? totals[leader] - totals[next] : null
    const noClearWinner = stanceMargin !== null && stanceMargin <= CLOSE_CALL_POINTS + 1e-9
    return { id: stance.id, label: stance.label, winner: noClearWinner ? null : leader ?? null, winnerLabel: noClearWinner ? 'No clear winner' : leader ? label(leader) : null, numericalLeader: leader ?? null, noClearWinner, margin: stanceMargin, active: samePriorityRatios(weights, stance.weights) }
  })
  const flips = byStance.filter(s => s.winner && s.winner !== first)
  const withinMargin = margin <= CLOSE_CALL_POINTS + 1e-9
  const close = withinMargin || flips.length > 0
  const text = !close ? `${label(first)} leads ${label(second)} by ${margin.toFixed(1)} pts and leads under every stance.`
    : `${withinMargin ? 'No clear winner. ' : ''}${label(first)} and ${label(second)} are ${margin.toFixed(1)} pts apart${withinMargin ? `, within the ${CLOSE_CALL_POINTS.toFixed(1)}-pt close-call band` : ''}.${flips.length ? ` ${flips.map(s => `${s.label} flips it to ${s.winnerLabel}`).join('; ')}.` : ' No stance selects a clear alternative.'}`
  return { winner: withinMargin ? null : first, winnerLabel: withinMargin ? null : label(first), numericalLeader: first, numericalLeaderLabel: label(first), runnerUp: second, runnerUpLabel: label(second), margin, withinMargin, close, flips, stances: byStance, badge: withinMargin ? 'No clear winner' : close ? 'Depends on priorities' : null, text }
}
