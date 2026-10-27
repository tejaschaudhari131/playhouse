/** The parcel export records overlap fractions, not a parcel-level flood determination. */
export const FLOOD_FILTER_OPTIONS = [
  ['any', 'Any flood status'],
  ['none', 'No mapped flood overlap'],
  ['mapped', 'Mapped flood overlap'],
  ['unknown', 'Unknown flood status'],
]

export const FLOOD_SCOPE = 'Screen covers FEMA Special Flood Hazard Areas (SFHA) and 0.2% annual-chance zones. No mapped overlap does not mean flood-free.'
const FEMA_URL = 'https://www.fema.gov/flood-maps/national-flood-hazard-layer'
const fraction = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null

export function floodStatus(properties = {}) {
  const sfha = fraction(properties?.sfha_overlap), annual02 = fraction(properties?.flood_02_overlap)
  const status = sfha > 0 || annual02 > 0 ? 'mapped' : sfha === 0 && annual02 === 0 ? 'none' : 'unknown'
  return { status, sfha, annual02, complete: sfha !== null && annual02 !== null,
    label: { mapped: 'Mapped flood overlap', none: 'No mapped flood overlap', unknown: 'Flood status unknown' }[status] }
}

/** Shared by site lists and map highlights; missing values are never assumed to be zero. */
export function passesFloodFilter(properties, filter = 'any') {
  if (!filter || filter === 'any') return true
  const evidence = floodStatus(properties)
  if (filter === 'no_sfha') return evidence.sfha === 0 // Existing Explorer option.
  if (['none', 'mapped', 'unknown'].includes(filter)) return evidence.status === filter
  return true
}

export function floodEvidence(properties, sources = []) {
  const source = (Array.isArray(sources) ? sources : []).find(row => /FEMA.*(?:Flood|NFHL)|National Flood Hazard Layer/i.test(row.name || row.catalog_name || ''))
  return { ...floodStatus(properties), source: {
    name: source?.catalog_name || source?.name || 'FEMA National Flood Hazard Layer',
    url: source?.catalog_url || source?.url || FEMA_URL,
    retrievedAt: source?.pulled_at || null,
    // A source pull date is not a map panel's legal effective date.
    effectiveDate: source?.effective_date || null,
    status: source?.status || null,
  } }
}

export function floodPercent(value) {
  if (fraction(value) === null) return 'Unknown'
  if (value > 0 && value < 0.001) return '<0.1%'
  return `${Number((value * 100).toFixed(1))}%`
}
