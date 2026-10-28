import test from 'node:test'
import assert from 'node:assert/strict'
import { addressSearchPlan, createAddressSearchClient, createAddressSearchController, isParcelSearch, partitionAddressRows, searchAddressRows } from './addressSearch.js'

const hash = '0123456789abcdef'
const rows = [['0056F00338000000', '100 FORBES AVE', 'hazelwood'], ['0049N00010000000', '1000 FORBES AVE', 'squirrel-hill-north'], ['0001A00001000000', '200 FORBES AVE', 'squirrel-hill-north'], ['0002A00001000000', '200 BUTLER ST', 'lawrenceville']]
const neighborhoods = [{ id: 'hazelwood', name: 'Hazelwood' }, { id: 'squirrel-hill-north', name: 'Squirrel Hill North' }, { id: 'lawrenceville', name: 'Lawrenceville' }]
function fixture() {
  const { shards } = partitionAddressRows(rows)
  const manifest = { neighborhoods, addressSearch: { version: 1, shards: Object.fromEntries([...shards].map(([prefix, records]) => [prefix, [hash, records.length]])) } }
  const requests = []
  const client = createAddressSearchClient(manifest, async (url, { signal }) => {
    requests.push({ url, signal })
    return { ok: true, json: async () => shards.get(url.split('addresses-')[1].split('.')[0]) }
  })
  return { client, manifest, requests, shards }
}

test('prefix index preserves original address rows and deduplicates repeated prefixes per parcel', () => {
  const result = partitionAddressRows([...rows, ['extra01', 'FORBES FORBES', 'hazelwood'], ['extra02', '', 'hazelwood'], ['extra03', '1 ST', 'hazelwood']])
  assert.equal(result.shards.get('for').filter(row => row[0] === 'extra01').length, 1)
  assert.equal(result.indexed, rows.length + 1)
  assert.equal(result.missingAddress, 1)
  assert.equal(result.unsearchable, 1)
  assert.deepEqual([...new Map([...result.shards.values()].flat().map(row => [row[0], row])).values()].sort(), [...rows, ['extra01', 'FORBES FORBES', 'hazelwood']].sort())
  assert.throws(() => partitionAddressRows([rows[0], rows[0]]), /Duplicate/)
})

test('citywide street names and number-plus-street queries fetch one smallest shard and retain full labels', async () => {
  const { client, requests } = fixture()
  const found = await client.search('Forbes Avenue')
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /addresses-for\./)
  assert.equal(found.total, 3)
  assert.deepEqual(found.matches[0], { id: 'hazelwood', properties: { pin: rows[0][0], address: rows[0][1], neighborhood: 'Hazelwood' } })
  const numbered = await client.search('100 Forbes')
  assert.equal(numbered.total, 2)
  assert.equal(numbered.matches[0].properties.address, '100 FORBES AVE', 'exact house number precedes a longer prefix match')
  assert.match(requests[1].url, /addresses-100\./)
  await client.search('Forbes')
  assert.equal(requests.length, 2, 'cached shard reused across compatible queries')
  const { matches } = searchAddressRows(rows, ['but', 'st'], neighborhoods)
  assert.equal(matches[0].properties.address, '200 BUTLER ST')
})

test('blank, short, full-PIN and impossible queries do not download any index', async () => {
  const { client, manifest, requests } = fixture()
  for (const query of ['', 'fo', 'AVE', '0056F00338000000', 'gibberish']) await client.search(query)
  assert.equal(requests.length, 0)
  assert.equal(addressSearchPlan(manifest, 'FORBES').status, 'ready', 'a street name is not a parcel PIN')
  assert.equal(addressSearchPlan({}, 'Forbes').status, 'unavailable')
  assert.equal(addressSearchPlan(manifest, '0056F00338000000').status, 'pin')
  assert.equal(isParcelSearch('0008A00028000B00'), true, 'unit-letter county PIN')
  assert.equal(isParcelSearch('SITE762A5CE6AFCC07DE'), true, 'City inventory synthetic ID')
  assert.equal(isParcelSearch('FORBES'), false)
})

function scheduler() {
  let next = 0
  const jobs = new Map()
  return { schedule: callback => { const id = ++next; jobs.set(id, callback); return id }, cancel: id => jobs.delete(id), run: async () => { const job = jobs.values().next().value; jobs.clear(); return job?.() }, jobs }
}

test('debounce fetches only the latest query and clear/dispose cancel pending work', async () => {
  const { client, requests } = fixture(), clock = scheduler(), states = []
  const control = createAddressSearchController(client, state => states.push(state), clock)
  control.update('Forbes'); control.update('Butler')
  assert.equal(requests.length, 0)
  assert.equal(clock.jobs.size, 1)
  await clock.run()
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /addresses-but\./)
  assert.equal(states.at(-1).matches[0].properties.address, '200 BUTLER ST')
  control.update('Forbes'); control.update('')
  assert.equal(clock.jobs.size, 0)
  assert.equal(states.at(-1).status, 'idle')
  control.update('Forbes'); control.dispose(); await clock.run()
  assert.equal(requests.length, 1)
})

test('late responses cannot replace newer results even if the fetcher ignores abort', async () => {
  const clock = scheduler(), states = [], releases = new Map(), signals = new Map()
  const client = { plan: query => ({ status: 'ready', key: query }), search: (query, signal) => { signals.set(query, signal); return new Promise(resolve => releases.set(query, () => resolve({ matches: [{ query }], pending: false, status: 'ready', query }))) } }
  const control = createAddressSearchController(client, state => states.push(state), clock)
  control.update('old'); const old = clock.run()
  control.update('new'); const newer = clock.run()
  assert.equal(signals.get('old').aborted, true)
  releases.get('new')(); await newer
  releases.get('old')(); await old
  assert.deepEqual(states.at(-1).matches, [{ query: 'new' }])
  control.dispose()
})

test('network failure is distinct from empty results and exposes no stale matches', async () => {
  const clock = scheduler(), states = []
  const client = { plan: query => ({ status: 'ready', key: query }), search: async () => { throw new Error('Test download failed') } }
  const control = createAddressSearchController(client, state => states.push(state), clock)
  control.update('Forbes'); await clock.run()
  assert.equal(states.at(-1).status, 'error')
  assert.equal(states.at(-1).error, 'Test download failed')
  assert.deepEqual(states.at(-1).matches, [])
})

test('current neighborhood is prioritized before downtown and duplicate addresses retain their PINs', async () => {
  const places = [{ id: 'downtown', name: 'Central Business District' }, { id: 'east-liberty', name: 'East Liberty' }]
  const records = [['downtown-b', '524 PENN AVE', 'downtown'], ['east', '6100 PENN AVE', 'east-liberty'], ['downtown-a', '524 PENN AVE', 'downtown']]
  const result = searchAddressRows(records, ['penn', 'ave'], places, 6, 'East Liberty')
  assert.deepEqual(result.matches.map(row => row.properties.pin), ['east', 'downtown-a', 'downtown-b'])
  assert.equal(result.total, 3)
  assert.equal(result.matches[1].properties.address, result.matches[2].properties.address)
  assert.notEqual(result.matches[1].properties.pin, result.matches[2].properties.pin)
  assert.equal(searchAddressRows(records, ['penn'], places, 1, 'east-liberty').matches[0].properties.pin, 'east')
  const manifest = { neighborhoods: places, addressSearch: { version: 1, shards: { pen: [hash, records.length] } } }
  const client = createAddressSearchClient(manifest, async () => ({ ok: true, json: async () => records }), 'East Liberty')
  assert.equal((await client.search('Penn Ave')).matches[0].properties.pin, 'east')
})
