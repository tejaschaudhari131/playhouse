import test from 'node:test'
import assert from 'node:assert/strict'
import { housingCostInputs, housingCostBurden } from './housingCosts.js'
import { initialStudioScenario, optionFor, historyFor, scenarioReducer } from './plannerState.js'
import { rectangleAt } from './plannerGeometry.js'
import { evaluatePlanner } from './plannerModel.js'

test('in explicit mode (plans saved before live mode), Census costs remain context until the exact assumptions are confirmed', () => {
  const { affordabilityAuto, ...state } = initialStudioScenario('site', { median_gross_rent: 643, median_income: 40000 })
  state.affordabilityConfirmation = null
  assert.equal(affordabilityAuto, true)
  assert.equal(housingCostBurden(state, state.draft).score, null)
  assert.equal(housingCostBurden(state, state.draft).burden, 643 * 12 / 40000)
  state.affordabilityConfirmation = housingCostInputs(state, state.draft)
  assert.equal(housingCostBurden(state, state.draft).score, 100)
  for (const key of ['rent', 'utilities']) assert.equal(housingCostBurden(state, { ...state.draft, [key]: state.draft[key] + 1 }).score, null)
  assert.equal(housingCostBurden({ ...state, targetIncome: 50000 }, state.draft).score, null)
  assert.equal(housingCostBurden({ ...state, targetIncome: 0 }, state.draft).burden, null)
  assert.equal(housingCostBurden(state, { ...state.draft, rent: -1 }).burden, null)
  assert.equal(housingCostBurden(state, state.draft).score, 100, 'Undo to confirmed values restores the original calculation')
})

test('cost confirmation does not certify financial viability and uses the disclosed preference anchors', () => {
  for (const [monthly, score] of [[1000, 100], [1500, 200 / 3], [2500, 0]]) {
    const state = { targetIncome: 60000 }, option = { rent: monthly - 150, utilities: 150 }
    state.affordabilityConfirmation = housingCostInputs(state, option)
    assert.ok(Math.abs(housingCostBurden(state, option).score - score) < 1e-8)
  }
})

test('each placed building retains its own confirmation; the current draft cannot confirm older costs', () => {
  const feature = { type: 'Feature', geometry: rectangleAt([-79.94, 40.41], 150, 150), properties: { pin: 'site', lot_sqft: 240000, zoning_code: 'RM-VH', scores: { townhouse_duplex: { demand: 70 } } } }
  const zoning = { districts: { 'RM-VH': { use_table_read: true, use_rows: { 'Two-Unit': 'P' } } } }
  const scenario = initialStudioScenario('site')
  scenario.affordabilityConfirmation = housingCostInputs(scenario, scenario.draft)
  const site = { id: 'placed', feature, existingBuildings: [], stop: null, targetIncome: 30000, option: { ...optionFor('townhouse_duplex', 700), placement: { east: -50, north: 0, bearing: 0 } } }
  const run = () => evaluatePlanner({ feature, zoning, scenario, stop: null, existingBuildings: [], areaSites: [site] })
  assert.equal(run().committed.proposal[0].scores.affordability, null)
  assert.ok(!run().included.includes('affordability'), 'portfolio excludes a factor without complete shared evidence')
  site.affordabilityConfirmation = housingCostInputs(site, site.option)
  assert.ok(Number.isFinite(run().committed.proposal[0].scores.affordability))
  assert.ok(run().included.includes('affordability'))
  scenario.affordabilityConfirmation = null
  assert.ok(Number.isFinite(run().committed.proposal[0].scores.affordability), 'placed assumption does not depend on the current draft')
  assert.ok(!run().included.includes('affordability'))
})

test('live mode keeps housing costs in the score through rent, utility, income and AMI edits, and one switch covers the plan', () => {
  const start = initialStudioScenario('site', { median_gross_rent: 643, median_income: 40000 })
  assert.equal(start.affordabilityAuto, true)
  assert.deepEqual(start.affordabilityConfirmation, { targetIncome: 40000, rent: 493, utilities: 150 })
  assert.equal(housingCostBurden(start, start.draft).score, 100)
  let history = historyFor(start)
  const step = action => { history = scenarioReducer(history, action); return history.present }
  for (const action of [{ type: 'draft', value: { rent: 1100 } }, { type: 'draft', value: { utilities: 175 } }, { type: 'set', key: 'targetIncome', value: 58650 }, { type: 'patch', value: { targetIncome: 41950 } }]) {
    const state = step(action)
    assert.equal(housingCostBurden(state, state.draft).confirmed, true, JSON.stringify(action))
  }
  assert.equal(history.past.length, 4, 'confirmation follows each edit inside the same undo step')
  assert.deepEqual(history.present.affordabilityConfirmation, { targetIncome: 41950, rent: 1100, utilities: 175 })
  const placed = { id: 'b', pin: 'site', option: history.present.draft, targetIncome: 41950, affordabilityConfirmation: history.present.affordabilityConfirmation, stopId: '' }
  step({ type: 'addBuilding', building: placed })
  const legacy = { id: 'old', pin: 'site', option: optionFor('single_family', 900), targetIncome: 30000, affordabilityConfirmation: null, stopId: '' }
  step({ type: 'patch', value: { buildings: [...history.present.buildings, legacy] } })
  let state = step({ type: 'housingCosts', include: false })
  assert.equal(state.affordabilityAuto, false)
  assert.equal(state.affordabilityConfirmation, null)
  assert.ok(state.buildings.every(b => b.affordabilityConfirmation === null))
  state = step({ type: 'draft', value: { rent: 1200 } })
  assert.equal(state.affordabilityConfirmation, null, 'excluded stays excluded after edits')
  state = step({ type: 'housingCosts', include: true })
  assert.deepEqual(state.affordabilityConfirmation, { targetIncome: 41950, rent: 1200, utilities: 175 })
  assert.deepEqual(state.buildings.map(b => b.affordabilityConfirmation), [{ targetIncome: 41950, rent: 1100, utilities: 175 }, { targetIncome: 30000, rent: 900, utilities: 150 }])
  state = step({ type: 'set', key: 'targetIncome', value: 0 })
  assert.equal(state.affordabilityConfirmation, null, 'invalid inputs are never confirmed')
  assert.equal(scenarioReducer(history, { type: 'housingCosts', include: true }), history, 'no-op when already on')
  history = scenarioReducer(history, { type: 'undo' })
  assert.deepEqual(history.present.affordabilityConfirmation, { targetIncome: 41950, rent: 1200, utilities: 175 })
})

test('legacy plans without the live-mode flag keep their exact confirmation behaviour', () => {
  const { affordabilityAuto, ...legacy } = initialStudioScenario('site', { median_gross_rent: 643, median_income: 40000 })
  legacy.affordabilityConfirmation = null
  const history = historyFor(legacy)
  const edited = scenarioReducer(history, { type: 'draft', value: { rent: 700 } }).present
  assert.equal(edited.affordabilityConfirmation, null)
  assert.equal(edited.affordabilityAuto, undefined)
  const confirmed = scenarioReducer(history, { type: 'set', key: 'affordabilityConfirmation', value: housingCostInputs(legacy, legacy.draft) }).present
  assert.equal(scenarioReducer(historyFor(confirmed), { type: 'draft', value: { rent: 700 } }).present.affordabilityConfirmation, confirmed.affordabilityConfirmation)
})
