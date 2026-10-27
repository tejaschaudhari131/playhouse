import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { demolishedArea, priceBenchmarks, parcelAcquisition, siteAcquisition, amiBand, breakEvenRent, capitalStack, taxLedger, annualTax,
  MILLAGE, TOTAL_MILLS, PRO_FORMA_ASSUMPTIONS, AREA_BASIS_TEXT } from './proForma.js'
import { rectangleAt, geometryArea } from './plannerGeometry.js'

const limits = JSON.parse(readFileSync(new URL('./hudIncomeLimits.json', import.meta.url)))
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6 * Math.max(1, Math.abs(expected)), `${message}: ${actual} ≠ ${expected}`)
const closeRange = (actual, expected, message) => { close(actual[0], expected[0], `${message} low`); close(actual[1], expected[1], `${message} high`) }
const building = (id, pin, w, d, extra = {}) => ({ type: 'Feature', properties: { id, pin, stories: 2, footprint_role: 'sole', ...extra }, geometry: rectangleAt([-79.94, 40.41], w, d) })
const sqftOf = (f, stories = 2) => geometryArea(f.geometry) * stories * 10.7639

test('millage is the 2026 City + Pittsburgh Public Schools + Allegheny County total of 27.307', () => {
  assert.deepEqual(MILLAGE.map(m => [m.id, m.mills]), [['city', 10.42], ['schools', 10.457], ['county', 6.43]])
  close(TOTAL_MILLS, 27.307, 'total mills')
  assert.match(MILLAGE[0].detail, /9\.67 general \+ 0\.50 parks \+ 0\.25 library/)
  closeRange(annualTax([100000, 200000]), [2730.7, 5461.4], 'tax on $100k–$200k')
})

test('demolished area prefers observed County living area and falls back to outline × stories', () => {
  const parcel = { pin: 'site', living_sqft: 1500 }
  const neighbor = { pin: 'next', living_sqft: 900 }
  const parcelFor = pin => ({ next: neighbor, bare: { pin: 'bare', living_sqft: null } })[pin] || null
  const house = building('h', 'site', 8, 10)
  const observed = demolishedArea([house], { parcel, parcelFor })
  assert.equal(observed.sqft, 1500)
  assert.equal(observed.basis, 'observed')
  assert.equal(AREA_BASIS_TEXT[observed.basis], 'Observed (County assessment)')

  const big = [building('a', 'next', 8, 10), building('b', 'next', 8, 10)]
  const multi = demolishedArea(big, { parcel, parcelFor })
  close(multi.sqft, sqftOf(big[0]) * 2, 'two buildings larger than the recorded living area use the calculated sum')
  assert.equal(multi.basis, 'calculated')
  assert.match(multi.parts[0].reason, /2 buildings exceed the recorded 900 sq ft/)

  const small = [building('a', 'next', 3, 3), building('b', 'next', 3, 3)]
  assert.equal(demolishedArea(small, { parcel, parcelFor }).sqft, 900, 'a smaller multi-building sum keeps the observed figure')

  const garage = building('g', 'site', 4, 6, { footprint_role: 'auxiliary', stories: 1 })
  const mixed = demolishedArea([house, garage], { parcel, parcelFor })
  close(mixed.sqft, 1500 + sqftOf(garage, 1), 'accessory outlines add calculated area')
  assert.equal(mixed.basis, 'mixed')
  const garageOnly = demolishedArea([garage], { parcel, parcelFor })
  assert.equal(garageOnly.basis, 'calculated', 'living area is never applied to an accessory-only demolition')

  const missing = demolishedArea([building('x', 'bare', 8, 10), building('y', null, 8, 10)], { parcel, parcelFor })
  assert.equal(missing.basis, 'calculated')
  assert.deepEqual(missing.parts.map(p => p.reason), ['no living area recorded', 'no parcel record'])
  assert.deepEqual(demolishedArea([], { parcel }), { sqft: 0, basis: 'none', parts: [] })

  const height = demolishedArea([building('t', 'none', 10, 10, { stories: null, height_m: 10.5 })], { parcel })
  close(height.sqft, sqftOf(building('t', 'none', 10, 10), 3), '10.5 m with no story count is three 3.5 m stories')
})

