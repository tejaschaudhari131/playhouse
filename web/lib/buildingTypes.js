/**
 * "Highlight building types": the recorded County land use (assessment USEDESC / CLASSDESC) grouped into
 * planning categories. A parcel's use describes the whole property, so garages and other outbuildings take
 * the category of the parcel they sit on. Never an occupancy survey or a recommended type.
 */
export const BUILDING_TYPE_CATEGORIES = [
  { id: 'single_family', label: 'Single-family', detail: 'Detached, row and townhouses: one home per parcel', color: '#3566d6' },
  { id: 'two_family', label: 'Two-family / duplex', detail: 'County use TWO FAMILY', color: '#0f9b94' },
  { id: 'small_multifamily', label: 'Small multifamily · 3–4', detail: 'THREE FAMILY, FOUR FAMILY and house conversions', color: '#e3a008' },
  { id: 'apartments', label: 'Apartments · 5+', detail: 'Apartments, condominiums, senior and public housing', color: '#d6336c' },
  { id: 'commercial', label: 'Commercial / mixed-use', detail: 'Retail, office, industrial and shops with homes over', color: '#7048e8' },
  { id: 'institutional', label: 'Institutional / other', detail: 'Government, schools, worship, hospitals, utilities and outbuildings', color: '#8b6a4f' },
  { id: 'vacant', label: 'Vacant lot', detail: 'Parcels recorded as vacant land; drawn as the lot, not a building', color: '#7cc576' },
  { id: 'unknown', label: 'Use unknown', detail: 'No matched County use', color: '#b4bcc8' },
]
export const BUILDING_TYPE_BY_ID = Object.fromEntries(BUILDING_TYPE_CATEGORIES.map(c => [c.id, c]))
export const BUILDING_TYPE_IDS = BUILDING_TYPE_CATEGORIES.map(c => c.id)

const SINGLE = new Set(['SINGLE FAMILY', 'ROWHOUSE', 'TOWNHOUSE', 'MOBILE HOME', 'MOBILE HOME (IN PARK)', 'DWG USED AS OFFICE', 'DWG USED AS RETAIL'])
const SMALL = new Set(['THREE FAMILY', 'FOUR FAMILY', 'DWG APT CONVERSION'])
const VACANT = /VACANT|BUILDERS LOT|DEVELOPMENTAL LAND|COMMON AREA OR GREENBELT/
const APARTMENTS = /^APART|APRTM CONDOS|^CONDOMINIUM$|INDEPENDENT LIVING|HOUSING AU|^HUD PROJ|OTHER COMMERCIAL HOUSING/
const MIXED = /APT'S OVER|APARTMENTS OVER|RETL\/|OFFICE\/RETAIL/
const INSTITUTIONAL = /CHURCH|SCHOOL|COLLEGE|BOARD OF EDUCATION|NURSING HOME|HOS\/HOMES|GROUP HOME|CEMETERY|FIRE DEPARTMENT|PUBLIC PARK|GOVERNMENT|URBAN RENEWAL|AUX BUILDING|COMMON AREA|RIGHT OF WAY|RETENTION POND|H\.O\.A|CONDO GARAGE|COAL RIGHTS|AIR RIGHTS|MUNICIPAL|COMMUNITY REINVESTMENT/

/** Category id for a County use description and class, e.g. ('TWO FAMILY', 'RESIDENTIAL') → 'two_family'. */
export function landUseCategory(landUse, landUseClass = null) {
  const use = String(landUse || '').trim().toUpperCase(), group = String(landUseClass || '').trim().toUpperCase()
  if (!use || use === 'UNKNOWN') return 'unknown'
  if (VACANT.test(use)) return 'vacant'
  if (SINGLE.has(use)) return 'single_family'
  if (use === 'TWO FAMILY') return 'two_family'
  if (SMALL.has(use)) return 'small_multifamily'
  if (APARTMENTS.test(use)) return 'apartments'
  if (MIXED.test(use)) return 'commercial'
  if (INSTITUTIONAL.test(use) || ['GOVERNMENT', 'UTILITIES', 'OTHER'].includes(group)) return 'institutional'
  if (['COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL'].includes(group)) return 'commercial'
  return group === 'RESIDENTIAL' ? 'single_family' : 'unknown'
}

/** Category for a parcel record's `land_use` / `land_use_class`. Publicly held land flagged as a vacant lot counts as vacant. */
export function parcelCategory(properties = {}) {
  const category = landUseCategory(properties?.land_use, properties?.land_use_class)
  return (category === 'unknown' || category === 'institutional') && properties?.vacant_lot === true ? 'vacant' : category
}

/** Category for a recorded footprint. A building standing on land recorded as vacant has an unknown use, not "vacant lot". */
export function buildingCategory(parcel) {
  const category = parcel ? parcelCategory(parcel) : 'unknown'
  return category === 'vacant' ? 'unknown' : category
}

/** Proposed and placed buildings use the category their typology would be recorded as. */
const TYPOLOGY = { single_family: 'single_family', adu: 'single_family', townhouse_duplex: 'two_family', triplex: 'small_multifamily', small_apartment: 'apartments', large_apartment: 'apartments' }
export function typologyCategory(typeId) { return TYPOLOGY[typeId] || 'unknown' }

export function categoryColor(id) { return (BUILDING_TYPE_BY_ID[id] || BUILDING_TYPE_BY_ID.unknown).color }

/** Lighter tint of a category colour for proposed and placed buildings, so they read as planned, not recorded. */
export function plannedCategoryColor(id) {
  return '#' + categoryColor(id).slice(1).match(/.{2}/g).map(c => Math.round(parseInt(c, 16) * .6 + 255 * .4).toString(16).padStart(2, '0')).join('')
}

/** MapLibre colour expression over a feature's `type_category`. */
export function categoryColorExpression(fallback = BUILDING_TYPE_BY_ID.unknown.color) {
  return ['match', ['coalesce', ['get', 'type_category'], 'unknown'], ...BUILDING_TYPE_CATEGORIES.flatMap(c => [c.id, c.color]), fallback]
}

/** Filter that hides footprints whose category is unchecked; null when every category is shown. */
export function hiddenCategoryFilter(hidden = []) {
  const ids = [...new Set(hidden)].filter(id => BUILDING_TYPE_BY_ID[id])
  return ids.length ? ['!', ['in', ['coalesce', ['get', 'type_category'], 'unknown'], ['literal', ids]]] : null
}

/** Combine MapLibre filters with `all`, skipping nulls. */
export function allFilters(...filters) {
  const list = filters.filter(Boolean)
  return list.length === 0 ? null : list.length === 1 ? list[0] : ['all', ...list]
}

/** Counts per category for features that carry `type_category`. */
export function categoryCounts(features = []) {
  const counts = Object.fromEntries(BUILDING_TYPE_IDS.map(id => [id, 0]))
  for (const f of features) { const id = f.properties?.type_category; counts[BUILDING_TYPE_BY_ID[id] ? id : 'unknown']++ }
  return counts
}
