import { PLANNER_FACTORS, INITIAL_WEIGHTS } from './plannerState.js'
import { BUILDING_IDS } from './buildings.js'
import { samePriorityRatios } from './priorityWeights.js'

/** Team-authored value judgments, not surveyed stakeholder preferences. */
export const PRIORITY_STANCES = [
  { id: 'balanced', label: 'Balanced', description: 'Spreads weight across the seven factors, with more on market fit and housing costs. A starting point, not an agreed public priority.', weights: { ...INITIAL_WEIGHTS } },
  { id: 'anti-displacement', label: 'Anti-Displacement & Affordability', description: 'Puts most weight on lower housing-cost burden and lower existing neighborhood displacement vulnerability. It does not model tenant protections or displacement caused by the project.', weights: { demand: 5, physical: 10, affordability: 35, displacement: 35, capacity: 5, access: 5, carbon: 5 } },
  { id: 'transit', label: 'Transit-Oriented Density', description: 'Puts most weight on walk-and-wait access to scheduled transit and the carbon proxy that rewards it. More homes draw down the assumed transit reserve, so capacity keeps a modest weight.', weights: { demand: 10, physical: 10, affordability: 10, displacement: 5, capacity: 10, access: 40, carbon: 15 } },
  { id: 'climate', label: 'Climate & Low-Carbon', description: 'Puts most weight on the relative carbon proxy per home, then access. Neither measures actual emissions or travel behavior.', weights: { demand: 5, physical: 10, affordability: 10, displacement: 5, capacity: 10, access: 20, carbon: 40 } },
  { id: 'market', label: 'Fast Market Infill', description: 'Puts most weight on the market proxy and physical fit. Approval time is not scored: check the zoning route in Build. It does not estimate cost, financing or profit.', weights: { demand: 40, physical: 30, affordability: 10, displacement: 5, capacity: 5, access: 5, carbon: 5 } },
]
export const CLOSE_CALL_POINTS = 3

export const stanceFor = weights => PRIORITY_STANCES.find(s => samePriorityRatios(weights, s.weights)) || null

const numeric = n => typeof n === 'number' && Number.isFinite(n)

/** Same aggregation as the planner screen: factors with weight and evidence for every option in both states. */
export function rescore({ baseline, proposal }, weights) {
  const values = [...Object.values(baseline), ...Object.values(proposal)]
  const included = PLANNER_FACTORS.map(f => f.id).filter(id => numeric(weights[id]) && weights[id] > 0 && values.every(o => numeric(o.scores?.[id])))
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
    return { id: stance.id, label: stance.label, winner: leader ?? null, winnerLabel: leader ? label(leader) : null, margin: leader && next ? totals[leader] - totals[next] : null, active: samePriorityRatios(weights, stance.weights) }
  })
  const flips = byStance.filter(s => s.winner && s.winner !== first)
  const withinMargin = margin <= CLOSE_CALL_POINTS + 1e-9
  const close = withinMargin || flips.length > 0
  const text = !close ? `${label(first)} leads ${label(second)} by ${margin.toFixed(1)} pts and leads under every stance.`
    : `${label(first)} leads ${label(second)} by ${margin.toFixed(1)} pts${withinMargin ? `, within the ${CLOSE_CALL_POINTS.toFixed(1)}-pt close-call band` : ''}.${flips.length ? ` ${flips.map(s => `${s.label} flips it to ${s.winnerLabel}`).join('; ')}.` : ' No stance changes the leader.'}`
  return { winner: first, winnerLabel: label(first), runnerUp: second, runnerUpLabel: label(second), margin, withinMargin, close, flips, stances: byStance, badge: close ? `Close call (±${margin.toFixed(1)} pts)` : null, text }
}