const sale = (price, year, extra = {}) => ({ neighborhood: 'Hazelwood', last_valid_sale_price: price, last_valid_sale_year: year, living_sqft: 1000, lot_sqft: 2000, ...extra })

test('price benchmarks use recent valid sales, quartiles, and fall back from a thin neighborhood', () => {
  const local = [100, 150, 200, 250, 300].map(r => sale(r * 1000, 2024))
  const other = [400, 500, 600, 700, 800].map(r => sale(r * 1000, 2025, { neighborhood: 'Lawrenceville' }))
  const noise = [sale(5000, 2025), sale(900000, 2010), sale(null, 2025)]
  const b = priceBenchmarks([...local, ...other, ...noise], { neighborhood: 'Hazelwood', asOfYear: 2026 })
  assert.deepEqual([b.living.q1, b.living.median, b.living.q3, b.living.n, b.livingScope], [150, 200, 250, 5, 'Hazelwood'])
  assert.equal(b.lot, null, 'no vacant-land sales, so no lot benchmark')
  const thin = priceBenchmarks([...local.slice(0, 2), ...other], { neighborhood: 'Hazelwood', asOfYear: 2026 })
  assert.equal(thin.livingScope, 'loaded neighborhoods')
  assert.equal(thin.living.n, 7)
  const vacant = [10, 20, 30, 40, 50].map(r => sale(r * 2000, 2023, { living_sqft: null, vacant_lot: true }))
  const lot = priceBenchmarks(vacant, { neighborhood: 'Hazelwood', asOfYear: 2026 })
  assert.deepEqual([lot.lot.q1, lot.lot.q3, lot.lotScope, lot.living], [20, 40, 'Hazelwood', null])
  assert.deepEqual(priceBenchmarks([], { asOfYear: 2026 }), { living: null, livingScope: null, lot: null, lotScope: null, asOfYear: 2026 })
})

test('acquisition: nominal public price, recent sale, neighborhood estimate, older sale, or unknown', () => {
  const benchmarks = { living: { q1: 150, median: 200, q3: 250, n: 9 }, livingScope: 'Hazelwood', lot: { q1: 5, median: 8, q3: 10, n: 6 }, lotScope: 'Hazelwood' }
  const opts = { benchmarks, asOfYear: 2026 }
  const ura = parcelAcquisition({ pin: 'u', land_use: 'MUNICIPAL URBAN RENEWAL', land_use_class: 'GOVERNMENT', last_valid_sale_price: 90000, last_valid_sale_year: 2024 }, opts)
  assert.deepEqual([ura.basis, ura.channel, ura.range, ura.taxable], ['public', 'ura', [1000, 5000], false])
  const city = parcelAcquisition({ pin: 'c', land_use: 'VACANT LAND', city_owned: true, city_status: 'available' }, opts)
  assert.deepEqual([city.basis, city.channel, city.range], ['public', 'city', PRO_FORMA_ASSUMPTIONS.publicNominal])
  assert.deepEqual([parcelAcquisition({ city_owned: true, city_status: 'permanent' }, opts).basis, parcelAcquisition({ land_use: 'BOARD OF EDUCATION', land_use_class: 'GOVERNMENT' }, opts).basis], ['not_offered', 'not_offered'])
  const sold = parcelAcquisition({ pin: 's', land_use: 'SINGLE FAMILY', last_valid_sale_price: 210000, last_valid_sale_year: 2022, living_sqft: 1400 }, opts)
  assert.deepEqual([sold.basis, sold.range, sold.year, sold.taxable], ['sale', [210000, 210000], 2022, true])
  const estimate = parcelAcquisition({ pin: 'e', land_use: 'SINGLE FAMILY', living_sqft: 1400 }, opts)
  assert.deepEqual([estimate.basis, estimate.per, estimate.range], ['estimate', 'living', [210000, 350000]])
  assert.match(estimate.text, /Hazelwood sales, middle half of \$\/living sq ft × 1,400 sq ft/)
  const land = parcelAcquisition({ pin: 'l', land_use: 'VACANT LAND', lot_sqft: 3000, vacant_lot: true }, opts)
  assert.deepEqual([land.basis, land.per, land.range], ['estimate', 'lot', [15000, 30000]])
  const old = parcelAcquisition({ pin: 'o', land_use: 'SINGLE FAMILY', last_valid_sale_price: 60000, last_valid_sale_year: 2001 }, { asOfYear: 2026 })
  assert.deepEqual([old.basis, old.range], ['old_sale', [60000, 60000]])
  assert.equal(parcelAcquisition({ pin: 'x', land_use: 'SINGLE FAMILY' }, { asOfYear: 2026 }).basis, 'unknown')
  assert.deepEqual(parcelAcquisition(null), { basis: 'unknown', channel: 'unknown', range: null, taxable: null, text: 'No parcel record' })
})

