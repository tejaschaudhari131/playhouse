import { AFFORDABLE_BONUS, presetById, reformSummary } from './policyReform.js'
import { envelopeHeight } from './zoningEnvelope.js'
import { districtStandards } from './titleNineRules.js'
import { EGRESS_IDS, EGRESS_RULES, egressCheck, egressMassing } from './singleStair.js'
import { CITY_MILLAGE, parcelShift } from './lvtShift.js'

/**
 * Named policy scenarios for the Scenarios tab. Each says what it would enable, compares Current rules with the
 * reform on the selected parcel, and names how a result should be judged. Example parcels were chosen from the
 * processed County data so the reform changes something on them; they are illustrations, not development advice.
 */
export const POLICY_SCENARIOS = [
  {
    id: 'lvt', label: 'Land value tax shift', status: 'hypothetical', kind: 'tax',
    enables: 'The City levy taxes land at a higher rate than buildings, raising the same revenue. Building on or improving a lot costs less in tax each year; holding a vacant or underused lot costs more. Zoning does not change.',
    evaluate: ['Tax change: this parcel’s City bill and the City tax on a new building here', 'Net homes: no new homes are permitted; the test is whether vacant and parking lots become cheaper to build on than to hold', 'Affordability: a lower City tax per new home lowers the rent the building needs', 'Feasibility: the change in yearly holding cost of the land'],
    example: { pin: '0001D00040000000', label: '650 Penn Ave, a Downtown surface parking lot', settings: { lvt: { ratio: 4 }, typeId: 'large_apartment', view: '2d' } },
  },
  {
    id: 'single-stair', label: 'Single-stair buildings', status: 'hypothetical', kind: 'stair',
    enables: 'One exit stair for apartments up to 6 stories (≤ 4 homes per floor, sprinklered), as in Seattle, Texas and Montana. Pennsylvania’s code needs two stairs above 3 stories, and the corridor between them needs a lot about 12 m wide. A single-stair core fits on lots from about 7.5 m.',
    evaluate: ['Net homes: whether a 12-home apartment fits this lot under each stair rule', 'Affordability: break-even rent per home against HUD income limits', 'Tax change: yearly property tax of the new building against today’s', 'Feasibility: market value minus development cost'],
    example: { pin: '0173E00083000000', label: 'Montezuma St, Lincoln-Lemington-Belmar: a 10.4 m-wide RM-M lot', settings: { egress: 'single-stair', typeId: 'small_apartment', footprint: { width: 9, depth: 22 } } },
  },
  {
    id: 'missing-middle', label: 'Missing-middle lot reform', status: 'hypothetical', kind: 'zoning', preset: 'missing-middle',
    enables: '2–4 homes by right in R1D, R1A and R2, and an 1,800 sq ft minimum lot in -L subdistricts. Small lots in house-only districts could take a duplex, triplex or fourplex without a variance.',
    evaluate: ['Net homes: most homes by right before and after', 'Affordability: break-even rent per home against HUD income limits', 'Tax change: yearly property tax of the new building against today’s', 'Feasibility: market value minus development cost'],
    example: { pin: '0232F00080000000', label: 'Maplewood Ave, East Hills: a 2,400 sq ft R2-L lot', settings: { preset: 'missing-middle', typeId: 'triplex' } },
  },
  {
    id: 'bill-2025-1545', label: 'Bill 2025-1545 height bonus', status: 'pending', kind: 'zoning', preset: 'bill-2025-1545',
    enables: 'The pending Affordable Housing Bonus adds 2 performance points × 15 ft (30 ft, about 2 stories) for buildings of 4+ homes in RM and neighbourhood mixed-use districts when 10% of rental homes stay at or below 50% AMI for 20 years. The bill also allows ADUs and removes parking minimums.',
    evaluate: ['Net homes: most homes by right before and after', 'Affordability: the bonus requires 10% of homes at ≤ 50% AMI; break-even rent shows the gap for the rest', 'Tax change: yearly property tax of the new building against today’s', 'Feasibility: market value minus development cost'],
    example: { pin: '0084A00332000000', label: '215 S Euclid Ave, East Liberty: an LNC lot', settings: { preset: 'bill-2025-1545', typeId: 'small_apartment' } },
  },
]
export const scenarioById = id => POLICY_SCENARIOS.find(s => s.id === id) || POLICY_SCENARIOS[0]
export const SCENARIO_STATUS_TEXT = { pending: 'Pending · not law', hypothetical: 'Hypothetical · not Pittsburgh law' }

/** HUD income-limit bands, as percent of area median income. */
export const AMI_BANDS = [30, 50, 60, 80]
/** Housing costs at or below this share of income are affordable (HUD's cost-burden line). */
export const AFFORDABLE_SHARE = .3

/**
 * Lowest AMI band whose household can pay `monthly` (rent + utilities) at 30% of income, and the affordable monthly
 * cost at every band. `band` is null when the cost is above what an 80% AMI household can afford.
 */
export function amiReach(monthly, householdSize = 1, limits) {
  if (!Number.isFinite(monthly) || !limits?.incomeLimits) return null
  const index = Math.min(8, Math.max(1, Math.round(householdSize || 1))) - 1
  const bands = AMI_BANDS.map(band => ({ band, monthly: limits.incomeLimits[band][index] * AFFORDABLE_SHARE / 12 }))
  return { monthly, householdSize: index + 1, band: bands.find(b => b.monthly + 1e-9 >= monthly)?.band ?? null, bands }
}

