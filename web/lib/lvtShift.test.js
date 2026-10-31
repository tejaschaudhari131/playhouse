import test from 'node:test'
import assert from 'node:assert/strict'
import { CITY_MILLAGE, SHIFT_CLASSES, parcelShift, revenue, shiftClass, shiftSummary, splitRates, taxBase, taxableValues } from './lvtShift.js'

const parcel = (land, building, tax_status = 'taxable', extra = {}) => ({ properties: { tax_status, assessed_land: land, assessed_building: building, ...extra } })
const city = [parcel(20000, 80000), parcel(50000, 50000), parcel(150000, 10000), parcel(5000, 300000), parcel(90000, 0), parcel(1e6, 4e6, 'exempt'), parcel(null, 1000), parcel(1000, 1000, 'purta')]
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`)

test('only taxable parcels with both values enter the base', () => {
  assert.equal(taxableValues(city[5].properties), null)
  assert.equal(taxableValues(city[6].properties), null)
  assert.equal(taxableValues(city[7].properties), null)
  assert.deepEqual(taxBase(city), { land: 315000, building: 440000, parcels: 5 })
})

test('split rates keep the land:building ratio and the 1:1 case is today’s millage', () => {
  const base = taxBase(city)
  const flat = splitRates(base, 1)
  close(flat.landMills, CITY_MILLAGE); close(flat.buildingMills, CITY_MILLAGE)
  for (const ratio of [1.5, 2, 4, 5.8]) {
    const rates = splitRates(base, ratio)
    close(rates.landMills / rates.buildingMills, ratio)
    assert.ok(rates.buildingMills < CITY_MILLAGE && rates.landMills > CITY_MILLAGE)
  }
  assert.throws(() => splitRates(base, -1), RangeError)
  assert.deepEqual(splitRates({ land: 0, building: 0 }, 4), { landMills: CITY_MILLAGE, buildingMills: CITY_MILLAGE, ratio: 4, millage: CITY_MILLAGE })
})

test('the shift is revenue-neutral over its base for any ratio', () => {
  const base = taxBase(city)
  for (const ratio of [1, 2, 3.5, 4, 6]) {
    const rates = splitRates(base, ratio)
    close(revenue(city, rates), revenue(city, rates, 'current'))
    close(revenue(city, rates, 'current'), (base.land + base.building) * CITY_MILLAGE / 1000)
  }
  const sum = city.map(p => parcelShift(p.properties, splitRates(base, 4))?.change ?? 0).reduce((a, b) => a + b, 0)
  close(sum, 0, 1e-9)
})

test('bills fall exactly for parcels whose land share is below the base land share', () => {
  const base = taxBase(city), rates = splitRates(base, 4), share = base.land / (base.land + base.building)
  for (const p of city) {
    const shift = parcelShift(p.properties, rates)
    if (!shift) continue
    assert.equal(shift.change < 0, shift.landShare < share, `land share ${shift.landShare}`)
  }
  const lot = parcelShift(parcel(90000, 0).properties, rates)
  close(lot.current, 90000 * CITY_MILLAGE / 1000)
  close(lot.proposed, 90000 * rates.landMills / 1000)
  close(lot.percent, rates.landMills / CITY_MILLAGE - 1)
})

test('choropleth classes and summary', () => {
  assert.equal(shiftClass(-.6), 'down-large')
  assert.equal(shiftClass(-.1), 'down')
  assert.equal(shiftClass(0), 'flat')
  assert.equal(shiftClass(.2), 'up')
  assert.equal(shiftClass(1.4), 'up-large')
  assert.equal(shiftClass(null), null)
  assert.equal(new Set(SHIFT_CLASSES.map(c => c.color)).size, SHIFT_CLASSES.length)
  const tagged = city.map((p, i) => ({ properties: { ...p.properties, kind: i % 2 ? 'odd' : 'even' } }))
  const summary = shiftSummary(tagged, splitRates(taxBase(city), 4), p => p.kind)
  assert.equal(summary.parcels, 5)
  assert.equal(summary.lower + summary.higher, 5)
  assert.equal(summary.byGroup.reduce((n, g) => n + g.parcels, 0), 5)
})

test('map parcels carry the values the tax shift needs', async () => {
  const { slimParcels } = await import('./plannerGeometry.js')
  const [slim] = slimParcels({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: { pin: 'A', neighborhood: 'Hazelwood', area: 'Hazelwood', tax_status: 'taxable', assessed_land: 9000, assessed_building: 41000, owner: 'never copied' } }] }).features
  assert.deepEqual(taxableValues(slim.properties), { land: 9000, building: 41000 })
  assert.equal(slim.properties.neighborhood, 'Hazelwood')
  assert.equal(slim.properties.owner, undefined)
})
