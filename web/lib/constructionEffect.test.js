import test from 'node:test'
import assert from 'node:assert/strict'
import { constructionCells, playConstructionEffect } from './constructionEffect.js'
import { placedBuildingColor } from './buildingUses.js'

// Local projected fixture: a non-axis-aligned 12 by 20 metre rectangle.
function footprint(width = 12, depth = 20, angle = .63) {
  const c = Math.cos(angle), s = Math.sin(angle)
  const corners = [[0, 0], [width, 0], [width, depth], [0, depth]].map(([x, y]) => [(x * c - y * s) / 111320, (x * s + y * c) / 111320])
  return { type: 'Polygon', coordinates: [[...corners, corners[0]]] }
}
const event = () => ({ id: 'new', pin: 'parcel', geometry: footprint(), height: 12, typeId: 'small_apartment' })
const area = ring => Math.abs(ring.slice(0, -1).reduce((sum, p, i) => sum + p[0] * ring[i + 1][1] - ring[i + 1][0] * p[1], 0)) / 2

test('cells follow rotated footprint, preserve outer corners, leave only narrow internal gaps, and cap geometry', () => {
  const geometry = footprint(), before = structuredClone(geometry), cells = constructionCells(geometry)
  assert.equal(cells.features.length, 12)
  const points = cells.features.flatMap(feature => feature.geometry.coordinates[0])
  for (const corner of geometry.coordinates[0]) assert.ok(points.some(p => Math.hypot(p[0] - corner[0], p[1] - corner[1]) < 1e-12))
  const originalArea = area(geometry.coordinates[0])
  const cellArea = cells.features.reduce((sum, feature) => sum + area(feature.geometry.coordinates[0]), 0)
  assert.ok(cellArea < originalArea && cellArea > originalArea * .94)
  const [origin, right, , top] = geometry.coordinates[0]
  const uAxis = right.map((value, axis) => value - origin[axis]), vAxis = top.map((value, axis) => value - origin[axis])
  for (const point of points) {
    const p = point.map((value, axis) => value - origin[axis])
    const u = (p[0] * uAxis[0] + p[1] * uAxis[1]) / (uAxis[0] ** 2 + uAxis[1] ** 2)
    const v = (p[0] * vAxis[0] + p[1] * vAxis[1]) / (vAxis[0] ** 2 + vAxis[1] ** 2)
    assert.ok(u >= -1e-12 && u <= 1 + 1e-12 && v >= -1e-12 && v <= 1 + 1e-12)
  }
  assert.equal(constructionCells(footprint(200, 150)).features.length, 16)
  assert.equal(constructionCells(footprint(3, 3)).features.length, 4)
  assert.deepEqual(geometry, before)
})

test('malformed, non-convex, and unsupported source shapes are skipped instead of guessed', () => {
  const geometry = footprint()
  for (const invalid of [null, {}, { ...geometry, type: 'MultiPolygon' }, { ...geometry, coordinates: [...geometry.coordinates, geometry.coordinates[0]] },
    { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]] },
    { type: 'Polygon', coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]] }]) assert.equal(constructionCells(invalid), null)
})

class FakeMap {
  constructor() {
    this.layers = new Map(['placed-buildings-fill', 'placed-buildings-outline', 'building-fill', 'building-outline'].map(id => [id, { id, minzoom: 14, paint: {}, layout: {} }]))
    this.layers.get('placed-buildings-outline').filter = ['==', ['get', 'valid'], true]
    this.layers.get('building-outline').layout.visibility = 'none'
    this.sources = new Map()
    this.handlers = new Map()
    this.container = { dataset: {} }
    this.uploads = []
    this.sourceLoaded = true
    this.repaints = 0
  }
  getContainer() { return this.container }
  getLayer(id) { return this.layers.get(id) }
  getFilter(id) { return this.getLayer(id).filter }
  setFilter(id, value) { this.getLayer(id).filter = value }
  getLayoutProperty(id, key) { return this.getLayer(id).layout[key] }
  setLayoutProperty(id, key, value) { this.getLayer(id).layout[key] = value }
  setPaintProperty(id, key, value) { this.getLayer(id).paint[key] = value }
  addLayer(layer) { this.layers.set(layer.id, layer) }
  removeLayer(id) { this.layers.delete(id) }
  addSource(id) { this.sources.set(id, { setData: data => { this.uploads.push(data); return this.rejectUpload ? Promise.reject(new Error('source failed')) : Promise.resolve() } }) }
  getSource(id) { return this.sources.get(id) }
  removeSource(id) { this.sources.delete(id) }
  isSourceLoaded() { return this.sourceLoaded }
  on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); return this }
  off(type, fn) { this.handlers.get(type)?.delete(fn); return this }
  emit(type, event = {}) { for (const fn of [...(this.handlers.get(type) || [])]) fn(event) }
  triggerRepaint() { this.repaints++ }
}
function setup(t, reduced = false) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previousWindow = globalThis.window, listeners = new Set()
  const motion = { matches: reduced, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  globalThis.window = { matchMedia: () => motion }
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow })
  return { map: new FakeMap(), motion, listeners }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
const temporaryLayers = map => [...map.layers.values()].filter(layer => layer.id.startsWith('construction-effect-'))

