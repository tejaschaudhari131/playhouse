import test from 'node:test'
import assert from 'node:assert/strict'
import { TYPE_MINIMUMS, fitDiagnosis, fitSummary, fitToLot, lotDimensions } from './lotFit.js'
import { fitMassing, rectangleAt } from './plannerGeometry.js'
import { optionFor } from './plannerState.js'

// 4822 Chatsworth Ave (0056F00332000000): a 2,441 sq ft, ~7 m wide Hazelwood lot.
const CHATSWORTH = { type: 'Polygon', coordinates: [[[-79.943552, 40.410896], [-79.943581, 40.410955], [-79.943905, 40.410853], [-79.943872, 40.410795], [-79.943552, 40.410896]]] }

test('lot dimensions use the oriented outline, not the map bounding box', () => {
  const lot = lotDimensions(CHATSWORTH)
  assert.ok(lot.width > 6.5 && lot.width < 7.5, `width ${lot.width}`)
  assert.ok(lot.depth > 29 && lot.depth < 30.5, `depth ${lot.depth}`)
  assert.ok(lot.areaM2 > 200 && lot.areaM2 < 230)
  const square = lotDimensions(rectangleAt([-79.94, 40.41], 20, 30))
  assert.equal(square.width, 20)
  assert.equal(square.depth, 30)
  assert.equal(lotDimensions(null), null)
})

test('a default duplex on the Chatsworth lot reports the failed width and fits after one click', () => {
  const duplex = optionFor('townhouse_duplex', 900)
  const massing = fitMassing(CHATSWORTH, duplex.width, duplex.depth)
  assert.equal(massing.fits, false)
  const diagnosis = fitDiagnosis(duplex, CHATSWORTH, massing)
  assert.deepEqual(diagnosis.reasons.map(r => r.id), ['width'])
  assert.match(diagnosis.reasons[0].text, /9 m across; the lot is about 7 m wide/)
  const fit = fitToLot({ option: duplex, geometry: CHATSWORTH })
  assert.ok(fit.width >= TYPE_MINIMUMS.townhouse_duplex.width && fit.width < 7)
  assert.ok(fit.depth > duplex.depth, 'a slimmer footprint grows deeper to keep floor area')
  assert.ok(fit.width * fit.depth <= duplex.width * duplex.depth)
  assert.equal(fitMassing(CHATSWORTH, fit.width, fit.depth).fits, true)
  assert.equal(fit.changed, true)
  assert.match(fitSummary(fit, duplex), /was 9 × 14 m.*Stories and height are unchanged/)
})

test('fit respects a lot-coverage cap and type minimums, and never invents a fit', () => {
  const duplex = optionFor('townhouse_duplex', 900)
  const capped = fitToLot({ option: duplex, geometry: CHATSWORTH, maxFootprintM2: 80 })
  assert.ok(capped.width * capped.depth <= 80)
  const large = optionFor('large_apartment', 900)
  assert.equal(fitToLot({ option: large, geometry: CHATSWORTH }), null)
  assert.match(fitSummary(null, large), /No 15 × 20 m or larger footprint/)
})

test('fit prefers a position clear of retained buildings and reports overlaps it cannot avoid', () => {
  const duplex = optionFor('townhouse_duplex', 900)
  const clear = fitToLot({ option: duplex, geometry: CHATSWORTH, obstacles: [] })
  assert.equal(clear.collisions, 0)
  const covering = { geometry: rectangleAt([-79.94373, 40.410875], 60, 60) }
  const blocked = fitToLot({ option: duplex, geometry: CHATSWORTH, obstacles: [covering] })
  assert.equal(blocked.collisions, 1)
  assert.match(fitSummary(blocked, duplex), /still overlaps 1 existing building/)
})

test('a fitting draft has no diagnosis; a manual position is named as the cause', () => {
  const single = optionFor('single_family', 900)
  const fits = fitMassing(CHATSWORTH, 5, 9)
  assert.equal(fitDiagnosis({ ...single, width: 5, depth: 9 }, CHATSWORTH, fits), null)
  const manual = { ...single, width: 5, depth: 9, placement: { east: 40, north: 0, bearing: 0 } }
  const diagnosis = fitDiagnosis(manual, CHATSWORTH, fitMassing(CHATSWORTH, 5, 9, manual.placement))
  assert.equal(diagnosis.reasons[0].id, 'manual')
  assert.equal(fitToLot({ option: manual, geometry: CHATSWORTH }).changed, true)
})
