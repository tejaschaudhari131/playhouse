/** A removal references one recorded footprint on one matched parcel, never a housing type. */
export function normalizeBuildingRef(value) {
  const identifier = raw => typeof raw === 'string' ? raw.trim() : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : ''
  const id = identifier(value?.id), pin = identifier(value?.pin)
  return id && pin ? { id, pin } : null
}

export function recordedBuildingRef(feature) {
  return normalizeBuildingRef({ id: feature?.properties?.id ?? feature?.id, pin: feature?.properties?.pin })
}

export const buildingRefKey = ref => JSON.stringify([ref.id, ref.pin])

/** Keep source evidence immutable. Missing evidence and unmatched footprints stay unknown. */
export function retainedBuildings(features, demolitions = []) {
  if (!Array.isArray(features) || !Array.isArray(demolitions) || !demolitions.length) return features
  const removed = new Set(demolitions.map(normalizeBuildingRef).filter(Boolean).map(buildingRefKey))
  if (!removed.size) return features
  const retained = features.filter(feature => {
    const ref = recordedBuildingRef(feature)
    return !ref || !removed.has(buildingRefKey(ref))
  })
  return retained.length === features.length ? features : retained
}
