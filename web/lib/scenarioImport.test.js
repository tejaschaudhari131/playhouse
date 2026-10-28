import test from 'node:test'
import assert from 'node:assert/strict'
import { initialStudioScenario, scenarioExport, MODEL_VERSION } from './plannerState.js'
import { parseScenarioImport, MAX_IMPORT_BYTES } from './scenarioImport.js'
import { MAX_PLAN_BYTES, restorePlanContext, validatePlan } from './planPersistence.js'

const PIN = '0056F00338000000', OTHER = '0049N00010000000'
const SHA = 'a'.repeat(64), FILE = 'region-1-network.01234.json'
function plan() {
  const state = initialStudioScenario(PIN, {}, '12107')
  state.draft = { ...state.draft, placement: { east: 3.125, north: -1.25, bearing: 178.5 } }
  state.weights = { demand: 55, affordability: 20, displacement: 5, access: 10, carbon: 10 }
  state.additionalDepartures = 60; state.serviceStopId = '12107'
  state.comparisonTypes = ['single_family', 'small_apartment']
  state.connections = [{ id: 'street-1', kind: 'street', from: { edge: [1, 2], t: .25 }, to: 7, width: 8, neighborhoodIds: ['hazelwood'] }]
  state.routes = [{ id: 'route-1', coordinates: [[-79.94, 40.41], [-79.941, 40.412]], meters: 230.5, minutes: 3.4 }]
  state.parks = [{ id: 'park-1', name: 'My park', coordinates: [-79.94, 40.41], node: 3, width: 20, depth: 25, neighborhoodIds: ['hazelwood'] }]
  state.buildings = [{ id: 'placed-1', pin: OTHER, option: { ...state.draft }, targetIncome: state.targetIncome, stopId: '20', affordabilityConfirmation: state.affordabilityConfirmation }]
  state.demolitions = [{ id: 'roof-1', pin: PIN }]
  return state
}
const payload = scenario => ({ ...scenarioExport(scenario), sources: { networkFile: FILE }, networkContext: SHA, results: { ignored: true } })

test('schema7 imports every exact edit and preset weight, while discarding derived scores', () => {
  const before = plan(), exported = payload(before)
  assert.equal(validatePlan(before), null)
  const result = parseScenarioImport(JSON.stringify(exported))
  assert.equal(result.issue, null)
  assert.equal(result.migrated, false)
  assert.deepEqual(result.saved.scenario, before)
  assert.equal(result.saved.sources.networkFile, FILE)
  assert.equal(result.saved.sources.networkSha256, SHA)
  assert.equal(result.saved.results, undefined)
  assert.deepEqual(exported.scenario, before)
})

test('storage recovery files are accepted and legacy costs require review without rewriting numbers or drawings', () => {
  const scenario = plan()
  const current = parseScenarioImport(JSON.stringify({ version: 1, modelVersion: MODEL_VERSION, scenario, sources: { networkFile: FILE } }))
  assert.equal(current.issue, null)
  assert.deepEqual(current.saved.scenario, scenario)
  const legacy = parseScenarioImport(JSON.stringify({ ...payload(scenario), modelVersion: 'planner-screen-2.1' }))
  assert.equal(legacy.issue, null)
  assert.equal(legacy.migrated, true)
  assert.equal(legacy.saved.scenario.affordabilityAuto, false)
  assert.equal(legacy.saved.scenario.affordabilityConfirmation, null)
  assert.equal(legacy.saved.scenario.draft.rent, scenario.draft.rent)
  assert.equal(legacy.saved.scenario.targetIncome, scenario.targetIncome)
  assert.equal(legacy.saved.scenario.draft.rentSource, 'legacy')
  for (const key of ['connections', 'routes', 'parks', 'demolitions', 'comparisonTypes']) assert.deepEqual(legacy.saved.scenario[key], scenario[key])
  assert.ok(legacy.notices.some(note => note.includes('reviewed')))
})

