import test from 'node:test'
import assert from 'node:assert/strict'
import { initialStudioScenario, optionFor } from './plannerState.js'
import { PLAN_STORAGE_KEY, parseSavedPlan, readSavedPlan, restorePlanContext, savePlan, shouldSavePlan, validatePlan } from './planPersistence.js'

const PIN = '0056F00338000000', OTHER = '0049N00010000000'
const sources = { dataVersion: '2026-09-01', networkFile: 'region-1-network.abcd.json' }
const storage = () => {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}
function fullPlan() {
  const scenario = initialStudioScenario(PIN, {}, '123')
  scenario.accessMode = 'network'
  scenario.targetIncome = 41234.56
  scenario.draft = { ...optionFor('triplex', 1200.12), width: 11.13, depth: 17.79, utilities: 102.22, placement: { east: -3.14, north: 9.99, bearing: 15.125 } }
  scenario.comparisonTypes = ['small_apartment', 'townhouse_duplex']
  scenario.buildings = [{ id: 'placed-one', pin: OTHER, option: { ...optionFor('single_family', 987), placement: { east: 1, north: -4, bearing: 22 } }, targetIncome: 30123, stopId: '42' }]
  scenario.demolitions = [{ id: 'source-one', pin: PIN }]
  scenario.connections = [{ id: 'path-one', kind: 'path', from: { edge: [1, 2], t: .3 }, to: 7, width: 3, neighborhoodIds: ['hazelwood'] }]
  scenario.parks = [{ id: 'park-one', name: 'Proposed park', coordinates: [-79.94, 40.41], node: 3, width: 20, depth: 20, neighborhoodIds: ['hazelwood'] }]
  scenario.routes = [{ id: 'route-one', coordinates: [[-79.94, 40.41], [-79.95, 40.42]], minutes: 3.25, meters: 244.98 }]
  scenario.zoningInputsByPin = { [PIN]: { lotSqft: 4345.2, grading: false, parkingRegime: 'base', existingGfaSqft: null } }
  scenario.projectInputs = { affordableUnits: 2 }
  scenario.additionalDepartures = 55; scenario.serviceStopId = '123'; scenario.capacityStopId = '123'
  scenario.spareBoardings = 17.5; scenario.parkAccessShare = 20
  return scenario
}

test('local saving round trips exact scenario inputs without derived results', () => {
  const target = storage(), scenario = fullPlan(), before = structuredClone(scenario)
  assert.equal(validatePlan(scenario), null)
  assert.equal(savePlan(target, scenario, sources).ok, true)
  const restored = readSavedPlan(target)
  assert.deepEqual(restored.saved.scenario, before)
  assert.deepEqual(restored.saved.sources, sources)
  assert.equal(restored.saved.results, undefined)
  assert.deepEqual(scenario, before)
})

test('optional affordability confirmations and household size remain exact, legacy plans stay valid', () => {
  const plan = fullPlan()
  plan.householdSize = 3
  plan.affordabilityConfirmation = { targetIncome: plan.targetIncome, rent: plan.draft.rent, utilities: plan.draft.utilities }
  plan.buildings[0].affordabilityConfirmation = { targetIncome: 30123, rent: 987, utilities: 150 }
  const target = storage()
  assert.equal(savePlan(target, plan, sources).ok, true)
  assert.deepEqual(readSavedPlan(target).saved.scenario, plan)
  plan.householdSize = 9
  assert.match(validatePlan(plan), /household/)
})

test('corrupt, unsupported and malformed plans remain available for recovery without applying them', () => {
  for (const change of [p => { p.draft.width = null }, p => { p.weights.access = -1 }, p => { p.connections[0].from = { edge: [2, 1], t: .5 } }, p => { p.routes[0].coordinates[0] = [999, 40] }, p => p.buildings.push(p.buildings[0]), p => { p.demolitions[0].pin = '' }]) {
    const scenario = fullPlan(); change(scenario)
    const raw = JSON.stringify({ version: 1, scenario, sources })
    const result = parseSavedPlan(raw)
    assert.equal(result.saved, null)
    assert.ok(result.issue)
    assert.equal(result.raw, raw)
  }
  for (const raw of ['{bad json', 'null', JSON.stringify({ version: 90, scenario: fullPlan(), sources }), '{"version":1,"scenario":{"__proto__":{"polluted":true}}}']) {
    assert.equal(parseSavedPlan(raw).saved, null)
    assert.equal(parseSavedPlan(raw).raw, raw)
  }
  assert.equal({}.polluted, undefined)
})

test('quota and storage denial never replace the prior saved copy or report success', () => {
  const target = storage()
  savePlan(target, fullPlan(), sources)
  const previous = target.getItem(PLAN_STORAGE_KEY)
  target.setItem = () => { throw new Error('Quota exceeded') }
  assert.equal(savePlan(target, initialStudioScenario(PIN), sources).ok, false)
  assert.equal(target.getItem(PLAN_STORAGE_KEY), previous)
  assert.match(readSavedPlan({ getItem: () => { throw new Error('Denied') } }).issue, /unavailable/)
})

test('initial opening does not overwrite a saved plan; edits, Undo to initial, and Redo do save', () => {
  const initial = initialStudioScenario(PIN), edited = { ...initial, targetIncome: 80000 }
  const session = { initial, lastSaved: null, dirty: false }
  assert.equal(shouldSavePlan(session, initial), false)
  assert.equal(shouldSavePlan(session, edited), true)
  session.lastSaved = JSON.stringify(edited)
  assert.equal(shouldSavePlan(session, edited), false)
  assert.equal(shouldSavePlan(session, initial), true)
  session.lastSaved = JSON.stringify(initial)
  assert.equal(shouldSavePlan(session, edited), true)
})

test('restore prepares every referenced neighborhood before exposing a saved multi-site plan', async () => {
  const saved = { scenario: fullPlan(), sources }
  const neighborhoods = [{ id: 'hazelwood', networkFile: sources.networkFile }, { id: 'lawrenceville', networkFile: 'other.json' }]
  const byPin = new Map([[PIN, neighborhoods[0]], [OTHER, neighborhoods[1]]]), loaded = []
  const result = await restorePlanContext(saved, { neighborhoods }, {
    locate: async (manifest, pin) => byPin.get(pin),
    load: async descriptor => {
      loaded.push(descriptor.id)
      return { parcels: { features: [{ properties: { pin: descriptor.id === 'hazelwood' ? PIN : OTHER } }] }, buildings: { features: [{ properties: { id: 'source-one', pin: PIN } }] } }
    },
  })
  assert.deepEqual(new Set(loaded), new Set(['hazelwood', 'lawrenceville']))
  assert.equal(result.chunks.size, 2)
  assert.equal(result.descriptor.id, 'hazelwood')
})

test('missing parcel or changed graph refuses unsafe restoration before fetching geometry', async () => {
  const saved = { scenario: fullPlan(), sources }
  const manifest = { neighborhoods: [{ id: 'hazelwood', networkFile: 'new-network.json' }] }
  let loads = 0
  const load = async () => { loads++; return {} }
  await assert.rejects(restorePlanContext(saved, manifest, { locate: async () => null, load }), /not in this data release/)
  await assert.rejects(restorePlanContext(saved, manifest, { locate: async () => manifest.neighborhoods[0], load }), /walking network changed/)
  assert.equal(loads, 0)
})
