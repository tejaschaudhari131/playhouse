import { FINANCE_VERSION } from './financeInputs.js'
import { BUILDINGS, BUILDING_IDS } from './buildings.js'
import { normalizeDemolition, buildingRefKey } from './redevelopment.js'
import { housingCostInputs } from './housingCosts.js'
import { prototypeRentOption } from './rentAssumptions.js'

export const MODEL_VERSION = 'planner-screen-3.0'
export const EXAMPLES = [
  { id: 'hazelwood', label: 'Hazelwood', pin: '0056F00338000000', caption: 'City inventory · Hazelwood Ave' },
  { id: 'lawrenceville', label: 'Lawrenceville', pin: '0049N00010000000', caption: 'City inventory · 3480 Butler St' },
]
export const MASSING_DEFAULTS = {
  single_family: { width: 8, depth: 12 },
  townhouse_duplex: { width: 9, depth: 14 },
  triplex: { width: 10, depth: 16 },
  small_apartment: { width: 14, depth: 20 },
  large_apartment: { width: 22, depth: 30 },
}
export const PLANNER_FACTORS = [
  { id: 'demand', label: 'Market fit', short: 'Market fit', source: 'Assessment sales + team lot-fit model', kind: 'Proxy' },
  { id: 'physical', label: 'Physical feasibility', short: 'Fit', source: 'County parcel outline + proposed dimensions', kind: 'Schematic' },
  { id: 'affordability', label: 'Affordability', short: 'Affordability', source: 'Proposed rent/utilities + target household income', kind: 'Assumption' },
  { id: 'displacement', label: 'Displacement risk', short: 'Displacement', source: 'ACS 2020–2024 + HUD CHAS 2018–2022', kind: 'Screen' },
  { id: 'capacity', label: 'Infrastructure capacity', short: 'Capacity', source: 'One selected PRT stop × assumed spare places + added service', kind: 'Conditional' },
  { id: 'access', label: 'Access to opportunity', short: 'Access', source: 'OSM walking graph / mapped parks + PRT stop departures', kind: 'Proxy' },
  { id: 'carbon', label: 'Marginal carbon emissions', short: 'Carbon', source: 'Existing RECS / embodied-tier / transit proxy', kind: 'Proxy' },
]
export const INITIAL_WEIGHTS = { demand: 25, physical: 0, affordability: 25, displacement: 15, capacity: 0, access: 20, carbon: 15 }

export function optionFor(typeId, rent) {
  return { typeId, ...MASSING_DEFAULTS[typeId], height: BUILDINGS[typeId].heightM, floors: BUILDINGS[typeId].floors, residentialForm: 'duplex', rent, utilities: 150, placement: null }
}
export function initialScenario(pin, props = {}, stopId = '') {
  // ACS gross rent includes utilities; subtract the explicit utility assumption once.
  const rent = Math.max(0, Math.round((props.median_gross_rent || 1200) - 150))
  return {
    pin, stopId, options: { A: optionFor('townhouse_duplex', rent), B: optionFor('triplex', rent) },
    // Scenario inputs, not statements about actual capacity or proposed rents.
    targetIncome: Math.round(props.median_income || 40000), householdSize: 1, affordabilityConfirmation: null,
    additionalDepartures: 0, serviceHours: 18, availablePlacesPerDeparture: 10,
    spareBoardings: null, boardingsPerHome: 4,
    connections: [], routes: [], parks: [], parkAccessShare: 0, buildings: [], demolitions: [],
    zoningInputsByPin: {}, projectInputs: {},
    weights: { ...INITIAL_WEIGHTS },
  }
}

/** Every type other than the draft, so each typology card has a score on first load. */
export const defaultComparisonTypes = typeId => BUILDING_IDS.filter(id => id !== typeId)

/** Studio edits one draft. Legacy A/B scenarios remain evaluable for older exports. */
export function initialStudioScenario(pin, props = {}, stopId = '') {
  const { options, ...scenario } = initialScenario(pin, props, stopId)
  // Live mode: housing costs count as scenario assumptions and follow every rent, utility or income edit.
  const studio = { ...scenario, targetIncome: 46380, incomeSource: 'hud', incomeBand: 60, rentMode: 'prototype', capacityMode: 'schedule', baselinePlacesPerDeparture: 1, draft: { ...options.A, ...prototypeRentOption(options.A.typeId) }, comparisonTypes: defaultComparisonTypes(options.A.typeId), affordabilityAuto: true }
  return { ...studio, affordabilityConfirmation: housingCostInputs(studio, studio.draft) }
}

