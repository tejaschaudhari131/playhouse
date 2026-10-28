import test from 'node:test'
import assert from 'node:assert/strict'
import { selectedDepartures, servicePatch, transitComparisonLabel } from './transitControls.js'
test('selected stop controls never carry additions from a different stop', () => {
  const s = { stopId: 'a', serviceStopId: 'a', additionalDepartures: 60 }
  assert.equal(selectedDepartures(s), 60)
  const other = { ...s, stopId: 'b' }
  assert.equal(selectedDepartures(other), 0)
  assert.deepEqual(servicePatch(other, 0), {})
  assert.deepEqual(servicePatch(other, 30), { additionalDepartures: 30, serviceStopId: 'b' })
  assert.deepEqual(servicePatch(s, 0), { additionalDepartures: 0, serviceStopId: '' })
})
test('walking edits are not described as added service', () => {
  assert.equal(transitComparisonLabel({ additionalDepartures: 0, connections: [{}] }), 'With infrastructure changes')
  assert.equal(transitComparisonLabel({ additionalDepartures: 0 }), 'Current service')
  assert.equal(transitComparisonLabel({ additionalDepartures: 60 }), 'With added service')
})