/** Market value minus development cost, as a [low, high] range: positive throughout pencils, negative throughout is a gap. */
export function feasibilityClass(gap) {
  if (!Array.isArray(gap) || !gap.every(Number.isFinite)) return null
  const [low, high] = gap[0] <= gap[1] ? gap : [gap[1], gap[0]]
  if (low >= 0) return { id: 'pencils', label: 'Pencils at the assumed rent' }
  if (high < 0) return { id: 'gap', label: 'Funding gap at the assumed rent' }
  return { id: 'marginal', label: 'Marginal: depends on cost and value' }
}

/** Evaluation metrics for one building from a `redevelopmentImpact` result. */
export function buildingMetrics(impact, { utilities = 0, householdSize = 1, limits = null } = {}) {
  if (!impact) return null
  const breakEven = impact.value?.breakEvenRent ?? null
  return {
    label: impact.replacement.label, homes: impact.replacement.units, net: impact.replacement.netUnits,
    tax: impact.tax?.net ?? null, breakEven,
    reach: breakEven ? amiReach(Math.min(...breakEven) + utilities, householdSize, limits) : null,
    feasibility: feasibilityClass(impact.value?.gap),
  }
}

const homesOf = list => list.reduce((best, r) => !best || (r.units ?? 0) > best.units ? { typeId: r.typeId, label: r.label, units: r.units ?? 0 } : best, null)

/**
 * Zoning presets (missing-middle, Bill 2025-1545) on one parcel: the building with the most homes that passes every
 * assessed check before and after, the rules that change, and the height limit for 4+ homes.
 */
export function zoningOutcome(presetId, options = [], code = null) {
  const preset = presetById(presetId), summary = reformSummary(options, preset.id, code)
  const before = homesOf(summary.results.filter(r => r.before)), after = homesOf(summary.results.filter(r => r.eligible))
  const current = envelopeHeight(code, 'current', 'small_apartment'), reformed = envelopeHeight(code, preset.id, 'small_apartment')
  const stories = districtStandards(code)?.stories ?? null
  const height = current && reformed ? {
    beforeFt: current.heightFt, afterFt: reformed.heightFt, bonusFt: reformed.bonusFt,
    beforeStories: stories, afterStories: stories && reformed.bonusFt ? stories + AFFORDABLE_BONUS.points * AFFORDABLE_BONUS.storiesPerPoint : stories,
  } : null
  return {
    preset, before, after, homesBefore: summary.maxHomesBefore, homesAfter: summary.maxHomesAfter, adu: summary.adu,
    addedTypes: summary.addedTypes, rules: summary.rules, permittedBefore: summary.permittedBefore, permittedAfter: summary.permittedAfter, height,
  }
}

/** No Title Nine conflict besides the setback conflict Title Nine reports whenever the evaluated footprint misses the lot; the stair search re-fits it. */
const zoningClear = option => !!option && !option.area?.invalid?.length
  && !(option.titleNine?.checks || []).some(check => check.status === 'conflict' && !(check.id === 'setbacks' && option.massing?.fits === false))

/**
 * Single-stair reform on one parcel. `fitFor(candidate, ruleId)` returns the largest fitted footprint
 * ({ width, depth }) at or above that rule's core minimum, or null. Only the 12-home small apartment changes:
 * houses and duplexes need one exit, triplexes stay at 3 stories, and the 8-story large apartment needs two stairs either way.
 */
export function stairOutcome(options = {}, fitFor, defaults = { typeId: 'small_apartment', units: 12, floors: 4, width: 14, depth: 20 }) {
  const list = Object.values(options || {})
  const apartment = options?.small_apartment || null
  const base = { ...defaults, ...(apartment ? { units: apartment.units, floors: apartment.floors } : {}) }
  const allowed = zoningClear(apartment)
  const rows = EGRESS_IDS.map(rule => {
    const candidate = { ...base, ...egressMassing('small_apartment', rule, { width: base.width, depth: base.depth }) }
    const fit = fitFor ? fitFor(candidate, rule) : null
    const check = egressCheck(fit ? { ...candidate, ...fit } : candidate, rule)
    return { rule, label: EGRESS_RULES[rule].label, maxStories: EGRESS_RULES[rule].maxSingleStairStories, stairs: check.stairs, minimum: check.minimum, fit, fits: !!fit && check.fits, efficiency: fit ? check.efficiency : null }
  })
  const others = list.filter(o => o.typeId !== 'small_apartment' && o.eligible)
  const best = row => homesOf([...others, ...(allowed && row.fits ? [{ typeId: 'small_apartment', label: apartment?.label || 'Small apartment (12 units)', units: base.units }] : [])])
  const before = best(rows[0]), after = best(rows[1])
  return { rows, allowed, before, after, homesBefore: before?.units ?? 0, homesAfter: after?.units ?? 0, enabled: !rows[0].fits && rows[1].fits }
}

/**
 * Land value tax shift on one parcel: its City bill, and the City tax once a new building is assessed at
 * `buildingValue` ([low, high], e.g. its cost before land) on today's assessed land value. Positive `change` means a higher bill.
 */
export function lvtOutcome(parcel, rates, buildingValue = null) {
  if (!rates) return null
  const own = parcelShift(parcel, rates)
  const land = own?.land ?? null
  const holding = land === null ? null : { current: land * CITY_MILLAGE / 1000, proposed: land * rates.landMills / 1000 }
  const built = land !== null && Array.isArray(buildingValue) ? buildingValue.map(value => {
    const building = Math.max(0, value)
    const current = (land + building) * rates.millage / 1000, proposed = (land * rates.landMills + building * rates.buildingMills) / 1000
    return { current, proposed, change: proposed - current }
  }) : null
  return { own, holding: holding && { ...holding, change: holding.proposed - holding.current }, built }
}
