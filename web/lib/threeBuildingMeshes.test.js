import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MATERIAL_SPECS, PartBuilder, buildNeighborhoodBuilding, buildProposedBuilding, buildingCacheKey, mercator, meterInMercator,
  metresProjector, neighborhoodForm, neighborhoodSelection, orientedBoundingBox, pitchedRoof, triangulate, triangleCount,
} from './threeBuildingMeshes.js'
import { MATERIAL_LOOKS } from './threeMaterials.js'
import { haversineMeters } from './geo.js'
import { demolitionKey, footprintKey } from './redevelopment.js'
import { ringDistance, pointInRing, signedArea } from './localFrame.js'

const ORIGIN = [-79.94, 40.41]
const rotate = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
/** Rectangle W×D centred at `c`, rotated `angle`; corners counter-clockwise from back-left (front edge is +y). */
const rect = (W, D, angle = 0, c = [0, 0]) => [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]].map(p => { const r = rotate(p, angle); return [r[0] + c[0], r[1] + c[1]] })
const vertices = geometries => [...geometries.values()].flatMap(g => Array.from({ length: g.position.length / 3 }, (_, i) => [g.position[i * 3], g.position[i * 3 + 1], g.position[i * 3 + 2]]))
const keyVertices = (geometries, key) => vertices(new Map([[key, geometries.get(key)]]))
const TYPES = [
  ['single_family', 7, 12, 8, 2], ['adu', 5, 6, 6, 2], ['townhouse_duplex', 8, 13, 11, 3], ['townhouse_duplex', 6, 21, 11, 3],
  ['triplex', 10, 16, 11, 3], ['small_apartment', 14, 20, 15, 4], ['large_apartment', 30, 24, 24, 8],
]
const feature = (id, lngLats, props = {}) => ({ type: 'Feature', properties: { id, pin: 'P1', height_m: 9, use_type: 'single_family', ...props }, geometry: { type: 'Polygon', coordinates: [[...lngLats, lngLats[0]]] } })
/** Outline of a W×D metre footprint at `centre` (lng/lat), rotated `angle` radians. */
const footprint = (centre, W, D, angle = 0) => {
  const k = 111320 * Math.cos(centre[1] * Math.PI / 180)
  return rect(W, D, angle).map(([x, y]) => [centre[0] + x / k, centre[1] + y / 110574])
}

test('Web Mercator helpers match MapLibre MercatorCoordinate and give true metres near the origin', () => {
  assert.deepEqual(mercator([0, 0]), [.5, .5])
  assert.ok(Math.abs(meterInMercator(0) - 1 / (2 * Math.PI * 6371008.8)) < 1e-18)
  const project = metresProjector(ORIGIN)
  for (const [dx, dy] of [[.0012, 0], [0, .0009], [-.002, .0015]]) {
    const p = [ORIGIN[0] + dx, ORIGIN[1] + dy], [x, y] = project(p)
    assert.ok(Math.abs(Math.hypot(x, y) - haversineMeters(...ORIGIN, ...p)) / haversineMeters(...ORIGIN, ...p) < .003)
    for (const [v, d] of [[x, dx], [y, dy]]) assert.ok(d === 0 ? Math.abs(v) < 1e-6 : Math.sign(v) === Math.sign(d))
  }
})

test('every builder material has UV rules and a look', () => {
  for (const [key, spec] of Object.entries(MATERIAL_SPECS)) {
    assert.ok(MATERIAL_LOOKS[key], `${key} needs a material look`)
    assert.ok(spec.uv === 'fit' || spec.uv === 'bay' || spec.tile?.length === 2, `${key} needs a tile size`)
  }
  assert.throws(() => new PartBuilder().face('marble', [[0, 0, 0], [1, 0, 0], [0, 1, 0]]), /Unknown building material/)
})

test('faces turn toward their outward hint and triangulation covers concave caps', () => {
  const b = new PartBuilder()
  b.face('trim', [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], [0, 0, 1])
  const g = b.geometries().get('trim')
  assert.equal(g.position.length, 18)
  for (let i = 0; i < 6; i++) assert.equal(g.normal[i * 3 + 2], 1)
  const [a, c, d] = [0, 1, 2].map(i => [g.position[i * 3], g.position[i * 3 + 1]])
  assert.ok((c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]) > 0, 'counter-clockwise seen from the hint side')
  const L = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 5], [0, 5]], area = triangulate(L).reduce((n, [i, j, k]) => n + Math.abs(signedArea([L[i], L[j], L[k]])), 0)
  assert.ok(Math.abs(area - signedArea(L)) < 1e-9)
})

