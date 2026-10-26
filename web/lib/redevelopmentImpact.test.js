import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recordedHomes, homesText, homesReplaced, netHomes, combinedHomes, redevelopmentImpact, IMPACT_ASSUMPTIONS } from './redevelopmentImpact.js'
import { optionFor } from './plannerState.js'
import { rectangleAt, geometryArea } from './plannerGeometry.js'

test('recorded homes follow County land use, with apartment bands as minimums and unclear housing as unknown', () => {
  const cases = [
    ['SINGLE FAMILY', 'RESIDENTIAL', 1, 'recorded'], ['ROWHOUSE', 'RESIDENTIAL', 1, 'recorded'], ['TWO FAMILY', 'RESIDENTIAL', 2, 'recorded'],
    ['THREE FAMILY', 'RESIDENTIAL', 3, 'recorded'], ['FOUR FAMILY', 'COMMERCIAL', 4, 'recorded'], ['APART: 5-19 UNITS', 'COMMERCIAL', 5, 'minimum'],
    ['APART:20-39 UNITS', 'COMMERCIAL', 20, 'minimum'], ['APART:40+ UNITS', 'COMMERCIAL', 40, 'minimum'], ["RETL/APT'S OVER", 'COMMERCIAL', 1, 'minimum'],
    ['CONDOMINIUM', 'RESIDENTIAL', 1, 'minimum'], ['HUD PROJ #202', 'GOVERNMENT', null, 'unknown'], ['INDEPENDENT LIVING (SENIORS)', 'COMMERCIAL', null, 'unknown'],
    ['OWNED BY METRO HOUSING AU', 'GOVERNMENT', null, 'unknown'], ['SOME NEW HOUSING CODE', 'RESIDENTIAL', null, 'unknown'],
    ['VACANT LAND', 'RESIDENTIAL', 0, 'none'], ['RES AUX BUILDING (NO HOUSE)', 'RESIDENTIAL', 0, 'none'], ['WAREHOUSE', 'INDUSTRIAL', 0, 'none'], ['MUNICIPAL GOVERNMENT', 'GOVERNMENT', 0, 'none'],
  ]
  for (const [land_use, land_use_class, homes, basis] of cases) assert.deepEqual(recordedHomes({ land_use, land_use_class }), { homes, basis, landUse: land_use }, land_use)
  assert.deepEqual(recordedHomes({}), { homes: null, basis: 'unknown', landUse: null })
  assert.equal(recordedHomes({ land_use: ' two family ' }).homes, 2)
  assert.equal(homesText(recordedHomes({ land_use: 'APART: 5-19 UNITS' })), '5+ (APART: 5-19 UNITS)')
  assert.equal(homesText(recordedHomes({ land_use: 'WAREHOUSE' })), 'None recorded (WAREHOUSE)')
  assert.equal(homesText(recordedHomes({})), 'Unknown (no recorded use)')
})

test('replaced homes count each parcel once, skip accessory outlines, and keep unknowns visible', () => {
  const parcels = { a: { land_use: 'TWO FAMILY', address: '1 A ST' }, b: { land_use: 'APART: 5-19 UNITS' }, c: { land_use: 'HUD PROJ #202' } }
  const roles = { garage: 'auxiliary' }
  const lookup = { parcel: pin => parcels[pin] || null, footprint: entry => ({ properties: { footprint_role: roles[entry.id] || 'sole' } }) }
  const demolitions = [{ id: 'main', pin: 'a' }, { id: 'rear', pin: 'a' }, { id: 'garage', pin: 'd' }, { id: 'apt', pin: 'b', site: 'a' }, { id: 'hud', pin: 'c' }, { id: 'orphan', pin: 'a', unmatched: true }, { id: 'lost', pin: 'missing' }]
  const result = homesReplaced(demolitions, lookup)
  assert.equal(result.replaced, 7)
  assert.equal(result.minimum, true)
  assert.equal(result.unknown, 2)
  assert.equal(result.unmatched, 1)
  assert.deepEqual(result.parcels.map(p => [p.pin, p.homes]), [['a', 2], ['b', 5], ['c', null], ['missing', null]])
  assert.equal(result.parcels[0].address, '1 A ST')
  const net = netHomes(12, result)
  assert.equal(net.net, 5)
  assert.equal(net.text, 'Net homes: up to +5 (12 proposed − 7+ replaced)')
  assert.match(net.note, /County land use; apartment bands count their minimum; 2 parcels with unknown homes not subtracted; 1 outline without a parcel record not counted\./)
  const exact = netHomes(1, homesReplaced([{ id: 'main', pin: 'a' }], lookup))
  assert.deepEqual([exact.text, exact.uncertain], ['Net homes: −1 (1 proposed − 2 replaced)', false])
  assert.equal(netHomes(3, homesReplaced([], lookup)).text, 'Net homes: +3 (3 proposed − 0 replaced)')
  assert.equal(netHomes(2, homesReplaced([{ id: 'x', pin: 'a' }], lookup)).text, 'Net homes: 0 (2 proposed − 2 replaced)')
  assert.deepEqual(combinedHomes(homesReplaced([{ id: 'main', pin: 'a' }, { id: 'apt', pin: 'b' }], lookup)), { homes: 7, basis: 'minimum', landUse: 'TWO FAMILY, APART: 5-19 UNITS' })
  assert.deepEqual(combinedHomes(homesReplaced([{ id: 'hud', pin: 'c' }], lookup)), { homes: null, basis: 'unknown', landUse: 'HUD PROJ #202' })
  assert.deepEqual(combinedHomes(homesReplaced([{ id: 'orphan', pin: 'a', unmatched: true }], lookup)), { homes: null, basis: 'unknown', landUse: null })
  assert.deepEqual(combinedHomes(homesReplaced([{ id: 'garage', pin: 'd' }], lookup)), { homes: 0, basis: 'none', landUse: 'no dwelling use recorded' })
})

