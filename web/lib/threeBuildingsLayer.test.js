import test from 'node:test'
import assert from 'node:assert/strict'
import { MeshBasicMaterial, Vector4 } from 'three'
import { BuildingScene, createThreeBuildingsLayer, mergeBuildings } from './threeBuildingsLayer.js'
import { mercator, meterInMercator } from './threeBuildingMeshes.js'
import { footprintKey } from './redevelopment.js'

const ORIGIN = [-79.94, 40.41]
function stubMaterials() {
  const made = { plain: new Map(), highlight: new Map() }
  let disposed = 0
  const get = (map, key) => { if (!map.has(key)) map.set(key, new MeshBasicMaterial()); return map.get(key) }
  return { made, get disposed() { return disposed }, get: key => get(made.plain, key), highlight: key => get(made.highlight, key), dispose: () => { disposed++ } }
}
const footprint = (centre, W, D) => {
  const k = 111320 * Math.cos(centre[1] * Math.PI / 180), ring = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]].map(([x, y]) => [centre[0] + x / k, centre[1] + y / 110574])
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
}
const house = (id, dx = 0, props = {}) => ({ type: 'Feature', properties: { id, pin: 'P1', height_m: 9, use_type: 'single_family', ...props }, geometry: footprint([ORIGIN[0] + dx, ORIGIN[1]], 7, 12) })
const disposals = group => {
  const events = []
  group.traverse(o => o.geometry?.addEventListener('dispose', () => events.push(o.userData.material)))
  return events
}

test('merging shifts each building by its anchor offset', () => {
  const arrays = { position: Float32Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9), normal: new Float32Array(9), uv: new Float32Array(6), color: new Float32Array(9).fill(1) }
  const merged = mergeBuildings(new Map([['brick', [{ arrays, offset: [10, 20] }, { arrays, offset: [-1, 0] }]]])).get('brick')
  assert.deepEqual([...merged.position.slice(0, 3)], [11, 22, 3])
  assert.deepEqual([...merged.position.slice(9, 12)], [0, 2, 3])
  assert.equal(merged.uv.length, 12)
})

test('origin matrix maps scene metres onto MapLibre mercator coordinates', () => {
  const scene = new BuildingScene({ materials: stubMaterials() })
  scene.setOrigin(ORIGIN)
  const [ox, oy] = mercator(ORIGIN), s = meterInMercator(ORIGIN[1])
  const p = new Vector4(100, 50, 12, 1).applyMatrix4(scene.originMatrix)
  assert.ok(Math.abs(p.x - (ox + 100 * s)) < 1e-12)
  assert.ok(Math.abs(p.y - (oy - 50 * s)) < 1e-12, 'north is up: mercator y decreases')
  assert.ok(Math.abs(p.z - 12 * s) < 1e-15)
})

test('neighbourhood meshes merge per material, cache by building and highlight the inspected footprint', () => {
  const materials = stubMaterials(), scene = new BuildingScene({ materials })
  const features = [house('a'), house('b', .0002), house('c', .0004, { use_type: 'nonresidential' })]
  scene.setOrigin(ORIGIN)
  assert.equal(scene.setNeighborhood(features), true)
  assert.equal(scene.meshed, 3)
  const keys = scene.neighborhood.children.map(m => m.userData.material)
  assert.equal(new Set(keys).size, keys.length, 'one mesh per material')
  assert.ok(keys.includes('shingle') && keys.includes('nbStorefront'))
  assert.equal(scene.setNeighborhood([...features]), false, 'same selection does not rebuild')
  const before = scene.cache.size, gone = disposals(scene.neighborhood)
  scene.setNeighborhood(features, { inspectedKey: footprintKey(features[1]) })
  assert.equal(scene.cache.size, before, 'cached geometry is reused')
  assert.ok(gone.length >= keys.length, 'replaced merged geometry is disposed')
  assert.ok(materials.made.highlight.size > 0)
  assert.ok(scene.neighborhood.children.some(m => materials.made.highlight.has(m.userData.material) && m.material === materials.made.highlight.get(m.userData.material)))
  scene.setNeighborhood([features[0]])
  assert.equal(scene.meshed, 1, 'a demolished or out-of-range building drops out on the next selection')
})

