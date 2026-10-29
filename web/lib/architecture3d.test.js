import test from 'node:test'
import assert from 'node:assert/strict'
import { architecturalMassing, facadeBearing, footprintBox, withFront, massingPalette, EXISTING_TONES, EXISTING_FACADE_COLOR, EXISTING_ROOF_COLOR, FLOOR_BAND_M } from './architecture3d.js'
import { fitMassing, rectangleAt } from './plannerGeometry.js'
import { localFrame, pointInRing } from './localFrame.js'
import { optionFor } from './plannerState.js'
import { USE_LEGEND } from './buildingUses.js'

const ORIGIN = [-79.94, 40.41]
const LOT = rectangleAt(ORIGIN, 20, 40)
const draft = typeId => {
  const option = optionFor(typeId, 1000)
  return { option, massing: fitMassing(LOT, option.width, option.depth) }
}
const massing = (typeId, extra = {}) => {
  const { option, massing: m } = draft(typeId)
  return architecturalMassing({ geometry: m.geometry, typeId, height: option.height, floors: option.floors, color: '#9cc3e8', parcel: LOT, ...extra })
}
/** Every vertex of every part lies inside (or on) the checked footprint. */
function insideFootprint(parts, footprint) {
  const frame = localFrame(ORIGIN), ring = footprint.coordinates[0].map(frame.project)
  const grow = ring.map(([x, y], _, all) => {
    const cx = all.slice(0, 4).reduce((n, p) => n + p[0], 0) / 4, cy = all.slice(0, 4).reduce((n, p) => n + p[1], 0) / 4
    return [cx + (x - cx) * 1.001, cy + (y - cy) * 1.001]
  })
  return parts.every(part => part.geometry.coordinates.flat().every(p => pointInRing(frame.project(p), grow)))
}

test('footprint frame recovers width, depth and axes from a drafted rectangle', () => {
  const { massing: m } = draft('townhouse_duplex')
  const box = footprintBox(m.geometry)
  assert.ok(Math.abs(box.width - 9) < .01 && Math.abs(box.depth - 14) < .01)
  assert.ok(Math.abs(box.u[0] * box.v[0] + box.u[1] * box.v[1]) < 1e-6)
  assert.equal(footprintBox({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] }), null)
  assert.equal(footprintBox(null), null)
})

test('the front is the width edge nearer a lot line', () => {
  // A 8 × 12 m house pushed to the south end of a deep lot faces south.
  const lot = rectangleAt(ORIGIN, 12, 40)
  const house = fitMassing(lot, 8, 12, { east: 0, north: -12, bearing: 0 })
  const box = withFront(footprintBox(house.geometry), lot)
  assert.ok(Math.abs(box.frontReach - 2) < .05, `reach ${box.frontReach}`)
  const north = withFront(footprintBox(fitMassing(lot, 8, 12, { east: 0, north: 12, bearing: 0 }).geometry), lot)
  assert.equal(north.front, -box.front)
  assert.equal(withFront(footprintBox(house.geometry), null).front, -1, 'no parcel: the first width edge is the front')
})

test('with nearby parcels, the front faces the street gap rather than a back neighbour or alley', () => {
  const frame = localFrame(ORIGIN), lotAt = north => rectangleAt(frame.unproject([0, north]), 12, 40)
  const lot = lotAt(0), house = footprintBox(fitMassing(lot, 8, 12, { east: 0, north: -12, bearing: 0 }).geometry)
  const nearest = withFront(house, lot)
  // A back-to-back lot shares the south line; a 16 m street separates the lot across to the north.
  const street = withFront(house, lot, [lotAt(-40), lotAt(56)])
  assert.equal(street.front, -nearest.front)
  assert.ok(Math.abs(street.frontReach - 26) < .05, `reach ${street.frontReach}`)
  assert.equal(withFront(house, lot, [lotAt(-45), lotAt(56)]).front, -nearest.front, 'a 5 m alley behind is not the front')
  assert.equal(withFront(house, lot, [lotAt(-40), lotAt(40)]).front, nearest.front, 'no open gap: nearest lot line')
  assert.equal(withFront(house, lot, [lotAt(-56), lotAt(56)]).front, nearest.front, 'equal streets: nearest lot line')
  const geometry = fitMassing(lot, 8, 12, { east: 0, north: -12, bearing: 0 }).geometry
  assert.ok(Math.abs(Math.abs(facadeBearing(geometry, lot, [lotAt(-40), lotAt(56)])) - 180) < .5, 'north-facing facade: camera looks south')
  assert.ok(Math.abs(facadeBearing(geometry, lot)) < .5, 'south-facing facade: camera looks north')
  assert.equal(facadeBearing(geometry, null), null)
})

