import test from 'node:test'
import assert from 'node:assert/strict'
import { BUILDING_IDS } from './buildings.js'
import { typologyCards, resizeDraft, rotatePlacement, draftKey, previewPaused } from './buildControls.js'
import { initialStudioScenario, optionFor, historyFor, scenarioReducer, defaultComparisonTypes } from './plannerState.js'
import { evaluatePlanner } from './plannerModel.js'
import { rectangleAt } from './plannerGeometry.js'

function fixture() {
  const scores = Object.fromEntries(['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'].map(id => [id, { demand: 60, displacement_risk: 30, carbon_index: 20 }]))
  const feature = { type: 'Feature', properties: { pin: 'site', zoning_code: 'TEST', lot_sqft: 10000, scores }, geometry: rectangleAt([-79.94, 40.41], 60, 60) }
  const zoning = { districts: { TEST: { use_table_read: true, code_section: 'Fixture', allowed: Object.keys(scores), use_rows: { 'Single-Unit Detached': 'P', 'Two-Unit': 'P', 'Three-Unit': 'P', 'Multi-Unit': '' } } } }
  return { feature, zoning, scenario: initialStudioScenario('site', feature.properties), stop: null, existingBuildings: [] }
}

test('typology cards list every type with units, dimensions, zoning badge and only evaluated scores', () => {
  const input = fixture()
  input.scenario.draft = { ...optionFor('triplex', 1100), width: 11, depth: 15 }
  input.scenario.comparisonTypes = defaultComparisonTypes('triplex')
  assert.ok(typologyCards({ draft: input.scenario.draft, options: evaluatePlanner(input).proposal, code: 'TEST', zoning: input.zoning }).every(c => c.status !== 'unscored'), 'new plans score every type')
  input.scenario.comparisonTypes = []
  const result = evaluatePlanner(input)
  const cards = typologyCards({ draft: input.scenario.draft, options: result.proposal, code: 'TEST', zoning: input.zoning })
  assert.deepEqual(cards.map(c => c.typeId), BUILDING_IDS)
  const active = cards.find(c => c.active)
  assert.equal(active.typeId, 'triplex')
  assert.deepEqual([active.units, active.width, active.depth, active.floors], [3, 11, 15, 3])
  assert.match(active.permission.label, /^Use permitted/)
  assert.equal(active.status, result.proposal.triplex.eligible ? 'scored' : 'review')
  if (active.status === 'scored') assert.equal(active.statusText, `${Math.round(result.proposal.triplex.total)} / 100`)
  const other = cards.find(c => c.typeId === 'single_family')
  assert.deepEqual([other.status, other.score, other.statusText, other.width, other.depth], ['unscored', null, 'Not scored yet', 8, 12])
  assert.equal(cards.find(c => c.typeId === 'small_apartment').permission.label, 'Needs zoning change')
  assert.equal(cards.find(c => c.typeId === 'townhouse_duplex').label, 'Duplex (2 units)')
  const all = evaluatePlanner({ ...input, scenario: { ...input.scenario, comparisonTypes: BUILDING_IDS } })
  const scored = typologyCards({ draft: input.scenario.draft, options: all.proposal, code: 'TEST', zoning: input.zoning })
  assert.ok(scored.every(c => c.status !== 'unscored'))
  assert.equal(scored.find(c => c.typeId === 'small_apartment').status, 'review', 'a use-table conflict is never shown as a score')
  assert.equal(scored.find(c => c.typeId === 'small_apartment').statusText, 'Not ranked · needs review')
  assert.equal(scored.find(c => c.typeId === 'small_apartment').score, null)
  assert.equal(typologyCards({ draft: input.scenario.draft, options: null, code: 'NONE', zoning: input.zoning })[0].permission.label, 'Zoning unknown')
})

test('quick-size steps stay in range and stories keep the height per floor', () => {
  const draft = optionFor('townhouse_duplex', 1000)
  assert.deepEqual(resizeDraft(draft, 'width', 1), { width: 10 })
  assert.deepEqual(resizeDraft({ ...draft, depth: 14.25 }, 'depth', -1), { depth: 13.3 })
  assert.deepEqual(resizeDraft(draft, 'floors', 1), { floors: 4, height: 14.7 })
  assert.deepEqual(resizeDraft(draft, 'floors', -2), { floors: 1, height: 3.7 })
  assert.equal(resizeDraft({ ...draft, floors: 1 }, 'floors', -1), null)
  assert.equal(resizeDraft({ ...draft, width: 2 }, 'width', -1), null)
  assert.equal(resizeDraft({ ...draft, depth: 100 }, 'depth', 1), null)
  assert.equal(resizeDraft(draft, 'height', 1), null)
  assert.deepEqual(resizeDraft({ ...draft, floors: undefined }, 'floors', 1), { floors: 4, height: 14.7 })
  assert.deepEqual(resizeDraft({ ...draft, height: 99, floors: 20 }, 'floors', 1), { floors: 21, height: 100 })
})

test('rotation wraps and turns an automatic placement into the same exact manual one', () => {
  assert.deepEqual(rotatePlacement({ east: 2, north: -3, bearing: 350 }, 15), { east: 2, north: -3, bearing: 5 })
  assert.deepEqual(rotatePlacement({ east: 2, north: -3, bearing: 5 }, -15), { east: 2, north: -3, bearing: 350 })
  assert.deepEqual(rotatePlacement(null, -15), { east: 0, north: 0, bearing: 345 })
})

test('adding a building resets the draft to automatic placement in one step and pauses the preview until something changes', () => {
  const input = fixture()
  input.scenario.draft = { ...input.scenario.draft, placement: { east: -10, north: -10, bearing: 0 } }
  const building = { id: 'new', pin: 'site', option: input.scenario.draft, targetIncome: 50000, stopId: '' }
  const history = scenarioReducer(historyFor(input.scenario), { type: 'addBuilding', building })
  assert.equal(history.present.draft.placement, null)
  assert.deepEqual(history.present.buildings[0].option.placement, { east: -10, north: -10, bearing: 0 })
  assert.equal(history.past.length, 1)
  const added = { id: 'new', pin: 'site', draft: draftKey(history.present.draft) }
  assert.equal(previewPaused(added, history.present), true)
  assert.equal(previewPaused(null, history.present), false)
  assert.equal(previewPaused(added, { ...history.present, pin: 'other' }), false)
  assert.equal(previewPaused(added, scenarioReducer(history, { type: 'draft', value: { width: 10 } }).present), false)
  assert.equal(previewPaused(added, scenarioReducer(history, { type: 'undo' }).present), false)
  const next = evaluatePlanner({ ...input, scenario: history.present, areaSites: [{ ...building, feature: input.feature, stop: null, existingBuildings: [] }] })
  assert.equal(next.proposal[input.scenario.draft.typeId].massing.collisions, 0, 'the next automatic draft avoids the building just added')
})

test('keyboard nudges are exact cardinal metres and stay bounded', async () => {
  const { nudgePlacement } = await import('./buildControls.js')
  const p = { east: 0, north: 0, bearing: 37 }
  assert.deepEqual(nudgePlacement(p, 'ArrowUp'), { east: 0, north: 1, bearing: 37 })
  assert.deepEqual(nudgePlacement(p, 'ArrowLeft', 5), { east: -5, north: 0, bearing: 37 })
  assert.equal(nudgePlacement({ ...p, east: 2000 }, 'ArrowRight').east, 2000)
  assert.equal(nudgePlacement(p, 'Tab'), null)
})
