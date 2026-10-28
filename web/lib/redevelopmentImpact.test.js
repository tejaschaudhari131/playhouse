import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recordedHomes, homesText, homesReplaced, netHomes, combinedHomes, redevelopmentImpact, planTaxLedger, constructionCost, IMPACT_ASSUMPTIONS } from './redevelopmentImpact.js'
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

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6 * Math.max(1, Math.abs(expected)), `${message}: ${actual} ≠ ${expected}`)
const closeRange = (actual, expected, message) => { close(actual[0], expected[0], `${message} low`); close(actual[1], expected[1], `${message} high`) }
const limits = JSON.parse(readFileSync(new URL('./hudIncomeLimits.json', import.meta.url)))

test('feasibility screen reports observed context, assumed cost ranges, capitalized rent and the 30% benchmark', () => {
  const origin = [-79.94, 40.41]
  const house = { type: 'Feature', properties: { id: 'h', pin: 'p', height_m: 7, stories: null }, geometry: rectangleAt(origin, 8, 12) }
  const parcel = { pin: 'p', land_use: 'TWO FAMILY', year_built: 1920, living_sqft: null, last_valid_sale_price: 85000, last_valid_sale_year: 2014, renter_share: 0.5, scores: { small_apartment: { displacement_risk: 62 } } }
  const draft = { ...optionFor('triplex', 1200), width: 10, depth: 16, floors: 3, utilities: 150 }
  const impact = redevelopmentImpact({ parcel, demolished: [house], draft, targetIncome: 60000, asOfYear: 2026 })
  const area = geometryArea(house.geometry)
  assert.ok(Math.abs(area - 96) < 0.5)
  assert.deepEqual(impact.existing.homes, { homes: 2, basis: 'recorded', landUse: 'TWO FAMILY' })
  assert.deepEqual(impact.existing.sale, { price: 85000, year: 2014 })
  assert.ok(Math.abs(impact.existing.demolishedSqft - area * 2 * 10.7639) < 1e-6, 'with no living area, a 7 m outline counts two assumed stories')
  assert.equal(impact.existing.area.basis, 'calculated')
  assert.deepEqual(impact.cost.demolition.map(Math.round), IMPACT_ASSUMPTIONS.demolitionPerSqft.map(rate => Math.round(rate * impact.existing.demolishedSqft)))
  const newSqft = 10 * 16 * 3 * 10.7639
  assert.deepEqual(impact.cost.construction.map(Math.round), [215, 285].map(rate => Math.round(rate * newSqft)))
  assert.deepEqual(impact.cost.acquisition.parcels.map(p => [p.basis, p.range]), [['old_sale', [85000, 85000]]])
  assert.equal(impact.replacement.netUnits, 1)
  const value = 1200 * 3 * 12 * 0.945 * 0.6 / 0.0725
  assert.ok(Math.abs(impact.value.capitalized - value) < 1e-6)
  assert.ok(Math.abs(impact.value.gap[0] - (value - impact.cost.development[1])) < 1e-6)
  assert.equal(impact.affordability.affordableRent, 1350)
  assert.ok(Math.abs(impact.affordability.rentBurden - 0.27) < 1e-9)
  assert.equal(impact.affordability.band, null, 'no HUD limits supplied')
  assert.equal(impact.displacement.renterHouseholds, 1)
  assert.equal(impact.displacement.screen, 62)
  assert.deepEqual(impact.carbon.newTonnes.map(Math.round), [144, 288])
  assert.deepEqual(impact.vacant.savedDemolition, impact.cost.demolition)
})

