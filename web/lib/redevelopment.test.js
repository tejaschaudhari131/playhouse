import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recordedBuildingRef, retainedBuildings, siteFootprints, blockingFootprints, footprintRef, isDemolished, demolitionSite } from './redevelopment.js'
import { initialStudioScenario, initialScenario, optionFor, historyFor, scenarioReducer, scenarioExport } from './plannerState.js'
import { evaluatePlanner } from './plannerModel.js'
import { createPlannerEvaluator } from './plannerEvaluation.js'
import { prepareNetwork } from './networkModel.js'
import { rectangleAt, geometryBounds, boundsOverlap, geometryCenter, placementAt } from './plannerGeometry.js'

const origin = [-79.94, 40.41]
const recorded = (id, pin, geometry = rectangleAt(origin, 9, 14)) => ({ type: 'Feature', id, properties: { id, pin }, geometry })
function fixture() {
  const scores = Object.fromEntries(['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'].map(id => [id, { demand: 60, displacement_risk: 30, carbon_index: 20 }]))
  const feature = { type: 'Feature', properties: { pin: 'site', zoning_code: 'LNC', lot_sqft: 10000, scores }, geometry: rectangleAt(origin, 100, 100) }
  const zoning = { districts: { LNC: { use_table_read: true, code_section: 'Synthetic fixture', allowed: Object.keys(scores), use_rows: { 'Single-Unit Detached': 'P', 'Two-Unit': 'P', 'Three-Unit': 'P', 'Multi-Unit': 'P' } } } }
  const scenario = initialStudioScenario('site', feature.properties, 'bus')
  scenario.draft.placement = { east: 0, north: 0, bearing: 0 }
  return { feature, zoning, scenario, stop: { stop_id: 'bus', weekday_trips: 80, distance: 100 }, existingBuildings: [recorded('one', 'site')] }
}
const remove = (scenario, id = 'one', pin = 'site', extra = {}) => scenarioReducer(historyFor(scenario), { type: 'demolishBuilding', building: { id, pin }, ...extra }).present
const check = (option, id) => option.titleNine.checks.find(c => c.id === id)

test('removals match recorded ID and matched PIN, preserve source objects, and never imply missing evidence is empty', () => {
  const features = [recorded(12, 'site'), recorded('13', 'site'), recorded('12', 'neighbor'), recorded('unmatched', '')]
  const snapshot = structuredClone(features)
  const result = retainedBuildings(features, [{ id: '12', pin: 'site' }, { id: 'unknown', pin: 'site' }, { id: {}, pin: 'site' }])
  assert.deepEqual(result, features.slice(1))
  assert.equal(result[0], features[1])
  assert.deepEqual(features, snapshot)
  assert.equal(retainedBuildings(null, [{ id: '12', pin: 'site' }]), null)
  assert.equal(retainedBuildings(undefined, [{ id: '12', pin: 'site' }]), undefined)
  assert.equal(retainedBuildings(features, [{ id: '12', pin: 'wrong' }]), features)
  assert.equal(retainedBuildings(features, [{ id: 'unmatched', pin: '' }]), features)
  assert.equal(retainedBuildings(features), features)
  assert.deepEqual(recordedBuildingRef({ id: 12, properties: { pin: 'site' } }), { id: '12', pin: 'site' })
  assert.equal(recordedBuildingRef({ id: '12' }), null)
})

const at = (east, north = 0) => [origin[0] + east / (111320 * Math.cos(origin[1] * Math.PI / 180)), origin[1] + north / 111320]

test('a site lists its own footprints first, then outlines crossing its boundary from neighbors or without a parcel', () => {
  const { feature } = fixture()
  const own = recorded('own', 'site'), farOwn = recorded('far-own', 'site', rectangleAt(at(400), 9, 9))
  const crossing = recorded('cross', 'neighbor', rectangleAt(at(50), 12, 12)), orphan = recorded('orphan', '', rectangleAt(at(-50), 8, 8))
  const away = recorded('away', 'neighbor', rectangleAt(at(120), 12, 12))
  assert.deepEqual(siteFootprints([crossing, away, orphan, own, farOwn], feature).map(f => f.properties.id), ['own', 'far-own', 'cross', 'orphan'])
  assert.deepEqual(siteFootprints(null, feature), [])
  assert.deepEqual(siteFootprints([own], null), [])
  assert.deepEqual(blockingFootprints([own, crossing, away], rectangleAt(at(48), 10, 10)).map(f => f.properties.id), ['cross'])
  assert.deepEqual(blockingFootprints(null, feature.geometry), [])
  assert.deepEqual(footprintRef(own, 'site'), { id: 'own', pin: 'site' })
  assert.deepEqual(footprintRef(crossing, 'site'), { id: 'cross', pin: 'neighbor', site: 'site' })
  assert.deepEqual(footprintRef(orphan, 'site'), { id: 'orphan', pin: 'site', unmatched: true })
  assert.equal(footprintRef({ properties: { pin: 'site' } }, 'site'), null)
  assert.equal(footprintRef(orphan, ''), null)
  assert.equal(demolitionSite(footprintRef(crossing, 'site')), 'site')
  assert.equal(demolitionSite(footprintRef(own, 'site')), 'site')
})