test('acquisition never reads private tax delinquency or owner names', () => {
  const base = { pin: 's', land_use: 'SINGLE FAMILY', last_valid_sale_price: 210000, last_valid_sale_year: 2022 }
  const flagged = { ...base, tax_delinquent: true, tax_delinquent_prior_years: true, owner_name: 'JANE DOE' }
  assert.deepEqual(parcelAcquisition(flagged, { asOfYear: 2026 }), parcelAcquisition(base, { asOfYear: 2026 }))
  assert.doesNotMatch(JSON.stringify(parcelAcquisition(flagged, { asOfYear: 2026 })), /JANE|delinquen/i)
})

test('site acquisition adds parcels of demolished neighbor buildings and flags unknown values', () => {
  const parcel = { pin: 'site', land_use: 'VACANT LAND', city_owned: true, city_status: 'sale_pending' }
  const parcels = { next: { pin: 'next', land_use: 'SINGLE FAMILY', last_valid_sale_price: 150000, last_valid_sale_year: 2025 }, gone: { pin: 'gone', land_use: 'SINGLE FAMILY' } }
  const parcelFor = pin => parcels[pin] || null
  const one = siteAcquisition({ parcel, demolished: [building('a', 'next', 5, 5), building('b', 'next', 5, 5), building('c', 'site', 5, 5)], parcelFor, asOfYear: 2026 })
  assert.deepEqual(one.parcels.map(p => p.pin), ['site', 'next'])
  assert.deepEqual([one.range, one.complete, one.public], [[151000, 155000], true, true])
  const two = siteAcquisition({ parcel, demolished: [building('d', 'gone', 5, 5)], parcelFor, asOfYear: 2026 })
  assert.deepEqual([two.range, two.complete], [[1000, 5000], false])
})

test('AMI band uses FY2026 HUD HOME limits for the household size', () => {
  assert.deepEqual(amiBand(23000, 1, limits), { band: 30, percent: 23000 / 38650 * 50, householdSize: 1, fiscalYear: 2026 })
  assert.equal(amiBand(38650, 1, limits).band, 50)
  assert.equal(amiBand(53040, 2, limits).band, 60)
  assert.equal(amiBand(60000, 2, limits).band, 80)
  assert.equal(amiBand(200000, 4, limits).band, null)
  assert.equal(amiBand(30000, 12, limits).householdSize, 8)
  assert.equal(amiBand(0, 2, limits), null)
  assert.equal(amiBand(50000, 2, null), null)
})

test('break-even rent capitalizes back to the development cost', () => {
  const assumptions = { operatingShare: 0.4, capRate: 0.065 }
  const rent = breakEvenRent([650000, 900000], 3, assumptions)
  closeRange(rent, [650000 * 0.065 / (3 * 12 * 0.6), 900000 * 0.065 / (3 * 12 * 0.6)], 'break-even rent')
  closeRange(rent.map(r => r * 3 * 12 * 0.6 / 0.065), [650000, 900000], 'round trip')
})

