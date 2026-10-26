import test from 'node:test'
import assert from 'node:assert/strict'
import { housingCostInputs, housingCostBurden } from './housingCosts.js'
import { initialStudioScenario, optionFor } from './plannerState.js'
import { rectangleAt } from './plannerGeometry.js'
import { evaluatePlanner } from './plannerModel.js'

test('starting Census costs remain context until the exact assumptions are confirmed', () => {
  const state = initialStudioScenario('site', { median_gross_rent: 643, median_income: 40000 })
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