test('gable roof: ridge, eaves, gable-end triangles and wall top line up', () => {
  const b = new PartBuilder()
  const roof = pitchedRoof(b, { x0: -4, x1: 4, y0: -6, y1: 6, along: 'y', zTop: 7.9, wallTarget: 5.6, eave: .4, rake: .3, keys: { roof: 'shingle', gable: 'siding', ridge: 'ridgeCap' } })
  const g = b.geometries(), shingle = keyVertices(g, 'shingle'), gable = keyVertices(g, 'siding')
  const top = Math.max(...shingle.map(p => p[2]))
  assert.ok(Math.abs(top - 7.9) < 1e-5)
  for (const p of shingle.filter(p => Math.abs(p[2] - 7.9) < 1e-5)) assert.ok(Math.abs(p[0]) < 1e-5, 'ridge runs along y at x = 0')
  for (const p of shingle.filter(p => Math.abs(Math.abs(p[0]) - 4) < 1e-5)) assert.ok(Math.abs(p[2] - roof.zEdge) < 1e-5, 'eaves reach the outline')
  assert.deepEqual(roof.wall, { x0: -3.6, x1: 3.6, y0: -5.7, y1: 5.7 })
  assert.equal(gable.length, 6, 'two gable-end triangles')
  for (const p of gable) {
    assert.ok(Math.abs(Math.abs(p[1]) - 5.7) < 1e-5, 'gables sit on the end walls')
    assert.ok(Math.abs(p[2] - roof.wallTop) < 1e-5 || (Math.abs(p[0]) < 1e-5 && Math.abs(p[2] - roof.gables[0].apex) < 1e-5))
  }
  // The roof underside meets the side walls exactly at the wall top.
  assert.ok(Math.abs(7.9 - roof.tv - roof.tan * (4 - .4) - roof.wallTop) < 1e-9)
  assert.ok(Math.atan(roof.tan) * 180 / Math.PI >= 20 && Math.atan(roof.tan) * 180 / Math.PI <= 52)
  assert.ok(Math.max(...vertices(g).map(p => p[2])) <= 7.9 + .07 + 1e-6, 'ridge cap stays at zTop + 0.07')
})

test('hip roof: four slopes rise at one pitch to a shortened ridge', () => {
  const b = new PartBuilder()
  const roof = pitchedRoof(b, { x0: -7, x1: 7, y0: -4, y1: 4, along: 'x', hip: true, zTop: 8, wallTarget: 5.5, eave: .4, keys: { roof: 'shingle', gable: 'siding', ridge: 'ridgeCap' } })
  const shingle = keyVertices(b.geometries(), 'shingle')
  const ridge = shingle.filter(p => Math.abs(p[2] - 8) < 1e-6)
  assert.ok(ridge.every(p => Math.abs(p[1]) < 1e-6 && Math.abs(Math.abs(p[0]) - 3) < 1e-6), 'ridge from x = -3 to 3')
  assert.ok(!b.geometries().has('siding'), 'no gable walls on a hip roof')
  assert.ok(Math.abs(roof.wallTop - (roof.zEdge - roof.tv)) < 1e-9)
  assert.deepEqual(roof.gables, [])
})

test('oriented bounding box finds a rotated footprint and its long axis', () => {
  const ring = rect(6, 15, 30 * Math.PI / 180, [10, -4])
  const obb = orientedBoundingBox(ring)
  assert.ok(Math.abs(obb.length - 15) < 1e-6 && Math.abs(obb.width - 6) < 1e-6 && Math.abs(obb.area - 90) < 1e-6)
  const long = rotate([0, 1], 30 * Math.PI / 180)
  assert.ok(Math.abs(Math.abs(obb.axis[0] * long[0] + obb.axis[1] * long[1]) - 1) < 1e-9)
  assert.ok(Math.hypot(obb.centre[0] - 10, obb.centre[1] + 4) < 1e-9)
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 9], [0, 9]]
  assert.ok(orientedBoundingBox(L).area >= signedArea(L))
})

test('recorded houses get ridges along their oriented long axis, at or below recorded height', () => {
  const angle = 25 * Math.PI / 180
  for (let i = 0; i < 12; i++) {
    const f = feature(`h${i}`, footprint([ORIGIN[0] + i * .0002, ORIGIN[1]], 7, 14, angle), { height_m: 9 })
    const built = buildNeighborhoodBuilding(f)
    assert.ok(['gable', 'hip'].includes(built.roof))
    const all = vertices(built.geometries)
    assert.ok(Math.max(...all.map(p => p[2])) <= 9 + 1e-6)
    const shingle = keyVertices(built.geometries, 'shingle'), top = Math.max(...shingle.map(p => p[2]))
    const ridge = shingle.filter(p => top - p[2] < 1e-4)
    const [a, c] = [ridge[0], ridge.find(p => Math.hypot(p[0] - ridge[0][0], p[1] - ridge[0][1]) > 1)]
    const along = [(c[0] - a[0]), (c[1] - a[1])], l = Math.hypot(...along), long = rotate([0, 1], angle)
    assert.ok(Math.abs(Math.abs((along[0] * long[0] + along[1] * long[1]) / l) - 1) < 1e-3, 'ridge parallel to the long side')
    assert.ok(built.geometries.has('nbBrick') || built.geometries.has('nbSiding'), 'masonry or siding facade with window bays')
  }
})