test('feasibility screen reports observed context, assumed cost ranges, capitalized rent and the 30% benchmark', () => {
  const origin = [-79.94, 40.41]
  const house = { type: 'Feature', properties: { id: 'h', pin: 'p', height_m: 7, stories: null }, geometry: rectangleAt(origin, 8, 12) }
  const parcel = { land_use: 'TWO FAMILY', year_built: 1920, living_sqft: 1860, last_valid_sale_price: 85000, last_valid_sale_year: 2014, renter_share: 0.5, scores: { small_apartment: { displacement_risk: 62 } } }
  const draft = { ...optionFor('triplex', 1200), width: 10, depth: 16, floors: 3, utilities: 150 }
  const impact = redevelopmentImpact({ parcel, demolished: [house], draft, targetIncome: 60000 })
  const area = geometryArea(house.geometry)
  assert.ok(Math.abs(area - 96) < 0.5)
  assert.deepEqual(impact.existing.homes, { homes: 2, basis: 'recorded', landUse: 'TWO FAMILY' })
  assert.deepEqual(impact.existing.sale, { price: 85000, year: 2014 })
  assert.ok(Math.abs(impact.existing.demolishedSqft - area * 2 * 10.7639) < 1e-6, 'a 7 m outline counts two assumed stories')
  assert.deepEqual(impact.cost.demolition.map(Math.round), IMPACT_ASSUMPTIONS.demolitionPerSqft.map(rate => Math.round(rate * impact.existing.demolishedSqft)))
  const newSqft = 10 * 16 * 3 * 10.7639
  assert.deepEqual(impact.cost.construction.map(Math.round), [250, 350].map(rate => Math.round(rate * newSqft)))
  assert.equal(impact.replacement.netUnits, 1)
  const value = 1200 * 3 * 12 * 0.6 / 0.065
  assert.ok(Math.abs(impact.value.capitalized - value) < 1e-6)
  assert.ok(Math.abs(impact.value.gap[0] - (value - impact.cost.total[1])) < 1e-6)
  assert.equal(impact.affordability.affordableRent, 1350)
  assert.ok(Math.abs(impact.affordability.rentBurden - 0.27) < 1e-9)
  assert.equal(impact.displacement.renterHouseholds, 1)
  assert.equal(impact.displacement.screen, 62)
  assert.deepEqual(impact.carbon.newTonnes.map(Math.round), [144, 288])
  assert.deepEqual(impact.vacant.savedDemolition, impact.cost.demolition)
})

test('vacant or unknown context never invents demolition cost, homes or displacement', () => {
  const draft = optionFor('single_family', 900)
  const vacant = redevelopmentImpact({ parcel: { land_use: 'VACANT LAND', land_use_class: 'RESIDENTIAL' }, demolished: [], draft, targetIncome: 0 })
  assert.deepEqual(vacant.cost.demolition, [0, 0])
  assert.equal(vacant.existing.homes.homes, 0)
  assert.equal(vacant.affordability, null)
  assert.equal(vacant.displacement.renterHouseholds, null)
  const unknown = redevelopmentImpact({ parcel: {}, demolished: [], draft, targetIncome: 50000 })
  assert.equal(unknown.replacement.netUnits, null)
  assert.equal(unknown.existing.sale, null)
  assert.equal(unknown.displacement.screen, null)
})

test('real Glenwood parcel: assessment fields flow into the impact screen unchanged', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../testdata/study/${name}`, import.meta.url)))
  const feature = read('parcels.geojson').features.find(f => f.properties.pin === '0056G00082000000')
  const building = read('existing-buildings.geojson').features.find(f => f.properties.id === '550443')
  const snapshot = structuredClone(feature.properties)
  const impact = redevelopmentImpact({ parcel: feature.properties, demolished: [building], draft: optionFor('townhouse_duplex', 1000), targetIncome: 40000 })
  assert.deepEqual(feature.properties, snapshot)
  assert.equal(impact.existing.homes.homes, 1)
  assert.equal(impact.existing.livingSqft, 1860)
  assert.equal(impact.existing.yearBuilt, 1920)
  assert.equal(impact.replacement.netUnits, 1)
  assert.ok(impact.cost.demolition[0] > 0 && impact.cost.demolition[1] > impact.cost.demolition[0])
  assert.equal(impact.displacement.renterShare, 0.489)
})
