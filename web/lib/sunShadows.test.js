import test from 'node:test'
import assert from 'node:assert/strict'
import { SUN_TIMES, SEASONS, sunPosition, sunFor, shadowVector, shadowPolygon, buildingShadows, convexHull, sunLight, daylight, normalizeSun, formatSolarHour, seasonFor } from './sunShadows.js'
import { rectangleAt, geometryArea } from './plannerGeometry.js'

const near = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`)

test('equinox sun over Pittsburgh: east in the morning, south and highest at noon, west in the afternoon', () => {
  const morning = sunFor('morning'), noon = sunFor('noon'), afternoon = sunFor('afternoon')
  near(noon.altitude, 90 - 40.44, .01, 'noon altitude = 90° − latitude')
  near(noon.azimuth, 180, .01, 'noon azimuth')
  near(morning.altitude, 32.6, .2, 'morning altitude')
  near(morning.azimuth, 123, 1, 'morning azimuth')
  near(afternoon.azimuth, 360 - morning.azimuth, 1e-6, 'afternoon mirrors morning')
  assert.deepEqual(SUN_TIMES.map(t => t.id), ['morning', 'noon', 'afternoon'])
  assert.equal(sunFor('unknown').id, 'noon')
  near(sunPosition(40.44, 12, 23.44).altitude, 73, .1, 'summer solstice noon')
})

test('shadows fall away from the sun with length height ÷ tan(altitude)', () => {
  const noon = sunFor('noon'), [dx, dy] = shadowVector(10, noon)
  near(dx, 0, 1e-9, 'noon shadow has no east-west offset')
  near(dy, 10 / Math.tan(noon.altitude * Math.PI / 180), 1e-9, 'noon shadow points north')
  const [mx] = shadowVector(10, sunFor('morning'))
  assert.ok(mx < 0, 'morning shadows point west')
  assert.deepEqual(shadowVector(0, noon), [0, 0])
  assert.deepEqual(shadowVector(10, { altitude: 0, azimuth: 90 }), [0, 0], 'no shadow at or below the horizon')
})

test('a box shadow covers its footprint plus the swept roof outline', () => {
  const footprint = rectangleAt([-79.94, 40.41], 10, 10), noon = sunFor('noon')
  const shadow = shadowPolygon(footprint, 8, noon)
  const length = 8 / Math.tan(noon.altitude * Math.PI / 180)
  near(geometryArea(shadow), 100 + 10 * length, 1, 'swept area')
  assert.ok(geometryArea(shadowPolygon(footprint, 16, noon)) > geometryArea(shadow), 'taller buildings cast longer shadows')
  assert.equal(shadowPolygon(null, 8, noon), null)
  const features = buildingShadows([{ geometry: footprint, height: 8, kind: 'proposed' }, { geometry: footprint, height: 0 }], noon)
  assert.equal(features.length, 1)
  assert.equal(features[0].properties.kind, 'proposed')
})

test('seasonal noon sun: 90° − latitude ± 23.44° declination, always due south at Pittsburgh', () => {
  assert.deepEqual(SEASONS.map(s => s.id), ['winter', 'equinox', 'summer'])
  const winter = sunFor({ season: 'winter', hour: 12 }), summer = sunFor({ season: 'summer', hour: 12 })
  near(winter.altitude, 90 - 40.44 - 23.44, .01, 'winter solstice noon altitude')
  near(summer.altitude, 90 - 40.44 + 23.44, .01, 'summer solstice noon altitude')
  near(winter.azimuth, 180, .01, 'winter noon azimuth')
  near(summer.azimuth, 180, .01, 'summer noon azimuth')
  assert.equal(winter.season, 'winter')
  assert.equal(winter.id, 'noon')
  const june9 = sunFor({ season: 'summer', hour: 9 }), dec9 = sunFor({ season: 'winter', hour: 9 })
  assert.ok(june9.altitude > dec9.altitude + 25, 'June morning sun is far higher')
  assert.ok(june9.azimuth < dec9.azimuth, 'June morning sun is further north of east')
  assert.ok(sunPosition(40.44, 6, 23.44).azimuth < 90, 'June sunrise is north of east')
  assert.ok(sunPosition(40.44, 15, -23.44).azimuth < 270 - 25, 'December afternoon sun stays south of west')
})

test('daylight: 12 h at the equinox, about 9.1 h and 14.9 h at the solstices', () => {
  near(daylight(40.44, 0).length, 12, 1e-9, 'equinox day')
  near(daylight(40.44, -23.44).length, 9.11, .02, 'winter day')
  near(daylight(40.44, 23.44).length, 14.89, .02, 'summer day')
  near(daylight(40.44, 23.44).sunrise + daylight(40.44, 23.44).sunset, 24, 1e-9, 'symmetric about solar noon')
  assert.equal(daylight(80, 23.44).length, 24, 'polar day')
  assert.equal(daylight(80, -23.44).length, 0, 'polar night')
})

test('sun choices: preset ids stay equinox presets, hours clamp inside daylight, unknown seasons fall back', () => {
  assert.deepEqual(normalizeSun('morning'), { season: 'equinox', hour: 9 })
  assert.deepEqual(normalizeSun(null), { season: 'equinox', hour: 12 })
  const early = normalizeSun({ season: 'winter', hour: 5 })
  near(early.hour, daylight(40.44, -23.44).sunrise + .25, 1e-9, 'clamped after winter sunrise')
  assert.equal(normalizeSun({ season: 'mars', hour: 10 }).season, 'equinox')
  assert.equal(sunFor({ season: 'summer', hour: 10.5 }).id, 'custom')
  assert.equal(sunFor({ season: 'summer', hour: 10.5 }).label, '10:30')
  assert.equal(formatSolarHour(8.875), '8:53')
  assert.equal(seasonFor('summer').date, 'Jun 21')
})

test('convex hull and light follow the same sun', () => {
  assert.equal(convexHull([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, .5]]).length, 4)
  const light = sunLight(sunFor('morning'))
  assert.equal(light.anchor, 'map')
  near(light.position[1], sunFor('morning').azimuth, 1e-9, 'light azimuth')
  assert.ok(light.position[2] >= 25 && light.position[2] <= 80)
})
