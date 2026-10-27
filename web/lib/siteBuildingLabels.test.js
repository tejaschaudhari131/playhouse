import test from 'node:test'
import assert from 'node:assert/strict'
import { buildingIdentityRows } from './buildingIdentity.js'
import { siteBuildingLabels } from './siteBuildingLabels.js'
import { footprintRef } from './redevelopment.js'
import { rectangleAt } from './plannerGeometry.js'

const building = (id, pin, lng = -79.94, height_m = 12) => ({ type: 'Feature', properties: { id, pin, height_m, height_method: 'osm_height' }, geometry: rectangleAt([lng, 40.41], 10, 12) })

test('map labels share list identities and retain numbers through demolition, inspection and restoration', () => {
  const buildings = [building('west', 'site', -79.941), building('middle', 'site'), building('east', 'site', -79.939)]
  const before = structuredClone(buildings), rows = buildingIdentityRows(buildings, 'site')
  const removed = footprintRef(rows[1].building, 'site')
  const selection = { ...removed, kind: 'existing' }
  assert.deepEqual(siteBuildingLabels(rows, null).map(f => f.properties.number), [1, 2, 3])
  assert.deepEqual(siteBuildingLabels(rows, null, [removed]).map(f => f.properties.number), [1, 3])
  const labels = siteBuildingLabels(rows, selection, [removed])
  assert.deepEqual(labels.map(f => f.properties.number), [1, 2, 3])
  assert.deepEqual(labels.filter(f => f.properties.selected).map(f => [f.properties.key, f.properties.height_m, f.properties.removed]), [[rows[1].key, 0, true]])
  assert.equal(siteBuildingLabels(rows, selection)[1].properties.height_m, 12)
  assert.deepEqual(buildings, before, 'label updates never change source geometry, heights or use evidence')
})

test('selection distinguishes matched, crossing and unmatched outlines even if source IDs coincide', () => {
  const features = [building('same', 'site'), building('same', 'neighbor'), building('same', '')]
  const rows = buildingIdentityRows(features, 'site')
  for (const feature of features) {
    const selection = { ...footprintRef(feature, 'site'), kind: 'existing' }
    const labels = siteBuildingLabels(rows, selection)
    assert.equal(labels.filter(f => f.properties.selected).length, 1)
    assert.equal(labels.find(f => f.properties.selected).id, rows.find(row => row.building === feature).key)
  }
  assert.ok(siteBuildingLabels(rows, { kind: 'placed', id: 'same', pin: 'site' }).every(f => !f.properties.selected))
})

test('labels use display height for roof alignment and skip outlines without known locations', () => {
  const placeholder = building('placeholder', 'site', -79.94, 9)
  placeholder.properties.height_method = 'placeholder'
  const missing = { type: 'Feature', properties: { id: 'missing', pin: 'site' }, geometry: null }
  const rows = buildingIdentityRows([placeholder, missing], 'site')
  const labels = siteBuildingLabels(rows, null)
  assert.equal(labels.length, 1)
  assert.equal(labels[0].properties.height_m, 9)
  assert.equal(rows.find(row => row.building === placeholder).heightM, null, 'a rendered height does not become measured evidence')
  assert.deepEqual(labels[0].geometry.coordinates, rows.find(row => row.building === placeholder).center)
  assert.deepEqual(siteBuildingLabels([], null), [])
})
