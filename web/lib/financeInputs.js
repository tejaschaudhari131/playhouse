/** Editable screening assumptions, not bids, appraisals or financing commitments. */
export const FINANCE_VERSION = 'pro-forma-2.0'
export const FINANCE_DEFAULTS = {
  softShare: .12, developerFeeShare: .10, contingencyShare: .05, siteWorkShare: .10,
  interestRate: .075, financedShare: .65, constructionMonths: 18, averageDraw: .5,
  reservePerHome: 3000, vacancyShare: .055, operatingShare: .40, capRate: .0725,
}
export const FINANCE_LIMITS = {
  softShare: [0, .5], developerFeeShare: [0, .3], contingencyShare: [0, .3], siteWorkShare: [0, 1],
  interestRate: [0, .3], financedShare: [0, 1], constructionMonths: [1, 60], averageDraw: [0, 1],
  reservePerHome: [0, 100000], vacancyShare: [0, .5], operatingShare: [0, .9], capRate: [.01, .2],
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export function validFinanceInputs(input) {
  if (input === undefined) return true
  if (!object(input)) return false
  for (const [key, value] of Object.entries(input)) {
    if (key === 'constructionByType') {
      if (!object(value) || Object.entries(value).some(([id, rates]) => !['single_family','townhouse_duplex','triplex','small_apartment','large_apartment'].includes(id) || !Array.isArray(rates) || rates.length !== 2 || !rates.every(n => Number.isFinite(n) && n >= 50 && n <= 2000) || rates[0] > rates[1])) return false
    } else if (!FINANCE_LIMITS[key] || !Number.isFinite(value) || value < FINANCE_LIMITS[key][0] || value > FINANCE_LIMITS[key][1] || key === 'constructionMonths' && !Number.isInteger(value)) return false
  }
  return true
}
export function financeInputs(input = {}) {
  if (!validFinanceInputs(input)) throw new Error('Invalid pro forma assumptions')
  return { ...FINANCE_DEFAULTS, ...input }
}

/** National contractor examples; story bands are assumptions, not an IBC design classification. */
export function constructionRates(option) {
  if (option.typeId === 'single_family') return [225, 325]
  const floors = option.floors || 3
  return floors <= 2 ? [185, 230] : floors <= 3 ? [215, 285] : floors <= 5 ? [285, 385] : floors <= 7 ? [315, 425] : [340, 485]
}

export function operatingStatement(rent, units, assumptions = FINANCE_DEFAULTS) {
  const scheduledRent = Math.max(0, rent) * units * 12
  const vacancyLoss = scheduledRent * assumptions.vacancyShare
  const effectiveIncome = scheduledRent - vacancyLoss
  const expenses = effectiveIncome * assumptions.operatingShare
  const noi = effectiveIncome - expenses
  return { scheduledRent, vacancyLoss, effectiveIncome, expenses, noi, capitalized: noi / assumptions.capRate }
}

/** Explicit sources and uses. Interest uses an average construction-loan draw, not permanent debt. */
export function developmentBudget({ construction, demolition, acquisition, units, assumptions = FINANCE_DEFAULTS }) {
  const scale = (r, f) => r.map(v => v * f)
  const add = (...rs) => [0, 1].map(i => rs.reduce((n, r) => n + r[i], 0))
  const siteWork = scale(construction, assumptions.siteWorkShare)
  const hard = add(construction, demolition, siteWork)
  const contingency = scale(hard, assumptions.contingencyShare)
  const soft = scale(hard, assumptions.softShare)
  const developerFee = scale(add(hard, soft, contingency), assumptions.developerFeeShare)
  const reserves = [units * assumptions.reservePerHome, units * assumptions.reservePerHome]
  const beforeInterest = add(hard, contingency, soft, developerFee, reserves, acquisition)
  const interest = scale(beforeInterest, assumptions.financedShare * assumptions.averageDraw * assumptions.interestRate * assumptions.constructionMonths / 12)
  const development = add(beforeInterest, interest)
  const beforeLand = add(hard, contingency, soft, developerFee, reserves, interest)
  return { siteWork, hard, contingency, soft, developerFee, reserves, interest, development, beforeLand }
}