test('every typology stays inside its footprint and under its modelled height', () => {
  for (const typeId of ['single_family', 'townhouse_duplex', 'triplex', 'small_apartment', 'large_apartment']) {
    const { option, massing: m } = draft(typeId)
    const parts = massing(typeId)
    assert.ok(parts.length >= 5, `${typeId}: ${parts.length} parts`)
    assert.ok(parts.every(p => p.base >= 0 && p.top > p.base && p.top <= option.height + 1e-9), `${typeId} heights`)
    assert.ok(Math.abs(Math.max(...parts.map(p => p.top)) - option.height) < .01, `${typeId} reaches its modelled height`)
    assert.ok(insideFootprint(parts, m.geometry), `${typeId} footprint`)
  }
})

test('stories are countable: one plate per story with a recessed band between stories', () => {
  for (const [typeId, floors] of [['single_family', 2], ['townhouse_duplex', 3], ['large_apartment', 8]]) {
    const parts = massing(typeId)
    const plates = new Set(parts.filter(p => p.part.startsWith('floor-') || p.part === 'base' || p.part === 'podium').map(p => p.part === 'base' || p.part === 'podium' ? 'floor-1' : p.part))
    assert.equal(plates.size, floors, `${typeId} stories`)
    const bands = parts.filter(p => p.part === 'band')
    assert.ok(bands.length >= floors - 1, `${typeId} bands`)
    assert.ok(bands.every(b => Math.abs(b.top - b.base - FLOOR_BAND_M) < 1e-6))
  }
  const four = massing('townhouse_duplex', { floors: 4 })
  assert.equal(new Set(four.filter(p => p.part.startsWith('floor-')).map(p => p.part)).size, 4, 'edited story counts are drawn')
})

test('typologies carry their recognisable features', () => {
  const kinds = typeId => new Set(massing(typeId).map(p => p.part))
  const house = kinds('single_family')
  for (const part of ['porch-deck', 'porch-post', 'porch-roof', 'roof']) assert.ok(house.has(part), `house ${part}`)
  const porch = massing('single_family').find(p => p.part === 'porch-roof')
  assert.ok(porch.top <= 3.01, 'porch is one story')
  const duplex = kinds('townhouse_duplex')
  for (const part of ['party-wall', 'cornice', 'stoop']) assert.ok(duplex.has(part), `duplex ${part}`)
  assert.equal(new Set(massing('townhouse_duplex').filter(p => p.part === 'floor-1').map(p => p.color)).size, 2, 'two bays in alternating tones')
  const triplex = kinds('triplex')
  for (const part of ['base', 'balcony', 'railing', 'roof-cap']) assert.ok(triplex.has(part), `triplex ${part}`)
  for (const typeId of ['small_apartment', 'large_apartment']) {
    const parts = massing(typeId), names = new Set(parts.map(p => p.part))
    for (const part of ['podium', 'parapet', 'penthouse', 'solar']) assert.ok(names.has(part), `${typeId} ${part}`)
    const podium = parts.find(p => p.part === 'podium')
    assert.ok(podium.top + FLOOR_BAND_M <= 3.8 + 1e-9)
    assert.equal(parts.find(p => p.part === 'parapet').geometry.coordinates.length, 2, 'parapet is a ring with a hole')
  }
  const { option, massing: m } = draft('single_family')
  assert.ok(architecturalMassing({ geometry: m.geometry, typeId: 'adu', height: option.height, floors: 2, color: '#9cc3e8' }).some(p => p.part === 'porch-deck'), 'ADU uses the house form')
})

test('preview states keep their warning hue and a ground rim; placed buildings use material tones', () => {
  const red = massing('small_apartment', { color: '#dc2626', state: 'invalid' })
  assert.ok(red.some(p => p.part === 'state-rim' && p.color === '#dc2626'))
  const reddish = hex => { const [r, g, b] = hex.slice(1).match(/.{2}/g).map(c => parseInt(c, 16)); return r > g && r > b }
  assert.ok(red.every(p => reddish(p.color)), 'every part stays red')
  assert.ok(!massing('small_apartment').some(p => p.part === 'state-rim'))
  assert.equal(massingPalette('#9cc3e8').solar, '#23466f')
})

test('non-rectangular or missing geometry falls back to one honest box', () => {
  const odd = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [.5, 1.5], [0, 1], [0, 0]]] }
  assert.deepEqual(architecturalMassing({ geometry: odd, typeId: 'triplex', height: 9, color: '#fff' }).map(p => [p.base, p.top]), [[0, 9]])
  assert.deepEqual(architecturalMassing({ geometry: null, typeId: 'triplex', height: 9, color: '#fff' }), [])
})

test('existing outlines get a warm facade and a charcoal roof cap per recorded use', () => {
  for (const use of USE_LEGEND) assert.notEqual(EXISTING_TONES[use.id].facade, EXISTING_TONES[use.id].roof)
  assert.equal(EXISTING_FACADE_COLOR[0], 'match')
  assert.equal(EXISTING_ROOF_COLOR.length, 3 + USE_LEGEND.length * 2)
  assert.ok(EXISTING_FACADE_COLOR.includes(USE_LEGEND[0].color), 'keyed on the land-use colour')
})
