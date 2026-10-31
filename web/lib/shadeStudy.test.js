import test from 'node:test'
import assert from 'node:assert/strict'
import { analysisWindow, studyTimes, maxShadowLength, shadeBounds, samplePoints, shadeStudy, shadeFeatures, formatHours, SHADE_STEP_H } from './shadeStudy.js'
import { daylight } from './sunShadows.js'
import { rectangleAt } from './plannerGeometry.js'

const near = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`)
const origin = [-79.94, 40.44]
const at = (east, north) => [origin[0] + east / (111320 * Math.cos(origin[1] * Math.PI / 180)), origin[1] + north / 111320]
const parcel = (pin, east, north, size = 20) => ({ type: 'Feature', properties: { pin, address: `${pin} St` }, geometry: rectangleAt(at(east, north), size, size) })
const tower = { geometry: rectangleAt(origin, 10, 10), height: 20, pin: 'SITE' }
const parcels = [parcel('SITE', 0, 0), parcel('NORTH', 0, 20), parcel('SOUTH', 0, -20), parcel('EAST', 20, 0), parcel('WEST', -20, 0), parcel('NORTHWEST', -20, 20), parcel('NORTHEAST', 20, 20), parcel('FAR', 0, 600)]

test('CEQR window: 1.5 h after sunrise to 1.5 h before sunset, sampled at step midpoints', () => {
  const winter = analysisWindow(40.44, -23.44), day = daylight(40.44, -23.44)
  near(winter.start, day.sunrise + 1.5, 1e-9, 'start')
  near(winter.end - winter.start, day.length - 3, 1e-9, 'window length')
  const times = studyTimes({ start: 9, end: 10 }, .25)
  assert.deepEqual(times, [9.125, 9.375, 9.625, 9.875])
})

test('the longest shadow in the window is a winter one and bounds cover it', () => {
  const winter = maxShadowLength([tower], { season: 'winter' }), summer = maxShadowLength([tower], { season: 'summer' })
  assert.ok(winter > summer, `winter ${winter} m vs summer ${summer} m`)
  assert.ok(winter > 60 && winter < 120, `20 m tower casts ${winter} m at the edge of the winter window`)
  const bounds = shadeBounds([tower], { season: 'winter' })
  assert.ok(bounds[3] - origin[1] > winter / 111320, 'bounds reach the longest shadow')
  assert.equal(shadeBounds([], {}), null)
})

test('sample points stay inside the lot and scale with its area', () => {
  const ring = [[0, 0], [20, 0], [20, 10], [0, 10]], points = samplePoints(ring, 50)
  assert.ok(points.length >= 40 && points.length <= 60, `${points.length} points`)
  assert.ok(points.every(([x, y]) => x > 0 && x < 20 && y > 0 && y < 10))
  assert.equal(samplePoints([[0, 0], [.1, 0], [0, .1]]).length, 1, 'a sliver still gets one point')
})

test('a tower shades its northern neighbour longest in winter and never shades its own lot or the south one', () => {
  const winter = shadeStudy({ buildings: [tower], parcels, season: 'winter' })
  const summer = shadeStudy({ buildings: [tower], parcels, season: 'summer' })
  const pins = study => study.neighbours.map(n => n.pin)
  assert.ok(!pins(winter).includes('SITE'), 'own parcel excluded')
  assert.ok(!pins(winter).includes('SOUTH'), 'shadows fall away from the southern sun')
  assert.ok(!pins(winter).includes('FAR'), '600 m away is out of reach')
  assert.equal(winter.neighbours[0].pin, 'NORTH')
  const north = s => s.neighbours.find(n => n.pin === 'NORTH')?.hours ?? 0
  assert.ok(north(winter) > north(summer), `winter ${north(winter)} h vs summer ${north(summer)} h`)
  assert.ok(north(winter) <= winter.window.end - winter.window.start + 1e-9, 'never more than the window')
  for (const n of winter.neighbours) assert.equal(n.hours / SHADE_STEP_H % 1, 0, 'hours count whole samples')
  const west = winter.neighbours.find(n => n.pin === 'NORTHWEST'), east = winter.neighbours.find(n => n.pin === 'NORTHEAST')
  assert.ok(west.first < 12 && west.last <= 12.5, 'morning shadows fall west')
  assert.ok(east.first >= 11.5, 'afternoon shadows fall east')
  assert.equal(winter.season, 'winter')
})

test('stricter coverage, short buildings and empty input', () => {
  const loose = shadeStudy({ buildings: [tower], parcels, season: 'equinox', coverage: .01 })
  const strict = shadeStudy({ buildings: [tower], parcels, season: 'equinox', coverage: .6 })
  const hours = s => s.neighbours.reduce((sum, n) => sum + n.hours, 0)
  assert.ok(hours(strict) < hours(loose))
  const shed = shadeStudy({ buildings: [{ ...tower, height: 2 }], parcels, season: 'summer' })
  assert.ok(hours(shed) < hours(shadeStudy({ buildings: [tower], parcels, season: 'summer' })))
  assert.equal(shadeStudy({ buildings: [], parcels }), null)
  assert.equal(shadeStudy({ buildings: [{ ...tower, height: 0 }], parcels }), null)
})

test('map features carry hours and labels; formatting', () => {
  const study = shadeStudy({ buildings: [tower], parcels, season: 'winter' })
  const features = shadeFeatures(study, parcels)
  assert.equal(features.length, study.neighbours.length)
  assert.equal(features[0].properties.pin, 'NORTH')
  assert.equal(typeof features[0].properties.hours, 'number')
  assert.deepEqual(shadeFeatures(null, parcels), [])
  assert.equal(formatHours(.25), '15 min')
  assert.equal(formatHours(2), '2 h')
  assert.equal(formatHours(2.75), '2 h 45 min')
})
