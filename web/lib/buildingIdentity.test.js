import test from 'node:test'
import assert from 'node:assert/strict'
import { buildingIdentityRows } from './buildingIdentity.js'
import { rectangleAt, rectangleInside } from './plannerGeometry.js'
import { footprintRef, isDemolished } from './redevelopment.js'
import { historyFor, initialStudioScenario, scenarioReducer } from './plannerState.js'

const origin = [-79.94, 40.41]
const at = (east, north = 0) => [origin[0] + east / (111320 * Math.cos(origin[1] * Math.PI / 180)), origin[1] + north / 111320]
const recorded = (id, pin, east, north = 0, properties = {}) => ({ type: 'Feature', id, properties: { id, pin, ...properties }, geometry: rectangleAt(at(east, north), 9, 14) })
const ids = rows => rows.map(row => [row.key, row.number])

test('same-use county outlines keep geographical numbers across source order and duplicate neighborhood chunks', () => {
  const west = recorded('west', 'site', -15, 20, { use_label: 'Single-family' })
  const east = recorded('east', 'site', 15, 20, { use_label: 'Single-family' })
  const south = recorded('south', 'site', 0, -10, { use_label: 'Single-family' })
  const source = [south, east, west], before = structuredClone(source)
  const rows = buildingIdentityRows(source, 'site')
  assert.deepEqual(rows.map(row => row.building.id), ['west', 'east', 'south'])
  assert.deepEqual(rows.map(row => row.label), ['Building #1', 'Building #2', 'Building #3'])
  assert.deepEqual(ids(buildingIdentityRows([...source].reverse(), 'site')), ids(rows))
  assert.deepEqual(ids(buildingIdentityRows([structuredClone(east), south, west, east, structuredClone(west)], 'site')), ids(rows))
  assert.equal(rows[0].building, west, 'source feature remains available for the existing selection/removal workflow')
  assert.deepEqual(source, before, 'numbering does not annotate or reorder source evidence')
})

test('same IDs on different parcels or unmatched outlines remain distinct, with stable identity tie-breaks', () => {
  const features = [recorded('same', 'neighbor', 0), recorded('same', 'site', 0), recorded('same', '', 0)]
  const rows = buildingIdentityRows(features, 'site')
  assert.equal(rows.length, 3)
  assert.equal(new Set(rows.map(row => row.key)).size, 3)
  assert.deepEqual(ids(buildingIdentityRows([...features].reverse(), 'site')), ids(rows))
  assert.deepEqual(rows.map(row => row.relation).sort(), ['crossing', 'matched', 'unmatched'])
  assert.equal(buildingIdentityRows([recorded('space', '  ', 0)], 'site')[0].relation, 'unmatched')
})

test('demolition and restoration change statuses while the complete site retains the same numbers', () => {
  const features = [recorded('west', 'site', -15), recorded('east', 'site', 15)]
  const original = buildingIdentityRows(features, 'site')
  let history = historyFor(initialStudioScenario('site', {}, null))
  const building = footprintRef(features[0], 'site')
  history = scenarioReducer(history, { type: 'demolishBuilding', building })
  const removedRows = buildingIdentityRows(features, 'site')
  assert.deepEqual(ids(removedRows), ids(original))
  assert.deepEqual(removedRows.map(row => isDemolished(row.building, history.present.demolitions)), [true, false])
  history = scenarioReducer(history, { type: 'restoreBuilding', building })
  assert.deepEqual(ids(buildingIdentityRows(features, 'site')), ids(original))
  assert.ok(features.every(feature => !isDemolished(feature, history.present.demolitions)))
})

