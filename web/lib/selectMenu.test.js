import test from 'node:test'
import assert from 'node:assert/strict'
import { matchingOption, optionIndex, selectMenuPosition } from './selectMenu.js'

test('keyboard navigation skips disabled choices and stays within the menu', () => {
  const options = [{}, { disabled: true }, {}, {}]
  assert.equal(optionIndex(options, 0, 1), 2)
  assert.equal(optionIndex(options, 2, -1), 0)
  assert.equal(optionIndex(options, 0, -1), 0)
  assert.equal(optionIndex(options, 3, 1), 3)
  assert.equal(optionIndex(options, 2, 'first'), 0)
  assert.equal(optionIndex(options, 0, 'last'), 3)
  assert.equal(optionIndex([{ disabled: true }], -1, 1), -1)
  assert.equal(optionIndex([], -1, 'first'), -1)
})

test('neighborhood typeahead supports prefixes, repeated-letter cycling, accents and disabled entries', () => {
  const options = ['Hazelwood', 'Shadyside', 'Squirrel Hill North', 'Squirrel Hill South', 'Éast Liberty'].map(text => ({ text }))
  assert.equal(matchingOption(options, 's', 1, true), 2)
  assert.equal(matchingOption(options, 's', 3, true), 1)
  assert.equal(matchingOption(options, 'squirrel hill s', 2), 3)
  assert.equal(matchingOption(options, 'EAST', -1), 4)
  assert.equal(matchingOption(options, 'unmatched', 0), -1)
  assert.equal(matchingOption([{ text: 'Hazelwood', disabled: true }], 'h'), -1)
  assert.equal(matchingOption([], 'h'), -1)
})

test('menu placement fits desktop, bottom drawers and narrow visual viewports', () => {
  const desktop = selectMenuPosition({ left: 800, top: 100, bottom: 144, width: 280 }, { width: 1280, height: 720 })
  assert.deepEqual(desktop, { left: 800, top: 148, width: 280, maxHeight: 320 })
  const bottom = selectMenuPosition({ left: 1000, top: 650, bottom: 694, width: 280 }, { width: 1280, height: 720 })
  assert.equal(bottom.top, 326)
  assert.equal(bottom.left + bottom.width, 1272)
  const mobile = selectMenuPosition({ left: 250, top: 430, bottom: 474, width: 180 }, { width: 320, height: 400, offsetTop: 100 }, 160)
  assert.equal(mobile.width, 240)
  assert.equal(mobile.left, 72)
  assert.equal(mobile.top, 266)
  assert.ok(mobile.top >= 108)
})
