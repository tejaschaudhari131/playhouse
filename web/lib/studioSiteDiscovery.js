import { DEFAULT_SITE_FILTERS, passesRecordFilters, typePermission } from './sites.js'
import { resolveZoning } from './zoning.js'
import { floodStatus } from './floodEvidence.js'

export const SITE_PAGE_SIZE = 60
export const SITE_SORT_OPTIONS = [
  ['address', 'Address A–Z'],
  ['lot', 'Largest lot first'],
  ['lotSmall', 'Smallest lot first'],
  ['walk', 'Shortest estimated walk to frequent transit'],
  ['vacant', 'Recorded vacancy first'],
  ['cityOwned', 'Recorded City ownership first'],
  ['taxDelinquent', 'Tax-delinquency flag first'],
]
const flags = { vacant: 'vacant_lot', cityOwned: 'city_owned', taxDelinquent: 'tax_delinquent' }
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const populated = value => value !== '' && value !== null && value !== undefined

function addressOrder(a, b) {
  const x = a.properties, y = b.properties
  return Number(!x.address) - Number(!y.address)
    || String(x.address || x.pin).localeCompare(String(y.address || y.pin), undefined, { numeric: true })
    || String(x.pin).localeCompare(String(y.pin))
}

function numericOrder(a, b, field, descending) {
  const x = a.properties[field], y = b.properties[field]
  const validX = numeric(x), validY = numeric(y)
  if (validX !== validY) return validX ? -1 : 1
  return validX ? (descending ? y - x : x - y) : 0
}

function emptyPins(matches) {
  if (matches instanceof Map || matches instanceof Set) return new Set(matches.keys())
  return new Set((matches || []).map(row => typeof row === 'string' ? row : row.pin))
}

/** Public-record discovery, never a housing recommendation or an availability claim. */
export function studioSites(parcels, zoning, area, filters = {}, emptyMatches = null) {
  const query = (filters.query || '').trim().toLowerCase()
  const candidates = filters.emptyOnly ? emptyPins(emptyMatches) : null
  const rows = (parcels?.features || []).filter(feature => {
    const p = feature.properties
    if (!passesRecordFilters(p, { ...DEFAULT_SITE_FILTERS, ...filters, area })) return false
    if (query && !`${p.address || ''} ${p.pin}`.toLowerCase().includes(query)) return false
    // A numeric filter requires measured evidence; unknown must not become zero.
    if (populated(filters.minLotSqft) && (!numeric(p.lot_sqft) || !numeric(Number(filters.minLotSqft)) || p.lot_sqft < Number(filters.minLotSqft))) return false
    if (populated(filters.maxWalkMin) && (!numeric(p.walk_min_frequent) || !numeric(Number(filters.maxWalkMin)) || p.walk_min_frequent > Number(filters.maxWalkMin))) return false
    if (candidates && !candidates.has(p.pin)) return false
    if (filters.typeId && !['by_right', 'partial'].includes(typePermission(filters.typeId, resolveZoning(p.zoning_code, zoning)))) return false
    return true
  })
  const flag = flags[filters.sort]
  const flagRank = value => value === true ? 0 : value === false ? 1 : 2
  return rows.sort((a, b) => {
    const order = filters.sort === 'lot' ? numericOrder(a, b, 'lot_sqft', true)
      : filters.sort === 'lotSmall' ? numericOrder(a, b, 'lot_sqft', false)
        : filters.sort === 'walk' ? numericOrder(a, b, 'walk_min_frequent', false)
          : flag ? flagRank(a.properties[flag]) - flagRank(b.properties[flag]) : 0
    return order || addressOrder(a, b)
  })
}

export function sitePage(sites, requestedPage = 0) {
  const pages = Math.max(1, Math.ceil(sites.length / SITE_PAGE_SIZE))
  const page = Math.max(0, Math.min(pages - 1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0))
  const offset = page * SITE_PAGE_SIZE
  return { items: sites.slice(offset, offset + SITE_PAGE_SIZE), page, pages, total: sites.length,
    start: sites.length ? offset + 1 : 0, end: Math.min(sites.length, offset + SITE_PAGE_SIZE) }
}

export function siteRecordSummary(properties) {
  const lot = numeric(properties.lot_sqft) ? `${Math.round(properties.lot_sqft).toLocaleString()} sq ft` : 'Lot area unknown'
  const walk = numeric(properties.walk_min_frequent) ? `${properties.walk_min_frequent.toFixed(1)} min estimated walk` : 'Transit walk unknown'
  const record = (key, yes, no) => properties[key] === true ? yes : properties[key] === false ? no : `${yes}: unknown`
  return { lot, walk, flood: floodStatus(properties).label, flags: [
    record('vacant_lot', 'Vacancy recorded', 'No vacancy flag'),
    record('city_owned', 'City ownership recorded', 'No City ownership flag'),
    record('tax_delinquent', 'Tax delinquency recorded', 'No tax-delinquency flag'),
  ] }
}

/** Keep the fitting template ID, while applying the list's filters to visible candidates. */
export function filteredEmptyCandidates(parcels, zoning, filters, candidates) {
  if (!candidates.size) return candidates
  const subset = { features: (parcels?.features || []).filter(f => candidates.has(f.properties.pin)) }
  return new Map(studioSites(subset, zoning, null, filters, candidates).map(f => [f.properties.pin, candidates.get(f.properties.pin)]))
}
