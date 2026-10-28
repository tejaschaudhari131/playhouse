import test from 'node:test'
import assert from 'node:assert/strict'
import { choosePreferredStop, groupStopAliases, uniqueTransitTrips } from './transitStops.js'
import { stopsWithin } from './geo.js'

const groups = { a: { route_id: '56', direction_id: '0', trips: 30 }, b: { route_id: '56', direction_id: '1', trips: 25 }, c: { route_id: '75', direction_id: '0', trips: 15 } }
const stops = [{ stop_id: '1', name: 'SYLVAN', coordinates: [-79.96, 40.45], weekday_trips: 30, service_groups: ['a'] },
  { stop_id: '2', name: 'SYVAN', coordinates: [-79.96, 40.45], weekday_trips: 30, service_groups: ['a'] },
  { stop_id: '3', name: 'SYLVAN', coordinates: [-79.96, 40.45], weekday_trips: 25, service_groups: ['b'] }]

test('one trip at several nearby stops counts once; opposite directions remain distinct', () => {
  assert.deepEqual(uniqueTransitTrips(stops, groups), { trips: 55, routeTrips: { '56': 55 }, routeDirectionTrips: { '56:0': 30, '56:1': 25 }, method: 'unique_boardable_gtfs_trip_per_route' })
  const collection = { service_groups: groups, features: stops.map(s => ({ type: 'Feature', geometry: { type: 'Point', coordinates: s.coordinates }, properties: { ...s, routes: ['56'] } })) }
  assert.equal(stopsWithin(collection, -79.96, 40.45, 400).trips, 55)
  assert.equal(stopsWithin(collection, -80.5, 40.45, 400).trips, 0)
})

test('legacy multi-stop totals are unknown; single-stop archived schedules remain usable', () => {
  assert.equal(uniqueTransitTrips(stops, null).trips, null)
  assert.equal(uniqueTransitTrips(stops.slice(0, 1), null).trips, 30)
  assert.equal(uniqueTransitTrips(stops, {}).trips, null)
})

test('only colocated aliases with identical services group, preserving source spelling and directions', () => {
  const original = structuredClone(stops)
  const rows = groupStopAliases(stops)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].aliases[0].name, 'SYVAN')
  assert.equal(rows[1].stop_id, '3')
  assert.equal(groupStopAliases([...stops, { ...stops[0], stop_id: '4', coordinates: [-79.9602, 40.45] }]).length, 3)
  assert.deepEqual(stops, original)
})

test('default choice balances walking and waiting, has deterministic ties and explains assumptions', () => {
  const candidates = [{ stop_id: '1', distance: 80, weekday_trips: 20 }, { stop_id: '2', distance: 400, weekday_trips: 100 }, { stop_id: '3', distance: 1000, weekday_trips: 120 }]
  const preferred = choosePreferredStop(candidates)
  assert.equal(preferred.stop_id, '2')
  assert.equal(preferred.selection.walkMinutes, 5)
  assert.match(preferred.selection.reason, /straight-line/)
  assert.equal(choosePreferredStop(candidates, { walkMinutesByStop: { 1: 3, 2: 90, 3: 15 } }).stop_id, '3')
  assert.equal(choosePreferredStop([{ ...candidates[0], stop_id: '2' }, candidates[0]]).stop_id, '1')
  assert.equal(choosePreferredStop([]), null)
})
