import { geometriesOverlap } from './plannerGeometry.js'

const identifier = raw => typeof raw === 'string' ? raw.trim() : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : ''
// County outlines without a matched parcel keep their source ID, which is unique citywide.
const UNMATCHED = '#unmatched'

/** A removal references one recorded footprint on one matched parcel, never a housing type. */
export function normalizeBuildingRef(value) {
  const id = identifier(value?.id), pin = identifier(value?.pin)
  return id && pin ? { id, pin } : null
}

export function recordedBuildingRef(feature) {
  return normalizeBuildingRef({ id: feature?.properties?.id ?? feature?.id, pin: feature?.properties?.pin })
}

/** A scenario demolition. `pin` is the footprint's matched parcel; `site` is the parcel
 * workflow that removed a footprint crossing from another parcel. Unmatched outlines use
 * the removing site as `pin`, so the plan can still load that site's evidence. */
export function normalizeDemolition(value) {
  const ref = normalizeBuildingRef(value)
  if (!ref) return null
  const site = identifier(value?.site)
  return { ...ref, ...(value?.unmatched === true ? { unmatched: true } : {}), ...(site && site !== ref.pin ? { site } : {}) }
}

export const buildingRefKey = ref => JSON.stringify([ref.id, ref.unmatched ? UNMATCHED : ref.pin])

/** Identity of a selection or demolition entry, including unmatched outlines. */
export function demolitionKey(entry) {
  const id = identifier(entry?.id)
  if (!id) return null
  if (entry.unmatched === true) return buildingRefKey({ id, unmatched: true })
  const pin = identifier(entry.pin)
  return pin ? buildingRefKey({ id, pin }) : null
}

export function footprintKey(feature) {
  const id = identifier(feature?.properties?.id ?? feature?.id), pin = identifier(feature?.properties?.pin)
  return id ? buildingRefKey({ id, pin, unmatched: !pin }) : null
}

export const demolitionSite = entry => entry.site || entry.pin

/** Demolition reference for a footprint removed from the selected parcel's workflow. */
export function footprintRef(feature, sitePin) {
  const id = identifier(feature?.properties?.id ?? feature?.id), pin = identifier(feature?.properties?.pin), site = identifier(sitePin)
  if (!id) return null
  if (pin) return normalizeDemolition({ id, pin, site })
  return site ? { id, pin: site, unmatched: true } : null
}

export function isDemolished(feature, demolitions = []) {
  const key = footprintKey(feature)
  return !!key && demolitions.some(entry => demolitionKey(entry) === key)
}

/** Keep source evidence immutable. Missing evidence and unmatched footprints stay unknown. */
export function retainedBuildings(features, demolitions = []) {
  if (!Array.isArray(features) || !Array.isArray(demolitions) || !demolitions.length) return features
  const removed = new Set(demolitions.map(normalizeDemolition).filter(Boolean).map(buildingRefKey))
  if (!removed.size) return features
  const retained = features.filter(feature => {
    const key = footprintKey(feature)
    return !key || !removed.has(key)
  })
  return retained.length === features.length ? features : retained
}

/** Footprints a parcel workflow can inspect: its matched records first, then any outline
 * crossing or touching the parcel, whichever parcel (if any) it was matched to. */
export function siteFootprints(features, parcel) {
  if (!Array.isArray(features) || !parcel?.geometry) return []
  const pin = parcel.properties?.pin
  const own = [], crossing = []
  for (const feature of features) {
    if (pin && feature?.properties?.pin === pin) own.push(feature)
    else if (feature?.geometry && geometriesOverlap(parcel.geometry, feature.geometry)) crossing.push(feature)
  }
  return [...own, ...crossing]
}

/** Recorded footprints under a proposed outline. Proposed buildings and reservations are separate obstacles. */
export function blockingFootprints(features, geometry) {
  if (!Array.isArray(features) || !geometry) return []
  return features.filter(feature => feature?.geometry && geometriesOverlap(geometry, feature.geometry))
}