test('one upload becomes a bottom-to-top native transition only after source readiness and a render, then restores the map', async t => {
  const { map, listeners } = setup(t), input = event(), before = structuredClone(input)
  const originalFilter = map.getFilter('placed-buildings-outline')
  let done = 0
  map.sourceLoaded = false
  playConstructionEffect(map, input, () => done++)
  const layers = temporaryLayers(map)
  assert.equal(layers.length, 4)
  assert.equal(map.uploads.length, 1)
  assert.equal(map.container.dataset.constructionPhase, 'loading')
  assert.deepEqual(map.getFilter('placed-buildings-outline')[1], originalFilter)
  assert.deepEqual(map.getFilter('placed-buildings-fill'), ['any', ['!=', ['to-string', ['get', 'id']], 'new'], ['!=', ['to-string', ['get', 'pin']], 'parcel']])
  for (const layer of layers) {
    assert.equal(layer.paint['fill-extrusion-color'], placedBuildingColor(input.typeId))
    assert.equal(layer.paint['fill-extrusion-height'], layer.paint['fill-extrusion-base'])
    assert.equal(layer.paint['fill-extrusion-opacity'], 0, 'upper rows have no floating top faces before their turn')
    assert.equal(layer.minzoom, 14)
  }
  await flush()
  t.mock.timers.tick(100)
  assert.equal(map.repaints, 0)
  map.sourceLoaded = true
  map.emit('sourcedata', { sourceId: [...map.sources.keys()][0] })
  assert.equal(map.repaints, 1)
  t.mock.timers.tick(100)
  assert.equal(layers[0].paint['fill-extrusion-height'], 0, 'the first paint needs a render boundary')
  map.emit('render')
  t.mock.timers.tick(0)
  assert.equal(layers[0].paint['fill-extrusion-height'], 3)
  assert.equal(layers[0].paint['fill-extrusion-opacity'], .96)
  assert.equal(layers[1].paint['fill-extrusion-opacity'], 0)
  assert.equal(layers[1].paint['fill-extrusion-height'], layers[1].paint['fill-extrusion-base'])
  t.mock.timers.tick(90)
  assert.equal(layers[1].paint['fill-extrusion-height'], 6)
  t.mock.timers.tick(180)
  assert.equal(layers[3].paint['fill-extrusion-height'], 12)
  t.mock.timers.tick(160)
  assert.equal(done, 1)
  assert.equal(map.uploads.length, 1, 'animation updates only native paint values')
  assert.equal(temporaryLayers(map).length, 0)
  assert.equal(map.sources.size, 0)
  assert.deepEqual(map.getFilter('placed-buildings-outline'), originalFilter)
  assert.equal(map.getFilter('placed-buildings-fill'), null)
  assert.equal(map.getLayoutProperty('building-fill', 'visibility'), null)
  assert.equal(map.getLayoutProperty('building-outline', 'visibility'), 'none')
  assert.deepEqual(map.container.dataset, {})
  assert.equal(listeners.size, 0)
  assert.deepEqual(input, before)
})

test('cancel/undo clears pending work once, and late source readiness cannot replay the effect', async t => {
  const { map } = setup(t)
  let done = 0
  const cancel = playConstructionEffect(map, event(), () => done++)
  cancel(); cancel()
  await flush()
  map.emit('render')
  t.mock.timers.tick(2000)
  assert.equal(done, 1)
  assert.equal(temporaryLayers(map).length, 0)
  assert.equal(map.sources.size, 0)
  assert.deepEqual(map.container.dataset, {})
})

test('the permanent building source must be ready before the decorative build starts', async t => {
  const { map } = setup(t)
  let committedReady = false
  map.sources.set('placed-buildings', {})
  map.isSourceLoaded = id => id !== 'placed-buildings' || committedReady
  const cancel = playConstructionEffect(map, { ...event(), height: 8 })
  assert.equal(temporaryLayers(map).length, 3)
  await flush()
  assert.equal(map.repaints, 0)
  committedReady = true
  map.emit('sourcedata', { sourceId: 'placed-buildings' })
  assert.equal(map.repaints, 1)
  map.emit('render')
  assert.equal(map.container.dataset.constructionPhase, 'building')
  cancel()
  assert.deepEqual([...map.sources.keys()], ['placed-buildings'])
})

test('reduced motion skips all map mutation and still completes', t => {
  const { map } = setup(t, true)
  let done = 0
  assert.equal(playConstructionEffect(map, event(), () => done++), undefined)
  assert.equal(done, 1)
  assert.equal(map.sources.size, 0)
  assert.equal(map.uploads.length, 0)
  assert.deepEqual(map.container.dataset, {})
})

test('upload failure, stalled source, reduced-motion change, and map removal all end bounded work', async t => {
  const { map, listeners } = setup(t)
  let done = 0
  map.rejectUpload = true
  playConstructionEffect(map, event(), () => done++)
  await flush()
  assert.equal(done, 1)
  assert.equal(map.sources.size, 0)
  map.rejectUpload = false
  map.sourceLoaded = false
  playConstructionEffect(map, event(), () => done++)
  await flush()
  t.mock.timers.tick(1500)
  assert.equal(done, 2)
  assert.equal(map.getLayoutProperty('building-fill', 'visibility'), null)
  playConstructionEffect(map, event(), () => done++)
  for (const listener of [...listeners]) listener()
  assert.equal(done, 3)
  playConstructionEffect(map, event(), () => done++)
  map.emit('remove')
  await flush()
  t.mock.timers.tick(2000)
  assert.equal(done, 4)
  assert.equal(listeners.size, 0)
  assert.deepEqual(map.container.dataset, {})
})
