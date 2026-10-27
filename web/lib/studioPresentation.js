export { studioSites } from './studioSiteDiscovery.js'
import { signed } from './redevelopmentImpact.js'
export const FACTOR_LABELS = { demand: 'Market fit', physical: 'Physical fit', affordability: 'Housing-cost burden', displacement: 'Lower neighborhood displacement risk', capacity: 'Assumed transit capacity', access: 'Access', carbon: 'Carbon estimate' }
/** Exact relative contributions against the best other eligible template, no invented outcomes. */
export function templateTradeoffs(entry, entries, factors, state) {
 const candidate=entry[state]
 const reference=entries.filter(e=>e.id!==entry.id && e[state].eligible && Number.isFinite(e[state].total)).sort((a,b)=>b[state].total-a[state].total)[0]
 if(!reference || !candidate.eligible) return {reference:null,pros:[],cons:[]}
 const changes=factors.filter(f=>f.included).map(f=>({id:f.id,label:FACTOR_LABELS[f.id],points:(candidate.scores[f.id]-reference[state].scores[f.id])*f.effectiveWeight}))
 return {reference:reference[state].label,pros:changes.filter(f=>f.points>=.05).sort((a,b)=>b.points-a.points).slice(0,2),cons:changes.filter(f=>f.points<=-.05).sort((a,b)=>a.points-b.points).slice(0,2)}
}

/** Zoning status shown beside every compared score. Proposed use is read against mapped zoning only. */
export function zoningBadge(option) {
  const conflicts = (option?.titleNine?.checks || []).filter(c => c.status === 'conflict')
  const others = conflicts.filter(c => c.id !== 'use')
  if (conflicts.length > others.length) return { tone: 'reform', text: `Requires zoning variance / reform: Proposed use${others.length ? ` + ${others.length} other ${others.length === 1 ? 'conflict' : 'conflicts'}` : ''}` }
  if (others.length) return { tone: 'conflict', text: `Zoning conflict: ${others[0].label}${others.length > 1 ? ` + ${others.length - 1} more` : ''}` }
  const category = option?.permission?.category
  if (category === 'permitted') return { tone: 'permitted', text: 'Permitted' }
  if (category === 'special') return { tone: 'special', text: 'Needs special approval (not a variance)' }
  if (category === 'partial') return { tone: 'special', text: 'Permitted for some unit counts' }
  return { tone: 'unknown', text: 'Proposed use not reviewed' }
}

/**
 * Headline number for a compared type. A simulated by-right score is labelled as such and never ranks.
 * `reform` is a `simulateReform` result, or `true` for the use-row-only simulation.
 */
export function comparisonScore(option, reform = null) {
  if (option?.eligible && Number.isFinite(option.total)) return { value: option.total, kind: 'score' }
  const simulated = reform === true ? option?.reformEligible : !!reform?.eligible
  if (simulated && Number.isFinite(option?.suitability)) return { value: option.suitability, kind: 'reform' }
  return { value: Number.isFinite(option?.suitability) ? option.suitability : null, kind: 'underlying' }
}

const scoreText = value => Number.isFinite(value) ? value.toFixed(1) : '—'

/** Compact plan totals shown above every inspector tab. Scores compare the same plan under current and changed infrastructure. */
export function planImpact({ buildings = 0, demolitions = 0, net, placedPlan = null, pending = false }) {
  if (!buildings && !demolitions) return { empty: true, text: 'No buildings added or removed yet.' }
  const homes = net?.proposed ?? 0
  const netValue = `${net?.uncertain ? 'up to ' : ''}${signed(net?.net ?? 0)}`
  const score = pending ? { text: 'Updating…', detail: null }
    : !placedPlan ? { text: '—', detail: buildings ? 'Score appears after evaluation.' : 'Add a building to score the plan.' }
      : { text: Number.isFinite(placedPlan.baseline.total) || Number.isFinite(placedPlan.proposal.total) ? `${scoreText(placedPlan.baseline.total)} → ${scoreText(placedPlan.proposal.total)}` : 'Not ranked',
        detail: Number.isFinite(placedPlan.baseline.total) && Number.isFinite(placedPlan.proposal.total) ? 'Current → changed infrastructure' : 'Not ranked: a planned building needs zoning or physical review.' }
  return { empty: false, homes, net: netValue, netDetail: `${homes} proposed − ${net?.replaced ?? 0}${net?.uncertain ? '+' : ''} replaced (estimate)`, score }
}
