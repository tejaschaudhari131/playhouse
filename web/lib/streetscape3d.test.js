import test from 'node:test'
import assert from 'node:assert/strict'
import { yardPad, frontWalk, treeParts, parkTreePoints, pathTreePoints, yardTreePoints, streetscapeTrees, YARD_TOP_M } from './streetscape3d.js'
import { insetRing, localFrame, pointInRing, ringDistance, signedArea } from './localFrame.js'
import { fitMassing, rectangleAt, geometryArea } from './plannerGeometry.js'

const ORIGIN = [-79.94, 40.41]
const frame = localFrame(ORIGIN)
const LOT = rectangleAt(ORIGIN, 12, 36)

test('a lot gets a raised turf pad and a thin curb on its line', () => {
  const [pad, curb] = yardPad(LOT)
  assert.deepEqual([pad.properties.base, pad.properties.top], [0, YARD_TOP_M])
  assert.equal(curb.properties.part, 'curb')
  assert.equal(curb.geometry.coordinates.length, 2, 'curb is a ring')
  const width = (geometryArea(LOT) - geometryArea({ type: 'Polygon', coordinates: [curb.geometry.coordinates[1]] })) / (2 * (12 + 36))
  assert.ok(Math.abs(width - .3) < .02, `curb ${width} m`)
  assert.deepEqual(yardPad(null), [])
})

test('a paved walk runs from the front edge to the nearer lot line', () => {
  const house = fitMassing(LOT, 8, 12, { east: 0, north: -10, bearing: 0 })
  const walk = frontWalk(house.geometry, LOT)
  assert.ok(Math.abs(geometryArea(walk.geometry) - 1.2 * 2) < .05, 'reach 2 m × 1.2 m wide')
  assert.ok(walk.properties.top > YARD_TOP_M, 'paving sits on the turf')
  assert.equal(frontWalk(house.geometry, null), null)
})

test('trees: octagonal trunk under two layered canopies', () => {
  const parts = treeParts(frame, [0, 0])
  assert.deepEqual(parts.map(p => [p.properties.part, p.properties.base, p.properties.top]), [['trunk', 0, 2.2], ['canopy', 2.2, 5.5], ['canopy', 3.5, 6.8]])
  assert.ok(parts.every(p => p.geometry.coordinates[0].length === 9), 'eight sides, closed')
})

test('park trees stay inside the park; path trees alternate sides at a steady spacing', () => {
  const park = rectangleAt(ORIGIN, 60, 40), ring = park.coordinates[0].map(frame.project)
  const points = parkTreePoints(frame, park)
  assert.ok(points.length >= 12 && points.length <= 36)
  assert.ok(points.every(p => pointInRing(p, ring) && ringDistance(p, ring) >= 2.5))
  const line = [frame.unproject([0, 0]), frame.unproject([100, 0])]
  const along = pathTreePoints(frame, line)
  assert.equal(along.length, 7)
  assert.ok(along.every((p, i) => Math.abs(Math.abs(p[1]) - 4.5) < 1e-6 && Math.sign(p[1]) === (i % 2 ? -1 : 1)))
  assert.ok(Math.abs(along[1][0] - along[0][0] - 14) < 1e-6)
})

test('yard trees stay clear of buildings and the lot line, a few metres apart', () => {
  const house = fitMassing(LOT, 8, 12, { east: 0, north: 0, bearing: 0 })
  const points = yardTreePoints(frame, LOT, [house.geometry])
  const ring = LOT.coordinates[0].map(frame.project), footprint = house.geometry.coordinates[0].map(frame.project)
  assert.ok(points.length >= 2 && points.length <= 3)
  assert.ok(points.every(p => ringDistance(p, ring) >= 2 && !pointInRing(p, footprint) && ringDistance(p, footprint) >= 3.2))
  assert.ok(points.every((p, i) => points.every((q, j) => i === j || Math.hypot(p[0] - q[0], p[1] - q[1]) >= 6)))
  const full = fitMassing(LOT, 11.5, 35.5, { east: 0, north: 0, bearing: 0 })
  assert.deepEqual(yardTreePoints(frame, LOT, [full.geometry]), [], 'no room, no tree')
})

test('streetscape trees combine parks, paths and lots under a cap', () => {
  const trees = streetscapeTrees({ parks: [rectangleAt(ORIGIN, 60, 40)], paths: [[ORIGIN, [ORIGIN[0] + .001, ORIGIN[1]]]], lots: [{ parcel: LOT, footprints: [] }], max: 10 })
  assert.equal(trees.length, 30, '10 trees × 3 parts')
})

test('per-edge inset keeps every vertex at its distance and rejects collapse', () => {
  const ring = [[0, 0], [10, 0], [10, 30], [0, 30]]
  const inset = insetRing(ring, i => i % 2 ? 1 : 3)
  assert.ok(Math.abs(signedArea(inset) - 8 * 24) < 1e-6)
  assert.equal(insetRing(ring, () => 6), null, 'a 10 m wide lot cannot lose 6 m on both sides')
  const notch = [[0, 0], [20, 0], [20, 20], [12, 20], [12, 8], [8, 8], [8, 20], [0, 20]]
  assert.equal(insetRing(notch, () => 4.5), null, 'arms narrower than twice the inset are refused')
  assert.ok(insetRing(notch, () => 2.5), 'a U-shaped inset around the notch is kept')
  assert.ok(insetRing([[0, 0], [0, 10], [5, 10], [10, 10], [10, 0]], () => 1), 'collinear vertices and either winding are accepted')
})
