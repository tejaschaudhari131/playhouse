/**
 * Single-stair (single-exit) reform for small apartment buildings.
 *
 * Baseline: 2024 International Building Code Table 1006.3.4(1) allows one exit stair for R-2 apartments only up to
 * the third story, with at most 4 dwelling units per story and 125 ft of exit-access travel, fully sprinklered.
 * Pennsylvania's UCC adopts the IBC, so a 4-story apartment needs two stairs. The modelled reform follows the
 * 6-story laws adopted by Seattle (SBC §1006.3.4 item 7), Texas (SB 2835, 2025) and Montana (SB 213, 2025):
 * one stair up to 6 stories, ≤ 4 units per floor, ≤ 125 ft travel, NFPA 13 sprinklers. Not law in Pittsburgh.
 *
 * Core geometry is a team planning assumption, not a code-compliant design: a 48-inch two-flight stair with
 * landings and enclosure walls is about 2.8 × 5.8 m; a two-stair building adds a corridor joining the stairs,
 * which forces a double-loaded plan at least ~12 m wide. A single-stair point-access plan works from ~7.5 m.
 */
export const EGRESS_RULES = {
  'two-stair': {
    id: 'two-stair', label: 'Current code (2024 IBC)', short: 'Two stairs above 3 stories', maxSingleStairStories: 3, maxUnitsPerStory: 4, travelFt: 125,
    url: 'https://up.codes/s/single-exits', source: '2024 IBC Table 1006.3.4(1)',
  },
  'single-stair': {
    id: 'single-stair', label: 'Single-stair reform', short: 'One stair up to 6 stories', maxSingleStairStories: 6, maxUnitsPerStory: 4, travelFt: 125, sprinklers: 'NFPA 13',
    url: 'https://www.pew.org/en/research-and-analysis/articles/2025/11/04/states-advance-single-stairway-reforms-to-expand-housing', source: 'Seattle, Texas SB 2835, Montana SB 213',
  },
}
export const EGRESS_IDS = Object.keys(EGRESS_RULES)
export const egressRule = id => EGRESS_RULES[id] || EGRESS_RULES['two-stair']

export const STAIR_M = { width: 2.8, length: 5.8 }
export const CORRIDOR_M = 1.5
/** Minimum footprint (metres) a stair core layout needs. */
export const CORE_MINIMUMS = { 1: { width: 7.5, depth: 14 }, 2: { width: 12, depth: 18 } }
/** Default footprint of the 12-home, 4-story small apartment under each rule. */
export const APARTMENT_FOOTPRINT = { 'two-stair': { width: 14, depth: 20 }, 'single-stair': { width: 11, depth: 18 } }

const APARTMENT_TYPES = new Set(['triplex', 'small_apartment', 'large_apartment'])
const FT = 0.3048

/** R-2 (three or more homes) buildings need a stair count; houses and duplexes are R-3 with one exit. */
export const isApartment = typeId => APARTMENT_TYPES.has(typeId)

/** Exit stairs a building needs under a rule: 1 or 2. Inputs are stories, homes and the footprint in metres. */
export function stairsRequired({ typeId, floors, units, width = null, depth = null }, ruleId = 'two-stair') {
  if (!isApartment(typeId)) return 1
  const rule = egressRule(ruleId), stories = Math.max(1, Math.round(floors || 1))
  const perStory = Math.ceil((units || 0) / stories)
  // Farthest point to a central stair: half the plate diagonal, a generous stand-in for walking distance.
  const travel = width && depth ? Math.hypot(width, depth) / 2 / FT : 0
  return stories <= rule.maxSingleStairStories && perStory <= rule.maxUnitsPerStory && travel <= rule.travelFt ? 1 : 2
}

/** Floor plate, stair core and net share for a footprint with the given number of stairs. */
export function coreArea({ width, depth }, stairs) {
  const plate = width * depth, stair = STAIR_M.width * STAIR_M.length
  const core = stairs === 1 ? stair + 4 : 2 * stair + CORRIDOR_M * Math.max(0, depth - 2 * STAIR_M.length)
  return { plate, core, net: Math.max(0, plate - core), efficiency: plate > 0 ? Math.max(0, plate - core) / plate : 0 }
}

/**
 * Egress screen for one building option: stairs needed, the core's minimum footprint and whether this footprint
 * meets it. A planning check shown beside the score, never a veto or a building-code determination.
 */
export function egressCheck(option, ruleId = 'two-stair') {
  if (!option || !isApartment(option.typeId)) return null
  const rule = egressRule(ruleId), stairs = stairsRequired(option, ruleId), min = CORE_MINIMUMS[stairs]
  const narrow = Math.min(option.width, option.depth), long = Math.max(option.width, option.depth)
  const fits = narrow + 1e-9 >= min.width && long + 1e-9 >= min.depth
  const area = coreArea({ width: narrow, depth: long }, stairs)
  const perStory = Math.ceil((option.units || 0) / Math.max(1, Math.round(option.floors || 1)))
  const text = `${stairs === 1 ? 'One stair' : 'Two stairs'} under ${rule.label.toLowerCase()} (${option.floors} stories, ${perStory} homes per floor). `
    + (fits ? `The ${narrow} m-wide footprint fits a ${stairs === 1 ? 'single-stair point-access' : 'two-stair corridor'} core; about ${Math.round(area.efficiency * 100)}% of each floor is homes.`
      : `A ${stairs === 1 ? 'single-stair' : 'two-stair corridor'} core needs about ${min.width} × ${min.depth} m; this footprint is ${narrow} × ${long} m.`)
  return { rule: rule.id, stairs, minimum: min, fits, perStory, ...area, status: fits ? 'pass' : 'conflict', text }
}

/** Smallest footprint the lot-fit search may use: the type minimum, raised to the stair core's minimum for apartments. */
export function egressMinimum(option, typeMinimum, ruleId = 'two-stair') {
  if (!isApartment(option?.typeId) || option.typeId === 'triplex') return typeMinimum
  const core = CORE_MINIMUMS[stairsRequired({ ...option, width: null, depth: null }, ruleId)]
  return { width: Math.max(typeMinimum.width, core.width), depth: Math.max(typeMinimum.depth, core.depth) }
}

/** Default massing for a type under a rule; only the small apartment changes footprint. */
export function egressMassing(typeId, ruleId, defaults) {
  return typeId === 'small_apartment' ? { ...APARTMENT_FOOTPRINT[egressRule(ruleId).id] } : defaults
}

/**
 * Before/after for a lot: does a 12-home small apartment fit at the default footprint under each rule? `fit` is a
 * function (option) → boolean, e.g. a lot-fit search. Returns per-rule footprint, stairs and fit.
 */
export function stairComparison(option, fit) {
  return EGRESS_IDS.map(id => {
    const footprint = egressMassing(option.typeId, id, { width: option.width, depth: option.depth })
    const candidate = { ...option, ...footprint }
    const check = egressCheck(candidate, id)
    return { rule: id, label: EGRESS_RULES[id].label, ...footprint, stairs: check?.stairs ?? 1, fits: !!fit(candidate, id), check }
  })
}
