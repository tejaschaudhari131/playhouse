import test from 'node:test'
import assert from 'node:assert/strict'
import { sitePage, siteRecordSummary, studioSites } from './studioSiteDiscovery.js'

const feature = (pin, props = {}) => ({ type: 'Feature', properties: { pin, address: `${pin} Main St`, area: 'Hazelwood', ...props } })
const pins = rows => rows.map(row => row.properties.pin)
const find = (features, filters, candidates) => studioSites({ features }, {}, 'Hazelwood', filters, candidates)

test('size and transit filters require known values and preserve exact numeric boundaries', () => {
  const rows = [feature('a', { lot_sqft: 3000.5, walk_min_frequent: 5.25 }), feature('b', { lot_sqft: 3000.49, walk_min_frequent: 5.26 }), feature('c', { lot_sqft: null, walk_min_frequent: null }), feature('d', { lot_sqft: NaN, walk_min_frequent: NaN })]
  assert.deepEqual(pins(find(rows, { minLotSqft: 3000.5, maxWalkMin: 5.25 })), ['a'])
  assert.deepEqual(pins(find(rows, { minLotSqft: 0 })), ['a', 'b'])
  assert.deepEqual(pins(find(rows, { minLotSqft: '' })), ['a', 'b', 'c', 'd'])
  assert.deepEqual(find(rows, { maxWalkMin: 'invalid' }), [])
})

test('numeric sorts keep unknown last in either direction without mutating input records', () => {
  const rows = [feature('a', { lot_sqft: null }), feature('b', { lot_sqft: 5000, walk_min_frequent: 8 }), feature('c', { lot_sqft: 1000, walk_min_frequent: 0 })]
  const snapshot = structuredClone(rows)
  assert.deepEqual(pins(find(rows, { sort: 'lot' })), ['b', 'c', 'a'])
  assert.deepEqual(pins(find(rows, { sort: 'lotSmall' })), ['c', 'b', 'a'])
  assert.deepEqual(pins(find(rows, { sort: 'walk' })), ['c', 'b', 'a'])
  assert.deepEqual(rows, snapshot)
})

test('record flag sorts distinguish true, false and unknown without inferring availability', () => {
  const rows = [feature('a'), feature('b', { vacant_lot: false, city_owned: false, tax_delinquent: false }), feature('c', { vacant_lot: true, city_owned: true, tax_delinquent: true })]
  for (const sort of ['vacant', 'cityOwned', 'taxDelinquent']) assert.deepEqual(pins(find(rows, { sort })), ['c', 'b', 'a'])
  assert.deepEqual(pins(find(rows, { vacant: true, cityOwned: true, taxDelinquent: true })), ['c'])
  const unknown = siteRecordSummary(rows[0].properties)
  assert.equal(unknown.lot, 'Lot area unknown')
  assert.equal(unknown.walk, 'Transit walk unknown')
  assert.ok(unknown.flags.every(label => label.includes('unknown')))
  assert.equal(siteRecordSummary({ lot_sqft: 0, walk_min_frequent: 0 }).walk, '0.0 min estimated walk')
})

test('discovery retains geography, zoning, flood and text filters and uses supplied empty-space evidence only', () => {
  const rows = [feature('a', { address: '2 Main St', sfha_overlap: 0, flood_02_overlap: 0 }), feature('b', { address: '10 Main St' }), feature('c', { address: '1 Main St', area: 'Elsewhere' })]
  assert.deepEqual(pins(find(rows, {})), ['a', 'b'])
  assert.deepEqual(pins(find(rows, { query: '10 MAIN' })), ['b'])
  assert.deepEqual(pins(find(rows, { flood: 'none' })), ['a'])
  assert.deepEqual(find(rows, { typeId: 'triplex' }), [])
  assert.deepEqual(pins(find(rows, { emptyOnly: true }, new Map([['b', 'single_family']]))), ['b'])
  assert.deepEqual(pins(find(rows, { emptyOnly: true }, [{ pin: 'a' } ])), ['a'])
  assert.deepEqual(find(rows, { emptyOnly: true }), [])
})

test('every result remains reachable beyond the first 60 and pagination clamps after filtering', () => {
  const rows = Array.from({ length: 121 }, (_, i) => feature(String(i)))
  assert.equal(sitePage(rows, 0).items.length, 60)
  assert.equal(sitePage(rows, 1).items.length, 60)
  const last = sitePage(rows, 2)
  assert.equal(last.start, 121)
  assert.equal(last.end, 121)
  assert.equal(last.items[0], rows[120])
  assert.equal(sitePage(rows.slice(0, 4), 2).page, 0)
  assert.deepEqual(sitePage([], 10), { items: [], page: 0, pages: 1, total: 0, start: 0, end: 0 })
  assert.deepEqual([0, 1, 2].flatMap(page => sitePage(rows, page).items), rows)
})
