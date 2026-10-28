import { BUILDING_IDS } from './buildings.js'
import { MODEL_VERSION } from './plannerState.js'
import { HOUSING_COST_LIMITS } from './housingCosts.js'
import { PREFERENCE_FACTOR_IDS } from './scoringPolicy.js'
import { demolitionKey, footprintKey } from './redevelopment.js'

export const PLAN_STORAGE_KEY = 'playhouse.plan.v1'
export const PLAN_STORAGE_VERSION = 1
export const MAX_PLAN_BYTES = 2_000_000
export const validPlanPin = value => typeof value === 'string' && /^[0-9A-Z]{6,24}$/.test(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const number = (value, min = 0, max = 1e9) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const identifier = value => typeof value === 'string' && value.length > 0 && value.length < 150
const list = (value, limit) => Array.isArray(value) && value.length <= limit
const point = value => list(value, 2) && value.length === 2 && number(value[0], -180, 180) && number(value[1], -90, 90)
const endpoint = value => Number.isInteger(value) && value >= 0 || object(value) && list(value.edge, 2) && value.edge.length === 2 && value.edge.every(n => Number.isInteger(n) && n >= 0) && value.edge[0] < value.edge[1] && number(value.t, 0, 1)
const unique = values => new Set(values).size === values.length
const regionIds = value => value === undefined || list(value, 90) && value.every(id => typeof id === 'string' && /^[a-z0-9-]+$/.test(id))
const costValue = (key, value) => number(value, HOUSING_COST_LIMITS[key].min, HOUSING_COST_LIMITS[key].max)
const affordabilityConfirmation = value => value === undefined || value === null || object(value) && ['targetIncome', 'rent', 'utilities'].every(key => costValue(key, value[key]))
export const planBytes = value => new TextEncoder().encode(value).byteLength

export function safePlanJson(value, depth = 0) {
  if (depth > 14) return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.length <= 1000
  if (Array.isArray(value)) return value.length <= 40000 && value.every(item => safePlanJson(item, depth + 1))
  return object(value) && Object.entries(value).every(([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) && safePlanJson(item, depth + 1))
}

function validOption(option) {
  return object(option) && BUILDING_IDS.includes(option.typeId)
    && ['width', 'depth', 'height'].every(key => number(option[key], .1, 1000))
    && costValue('rent', option.rent) && costValue('utilities', option.utilities)
    && (option.floors === undefined || Number.isInteger(option.floors) && number(option.floors, 1, 60))
    && (option.residentialForm === undefined || ['duplex', 'attached'].includes(option.residentialForm))
    && (option.placement === null || object(option.placement) && number(option.placement.east, -10000, 10000) && number(option.placement.north, -10000, 10000) && number(option.placement.bearing, 0, 360))
}

/** Reject malformed stored inputs; never repair a plan by silently dropping edits. */
export function validatePlan(scenario) {
  if (!object(scenario) || !safePlanJson(scenario) || !validPlanPin(scenario.pin) || !validOption(scenario.draft)) return 'The saved plan has invalid parcel or building inputs.'
  if (!affordabilityConfirmation(scenario.affordabilityConfirmation) || scenario.affordabilityAuto !== undefined && typeof scenario.affordabilityAuto !== 'boolean' || scenario.householdSize !== undefined && !(Number.isInteger(scenario.householdSize) && number(scenario.householdSize, 1, 8))) return 'The saved household inputs are invalid.'
  if (!object(scenario.weights) || !PREFERENCE_FACTOR_IDS.every(id => number(scenario.weights[id], 0, 100)) || !['physical', 'capacity'].every(id => scenario.weights[id] === undefined || number(scenario.weights[id], 0, 100))) return 'The saved priorities are invalid.'
  if (!list(scenario.comparisonTypes, BUILDING_IDS.length) || !scenario.comparisonTypes.every(id => BUILDING_IDS.includes(id)) || !unique(scenario.comparisonTypes)) return 'The saved comparison choices are invalid.'
  for (const [key, min, max] of [['targetIncome', 5000, 500000], ['additionalDepartures', 0, 500], ['serviceHours', 1, 24], ['availablePlacesPerDeparture', 0, 100], ['boardingsPerHome', .1, 20], ['parkAccessShare', 0, 100]]) {
    if (!number(scenario[key], min, max)) return `The saved ${key} input is invalid.`
  }
  if (!Number.isInteger(scenario.additionalDepartures)) return 'Added departures must be a whole number.'
  if (scenario.rentMode !== undefined && !['prototype', 'custom', 'legacy'].includes(scenario.rentMode) || scenario.incomeSource !== undefined && !['hud', 'custom', 'legacy', 'fallback'].includes(scenario.incomeSource) || scenario.incomeBand !== undefined && scenario.incomeBand !== null && ![30, 50, 60, 80].includes(scenario.incomeBand)) return 'The saved housing-cost provenance is invalid.'
  if (scenario.spareBoardings !== null && !number(scenario.spareBoardings, 0, 10000)) return 'The saved transit reserve is invalid.'
  if (scenario.baselinePlacesPerDeparture !== undefined && !number(scenario.baselinePlacesPerDeparture, 0, 100)) return 'The saved transit capacity input is invalid.'
  if (scenario.capacityMode !== undefined && !['schedule', 'manual'].includes(scenario.capacityMode) || scenario.accessMode !== undefined && !['network', 'direct'].includes(scenario.accessMode)) return 'The saved calculation mode is invalid.'
  if (!['stopId', 'serviceStopId', 'capacityStopId'].every(key => scenario[key] === undefined || typeof scenario[key] === 'string' && scenario[key].length < 100)) return 'The saved stop reference is invalid.'
  if (!list(scenario.buildings, 40) || !scenario.buildings.every(b => object(b) && identifier(b.id) && validPlanPin(b.pin) && validOption(b.option) && costValue('targetIncome', b.targetIncome) && typeof b.stopId === 'string' && affordabilityConfirmation(b.affordabilityConfirmation)) || !unique(scenario.buildings.map(b => b.id))) return 'The saved building list is invalid.'
  if (!list(scenario.demolitions, 100) || !scenario.demolitions.every(b => object(b) && identifier(b.id) && validPlanPin(b.pin) && (b.site === undefined || validPlanPin(b.site)) && (b.unmatched === undefined || b.unmatched === true)) || !unique(scenario.demolitions.map(b => `${b.unmatched ? '#unmatched' : b.pin}:${b.id}`))) return 'The saved demolition list is invalid.'
  if (!list(scenario.connections, 12) || !scenario.connections.every(c => object(c) && identifier(c.id) && ['path', 'street'].includes(c.kind) && endpoint(c.from) && endpoint(c.to) && number(c.width, 2, 30) && regionIds(c.neighborhoodIds))) return 'The saved connections are invalid.'
  if (!list(scenario.parks, 12) || !scenario.parks.every(p => object(p) && identifier(p.id) && typeof p.name === 'string' && point(p.coordinates) && Number.isInteger(p.node) && p.node >= 0 && number(p.width, 5, 100) && number(p.depth, 5, 100) && regionIds(p.neighborhoodIds))) return 'The saved parks are invalid.'
  if (!list(scenario.routes, 12) || !scenario.routes.every(r => object(r) && identifier(r.id) && list(r.coordinates, 40000) && r.coordinates.length >= 2 && r.coordinates.every(point) && number(r.minutes) && number(r.meters))) return 'The saved routes are invalid.'
  if (!object(scenario.zoningInputsByPin) || !Object.entries(scenario.zoningInputsByPin).every(([pin, inputs]) => validPlanPin(pin) && object(inputs) && Object.values(inputs).every(value => value === null || typeof value === 'boolean' || typeof value === 'string' || number(value)))) return 'The saved zoning evidence is invalid.'
  if (!object(scenario.projectInputs) || !Object.values(scenario.projectInputs).every(value => value === null || number(value))) return 'The saved project inputs are invalid.'
  return null
}

/** Preserve every edit and numeric assumption. Old unverified costs require review. */
export function migrateSavedScenario(scenario, modelVersion = MODEL_VERSION) {
  if (!object(scenario?.draft)) return scenario
  const legacy = modelVersion !== MODEL_VERSION
  if (!legacy) return scenario
  return { ...scenario, rentMode: 'legacy', incomeSource: 'legacy', incomeBand: null,
    weights: { ...scenario.weights, physical: 0, capacity: 0 },
    affordabilityAuto: false, affordabilityConfirmation: null,
    draft: { ...scenario.draft, rentSource: 'legacy', rentSourceDetail: 'Preserved from an earlier model. Original rent provenance was not recorded; review before including housing costs.' },
    buildings: scenario.buildings.map(building => ({ ...building, affordabilityConfirmation: null,
      option: { ...building.option, rentSource: 'legacy', rentSourceDetail: 'Preserved legacy building rent; review before including housing costs.' } })),
  }
}

export function planPins(scenario) {
  return [...new Set([scenario.pin, ...scenario.buildings.map(b => b.pin), ...scenario.demolitions.flatMap(b => [b.pin, b.site].filter(Boolean)), ...Object.keys(scenario.zoningInputsByPin)])]
}

/** Startup is the only untouched state; Undo to the original object is still an edit. */
export function shouldSavePlan(session, plan) {
  if (!session.started && plan === session.initial && !session.dirty) return false
  session.started = true
  return JSON.stringify(plan) !== session.lastSaved
}

export function parseSavedPlan(raw) {
  if (!raw) return { saved: null, raw: null, issue: null }
  if (typeof raw !== 'string' || planBytes(raw) > MAX_PLAN_BYTES) return { saved: null, raw, issue: 'The saved plan is too large to restore safely.' }
  try {
    const saved = JSON.parse(raw)
    const issue = saved.version !== PLAN_STORAGE_VERSION ? 'This saved plan uses an unsupported version.' : validatePlan(saved.scenario)
    if (issue) return { saved: null, raw, issue }
    if (!object(saved.sources) || typeof saved.sources.networkFile !== 'string') return { saved: null, raw, issue: 'The saved plan has no verifiable network version.' }
    if (!safePlanJson(saved.sources)) return { saved: null, raw, issue: 'The saved source metadata is invalid.' }
    const scenario = migrateSavedScenario(saved.scenario, saved.modelVersion || 'legacy')
    return { saved: scenario === saved.scenario ? saved : { ...saved, modelVersion: MODEL_VERSION, scenario }, raw, issue: null, migrated: scenario !== saved.scenario }
  } catch { return { saved: null, raw, issue: 'The saved plan could not be read.' } }
}

export function readSavedPlan(storage) {
  try { return parseSavedPlan(storage.getItem(PLAN_STORAGE_KEY)) }
  catch { return { saved: null, raw: null, issue: 'Browser storage is unavailable. Export your plan to keep a copy.' } }
}

export function savePlan(storage, scenario, sources) {
  const issue = validatePlan(scenario)
  if (issue) return { ok: false, issue }
  try {
    const raw = JSON.stringify({ version: PLAN_STORAGE_VERSION, modelVersion: MODEL_VERSION, savedAt: new Date().toISOString(), sources, scenario })
    if (typeof raw !== 'string' || planBytes(raw) > MAX_PLAN_BYTES) return { ok: false, issue: 'This plan is too large for local saving. Export a copy.' }
    storage.setItem(PLAN_STORAGE_KEY, raw)
    return { ok: true, raw }
  } catch { return { ok: false, issue: 'Could not save on this device. Export your plan or retry.' } }
}

/** All referenced data must exist before a saved scenario reaches the evaluator. */
export async function restorePlanContext(saved, manifest, { locate, load, signal, networkSha256 }) {
  const pins = planPins(saved.scenario), descriptors = new Map(), byPin = new Map()
  for (const pin of pins) {
    const descriptor = await locate(manifest, pin, signal)
    if (!descriptor) throw new Error(`Saved parcel ${pin} is not in this data release.`)
    descriptors.set(descriptor.id, descriptor); byPin.set(pin, descriptor)
  }
  for (const id of [...saved.scenario.connections, ...saved.scenario.parks].flatMap(edit => edit.neighborhoodIds || [])) {
    const descriptor = manifest.neighborhoods.find(n => n.id === id)
    if (!descriptor) throw new Error('A saved infrastructure neighborhood is unavailable.')
    descriptors.set(id, descriptor)
  }
  const selected = byPin.get(saved.scenario.pin)
  const networkEdits = saved.scenario.connections.length || saved.scenario.parks.length || saved.scenario.routes.length
  if (networkEdits) {
    const fileMatches = saved.sources.networkFile && saved.sources.networkFile === selected.networkFile
    const shaMatches = !saved.sources.networkFile && saved.sources.networkSha256 && saved.sources.networkSha256 === networkSha256
    if (!fileMatches && !shaMatches) throw new Error('The walking network changed or cannot be verified for this plan. Keep the exported copy; no edits were applied.')
    if (saved.sources.networkSha256 && networkSha256 && saved.sources.networkSha256 !== networkSha256) throw new Error('The walking network source changed since this plan was exported. No edits were applied.')
  }
  const chunks = new Map(), queue = [...descriptors.values()]
  let next = 0
  await Promise.all(Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (next < queue.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const descriptor = queue[next++]
      chunks.set(descriptor.id, await load(descriptor, signal))
    }
  }))
  for (const pin of pins) if (!chunks.get(byPin.get(pin).id).parcels.features.some(f => f.properties.pin === pin)) throw new Error(`Saved parcel ${pin} is missing from its neighborhood.`)
  for (const removed of saved.scenario.demolitions) if (!chunks.get(byPin.get(removed.pin).id).buildings.features.some(f => footprintKey(f) === demolitionKey(removed))) throw new Error(`Saved building ${removed.id} is missing from the current outlines. Download the saved copy before starting a new plan.`)
  return { chunks, descriptor: selected }
}