test('pro forma: observed living area, acquisition, hard vs total cost, break-even rent, residual land value, subsidy gap and tax', () => {
  const house = { type: 'Feature', properties: { id: 'h', pin: 'p', stories: 2, footprint_role: 'sole' }, geometry: rectangleAt([-79.94, 40.41], 8, 12) }
  const parcel = { pin: 'p', neighborhood: 'Hazelwood', land_use: 'TWO FAMILY', living_sqft: 1860, renter_share: 0.5, qct_2026: true }
  const benchmarks = { living: { q1: 150, median: 200, q3: 250, n: 12 }, livingScope: 'Hazelwood', lot: null, lotScope: null }
  const draft = { ...optionFor('triplex', 1200), width: 10, depth: 16, floors: 3, utilities: 150 }
  const impact = redevelopmentImpact({ parcel, demolished: [house], draft, targetIncome: 60000, householdSize: 2, limits, benchmarks, asOfYear: 2026 })
  assert.equal(impact.existing.demolishedSqft, 1860)
  assert.equal(impact.existing.area.basis, 'observed')
  const demolition = [8 * 1860, 15 * 1860], construction = [215, 285].map(r => r * 10 * 16 * 3 * 10.7639)
  const hard = [demolition[0] + construction[0] * 1.1, demolition[1] + construction[1] * 1.1]
  closeRange(impact.cost.hard, hard, 'hard cost = demolition + construction + 10% site work')
  closeRange(impact.cost.soft, [hard[0] * 0.12, hard[1] * 0.12], 'design/permits/legal 12% of hard')
  assert.deepEqual(impact.cost.acquisition.range, [150 * 1860, 250 * 1860])
  const base = [hard[0] * 1.17 * 1.10 + 9000 + 150 * 1860, hard[1] * 1.17 * 1.10 + 9000 + 250 * 1860]
  const development = base.map(v => v * (1 + .65 * .5 * .075 * 1.5))
  closeRange(impact.cost.development, development, 'total development cost incl. acquisition')
  closeRange(impact.cost.perHome, development.map(v => v / 3), 'per home')
  closeRange(impact.value.breakEvenRent, development.map(v => v * 0.0725 / (3 * 12 * .945 * 0.6)), 'break-even rent')
  const capitalized = 1200 * 3 * 12 * 0.945 * 0.6 / 0.0725
  closeRange(impact.value.residualLand, [capitalized - impact.cost.beforeLand[1], capitalized - impact.cost.beforeLand[0]], 'residual land value at draft rent')
  const affordable = 1350 * 3 * 12 * 0.945 * 0.6 / 0.0725
  closeRange(impact.affordability.residualLand, [affordable - impact.cost.beforeLand[1], affordable - impact.cost.beforeLand[0]], 'residual land value at the affordable rent')
  closeRange(impact.affordability.subsidyPerUnit, development.map(v => Math.max(0, v - affordable) / 3), 'subsidy gap per home')
  assert.equal(impact.affordability.band.band, 80)
  assert.equal(impact.capitalStack.band, 80)
  assert.equal(impact.capitalStack.qct, true)
  assert.equal(impact.capitalStack.programs[0].estimate, null)
  closeRange(impact.tax.newValue, development, 'new assessed value scenario includes acquisition and soft costs')
  closeRange(impact.tax.replacedValue, [150 * 1860, 250 * 1860], 'replaced value = acquisition estimate')
  closeRange(impact.tax.net, [development[0] * 0.027307 - 250 * 1860 * 0.027307, development[1] * 0.027307 - 150 * 1860 * 0.027307], 'net new tax')

  const rich = redevelopmentImpact({ parcel: { ...parcel, land_use: 'VACANT LAND', living_sqft: null }, demolished: [], draft: { ...draft, rent: 9000 }, targetIncome: null, asOfYear: 2026 })
  assert.equal(rich.capitalStack, null, 'no shortfall, no capital stack guide')
  assert.deepEqual(rich.tax.replacedValue, [0, 0], 'vacant land replaces no building tax')
  assert.equal(rich.cost.acquisition.complete, false, 'no comparable sales: acquisition unknown and flagged')
})

test('public inventory acquisition is nominal and tax-exempt; garage-only demolition replaces no tax', () => {
  const garage = { type: 'Feature', properties: { id: 'g', pin: 'u', stories: 1, footprint_role: 'auxiliary' }, geometry: rectangleAt([-79.94, 40.41], 4, 6) }
  const parcel = { pin: 'u', land_use: 'COMMUNITY URBAN RENEWAL', land_use_class: 'GOVERNMENT' }
  const impact = redevelopmentImpact({ parcel, demolished: [garage], draft: optionFor('single_family', 900), targetIncome: 29000, householdSize: 3, limits, asOfYear: 2026 })
  assert.deepEqual(impact.cost.acquisition.range, [1000, 5000])
  assert.equal(impact.cost.acquisition.public, true)
  assert.deepEqual(impact.tax.replacedValue, [0, 0])
  assert.equal(impact.affordability.band.band, 30)
  assert.ok(impact.capitalStack.programs.every(p => p.status !== 'not_eligible'))
})

test('plan tax ledger sums placed buildings against parcels with demolished principal buildings', () => {
  const parcels = { a: { pin: 'a', land_use: 'SINGLE FAMILY', last_valid_sale_price: 100000, last_valid_sale_year: 2024 }, b: { pin: 'b', land_use: 'SINGLE FAMILY', last_valid_sale_price: 50000, last_valid_sale_year: 2024 } }
  const f = (pin, role) => ({ properties: { pin, footprint_role: role } })
  const buildings = [{ option: optionFor('triplex', 1200) }, { option: optionFor('single_family', 900) }]
  const ledger = planTaxLedger({ buildings, demolished: [f('a', 'sole'), f('a', 'sole'), f('b', 'auxiliary')], parcelFor: pin => parcels[pin], asOfYear: 2026 })
  const hard = buildings.map(b => constructionCost(b.option).cost).reduce((s,c) => [s[0]+c[0]*1.1,s[1]+c[1]*1.1],[0,0])
  closeRange(ledger.newValue, hard.map(v => (v*1.17*1.1+4*3000+100000)*(1+.65*.5*.075*1.5)), 'plan cost proxy includes allowances and acquisition once')
  assert.deepEqual(ledger.replacedValue, [100000, 100000], 'parcel a counted once; garage-only parcel b keeps its tax')
  assert.deepEqual(planTaxLedger({}).net, [0, 0])
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
