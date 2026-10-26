const finite = value => typeof value === 'number' && Number.isFinite(value)

/** Confirmation records the exact assumptions, not an income verification or forecast. */
export function housingCostInputs(state, option) {
  const { targetIncome } = state
  return finite(targetIncome) && targetIncome > 0 && finite(option?.rent) && option.rent >= 0 && finite(option?.utilities) && option.utilities >= 0
    ? { targetIncome, rent: option.rent, utilities: option.utilities } : null
}

export function housingCostConfirmed(state, option) {
  const inputs = housingCostInputs(state, option), saved = state.affordabilityConfirmation
  return !!inputs && !!saved && Object.keys(inputs).every(key => inputs[key] === saved[key])
}

export function housingCostBurden(state, option) {
  const inputs = housingCostInputs(state, option)
  if (!inputs) return { monthly: null, burden: null, confirmed: false, score: null }
  const monthly = inputs.rent + inputs.utilities, burden = monthly * 12 / inputs.targetIncome
  const confirmed = housingCostConfirmed(state, option)
  return { monthly, burden, confirmed, score: confirmed ? Math.max(0, Math.min(100, 100 * (.5 - burden) / .3)) : null }
}