test('unmatched and cross-boundary removals match only their own outline', () => {
  const orphan = recorded('orphan', ''), sameIdOwned = recorded('orphan', 'site'), crossing = recorded('cross', 'neighbor')
  const features = [orphan, sameIdOwned, crossing]
  assert.deepEqual(retainedBuildings(features, [{ id: 'orphan', pin: 'site', unmatched: true }]), [sameIdOwned, crossing])
  assert.deepEqual(retainedBuildings(features, [{ id: 'orphan', pin: 'site' }]), [orphan, crossing])
  assert.deepEqual(retainedBuildings(features, [{ id: 'cross', pin: 'neighbor', site: 'site' }]), [orphan, sameIdOwned])
  assert.equal(isDemolished(orphan, [{ id: 'orphan', pin: 'other-site', unmatched: true }]), true)
  assert.equal(isDemolished(sameIdOwned, [{ id: 'orphan', pin: 'site', unmatched: true }]), false)
})

test('batch demolition is one undo step, dedupes, keeps site context and clears both parcels’ retained-area inputs', () => {
  const { scenario } = fixture()
  scenario.zoningInputsByPin = { site: { existingGfaSqft: 9000, parkingSpaces: 2 }, neighbor: { existingFootprintSqft: 400, izStatus: 'none' }, other: { existingGfaSqft: 1 } }
  scenario.demolitions = [{ id: 'old', pin: 'site' }]
  const before = structuredClone(scenario), start = historyFor(scenario)
  const buildings = [{ id: 'cross', pin: 'neighbor', site: 'site' }, { id: 'orphan', pin: 'site', unmatched: true }, { id: 'cross', pin: 'neighbor', site: 'site' }, { id: 'old', pin: 'site' }]
  let history = scenarioReducer(start, { type: 'demolishBuildings', buildings, resetDraft: true })
  assert.deepEqual(history.present.demolitions, [{ id: 'old', pin: 'site' }, { id: 'cross', pin: 'neighbor', site: 'site' }, { id: 'orphan', pin: 'site', unmatched: true }])
  assert.deepEqual(history.present.zoningInputsByPin, { site: { parkingSpaces: 2 }, neighbor: { izStatus: 'none' }, other: { existingGfaSqft: 1 } })
  assert.equal(history.present.zoningInputsByPin.other, scenario.zoningInputsByPin.other)
  assert.equal(history.present.draft.placement, null)
  assert.equal(history.past.length, 1)
  assert.deepEqual(scenarioReducer(history, { type: 'undo' }).present, before)
  history = scenarioReducer(history, { type: 'restoreBuilding', building: { id: 'orphan', pin: 'site', unmatched: true } })
  assert.deepEqual(history.present.demolitions.map(d => d.id), ['old', 'cross'])
  history = scenarioReducer(history, { type: 'restoreBuilding', building: { id: 'cross', pin: 'neighbor' } })
  assert.deepEqual(history.present.demolitions.map(d => d.id), ['old'])
  for (const invalid of [[], [{ id: 'ok', pin: 'site' }, { id: '', pin: 'site' }], [{ id: 'old', pin: 'site' }], 'cross']) {
    assert.equal(scenarioReducer(start, { type: 'demolishBuildings', buildings: invalid }), start)
  }
  const nearlyFull = historyFor({ ...scenario, demolitions: Array.from({ length: 99 }, (_, id) => ({ id: String(id), pin: 'site' })) })
  assert.equal(scenarioReducer(nearlyFull, { type: 'demolishBuildings', buildings: [{ id: 'a', pin: 'site' }, { id: 'b', pin: 'site' }] }), nearlyFull)
  assert.equal(scenarioReducer(nearlyFull, { type: 'demolishBuildings', buildings: [{ id: 'a', pin: 'site' }] }).present.demolitions.length, 100)
})

