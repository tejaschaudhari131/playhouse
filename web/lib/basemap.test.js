import test from 'node:test'
import assert from 'node:assert/strict'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { basemapStyle, BASEMAP_PROVIDER } from './basemap.js'

test('hosted basemap is valid and cannot introduce a competing building inventory', () => {
  const style = basemapStyle()
  assert.deepEqual(validateStyleMin(style), [])
  assert.ok(style.layers.some(layer => layer['source-layer'] === 'transportation'))
  assert.ok(style.layers.some(layer => layer.type === 'symbol'))
  assert.ok(style.layers.every(layer => layer['source-layer'] !== 'building' && layer.type !== 'fill-extrusion'))
  assert.ok(!JSON.stringify(style).includes('tile.openstreetmap.org'))
  assert.equal(style.sources.openmaptiles.url, 'https://tiles.openfreemap.org/planet')
  assert.match(BASEMAP_PROVIDER.attribution, /OpenMapTiles/)
  assert.match(BASEMAP_PROVIDER.attribution, /OpenStreetMap/)
})

test('each map owns its style so renderer normalization cannot affect another view', () => {
  const first = basemapStyle(), second = basemapStyle()
  first.layers.pop()
  first.sources.openmaptiles.attribution = 'changed by renderer'
  assert.notEqual(first.layers.length, second.layers.length)
  assert.equal(second.sources.openmaptiles.attribution, BASEMAP_PROVIDER.attribution)
})