test('old SHA-only exports restore drawn edits only against the same source network', async () => {
  const exported = payload(plan())
  delete exported.sources.networkFile
  const imported = parseScenarioImport(JSON.stringify(exported))
  assert.equal(imported.issue, null)
  assert.equal(imported.saved.sources.networkFile, '')
  const descriptor = { id: 'hazelwood', networkFile: FILE }
  let loads = 0
  const context = {
    locate: async () => descriptor,
    load: async () => { loads++; return { parcels: { features: [PIN, OTHER].map(pin => ({ properties: { pin } })) }, buildings: { features: [{ properties: { pin: PIN, id: 'roof-1' } }] } } },
  }
  await assert.rejects(restorePlanContext(imported.saved, { neighborhoods: [descriptor] }, context), /cannot be verified/)
  await assert.rejects(restorePlanContext(imported.saved, { neighborhoods: [descriptor] }, { ...context, networkSha256: 'b'.repeat(64) }), /cannot be verified/)
  assert.equal(loads, 0)
  assert.equal((await restorePlanContext(imported.saved, { neighborhoods: [descriptor] }, { ...context, networkSha256: SHA })).descriptor.id, 'hazelwood')
  assert.equal(loads, 1)
})

test('changed modern graph refuses restoration even when a global source fingerprint matches', async () => {
  const saved = parseScenarioImport(JSON.stringify(payload(plan()))).saved
  let loaded = false
  await assert.rejects(restorePlanContext(saved, { neighborhoods: [{ id: 'hazelwood', networkFile: 'changed.json' }] }, {
    locate: async () => ({ id: 'hazelwood', networkFile: 'changed.json' }), load: async () => { loaded = true }, networkSha256: SHA,
  }), /walking network changed/)
  assert.equal(loaded, false)
})

test('missing graph provenance is allowed only for plans without drawn infrastructure', () => {
  const exported = payload(plan())
  delete exported.sources.networkFile; delete exported.networkContext
  assert.match(parseScenarioImport(JSON.stringify(exported)).issue, /no verifiable/)
  exported.scenario.connections = []; exported.scenario.routes = []; exported.scenario.parks = []
  assert.equal(parseScenarioImport(JSON.stringify(exported)).issue, null)
})

test('unsupported, malformed, hostile and unreasonable inputs fail before any scenario is applied', () => {
  for (const value of [null, {}, { schemaVersion: 3 }, { ...payload(plan()), modelVersion: 'planner-screen-99.0' }]) assert.ok(parseScenarioImport(JSON.stringify(value)).issue)
  assert.match(parseScenarioImport(JSON.stringify({ schemaVersion: 3 })).issue, /older A\/B/)
  assert.ok(parseScenarioImport('{broken').issue)
  const hostile = JSON.stringify(payload(plan())).replace('"results":{"ignored":true}', '"results":{"__proto__":{"polluted":true}}')
  assert.match(parseScenarioImport(hostile).issue, /unsafe/)
  assert.equal({}.polluted, undefined)
  for (const change of [p => { p.draft.rent = 0 }, p => { p.targetIncome = 1000 }, p => { p.draft.floors = 2.5 }, p => { p.connections[0].from.edge = [2, 1] }, p => { p.routes[0].coordinates[0] = [999, 40] }, p => { p.weights.demand = -1 }]) {
    const scenario = plan(); change(scenario)
    assert.ok(parseScenarioImport(JSON.stringify(payload(scenario))).issue)
  }
})

test('file and scenario byte budgets count UTF-8 bytes, including discarded export output', () => {
  assert.match(parseScenarioImport(' '.repeat(MAX_IMPORT_BYTES + 1)).issue, /10 MB/)
  const exported = payload(plan())
  exported.scenario.padding = 'x'.repeat(MAX_PLAN_BYTES)
  assert.match(parseScenarioImport(JSON.stringify(exported)).issue, /2 MB/)
  delete exported.scenario.padding
  exported.results.padding = 'é'.repeat(MAX_IMPORT_BYTES / 2)
  assert.match(parseScenarioImport(JSON.stringify(exported)).issue, /10 MB/)
})