export function historyFor(scenario) { return { past: [], present: scenario, future: [] } }
export function scenarioReducer(state, action) {
  // Temporary walkthroughs restore the exact pre-tour state, including undo/redo.
  if (action.type === 'restoreHistory') return action.history
  if (action.type === 'undo') {
    if (!state.past.length) return state
    return { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future] }
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) }
  }
  let next = state.present
  if (action.type === 'demolishBuilding' || action.type === 'demolishBuildings' || action.type === 'restoreBuilding') {
    const demolish = action.type !== 'restoreBuilding'
    const requested = action.type === 'demolishBuildings' ? (Array.isArray(action.buildings) ? action.buildings : []) : [action.building || action]
    const refs = requested.map(normalizeDemolition)
    if (!refs.length || refs.some(ref => !ref)) return state
    const demolitions = next.demolitions || []
    const key = entry => { const normalized = normalizeDemolition(entry); return normalized && buildingRefKey(normalized) }
    const existing = new Set(demolitions.map(key).filter(Boolean))
    const changed = refs.filter((ref, index) => existing.has(buildingRefKey(ref)) !== demolish && refs.findIndex(other => buildingRefKey(other) === buildingRefKey(ref)) === index)
    if (!changed.length || demolish && demolitions.length + changed.length > 100) return state
    // Existing-area inputs described the previous retained structures. Undo keeps
    // their exact values; a changed footprint set requires fresh retained totals.
    const zoningInputsByPin = { ...next.zoningInputsByPin }
    for (const pin of new Set(changed.flatMap(ref => [ref.pin, ref.site].filter(Boolean)))) {
      const inputs = { ...(zoningInputsByPin[pin] || {}) }
      delete inputs.existingGfaSqft
      delete inputs.existingFootprintSqft
      zoningInputsByPin[pin] = inputs
    }
    const removed = new Set(changed.map(buildingRefKey))
    next = { ...next,
      demolitions: demolish ? [...demolitions, ...changed] : demolitions.filter(entry => !removed.has(key(entry))),
      zoningInputsByPin,
      ...(demolish && action.resetDraft && next.draft ? { draft: { ...next.draft, placement: null } } : {}),
    }
  }
  if (action.type === 'addBuilding' && (next.buildings || []).length < 40 && !(next.buildings || []).some(b => b.id === action.building.id)) next = { ...next, buildings: [...(next.buildings || []), action.building], ...(action.slot ? { options: { ...next.options, [action.slot]: { ...next.options[action.slot], placement: null } } } : {}) }
  if (action.type === 'addBuilding' && next.draft && next !== state.present) next = { ...next, draft: { ...next.draft, placement: null } }
  if (action.type === 'draft') {
    const changedType = action.value.typeId && action.value.typeId !== next.draft.typeId
    const comparisonTypes = changedType && next.comparisonTypes.includes(action.value.typeId)
      ? [...next.comparisonTypes.filter(id => id !== action.value.typeId), next.draft.typeId]
      : next.comparisonTypes
    const manualRent = !changedType && Object.hasOwn(action.value, 'rent')
    const rentUpdate = changedType && next.rentMode === 'prototype' ? prototypeRentOption(action.value.typeId) : manualRent ? { rentSource: 'custom', rentSourceDetail: 'User-entered rent, shared across compared housing types.', rentRange: null } : {}
    next = { ...next, ...(manualRent ? { rentMode: 'custom' } : {}), draft: { ...next.draft, ...action.value, ...rentUpdate }, comparisonTypes }
  }
  if (action.type === 'removeBuilding') next = { ...next, buildings: (next.buildings || []).filter(b => b.id !== action.id) }
  if (action.type === 'reset') next = action.scenario
  if (action.type === 'patch') next = { ...next, ...action.value }
  if (action.type === 'set') next = { ...next, ...(action.key === 'targetIncome' ? { incomeSource: 'custom', incomeBand: null } : {}), [action.key]: action.value }
  if (action.type === 'option') next = { ...next, options: { ...next.options, [action.slot]: { ...next.options[action.slot], ...action.value } } }
  if (action.type === 'weight') next = { ...next, weights: { ...next.weights, [action.key]: action.value } }
  if (action.type === 'housingCosts' && next.draft) {
    // One switch for the whole plan: placed buildings keep their own recorded inputs.
    const include = action.include === true
    next = { ...next, affordabilityAuto: include, buildings: (next.buildings || []).map(b => {
      const confirmation = include ? housingCostInputs(b, b.option) : null
      return JSON.stringify(confirmation) === JSON.stringify(b.affordabilityConfirmation ?? null) ? b : { ...b, affordabilityConfirmation: confirmation }
    }) }
  }
  if (next.draft && typeof next.affordabilityAuto === 'boolean') {
    const confirmation = next.affordabilityAuto ? housingCostInputs(next, next.draft) : null
    if (JSON.stringify(confirmation) !== JSON.stringify(next.affordabilityConfirmation ?? null)) next = { ...next, affordabilityConfirmation: confirmation }
  }
  if (JSON.stringify(next) === JSON.stringify(state.present)) return state
  return { past: [...state.past, state.present].slice(-100), present: next, future: [] }
}

export function scenarioExport(scenario, summary) {
  return { schemaVersion: scenario.draft || scenario.demolitions?.length ? 7 : 3, modelVersion: MODEL_VERSION, financeVersion: FINANCE_VERSION, dataVersion: summary?.pulled_at || null, exportedAt: new Date().toISOString(), scenario, limitations: ['Dimensions, access connectors and infrastructure buildability are user/model assumptions.', 'Demolitions are hypothetical removals from this plan, applied in both infrastructure states. Source records are unchanged; removal permission, cost, occupancy, relocation and demolition carbon are not assessed.', 'Title Nine checks without sufficient evidence are excluded, not passed. A score is not zoning approval.', 'This model does not evaluate utilities, engineering, route schedules, travel to jobs or marginal tonnes of CO2.'] }
}
