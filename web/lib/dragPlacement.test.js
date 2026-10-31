import test from 'node:test'
import assert from 'node:assert/strict'
import { DRAG_THRESHOLD_PX, startDrag, dragMoved, dragPlacement, placementCenter, dropVerdict, obstaclesExcept } from './dragPlacement.js'
import { fitMassing, geometryCenter, placementAt, rectangleAt } from './plannerGeometry.js'
import { historyFor, scenarioReducer } from './plannerState.js'

const near = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`)
const center = [-79.94, 40.44]
const x = 111320 * Math.cos(center[1] * Math.PI / 180)
const at = (east, north) => [center[0] + east / x, center[1] + north / 111320]
const parcel = rectangleAt(center, 30, 40)

test('a press only becomes a drag past the pixel threshold, and stays one', () => {
  const state = startDrag({ kind: 'draft', pin: 'P', pointer: center, px: [100, 100], placement: { east: 0, north: 0, bearing: 0 }, parcel })
  assert.equal(dragMoved(state, [102, 101]), false)
  assert.equal(dragMoved(state, [100 + DRAG_THRESHOLD_PX, 100]), true)
  assert.equal(dragMoved({ ...state, moved: true }, [100, 100]), true)
  assert.equal(dragMoved(null, [0, 0]), false)
  assert.equal(startDrag({ kind: 'draft', pointer: center, px: [0, 0], placement: null, parcel }), null)
  assert.equal(startDrag({ kind: 'draft', pointer: center, px: [0, 0], placement: { east: 0, north: 0 }, parcel: null }), null)
})

test('dragging keeps the grab offset and bearing, in metres from the parcel centre', () => {
  const state = startDrag({ kind: 'placed', id: 'b1', pin: 'P', pointer: at(3, 2), px: [0, 0], placement: { east: 1, north: -4, bearing: 30 }, parcel })
  const moved = dragPlacement(state, at(8, -1))
  near(moved.east, 6, 1e-6, 'east = 1 + (8 − 3)')
  near(moved.north, -7, 1e-6, 'north = −4 + (−1 − 2)')
  assert.equal(moved.bearing, 30)
  const snapped = dragPlacement(state, at(8.3, -1.1), .5)
  assert.deepEqual([snapped.east, snapped.north], [6.5, -7])
  const still = dragPlacement(state, at(3, 2))
  near(still.east, 1, 1e-9, 'no movement')
  near(still.north, -4, 1e-9, 'no movement')
})

test('placementCenter inverts placementAt', () => {
  const point = at(5, -7), placement = placementAt(parcel, point, 15)
  const back = placementCenter(parcel, placement)
  near(back[0], point[0], 1e-12, 'lon')
  near(back[1], point[1], 1e-12, 'lat')
  assert.equal(placementCenter(null, placement), null)
  assert.deepEqual(placementCenter(parcel, { east: 0, north: 0 }), geometryCenter(parcel))
})

test('drops inside the lot are accepted; drops across the boundary or onto a neighbour are refused', () => {
  const state = startDrag({ kind: 'draft', pin: 'P', pointer: center, px: [0, 0], placement: { east: 0, north: 0, bearing: 0 }, parcel })
  const neighbour = { id: 'other', geometry: rectangleAt(at(0, 12), 8, 8) }
  const fit = pointer => fitMassing(parcel, 10, 10, dragPlacement(state, pointer, .5), [neighbour])
  assert.deepEqual(dropVerdict(fit(at(0, -10))), { ok: true, reason: null })
  assert.match(dropVerdict(fit(at(14, 0))).reason, /parcel boundary/)
  assert.match(dropVerdict(fit(at(0, 9))).reason, /overlaps/)
  assert.equal(dropVerdict(fit(at(0, 9)), { allowCollisions: true }).ok, true, 'the draft may land on a building it could replace')
  assert.equal(dropVerdict(fit(at(14, 0)), { allowCollisions: true }).ok, false, 'but never across the boundary')
  assert.equal(dropVerdict(null).ok, false)
  assert.equal(dropVerdict({ geometry: parcel, fits: true, collisions: null }).ok, true, 'unknown obstacles do not block; evaluation still checks')
})

test('a moving building is not its own obstacle', () => {
  const obstacles = [{ id: 'a', geometry: parcel }, { id: 'b', geometry: parcel }, { geometry: parcel }]
  assert.equal(obstaclesExcept(obstacles, 'a').length, 2)
  assert.equal(obstaclesExcept(null, 'a'), null)
})

test('moveBuilding updates one placed building with an undo step', () => {
  const building = { id: 'b1', pin: 'P', option: { typeId: 'duplex', placement: { east: 0, north: 0, bearing: 0 } } }
  const other = { id: 'b2', pin: 'P', option: { typeId: 'duplex', placement: { east: 5, north: 5, bearing: 0 } } }
  const state = historyFor({ pin: 'P', buildings: [building, other] })
  const next = scenarioReducer(state, { type: 'moveBuilding', id: 'b1', placement: { east: 3, north: -2, bearing: 0 } })
  assert.deepEqual(next.present.buildings[0].option.placement, { east: 3, north: -2, bearing: 0 })
  assert.equal(next.present.buildings[1], other)
  assert.equal(next.past.length, 1)
  assert.equal(scenarioReducer(next, { type: 'undo' }).present.buildings[0].option.placement.east, 0)
  assert.equal(scenarioReducer(state, { type: 'moveBuilding', id: 'missing', placement: { east: 1, north: 1, bearing: 0 } }), state)
  assert.equal(scenarioReducer(state, { type: 'moveBuilding', id: 'b1', placement: { east: 0, north: 0, bearing: 0 } }), state, 'same spot adds no undo step')
})