test('recorded commercial, tall and irregular footprints get flat-roof facades with cornice and rooftop plant', () => {
  const box = footprint(ORIGIN, 20, 30)
  const shop = buildNeighborhoodBuilding(feature('c', box, { use_type: 'nonresidential', height_m: 10 }))
  assert.equal(shop.roof, 'flat')
  for (const key of ['nbStorefront', 'nbCommercial', 'limestone', 'roofFlat', 'metal']) assert.ok(shop.geometries.has(key), key)
  const tower = buildNeighborhoodBuilding(feature('t', box, { use_type: 'large_apartment', height_m: 30 }))
  assert.ok(tower.geometries.has('nbApartment'))
  assert.ok(Math.max(...vertices(tower.geometries).map(p => p[2])) <= 30 + 1e-6)
  assert.equal(neighborhoodForm(rect(8, 12), 25, 'single_family').roof, 'flat')
  assert.equal(neighborhoodForm(rect(8, 12), 9, 'nonresidential').roof, 'flat')
  assert.equal(buildNeighborhoodBuilding(feature('z', box, { height_m: 0 })), null)
})

test('neighborhood selection keeps the nearest recorded buildings and drops demolished footprints', () => {
  const features = Array.from({ length: 30 }, (_, i) => feature(`b${i}`, footprint([ORIGIN[0] + i * .0003, ORIGIN[1]], 8, 10)))
  const near = neighborhoodSelection(features, ORIGIN, { limit: 5 })
  assert.deepEqual(near.map(f => f.properties.id), ['b0', 'b1', 'b2', 'b3', 'b4'])
  const removed = new Set([demolitionKey({ id: 'b1', pin: 'P1' })])
  assert.equal(footprintKey(features[1]), [...removed][0])
  assert.deepEqual(neighborhoodSelection(features, ORIGIN, { limit: 3, exclude: removed }).map(f => f.properties.id), ['b0', 'b2', 'b3'])
  const inRange = neighborhoodSelection(features, ORIGIN, { radius: 100 })
  assert.ok(inRange.length > 0 && inRange.every(f => haversineMeters(...ORIGIN, ...f.geometry.coordinates[0][0]) < 110))
  assert.equal(neighborhoodSelection([feature('x', footprint(ORIGIN, 5, 5), { height_m: null })], ORIGIN).length, 0)
  assert.notEqual(buildingCacheKey(features[0]), buildingCacheKey({ ...features[0], properties: { ...features[0].properties, height_m: 12 } }))
})

/** Distance outside the footprint (0 inside). */
const outside = (p, ring) => pointInRing(p, ring) ? 0 : ringDistance(p, ring)

test('every proposed typology stays inside its footprint and modelled height, facing the street front', () => {
  for (const [typeId, W, D, h, floors] of TYPES) for (const seed of [0, 1, 2, 3, 7]) for (const angle of [0, .6]) {
    const ring = rect(W, D, angle, [3, -2]), front = rotate([0, 1], angle)
    const built = buildProposedBuilding({ ring, front, typeId, height: h, floors, seed })
    assert.ok(built.triangles > 300, `${typeId} is articulated`)
    for (const p of vertices(built.geometries)) {
      assert.ok(p[2] <= h + 1e-6 && p[2] >= -1e-6, `${typeId} ${seed} height ${p[2]}`)
      assert.ok(outside(p, ring) < .01, `${typeId} ${seed} leaves its footprint by ${outside(p, ring)}`)
      assert.ok(p.every(Number.isFinite))
    }
    const entrance = typeId.endsWith('apartment') ? 'glassWarm' : 'door'
    const doors = keyVertices(built.geometries, entrance).filter(p => p[2] < 2.45)
    assert.ok(doors.length > 0, `${typeId} has a street entrance`)
    const lean = doors.reduce((n, p) => n + (p[0] - 3) * front[0] + (p[1] + 2) * front[1], 0) / doors.length
    assert.ok(lean > D * .2, `${typeId} door is on the front facade`)
  }
})

