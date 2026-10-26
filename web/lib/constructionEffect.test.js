import test from 'node:test'
import assert from 'node:assert/strict'
import { createPropertyExpression, latest } from '@maplibre/maplibre-gl-style-spec'
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
    this.states = new Map()
    this.placements = []
    this.paintUpdates = []
    this.sourceLoaded = true
    this.repaints = 0
  }
  getContainer() { return this.container }
  getLayer(id) { return this.layers.get(id) }
  getFilter(id) { return this.getLayer(id).filter }
  setFilter(id, value) { this.getLayer(id).filter = value }
  getLayoutProperty(id, key) { return this.getLayer(id).layout[key] }
  setLayoutProperty(id, key, value) { this.getLayer(id).layout[key] = value }
  setPaintProperty(id, key, value) { this.getLayer(id).paint[key] = value; this.paintUpdates.push({ id, key, value }) }
  setFeatureState(target, state) { this.states.set(target.id, state); this.placements.push({ ...target, ...state }) }
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
function paintValue(layer, key, state = {}) {
  const expression = createPropertyExpression(layer.paint[key], key, latest['paint_fill-extrusion'][key])
  assert.equal(expression.result, 'success', 'MapLibre accepts the state-driven paint expression')
  return expression.value.evaluate({ zoom: 18 }, { properties: {} }, state)
}

test('one upload builds individual blocks bottom-to-top after source readiness and a render, then restores the map', async t => {
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
    assert.equal(paintValue(layer, 'fill-extrusion-height'), 0)
    assert.equal(paintValue(layer, 'fill-extrusion-base'), 0)
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
  assert.equal(map.placements.length, 0, 'the first paint needs a render boundary')
  map.emit('render')
  t.mock.timers.tick(0)
  assert.equal(map.placements.length, 1, 'only one block appears on the first step')
  assert.equal(paintValue(layers[0], 'fill-extrusion-height', map.states.get(0)), 3)
  assert.equal(paintValue(layers[0], 'fill-extrusion-height', map.states.get(1)), 0, 'the next block has not appeared yet')
  assert.equal(layers[0].paint['fill-extrusion-opacity'], .96)
  assert.equal(layers[1].paint['fill-extrusion-opacity'], 0)
  t.mock.timers.tick(9)
  assert.equal(map.placements.length, 2, 'the next step places a second block instead of a complete floor')
  t.mock.timers.tick(91)
  assert.equal(map.placements.length, 12)
  assert.ok(map.placements.every(placement => placement.builtLevels === 1))
  assert.equal(layers[1].paint['fill-extrusion-opacity'], 0)
  t.mock.timers.tick(8)
  assert.equal(map.placements.at(-1).id, 11, 'the sweep reverses at the next level')
  assert.equal(paintValue(layers[1], 'fill-extrusion-height', map.states.get(11)), 6)
  assert.equal(paintValue(layers[1], 'fill-extrusion-height', map.states.get(0)), 0)
  assert.equal(paintValue(layers[1], 'fill-extrusion-base', map.states.get(0)), 0, 'unbuilt upper blocks have no floating top faces')
  t.mock.timers.tick(312)
  assert.equal(map.placements.length, 48)
  assert.equal(paintValue(layers[3], 'fill-extrusion-height', map.states.get(0)), 12)
  t.mock.timers.tick(60)
  assert.equal(done, 1)
  assert.equal(map.uploads.length, 1, 'geometry is never re-uploaded during the animation')
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

test('even the largest effect stays within 64 small state updates, four paint updates, and 600 ms', async t => {
  const { map } = setup(t)
  let done = 0
  playConstructionEffect(map, { ...event(), geometry: footprint(200, 150), height: 40 }, () => done++)
  await flush()
  map.emit('render')
  t.mock.timers.tick(564)
  assert.equal(done, 1)
  assert.equal(map.uploads.length, 1)
  assert.equal(map.placements.length, 64)
  assert.equal(map.paintUpdates.length, 4)
  for (let band = 1; band <= 4; band++) {
    const placements = map.placements.slice((band - 1) * 16, band * 16)
    assert.equal(new Set(placements.map(placement => placement.id)).size, 16)
    assert.ok(placements.every(placement => placement.builtLevels === band))
  }
  t.mock.timers.tick(2000)
  assert.equal(map.placements.length, 64)
})

test('undo during construction stops every remaining block placement', async t => {
  const { map } = setup(t)
  let done = 0
  const cancel = playConstructionEffect(map, event(), () => done++)
  await flush()
  map.emit('render')
  t.mock.timers.tick(100)
  const placed = map.placements.length
  assert.ok(placed > 0 && placed < 48)
  cancel()
  t.mock.timers.tick(2000)
  assert.equal(map.placements.length, placed)
  assert.equal(done, 1)
  assert.equal(map.sources.size, 0)
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