test('a footprint crossing from a neighbor or without a parcel stops blocking the draft once demolished from this site', () => {
  for (const blocker of [recorded('cross', 'neighbor', rectangleAt(at(45), 14, 14)), recorded('orphan', '', rectangleAt(at(45), 14, 14))]) {
    const input = fixture()
    input.existingBuildings = [blocker]
    input.scenario.draft = { ...input.scenario.draft, width: 8, depth: 8, placement: { east: 42, north: 0, bearing: 0 } }
    const before = evaluatePlanner(input)
    assert.equal(before.proposal.townhouse_duplex.massing.collisions, 1)
    assert.equal(before.proposal.townhouse_duplex.total, null)
    assert.deepEqual(blockingFootprints(input.existingBuildings, before.proposal.townhouse_duplex.massing.geometry), [blocker])
    const scenario = scenarioReducer(historyFor(input.scenario), { type: 'demolishBuildings', buildings: [footprintRef(blocker, 'site')] }).present
    const after = evaluatePlanner({ ...input, scenario })
    assert.equal(after.proposal.townhouse_duplex.massing.collisions, 0)
    assert.ok(Number.isFinite(after.proposal.townhouse_duplex.total))
    assert.deepEqual(after.proposal.townhouse_duplex.massing.placement, input.scenario.draft.placement)
  }
})

test('demolish/restore clear only affected retained-area assumptions and undo restores their exact values', () => {
  const { scenario } = fixture()
  scenario.zoningInputsByPin = { site: { existingGfaSqft: 9000, existingFootprintSqft: 4500, parkingSpaces: 2 }, neighbor: { existingGfaSqft: 600 } }
  const before = structuredClone(scenario)
  let history = scenarioReducer(historyFor(scenario), { type: 'demolishBuilding', building: { id: ' one ', pin: 'site' }, resetDraft: true })
  assert.deepEqual(history.present.demolitions, [{ id: 'one', pin: 'site' }])
  assert.equal(history.present.draft.placement, null)
  assert.deepEqual(history.present.zoningInputsByPin.site, { parkingSpaces: 2 })
  assert.equal(history.present.zoningInputsByPin.neighbor, scenario.zoningInputsByPin.neighbor)
  assert.deepEqual(scenario, before)
  assert.equal(scenarioReducer(history, { type: 'demolishBuilding', id: 'one', pin: 'site' }), history)
  assert.equal(scenarioReducer(history, { type: 'restoreBuilding', id: 'one', pin: 'wrong' }), history)
  const removed = history.present
  history = scenarioReducer(history, { type: 'undo' })
  assert.deepEqual(history.present, before)
  history = scenarioReducer(history, { type: 'redo' })
  assert.deepEqual(history.present, removed)
  history = scenarioReducer(history, { type: 'patch', value: { zoningInputsByPin: { site: { existingGfaSqft: 0, existingFootprintSqft: 0, parkingSpaces: 2 } } } })
  history = scenarioReducer(history, { type: 'restoreBuilding', id: 'one', pin: 'site' })
  assert.deepEqual(history.present.demolitions, [])
  assert.deepEqual(history.present.zoningInputsByPin.site, { parkingSpaces: 2 })
  assert.deepEqual(remove(scenario).draft.placement, scenario.draft.placement, 'ordinary demolition retains manual draft placement')
})

test('invalid removals and the 100-building limit are no-ops, including optional draft reset', () => {
  const { scenario } = fixture()
  const history = historyFor(scenario)
  for (const building of [{}, { id: '', pin: 'site' }, { id: 'one', pin: ' ' }, { id: {}, pin: 'site' }, { id: Infinity, pin: 'site' }]) {
    assert.equal(scenarioReducer(history, { type: 'demolishBuilding', building, resetDraft: true }), history)
  }
  const full = historyFor({ ...scenario, demolitions: Array.from({ length: 100 }, (_, id) => ({ id: String(id), pin: 'site' })) })
  assert.equal(scenarioReducer(full, { type: 'demolishBuilding', building: { id: 'extra', pin: 'site' }, resetDraft: true }), full)
  assert.equal(scenarioReducer(full, { type: 'restoreBuilding', id: '99', pin: 'site' }).present.demolitions.length, 99)
})

