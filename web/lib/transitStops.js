import { haversineMeters } from './geo.js'
import { geometryCenter } from './plannerGeometry.js'

/** Union exact service groups; never estimate unique trips by summing stop totals. */
export function uniqueTransitTrips(stops, groups) {
  if (!stops.length) return { trips: 0, routeTrips: {}, routeDirectionTrips: {}, method: 'unique_boardable_gtfs_trip_per_route' }
  // A single stop needs no cross-stop deduplication; archived fixtures remain readable.
  if (!groups || stops.some(stop => !Array.isArray(stop.service_groups))) {
    return { trips: stops.length === 1 ? stops[0].weekday_trips : null, routeTrips: null, routeDirectionTrips: null,
      method: stops.length === 1 ? 'single_stop_schedule' : 'trip_identity_unavailable' }
  }
  if (stops.some(stop => [...new Set(stop.service_groups)].reduce((sum, id) => sum + (groups[id]?.trips ?? NaN), 0) !== stop.weekday_trips)) {
    return { trips: null, routeTrips: null, routeDirectionTrips: null, method: 'trip_identity_unavailable' }
  }
  const ids = new Set(stops.flatMap(stop => stop.service_groups)), routeTrips = {}, routeDirectionTrips = {}
  let trips = 0
  for (const id of ids) {
    const group = groups[id]
    if (!group || !Number.isInteger(group.trips) || group.trips < 0) return { trips: null, routeTrips: null, routeDirectionTrips: null, method: 'trip_identity_unavailable' }
    trips += group.trips
    routeTrips[group.route_id] = (routeTrips[group.route_id] || 0) + group.trips
    const directionKey = `${group.route_id}:${group.direction_id}`
    routeDirectionTrips[directionKey] = (routeDirectionTrips[directionKey] || 0) + group.trips
  }
  return { trips, routeTrips, routeDirectionTrips, method: 'unique_boardable_gtfs_trip_per_route' }
}

const sameGroups = (a, b) => a.service_groups?.length > 0 && b.service_groups?.length > 0
  && [...a.service_groups].sort().join('|') === [...b.service_groups].sort().join('|')

/** Only aliases with matching trips at the same physical point may collapse.
 * Distinct platforms, directions and nearby intersections retain their stop IDs.
 */
export function groupStopAliases(stops) {
  const rows = []
  for (const stop of [...stops].sort((a, b) => String(a.stop_id).localeCompare(String(b.stop_id), 'en', { numeric: true }))) {
    const alias = rows.find(row => sameGroups(row, stop) && haversineMeters(...row.coordinates, ...stop.coordinates) <= 5)
    if (alias) {
      alias.aliases.push({ stop_id: String(stop.stop_id), name: stop.name, coordinates: stop.coordinates })
      alias.aliasNames = [...new Set([...alias.aliasNames, stop.name])]
    } else rows.push({ ...stop, aliases: [], aliasNames: [stop.name] })
  }
  return rows
}

export function nearbyTransitStops(feature, collection) {
  const point = geometryCenter(feature?.geometry)
  if (!point) return []
  const stops = (collection?.features || []).filter(f => f.geometry?.type === 'Point' && f.properties.weekday_trips > 0).map(f => ({
    ...f.properties, coordinates: f.geometry.coordinates,
    distance: haversineMeters(...point, ...f.geometry.coordinates),
  })).filter(stop => stop.distance <= 1200)
  // Preserve all source IDs so old saved scenarios and map clicks still resolve.
  // Only display names are shared for proven aliases; consumers can show group IDs.
  const canonical = new Map(groupStopAliases(stops).flatMap(row => [row.stop_id, ...row.aliases.map(a => a.stop_id)].map(id => [String(id), row])))
  return stops.map(stop => {
    const row = canonical.get(String(stop.stop_id))
    return { ...stop, display_name: row.name, alias_stop_ids: row.aliases.map(a => a.stop_id), alias_names: row.aliasNames,
      stop_label: `${row.name} · stop ${stop.stop_id}${stop.route_weekday_trips?.length ? ` · ${[...new Set(stop.route_weekday_trips.flatMap(r => r.headsigns?.length ? r.headsigns : [`direction ${r.direction_id || 'not supplied'}`]))].join(' / ')}` : ''}` }
  }).sort((a, b) => a.distance - b.distance || String(a.stop_id).localeCompare(String(b.stop_id), 'en', { numeric: true }))
}

/** Minimum modeled walk + half the average departure interval, not a frequency cutoff.
 * Routed minutes may be supplied; otherwise the initial choice explicitly uses
 * straight-line walking at 80 m/min. No destination/transfer equivalence is implied.
 */
export function choosePreferredStop(stops, { serviceHours = 18, walkMinutesByStop } = {}) {
  const ranked = stops.flatMap(stop => {
    const walk = walkMinutesByStop ? walkMinutesByStop[String(stop.stop_id)] : stop.distance / 80
    if (!Number.isFinite(walk) || walk < 0 || !Number.isFinite(stop.weekday_trips) || stop.weekday_trips <= 0) return []
    const wait = serviceHours * 60 / stop.weekday_trips / 2
    return [{ ...stop, selection: { method: walkMinutesByStop ? 'routed_walk_plus_average_wait' : 'straight_line_walk_plus_average_wait', walkMinutes: walk, waitMinutes: wait, totalMinutes: walk + wait, serviceHours,
      reason: `Lowest estimated ${walkMinutesByStop ? 'routed' : 'straight-line'} walk + average wait among nearby stops. Assumes ${serviceHours} service hours and evenly spaced departures; destinations and transfers are not compared.` } }]
  }).sort((a, b) => a.selection.totalMinutes - b.selection.totalMinutes || a.distance - b.distance || String(a.stop_id).localeCompare(String(b.stop_id), 'en', { numeric: true }))
  return ranked[0] || null
}
