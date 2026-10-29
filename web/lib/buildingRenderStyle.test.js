import test from 'node:test'
import assert from 'node:assert/strict'
import { Color, createPropertyExpression, latest } from '@maplibre/maplibre-gl-style-spec'
import { buildingMassing, existingBuildingColors } from './buildingRenderStyle.js'
import { placedBuildingColor, PLACEMENT_COLORS, USE_LEGEND } from './buildingUses.js'
import { rectangleAt } from './plannerGeometry.js'

function colorAt(expression, zoom, properties = {}, state = {}, overview = false) {
  const key = overview ? 'fill-color' : 'fill-extrusion-color'
  const property = overview ? latest.paint_fill[key] : latest['paint_fill-extrusion'][key]
  const compiled = createPropertyExpression(expression, key, property)
  assert.equal(compiled.result, 'success')
  return compiled.value.evaluate({ zoom }, { type: 'Polygon', properties }, state)
}

test('type colours remain the legend colours on footprints, walls and roofs across zoom levels', () => {
  const colors = existingBuildingColors()
  for (const use of USE_LEGEND) {
    const properties = { use_color: use.color }
    assert.deepEqual(colorAt(colors.overview, 15, properties, {}, true), Color.parse(use.color))
    for (const zoom of [16, 17.6, 19.9, 22]) for (const part of ['facade', 'roof']) {
      assert.deepEqual(colorAt(colors[part], zoom, properties), Color.parse(use.color), `${use.id} ${part} at ${zoom}`)
    }
  }
  assert.deepEqual(colorAt(colors.roof, 20), Color.parse('#cbd5e1'), 'unmatched buildings keep the unknown-use colour')
})

test('realistic tones remain distinct and inspection highlights survive switching styles', () => {
  const properties = { use_color: USE_LEGEND[0].color }
  const realistic = existingBuildingColors('realistic'), types = existingBuildingColors('types')
  assert.notDeepEqual(colorAt(realistic.facade, 19, properties), colorAt(realistic.roof, 19, properties))
  assert.notDeepEqual(colorAt(realistic.roof, 19, properties), colorAt(types.roof, 19, properties))
  for (const style of ['types', 'realistic']) {
    const colors = existingBuildingColors(style)
    assert.deepEqual(colorAt(colors.facade, 19, properties, { inspected: true }), Color.parse('#35b6bb'))
    assert.deepEqual(colorAt(colors.roof, 19, properties, { inspected: true }), Color.parse('#1f7f84'))
  }
})

test('type massing preserves the full checked footprint and height in the simulated hue', () => {
  const geometry = rectangleAt([-79.94, 40.41], 9, 14), original = structuredClone(geometry)
  for (const typeId of ['single_family', 'townhouse_duplex', 'triplex', 'small_apartment', 'large_apartment']) {
    const color = placedBuildingColor(typeId)
    const parts = buildingMassing({ geometry, typeId, color, height: 13.7, floors: 4 })
    assert.equal(parts.length, 1)
    assert.equal(parts[0].geometry, geometry)
    assert.equal(parts[0].base, 0)
    assert.equal(parts[0].top, 13.7)
    assert.equal(parts[0].color, color)
  }
  assert.deepEqual(geometry, original)
  assert.deepEqual(buildingMassing({ geometry, height: 0 }), [])
  assert.deepEqual(buildingMassing({ height: 12 }), [])
})

test('realistic mode restores architectural parts, while colour mode retains preview validation colours', () => {
  const geometry = rectangleAt([-79.94, 40.41], 9, 14)
  const building = { geometry, typeId: 'single_family', color: placedBuildingColor('single_family'), height: 9, floors: 2 }
  const parts = buildingMassing({ ...building, buildingStyle: 'realistic' })
  assert.ok(parts.some(p => p.part === 'porch-roof'))
  assert.ok(parts.some(p => p.part === 'roof'))
  assert.equal(Math.max(...parts.map(p => p.top)), 9)
  for (const [state, color] of Object.entries(PLACEMENT_COLORS)) {
    assert.equal(buildingMassing({ ...building, state, color })[0].color, color)
  }
})
