import test from 'node:test'
import assert from 'node:assert/strict'
import { draftStatus } from './plannerStatus.js'

const evaluated = { eligible: true, physicalEligible: true, total: 75.3, titleNine: { conflict: false, excluded: ['frontage', 'parking'] } }
test('zero priorities and missing shared evidence are ranking states, not placement blockers', () => {
  const noScore = { ...evaluated, total: null }
  const zero = draftStatus({ evaluated: noScore, proposal: noScore, weights: { physical: 0 } })
  assert.equal(zero.title, 'No score')
  assert.equal(zero.canPlace, true)
  assert.match(zero.detail, /All priorities are off/)
  const absent = draftStatus({ evaluated: noScore, proposal: noScore, weights: { affordability: 50 } })
  assert.match(absent.detail, /No weighted factor has shared evidence/)
  assert.equal(absent.canPlace, true)
})
test('unknown zoning remains qualified; supported conflicts and physical blockers prevent placement', () => {
  const qualified = draftStatus({ evaluated, proposal: evaluated, weights: { physical: 50 } })
  assert.equal(qualified.title, '75.3 / 100')
  assert.match(qualified.placement, /2 zoning checks unassessed/)
  for (const proposal of [{ ...evaluated, physicalEligible: false, gate: 'Does not fit' }, { ...evaluated, titleNine: { conflict: true }, gate: 'Zoning conflict' }]) assert.equal(draftStatus({ evaluated, proposal, weights: {} }).canPlace, false)
  assert.equal(draftStatus({ evaluated, proposal: evaluated, weights: {}, infrastructureErrors: ['bad node'] }).canPlace, false)
})
test('pending and error states cannot expose an old score or permit placement', () => {
  assert.deepEqual(draftStatus({ evaluated, proposal: evaluated, pending: true }), { title: 'Checking…', detail: 'Calculating fit and tradeoffs', placement: 'Checking placement…', canPlace: false })
  assert.equal(draftStatus({ evaluated, proposal: evaluated, error: 'Worker stopped' }).title, 'Results unavailable')
})