test('proposed buildings are cached by signature, hidden without rebuilding and disposed when removed', () => {
  const scene = new BuildingScene({ materials: stubMaterials() })
  scene.setOrigin(ORIGIN)
  const item = { key: 'preview', geometry: footprint([ORIGIN[0] + .0003, ORIGIN[1]], 8, 12), front: [0, 1], typeId: 'single_family', height: 8, floors: 2, state: 'valid' }
  scene.setProposed([item])
  const group = scene.proposed.children[0]
  assert.equal(group.userData.type, 'single_family')
  assert.ok(group.position.x > 20, 'placed at its offset from the scene origin')
  scene.setProposed([{ ...item, hidden: true }])
  assert.equal(scene.proposed.children[0], group)
  assert.equal(group.visible, false)
  const gone = disposals(group)
  scene.setProposed([{ ...item, typeId: 'triplex', height: 11, floors: 3 }])
  assert.notEqual(scene.proposed.children[0], group)
  assert.ok(gone.length > 5)
  assert.equal(scene.proposed.children.length, 1)
  scene.setOrigin([ORIGIN[0] + .0003, ORIGIN[1]])
  assert.ok(Math.abs(scene.proposed.children[0].position.x) < 1e-6, 'moving the origin re-places proposed groups')
})

test('scene dispose releases geometries and materials', () => {
  const materials = stubMaterials(), scene = new BuildingScene({ materials })
  scene.setOrigin(ORIGIN)
  scene.setNeighborhood([house('a')])
  scene.setProposed([{ key: 'p', geometry: footprint(ORIGIN, 8, 12), front: [0, 1], typeId: 'triplex', height: 11, floors: 3 }])
  const gone = [disposals(scene.neighborhood), disposals(scene.proposed)]
  const total = [scene.neighborhood, scene.proposed].reduce((n, g) => { let c = 0; g.traverse(o => { if (o.geometry) c++ }); return n + c }, 0)
  scene.dispose()
  assert.ok(total > 10)
  assert.equal(gone[0].length + gone[1].length, total)
  assert.equal(scene.proposed.children.length, 0)
  assert.equal(materials.disposed, 1)
  assert.equal(scene.cache.size, 0)
})

const fakeMap = () => {
  let repaints = 0
  return { getCanvas: () => ({}), triggerRepaint: () => { repaints++ }, get repaints() { return repaints } }
}
const fakeRenderer = () => {
  const calls = []
  return { calls, capabilities: { getMaxAnisotropy: () => 16 }, resetState: () => calls.push('reset'), setViewport: (...a) => calls.push(['viewport', ...a]), render: (scene, camera) => calls.push(['render', scene, camera]), dispose: () => calls.push('dispose') }
}

test('layer falls back without WebGL2: status unavailable, render is a no-op', () => {
  const statuses = []
  const controller = createThreeBuildingsLayer({ onStatus: s => statuses.push(s) })
  controller.setOrigin(ORIGIN)
  controller.layer.onAdd(fakeMap(), {})
  assert.equal(controller.status, 'unavailable')
  assert.deepEqual(statuses, ['unavailable'])
  assert.doesNotThrow(() => controller.layer.render({ drawingBufferWidth: 10, drawingBufferHeight: 10 }, { defaultProjectionData: { mainMatrix: new Array(16).fill(0) } }))
  assert.equal(controller.layer.type, 'custom')
  assert.equal(controller.layer.renderingMode, '3d')
})

test('layer replays inputs on add, renders with MapLibre matrix × origin and cleans up on remove', () => {
  const renderer = fakeRenderer(), map = fakeMap(), materials = stubMaterials()
  const controller = createThreeBuildingsLayer({ renderer: () => renderer, materials: () => materials, supports: () => true })
  controller.setOrigin(ORIGIN)
  controller.setNeighborhood([house('a')])
  controller.setSun({ azimuth: 90, altitude: 30, id: 'morning' })
  controller.layer.onAdd(map, {})
  assert.equal(controller.status, 'ready')
  assert.equal(renderer.autoClear, false, 'never clears the map frame')
  assert.equal(controller.meshed, 1)
  assert.ok(controller.scene.sun.position.x > 800 && Math.abs(controller.scene.sun.position.y) < 1e-6, 'morning sun in the east')
  controller.setProposed([{ key: 'p', geometry: footprint(ORIGIN, 8, 12), front: [0, 1], typeId: 'single_family', height: 8, floors: 2 }])
  assert.ok(map.repaints > 0)
  const main = Array.from({ length: 16 }, (_, i) => i % 5 === 0 ? 2 : 0)
  controller.layer.render({ drawingBufferWidth: 800, drawingBufferHeight: 600 }, { defaultProjectionData: { mainMatrix: main } })
  assert.deepEqual(renderer.calls.slice(0, 2), ['reset', ['viewport', 0, 0, 800, 600]])
  const camera = renderer.calls[2][2]
  const expected = controller.scene.originMatrix.clone().multiplyScalar(1)
  assert.ok(Math.abs(camera.projectionMatrix.elements[0] - 2 * expected.elements[0]) < 1e-12)
  assert.ok(Math.abs(camera.projectionMatrix.elements[12] - 2 * expected.elements[12]) < 1e-12)
  controller.layer.onRemove()
  assert.ok(renderer.calls.includes('dispose'))
  assert.equal(materials.disposed, 1)
  assert.equal(controller.status, 'idle')
})