test('real county footprint removal clears only its exact collision and preserves neighboring source evidence', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../testdata/study/${name}`, import.meta.url)))
  const feature = read('parcels.geojson').features.find(f => f.properties.pin === '0056G00082000000')
  const existingBuildings = read('existing-buildings.geojson').features.filter(f => boundsOverlap(geometryBounds(feature.geometry), geometryBounds(f.geometry)))
  const source = existingBuildings.find(f => f.properties.id === '550443'), ref = recordedBuildingRef(source)
  const scenario = initialStudioScenario(feature.properties.pin, feature.properties)
  scenario.draft = { ...optionFor('single_family', 1000), width: 3, depth: 3, placement: placementAt(feature.geometry, geometryCenter(source.geometry), 0) }
  const input = { feature, scenario, existingBuildings, zoning: read('zoning.json'), stop: null }
  const original = structuredClone(input), before = evaluatePlanner(input)
  assert.equal(before.proposal.single_family.massing.collisions, 1)
  assert.equal(before.proposal.single_family.total, null)
  const after = evaluatePlanner({ ...input, scenario: remove(scenario, ref.id, ref.pin) })
  for (const state of ['baseline', 'proposal']) {
    assert.equal(after[state].single_family.massing.collisions, 0)
    assert.equal(after[state].single_family.massing.fits, true)
    assert.ok(Number.isFinite(after[state].single_family.total))
  }
  assert.deepEqual(retainedBuildings(existingBuildings, [ref]).map(f => f.properties.id), ['549789'])
  assert.deepEqual(input, original)
})

test('retained-building accounting uses zero only after full removal; partial removal and missing evidence stay unknown', () => {
  const input = fixture()
  input.scenario.zoningInputsByPin.site = { existingGfaSqft: 30000, existingFootprintSqft: 9000 }
  const changed = remove(input.scenario)
  const result = evaluatePlanner({ ...input, scenario: changed })
  assert.equal(check(result.proposal.townhouse_duplex, 'far').status, 'pass')
  assert.ok(Number.isFinite(result.proposal.townhouse_duplex.total))
  const auxiliary = recorded('aux', 'site', rectangleAt([-79.9404, 40.41], 3, 3))
  const partial = evaluatePlanner({ ...input, scenario: changed, existingBuildings: [...input.existingBuildings, auxiliary] })
  assert.equal(partial.proposal.townhouse_duplex.massing.collisions, 0)
  assert.equal(check(partial.proposal.townhouse_duplex, 'far').status, 'unknown')
  const missing = evaluatePlanner({ ...input, scenario: changed, existingBuildings: null })
  assert.equal(missing.proposal.townhouse_duplex.total, null)
  assert.equal(missing.proposal.townhouse_duplex.massing.collisions, null)
  assert.equal(check(missing.proposal.townhouse_duplex, 'far').status, 'unknown')
  const tooTall = evaluatePlanner({ ...input, scenario: { ...changed, draft: { ...changed.draft, height: 100 } } })
  assert.equal(check(tooTall.proposal.townhouse_duplex, 'height').status, 'conflict')
  assert.equal(tooTall.proposal.townhouse_duplex.total, null, 'demolition does not bypass other zoning gates')
})

test('replacement collisions and zoning are recomputed for every placed-plan state after restoring an original', () => {
  const input = fixture(), replacement = { id: 'replacement', pin: 'site', option: input.scenario.draft, stopId: 'bus', targetIncome: input.scenario.targetIncome }
  let history = scenarioReducer(historyFor(input.scenario), { type: 'demolishBuilding', building: { id: 'one', pin: 'site' } })
  history = scenarioReducer(history, { type: 'addBuilding', building: replacement })
  history = scenarioReducer(history, { type: 'draft', value: { placement: { east: 30, north: 0, bearing: 0 } } })
  const areaSites = [{ ...replacement, feature: input.feature, stop: input.stop, existingBuildings: input.existingBuildings }]
  const evaluate = scenario => evaluatePlanner({ ...input, scenario, areaSites })
  const cleared = evaluate(history.present)
  for (const state of ['baseline', 'proposal']) {
    assert.equal(cleared.committed[state][0].massing.collisions, 0)
    assert.ok(Number.isFinite(cleared.placedPlan[state].total))
    assert.ok(Number.isFinite(cleared[state].townhouse_duplex.total))
  }
  const removed = history.present
  history = scenarioReducer(history, { type: 'restoreBuilding', id: 'one', pin: 'site' })
  const restored = evaluate(history.present)
  for (const state of ['baseline', 'proposal']) {
    assert.equal(restored.committed[state][0].massing.collisions, 1)
    assert.equal(restored.placedPlan[state].total, null)
    assert.equal(restored[state].townhouse_duplex.total, null)
  }
  assert.deepEqual(history.present.buildings, removed.buildings, 'restoring the source never deletes or moves replacement housing')
  history = scenarioReducer(history, { type: 'undo' })
  assert.deepEqual(evaluate(history.present), cleared)
})

test('demolition invalidates geometry cache, while priorities still reuse the correct retained evidence', () => {
  const input = fixture(), evaluator = createPlannerEvaluator()
  const before = evaluator.evaluate(input)
  const changed = { ...input, scenario: remove(input.scenario) }
  assert.deepEqual(evaluator.evaluate(changed), evaluatePlanner(changed))
  const priorities = { ...changed, scenario: { ...changed.scenario, weights: { physical: 100, affordability: 50 } } }
  assert.deepEqual(evaluator.evaluate(priorities), evaluatePlanner(priorities))
  assert.deepEqual(evaluator.evaluate(input), before)
  assert.deepEqual(evaluator.stats, { evaluated: 3, reweighted: 1 })
})

test('restoring a source footprint invalidates a path or park through it, including away from the selected parcel', () => {
  const nodes = [[-79.9403, 40.41], [-79.9397, 40.41]]
  const networkContext = prepareNetwork({ nodes, ground: [1, 1], edges: [[0, 1, 1], [1, 0, 1]], parks: [] })
  const edits = [
    { connections: [{ id: 'path', kind: 'path', from: 0, to: 1, width: 3 }] },
    { parks: [{ id: 'park', node: 0, coordinates: origin, width: 20, depth: 20 }] },
  ]
  for (const edit of edits) {
    const input = fixture(), original = recorded('offsite', 'another-parcel')
    input.existingBuildings = []
    input.infrastructureBuildings = [original]
    input.networkContext = networkContext
    input.stop.coordinates = nodes[1]
    input.scenario = { ...input.scenario, ...edit, accessMode: 'network', draft: { ...input.scenario.draft, placement: { east: 30, north: 0, bearing: 0 } } }
    let history = scenarioReducer(historyFor(input.scenario), { type: 'demolishBuilding', id: 'offsite', pin: 'another-parcel' })
    const cleared = evaluatePlanner({ ...input, scenario: history.present })
    assert.deepEqual(cleared.infrastructureErrors, [])
    assert.ok(Number.isFinite(cleared.proposal.townhouse_duplex.total))
    history = scenarioReducer(history, { type: 'restoreBuilding', id: 'offsite', pin: 'another-parcel' })
    const restored = evaluatePlanner({ ...input, scenario: history.present })
    assert.equal(restored.infrastructureErrors.length, 1)
    assert.match(restored.infrastructureErrors[0], /overlaps a retained recorded building/)
    assert.equal(restored.proposal.townhouse_duplex.total, null)
    assert.equal(restored.proposal.townhouse_duplex.access.available, false)
    assert.ok(Number.isFinite(restored.baseline.townhouse_duplex.total), 'existing infrastructure remains evaluable')
    history = scenarioReducer(history, { type: 'undo' })
    assert.deepEqual(evaluatePlanner({ ...input, scenario: history.present }), cleared)
    const missing = evaluatePlanner({ ...input, scenario: history.present, infrastructureBuildings: null })
    assert.equal(missing.proposal.townhouse_duplex.total, null)
    assert.match(missing.infrastructureErrors[0], /evidence is unavailable/)
  }
})

test('older scenarios without removals preserve results, and exports identify redevelopment assumptions', () => {
  const input = fixture(), { demolitions, ...legacyStudio } = input.scenario
  assert.deepEqual(evaluatePlanner({ ...input, scenario: legacyStudio }), evaluatePlanner(input))
  const legacy = initialScenario('site', input.feature.properties, 'bus')
  delete legacy.demolitions
  assert.deepEqual(evaluatePlanner({ ...input, scenario: legacy }), evaluatePlanner({ ...input, scenario: { ...legacy, demolitions: [] } }))
  const scenario = remove(legacyStudio), exported = scenarioExport(scenario, { pulled_at: '2026-09-27' })
  assert.equal(exported.schemaVersion, 7)
  assert.equal(exported.dataVersion, '2026-09-27')
  assert.deepEqual(exported.scenario.demolitions, [{ id: 'one', pin: 'site' }])
  assert.ok(exported.limitations.some(text => text.includes('demolition carbon')))
  assert.equal(scenarioExport(legacy).schemaVersion, 3)
})