test('marker centers stay on the roof for a courtyard and multipart outlines; areas subtract holes and add parts', () => {
  const outer = rectangleAt(origin, 30, 30).coordinates[0], hole = rectangleAt(origin, 10, 10).coordinates[0]
  const courtyard = { ...recorded('court', 'site', 0), geometry: { type: 'Polygon', coordinates: [outer, hole] } }
  const separate = rectangleAt(at(100), 8, 8).coordinates
  const multipart = { ...recorded('multi', 'site', 0), geometry: { type: 'MultiPolygon', coordinates: [[outer, hole], separate] } }
  for (const feature of [courtyard, multipart]) {
    const [row] = buildingIdentityRows([feature], 'site')
    const marker = rectangleAt(row.center, .1, .1).coordinates[0].slice(0, -1)
    assert.ok(rectangleInside(marker, [outer, hole]), 'marker lies inside the largest roof polygon, outside its courtyard')
    assert.ok(Math.abs(row.areaM2 - (feature === courtyard ? 800 : 864)) < .01)
    assert.equal(row.areaLabel, feature === courtyard ? '~800 m² footprint' : '~864 m² footprint')
    assert.equal(row.number, 1, 'a multipart footprint is one building identity')
  }
  const [row] = buildingIdentityRows([multipart], 'site')
  const reordered = { ...multipart, geometry: { ...multipart.geometry, coordinates: [...multipart.geometry.coordinates].reverse() } }
  assert.deepEqual(buildingIdentityRows([reordered], 'site')[0].center, row.center)
})

test('marker centers stay inside concave outlines whose bounding-box center is outside the roof', () => {
  const outline = [[-20, -20], [20, -20], [20, -10], [-10, -10], [-10, 20], [-20, 20], [-20, -20]].map(([x, y]) => at(x, y))
  const building = { ...recorded('concave', 'site', 0), geometry: { type: 'Polygon', coordinates: [outline] } }
  const [row] = buildingIdentityRows([building], 'site')
  const marker = rectangleAt(row.center, .1, .1).coordinates[0].slice(0, -1)
  assert.ok(rectangleInside(marker, [outline]))
})

test('compact labels preserve the difference between measured tags, estimates, inferred massing, placeholders and unknown height', () => {
  const rowFor = properties => buildingIdentityRows([recorded('one', 'site', 0, 0, properties)], 'site')[0]
  const mapped = rowFor({ height_m: 12.345, height_method: 'osm_height', height_ref: 'way/123' })
  assert.equal(mapped.heightLabel, '12.3 m mapped')
  assert.match(mapped.heightDescription, /not independently verified/)
  assert.equal(mapped.heightSource, 'https://www.openstreetmap.org/way/123')
  const estimate = rowFor({ height_m: 7.5, height_method: 'stories_estimate', stories: 2 })
  assert.equal(estimate.heightLabel, '~7.5 m estimated')
  assert.match(estimate.heightDescription, /2 recorded stories/)
  const inference = rowFor({ height_m: 16.5, height_method: 'typology_estimate', height_profile: 'apartments_large', stories: null })
  assert.equal(inference.heightLabel, '~16.5 m inferred')
  assert.match(inference.heightDescription, /no building-specific height record/)
  assert.doesNotMatch(inference.heightDescription, /\d+ (stories|levels)/)
  const placeholder = rowFor({ height_m: 9, height_method: 'placeholder' })
  assert.equal(placeholder.heightLabel, '9 m placeholder')
  assert.equal(placeholder.heightM, null)
  assert.equal(placeholder.displayHeightM, 9)
  assert.match(placeholder.heightDescription, /Height unknown/)
  const unknown = rowFor({ height_m: 9 })
  assert.equal(unknown.heightLabel, 'Height unknown')
  assert.equal(unknown.heightM, null)
  for (const height_m of [null, undefined, 0, -1, Infinity, NaN]) {
    const row = rowFor({ height_m, height_method: 'osm_height' })
    assert.equal(row.heightLabel, 'Height unknown')
    assert.equal(row.displayHeightM, null)
    assert.doesNotMatch(row.heightDescription, /undefined|NaN|Infinity/)
  }
  assert.match(rowFor({ height_m: 7.5, height_method: 'stories_estimate' }).heightDescription, /story count is unavailable/)
})

test('missing geometry and identifiers do not fabricate area, height, or numbered map locations', () => {
  const [row] = buildingIdentityRows([{ id: 'known', properties: { pin: 'site' }, geometry: null }, { properties: { pin: 'site' } }], 'site')
  assert.equal(row.center, null)
  assert.equal(row.areaM2, null)
  assert.equal(row.areaLabel, 'Footprint area unknown')
  assert.equal(row.heightLabel, 'Height unknown')
  assert.deepEqual(buildingIdentityRows(null, 'site'), [])
})
