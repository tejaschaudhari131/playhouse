import test from 'node:test'
import assert from 'node:assert/strict'
import { sharedHouseholdInputs, sharedCapacityInputs, customRentInputs, restoredBuildingInputs } from './scenarioAssumptions.js'
import { initialStudioScenario, scenarioReducer, historyFor } from './plannerState.js'
import { validatePlan } from './planPersistence.js'
test('moving a custom or legacy plan between sites keeps inputs valid without optional metadata', () => {
  const old = initialStudioScenario('0056F00338000000')
  old.rentMode = 'custom'; old.draft.rent = 1587.25
  for (const key of ['rentRange','rentSourceDetail','rentSource']) delete old.draft[key]
  for (const key of ['incomeBand','incomeSource']) delete old[key]
  const next = initialStudioScenario('0056F00278000000')
  Object.assign(next, sharedHouseholdInputs(old))
  Object.assign(next.draft, customRentInputs(old.draft))
  assert.equal(validatePlan(next), null)
  assert.equal(next.draft.rent, 1587.25)
  assert.equal(next.draft.rentRange, null)
})
test('replacing an unreviewed building preserves excluded costs even when current draft includes costs', () => {
  const current = initialStudioScenario('0056F00338000000')
  const building = { option: { ...current.draft }, targetIncome: 40000, stopId: '', affordabilityConfirmation: null }
  const next = scenarioReducer(historyFor(current), { type:'patch', value: restoredBuildingInputs(building) }).present
  assert.equal(next.affordabilityAuto, false)
  assert.equal(next.affordabilityConfirmation, null)
  assert.equal(next.incomeSource, 'legacy')
  assert.equal(validatePlan(next), null)
})

test('moving an older imported plan preserves manual unknown capacity and remains saveable', () => {
  const old = initialStudioScenario('0056F00338000000')
  delete old.capacityMode; delete old.baselinePlacesPerDeparture
  const next = { ...initialStudioScenario('0056F00278000000'), ...sharedCapacityInputs(old) }
  assert.equal(validatePlan(next), null)
  assert.equal(next.capacityMode, 'manual')
  assert.equal(next.baselinePlacesPerDeparture, 0)
})

test('same-area selection preserves optional imported access and excluded costs', () => {
  const old = initialStudioScenario('0056F00338000000')
  for (const key of ['stopId', 'serviceStopId', 'capacityStopId', 'affordabilityAuto']) delete old[key]
  old.accessMode = 'direct'; old.affordabilityConfirmation = null
  assert.equal(validatePlan(old), null)
  const next = { ...initialStudioScenario('0056F00278000000'), ...sharedHouseholdInputs(old), ...sharedCapacityInputs(old) }
  assert.equal(validatePlan(next), null)
  assert.equal(next.accessMode, 'direct')
  assert.equal(next.affordabilityAuto, false)
  assert.equal(next.serviceStopId, '')
  assert.equal(next.capacityStopId, '')
})