test('typologies carry their real-world parts', () => {
  const parts = (typeId, W, D, h, floors, seed = 0) => buildProposedBuilding({ ring: rect(W, D), front: [0, 1], typeId, height: h, floors, seed }).geometries
  const has = (g, keys) => keys.every(k => g.has(k)) || assert.fail(`missing ${keys.filter(k => !g.has(k))}`)
  const house = parts('single_family', 7, 12, 8, 2, 4)
  has(house, ['shingle', 'ridgeCap', 'siding', 'stone', 'trim', 'glass', 'shutter', 'door', 'glassWarm', 'lamp', 'balusterWood', 'wood', 'brick', 'limestone'])
  has(parts('single_family', 7, 12, 8, 2, 0), ['brick', 'limestone'])
  const gableHouse = parts('single_family', 7, 12, 8, 2, 0)
  assert.ok(keyVertices(gableHouse, 'brick').some(p => p[2] > 6), 'brick gable-end triangles above the eaves')
  const duplex = parts('townhouse_duplex', 9, 14, 11, 3, 0)
  has(duplex, ['shingle', 'brick', 'rustic', 'limestone', 'metalRoof', 'metal', 'door'])
  assert.ok(triangleCount(new Map([['door', duplex.get('door')]])) >= 4, 'paired doors')
  has(parts('townhouse_duplex', 9, 14, 12.5, 3, 1), ['roofFlat', 'trim', 'brick'])
  has(parts('triplex', 10, 16, 11, 3), ['rustic', 'brick', 'limestone', 'balusterMetal', 'concrete', 'roofFlat', 'glassWarm'])
  has(parts('small_apartment', 14, 20, 15, 4), ['storefront', 'awning', 'bronze', 'balusterMetal', 'panel', 'aptFacade', 'roofFlat', 'solar', 'limestone', 'vent'])
  // Solar panels tilt up toward the north edge, i.e. face south.
  const solar = keyVertices(parts('large_apartment', 30, 24, 24, 8), 'solar'), deck = Math.min(...solar.map(p => p[2]))
  const lows = solar.filter(p => p[2] < deck + .1), highs = solar.filter(p => p[2] > deck + .3)
  assert.ok(highs.reduce((n, p) => n + p[1], 0) / highs.length > lows.reduce((n, p) => n + p[1], 0) / lows.length)
})

test('zoning state remaps roof and trim tints and adds a ground rim', () => {
  const tint = (state, key) => {
    const g = buildProposedBuilding({ ring: rect(7, 12), front: [0, 1], typeId: 'single_family', height: 8, floors: 2, state, seed: 4 }).geometries
    return g.get(key) ? [...g.get(key).color.slice(0, 3)] : null
  }
  const [r, gr, b] = tint('invalid', 'shingle')
  assert.ok(r > .7 && gr < .35 && b < .3, 'red-tinted roof')
  assert.ok(tint('invalid', 'trim')[0] > tint('invalid', 'trim')[2] + .2, 'red-tinted trim')
  assert.deepEqual(tint('invalid', 'rim').map(c => Math.round(c * 255)), [220, 38, 38])
  assert.deepEqual(tint('valid', 'rim').map(c => Math.round(c * 255)), [22, 163, 74])
  assert.equal(tint('placed', 'rim'), null)
  const [pr, pg, pb] = tint('pending', 'shingle')
  assert.ok(Math.abs(pr - pb) < .1 && Math.abs(pr - pg) < .1, 'pending roof is grey')
  const flagged = buildProposedBuilding({ ring: rect(7, 12), front: [0, 1], typeId: 'single_family', height: 8, floors: 2, flagged: true }).geometries
  assert.ok(flagged.has('rim'))
  assert.equal(buildProposedBuilding({ ring: rect(7, 12), typeId: 'single_family', height: 0 }), null)
  assert.equal(buildProposedBuilding({ ring: rect(7, 12).slice(0, 3), typeId: 'single_family', height: 8 }), null)
})

test('front snaps to a footprint axis, so rotation and the street side drive the mesh', () => {
  const ring = rect(8, 12, .3)
  const door = front => {
    const d = keyVertices(buildProposedBuilding({ ring, front, typeId: 'triplex', height: 11, floors: 3 }).geometries, 'door')
    return [d.reduce((n, p) => n + p[0], 0) / d.length, d.reduce((n, p) => n + p[1], 0) / d.length]
  }
  const north = rotate([0, 1], .3), south = rotate([0, -1], .3), skew = rotate([.2, -1], .3)
  const [a, b, c] = [door(north), door(south), door(skew)]
  assert.ok(a[0] * north[0] + a[1] * north[1] > 4 && b[0] * south[0] + b[1] * south[1] > 4)
  assert.ok(Math.hypot(c[0] - b[0], c[1] - b[1]) < 1e-6, 'a skewed front guess snaps to the nearest side')
})
