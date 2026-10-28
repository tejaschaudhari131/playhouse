const finite = value => typeof value === 'number' && Number.isFinite(value)

/** Input guardrails for this rent-burden screen, not HUD eligibility limits. */
export const HOUSING_COST_LIMITS = { rent: { min: 1, max: 10000 }, utilities: { min: 0, max: 5000 }, targetIncome: { min: 5000, max: 500000 } }
export function housingCostValidation(state, option) {
  const values = { targetIncome: state.targetIncome, rent: option?.rent, utilities: option?.utilities }
  const names = { rent: 'Monthly rent', utilities: 'Monthly utilities', targetIncome: 'Annual household income' }
  const issues = Object.entries(HOUSING_COST_LIMITS).flatMap(([field, range]) => !finite(values[field]) || values[field] < range.min || values[field] > range.max
    ? [{ field, message: `${names[field]} must be between $${range.min.toLocaleString()} and $${range.max.toLocaleString()} for this screen.`, severity: 'error' }] : [])
  const warnings = []
  if (!issues.length && option.rent < 500) warnings.push({ field: 'rent', message: 'Rent below $500 is unusually low for new construction. Confirm a subsidy or an explicit scenario assumption.', severity: 'warning' })
  if (!issues.length && state.targetIncome < 15000) warnings.push({ field: 'targetIncome', message: 'Very low annual income: confirm household size and the selected income band. This guardrail is not an eligibility determination.', severity: 'warning' })
  return { valid: issues.length === 0, issues, warnings }
}

/** Confirmation records the exact assumptions, not an income verification or forecast. */
export function housingCostInputs(state, option) {
  return housingCostValidation(state, option).valid ? { targetIncome: state.targetIncome, rent: option.rent, utilities: option.utilities } : null
}

export function housingCostConfirmed(state, option) {
  const inputs = housingCostInputs(state, option), saved = state.affordabilityConfirmation
  return !!inputs && (state.affordabilityAuto === true || !!saved && Object.keys(inputs).every(key => inputs[key] === saved[key]))
}

export function housingCostBurden(state, option) {
  const inputs = housingCostInputs(state, option)
  if (!inputs) return { monthly: null, burden: null, confirmed: false, score: null }
  const monthly = inputs.rent + inputs.utilities, burden = monthly * 12 / inputs.targetIncome
  const confirmed = housingCostConfirmed(state, option)
  return { monthly, burden, confirmed, score: confirmed ? Math.max(0, Math.min(100, 100 * (.5 - burden) / .3)) : null }
}

/** An assumed proposal must never inherit the source parcel's confidence rating. */
export function housingCostEvidence(state, option) {
  return {
    rent: { kind: ['fallback', 'legacy'].includes(option?.rentSource) ? 'fallback' : 'assumed', label: option?.rentSource === 'type-baseline' ? 'Illustrative new-construction rent' : option?.rentSource === 'fallback' ? 'Legacy fallback rent' : option?.rentSource === 'legacy' ? 'Saved legacy rent assumption' : 'Scenario rent', source: option?.rentSourceDetail || 'Entered scenario assumption; not a measured rent for this proposed building.' },
    utilities: { kind: 'assumed', label: 'Utility allowance assumption', source: 'Entered monthly utility assumption; not an observed bill.' },
    targetIncome: { kind: ['fallback', 'legacy'].includes(state.incomeSource) ? 'fallback' : 'assumed', label: state.incomeBand ? `${state.incomeBand}% AMI target` : 'Target household income', source: state.incomeBand ? 'Selected income-band scenario using HUD Pittsburgh-area limits and household size; not actual resident income.' : state.incomeSource === 'legacy' ? 'Saved legacy income; its original provenance was not recorded. Review a target income band.' : state.incomeSource === 'fallback' ? 'Legacy fallback household income; replace with a target income band.' : 'Entered target household income; not actual resident income.' },
  }
}
