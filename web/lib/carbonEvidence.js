const finite = value => typeof value === 'number' && Number.isFinite(value)
const clamp = value => Math.max(0, Math.min(1, value))
const ENERGY = { single_family: 120.7, townhouse_duplex: 85.4, small_apartment: 68, large_apartment: 36.2 }

/** Same published RECS/tier proxy as the pipeline, using corrected source trip counts. */
export function carbonEvidence(props, typeId, archivedIndex = null) {
  const supplied = ['trips_within_400m', 'nearest_stop_m', 'transit_available'].some(id => Object.hasOwn(props, id))
  if (!supplied) return { index: finite(archivedIndex) ? archivedIndex : null, method: finite(archivedIndex) ? 'archived_proxy' : 'unavailable', confidence: 'Low', evidence: 'fallback', transit: null }
  if (!ENERGY[typeId]) return { index: null, method: 'unavailable', confidence: 'Low', evidence: 'assumed', transit: null }
  const operational = ENERGY[typeId] / ENERGY.single_family
  const embodied = typeId === 'single_family' ? 1 : .6
  const building = .5 * operational + .5 * embodied
  const trips = props.trips_within_400m, distance = props.nearest_stop_m
  const hasTransit = props.transit_available !== false && finite(trips) && trips >= 0
  const walk = hasTransit ? finite(distance) ? clamp(1 - distance / 800) : 0 : null
  const frequency = hasTransit ? clamp(Math.log1p(trips) / Math.log1p(250)) : null
  // The pipeline rounds transit to one decimal before computing its carbon proxy.
  const transit = hasTransit ? Math.round(1000 * (.45 * walk + .55 * frequency)) / 10 : null
  const index = Math.round(1000 * (transit === null ? building : .6 * building + .4 * (1 - transit / 100))) / 10
  return { index, method: 'recomputed_source_proxy', confidence: 'Low', evidence: 'assumed', transit, trips: hasTransit ? trips : null, countMethod: props.transit_count_method || 'source-count', operational, embodied, building,
    note: 'Relative per-home proxy using existing-stock energy and assumed embodied tiers. It is not a new-construction emissions estimate. Source transit is held fixed during a scenario; no causal mode shift is inferred.' }
}
