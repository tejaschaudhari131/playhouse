import test from 'node:test'
import assert from 'node:assert/strict'
import { commitNumber } from './numberInput.js'

test('out-of-range corrections are explicit and integer stories reject decimals', () => {
  assert.deepEqual(commitNumber('99', { label: 'Stories', min: 1, max: 60, integer: true }), { valid: true, value: 60, message: 'Adjusted to 60. Allowed range: 1–60.' })
  assert.equal(commitNumber('2.5', { label: 'Stories', min: 1, max: 60, integer: true }).valid, false)
  assert.equal(commitNumber('0', { label: 'Rent', min: 1, max: 10000, rejectRange: true }).valid, false)
  assert.equal(commitNumber('-100', { label: 'Income', min: 5000, max: 500000, rejectRange: true }).valid, false)
  assert.equal(commitNumber('1000', { min: 5000, rejectRange: true }).valid, false)
  assert.deepEqual(commitNumber('-10', { min: 0 }), { valid: true, value: 0, message: 'Adjusted to 0. Allowed range: 0–100,000.' })
})

test('optional unknown, exact fractional values and invalid numbers stay distinct', () => {
  assert.deepEqual(commitNumber('', { nullable: true }), { valid: true, value: null, message: '' })
  assert.equal(commitNumber('').valid, false)
  assert.equal(commitNumber('Infinity').valid, false)
  assert.equal(commitNumber('not a number').valid, false)
  assert.deepEqual(commitNumber('12.75', { step: .5 }), { valid: true, value: 12.75, message: '' })
  assert.deepEqual(commitNumber('-4.5', { min: -2000, max: 2000 }), { valid: true, value: -4.5, message: '' })
})
