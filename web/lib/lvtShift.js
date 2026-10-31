/**
 * Illustrative, revenue-neutral land value tax shift for the City of Pittsburgh real estate levy.
 *
 * Method follows the Center for Land Economics' open LVTShift toolkit (https://landeconomics.org/lvtshift):
 * rebuild the current tax from assessed value × millage, then solve for a split rate that raises the same
 * revenue with land taxed `ratio` times the building rate:
 *   current revenue = r × (ΣL + ΣB) = rB × (ratio × ΣL + ΣB)  ⇒  rB = r (ΣL + ΣB) / (ratio ΣL + ΣB), rL = ratio × rB.
 * Only the City levy is shifted (Pittsburgh taxed land at a higher City rate from 1913 to 2001); school and County
 * levies are unchanged. Values are the County's local assessed land and building values on taxable parcels.
 * Abatements, homestead and senior relief, appeals, PURTA and collection rates are ignored; it is an estimate.
 */
export const CITY_MILLAGE = 9.67
export const MILLAGE_SOURCE = { label: 'City of Pittsburgh 2026 real estate millage, Code §263.01 (Ordinance 39-2025)', url: 'https://ecode360.com/45440133' }
export const UNCHANGED_LEVIES = [
  { label: 'Pittsburgh Public Schools (2026)', mills: 10.457, url: 'https://www.wesanews.org/education/2025-12-17/pittsburgh-public-schools-2026-tax-increase-approved' },
  { label: 'Allegheny County (2026)', mills: 6.43, url: 'https://alleghenycountytreasurer.us/real-estate-tax/local-and-school-district-tax-millage/' },
]
export const RATIO_RANGE = { min: 1, max: 6, step: .5, default: 4 }
export const HISTORIC_RATIOS = [
  { ratio: 2, label: '2:1 — Pittsburgh’s ratio after the 1913 phase-in' },
  { ratio: 5.8, label: '5.8:1 — highest recorded Pittsburgh ratio (Banzhaf & Lavery 2008)' },
]

const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** Land and building values when the parcel is taxable with both values recorded; otherwise null. */
export function taxableValues(properties) {
  if (properties?.tax_status !== 'taxable') return null
  const land = properties.assessed_land, building = properties.assessed_building
  return finite(land) && finite(building) ? { land, building } : null
}

/** Sum of taxable land and building value over parcel features or property records. */
export function taxBase(records) {
  let land = 0, building = 0, parcels = 0
  for (const record of records) {
    const values = taxableValues(record?.properties ?? record)
    if (!values) continue
    land += values.land; building += values.building; parcels++
  }
  return { land, building, parcels }
}

/** Revenue-neutral split rates (mills) for a base and land:building ratio. */
export function splitRates(base, ratio = RATIO_RANGE.default, millage = CITY_MILLAGE) {
  if (!(ratio >= 0) || !Number.isFinite(ratio)) throw new RangeError('ratio must be a finite number ≥ 0')
  const total = base.land + base.building, weighted = ratio * base.land + base.building
  if (!(total > 0) || !(weighted > 0)) return { landMills: millage, buildingMills: millage, ratio, millage }
  const buildingMills = millage * total / weighted
  return { landMills: ratio * buildingMills, buildingMills, ratio, millage }
}

/** One parcel's City bill now and under the split rate, in dollars; null when not taxable or values are missing. */
export function parcelShift(properties, rates) {
  const values = taxableValues(properties)
  if (!values) return null
  const current = (values.land + values.building) * rates.millage / 1000
  const proposed = (values.land * rates.landMills + values.building * rates.buildingMills) / 1000
  const change = proposed - current
  return { ...values, current, proposed, change, percent: current > 0 ? change / current : 0, landShare: values.land + values.building > 0 ? values.land / (values.land + values.building) : 0 }
}

export function revenue(records, rates, which = 'proposed') {
  let total = 0
  for (const record of records) { const shift = parcelShift(record?.properties ?? record, rates); if (shift) total += shift[which] }
  return total
}

/**
 * Choropleth classes on percent change of the City bill. A parcel's bill falls exactly when its land share is
 * below the base's land share, so the neutral class is centred on zero.
 */
export const SHIFT_CLASSES = [
  { id: 'down-large', label: 'Falls 25% or more', max: -.25, color: '#2166ac' },
  { id: 'down', label: 'Falls 5–25%', max: -.05, color: '#67a9cf' },
  { id: 'flat', label: 'Within ±5%', max: .05, color: '#e8e4d8' },
  { id: 'up', label: 'Rises 5–50%', max: .5, color: '#f4a582' },
  { id: 'up-large', label: 'Rises 50% or more', max: Infinity, color: '#b2182b' },
]
export function shiftClass(percent) {
  if (typeof percent !== 'number' || Number.isNaN(percent)) return null
  return SHIFT_CLASSES.find(c => percent < c.max).id
}
export const SHIFT_COLOR = Object.fromEntries(SHIFT_CLASSES.map(c => [c.id, c.color]))
/** Map colours, including taxable-value gaps (exempt, PURTA or no recorded value). */
export const LVT_MAP_COLORS = { ...SHIFT_COLOR, none: '#c9ccd1' }

export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Summary over loaded parcels: share whose bill falls, median dollar change and median change by a grouping key.
 * `group` maps a property record to a label (e.g. building type category).
 */
export function shiftSummary(records, rates, group = () => 'all') {
  const changes = [], groups = new Map()
  let lower = 0, higher = 0
  for (const record of records) {
    const properties = record?.properties ?? record, shift = parcelShift(properties, rates)
    if (!shift) continue
    changes.push(shift.change)
    if (shift.change < -.005) lower++; else if (shift.change > .005) higher++
    const key = group(properties)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(shift.change)
  }
  return {
    parcels: changes.length, lower, higher,
    lowerShare: changes.length ? lower / changes.length : null,
    medianChange: median(changes),
    byGroup: [...groups].map(([key, list]) => ({ key, parcels: list.length, medianChange: median(list) })).sort((a, b) => b.parcels - a.parcels),
  }
}