test('capital stack screens LIHTC (with QCT basis boost), URA HOF and HOME/PHARE by AMI band', () => {
  const basis = [1000000, 1200000]
  const at50 = capitalStack({ gapPerUnit: [50000, 80000], units: 12, band: 50, basis, qct: true, typeId: 'small_apartment' })
  assert.deepEqual(at50.programs.map(p => [p.id, p.status]), [['lihtc', 'eligible'], ['hof', 'eligible'], ['home', 'eligible']])
  closeRange(at50.gap, [600000, 960000], 'total gap')
  closeRange(at50.programs[0].estimate.nine, [1000000 * 0.09 * 10 * 0.85 * 1.3, 1200000 * 0.09 * 10 * 0.85 * 1.3], '9% equity with 130% basis')
  closeRange(at50.programs[0].estimate.four, [1000000 * 0.04 * 10 * 0.85 * 1.3, 1200000 * 0.04 * 10 * 0.85 * 1.3], '4% equity with 130% basis')
  assert.match(at50.programs[0].note, /2026 HUD Qualified Census Tract \(QCT\): eligible basis may be boosted to 130%/)
  assert.match(at50.programs[0].note, /12 homes are small for a tax-credit deal/)
  assert.match(at50.programs[1].name, /Rental Gap Program/)
  assert.doesNotMatch(at50.programs[1].name, /For-Sale/)
  const at80 = capitalStack({ gapPerUnit: [10000, 20000], units: 2, band: 80, basis, qct: false, typeId: 'townhouse_duplex' })
  assert.deepEqual(at80.programs.map(p => p.status), ['conditional', 'eligible', 'eligible'])
  assert.match(at80.programs[0].note, /income averaging/)
  assert.match(at80.programs[0].note, /no 130% basis boost/)
  assert.match(at80.programs[1].name, /For-Sale Development Program/)
  closeRange(at80.programs[0].estimate.nine, [1000000 * 0.765, 1200000 * 0.765], '9% equity without boost')
  const market = capitalStack({ gapPerUnit: [10000, 20000], units: 40, band: null, basis, typeId: 'large_apartment' })
  assert.deepEqual(market.programs.map(p => p.status), ['not_eligible', 'not_eligible', 'not_eligible'])
  assert.doesNotMatch(market.programs[0].note, /small for a tax-credit deal/)
  for (const p of at50.programs) assert.match(p.url, /^https:\/\//)
})

test('tax ledger: new construction minus replaced taxable value, by taxing body, with exemptions and abatement', () => {
  const ledger = taxLedger({ newValues: [[400000, 500000], [100000, 100000]], replaced: [{ range: [150000, 200000], taxable: true }, { range: [1000, 5000], taxable: false }, { range: null, taxable: true }] })
  assert.deepEqual(ledger.newValue, [500000, 600000])
  assert.deepEqual(ledger.replacedValue, [150000, 200000])
  closeRange(ledger.newTax, [500000 * 0.027307, 600000 * 0.027307], 'new tax')
  closeRange(ledger.replacedTax, [150000 * 0.027307, 200000 * 0.027307], 'replaced tax')
  closeRange(ledger.net, [500000 * 0.027307 - 200000 * 0.027307, 600000 * 0.027307 - 150000 * 0.027307], 'net new tax')
  closeRange(ledger.bodies.reduce((sum, b) => [sum[0] + b.net[0], sum[1] + b.net[1]], [0, 0]), ledger.net, 'bodies sum to the total')
  closeRange(ledger.bodies[0].newTax, [500000 * 0.01042, 600000 * 0.01042], 'City tax')
  assert.deepEqual([ledger.exempt, ledger.unknown, ledger.abatement.applies, ledger.abatement.program], [1, 1, true, 'City Chapter 267'])
  assert.deepEqual([ledger.abatement.enhanced, ledger.abatement.years, ledger.abatement.cap], [false, 3, 125000], 'market-rate rental gets the standard 3-year credit')
  closeRange(ledger.abatement.cityAbated, ledger.bodies[0].net, 'City increase abated in full below the cap')
  closeRange(ledger.abatement.netDuring, [ledger.net[0] - ledger.bodies[0].net[0], ledger.net[1] - ledger.bodies[0].net[1]], 'schools and County still collect')
  const affordable = taxLedger({ newValues: [[40e6, 40e6]], band: 60 })
  assert.deepEqual([affordable.abatement.enhanced, affordable.abatement.years], [true, 10])
  assert.deepEqual(affordable.abatement.cityAbated, [250000, 250000], 'Enhanced credit is capped at $250,000 a year')
  const loss = taxLedger({ newValues: [[10000, 10000]], replaced: [{ range: [300000, 300000], taxable: true }] })
  assert.equal(loss.abatement.applies, false, 'no abatement when the new building is assessed below what it replaces')
  assert.deepEqual(loss.abatement.cityAbated, [0, 0])
  assert.deepEqual(taxLedger({}).net, [0, 0])
})
