import { geometryArea } from './plannerGeometry.js'
import { housingSpec } from './titleNine.js'

const SQFT = 10.7639

/** County land-use codes with a recorded dwelling count. Apartment bands give their lower bound. */
const RECORDED = { 'SINGLE FAMILY': 1, ROWHOUSE: 1, TOWNHOUSE: 1, 'MOBILE HOME': 1, 'MOBILE HOME (IN PARK)': 1, 'TWO FAMILY': 2, 'THREE FAMILY': 3, 'FOUR FAMILY': 4 }
const MINIMUM = {
  CONDOMINIUM: 1, 'APART: 5-19 UNITS': 5, 'COMM APRTM CONDOS 5-19 UNITS': 5, 'APART:20-39 UNITS': 20, 'COMM APRTM CONDOS 20-39 UNITS': 20,
  'APART:40+ UNITS': 40, 'COMM APRTM CONDOS 40+ UNITS': 40, "RETL/APT'S OVER": 1, 'OFFICE/APARTMENTS OVER': 1, 'DWG APT CONVERSION': 2,
}
const UNKNOWN_HOUSING = /INDEPENDENT LIVING|HOUSING AU|HUD PROJ|OTHER COMMERCIAL HOUSING|CONDOMINIUM UNIT|NURSING HOME|MOBILE HOMES|CONDEMNED/
const NON_DWELLING_RESIDENTIAL = /VACANT|AUX|GARAGE|COMMON|BUILDERS LOT|DEVELOPMENTAL|RIGHT OF WAY|RETENTION|RECREATION|GREENBELT/

/** Existing homes implied by a parcel's assessment land use. Never measured occupancy. */
export function recordedHomes(parcel) {
  const landUse = String(parcel?.land_use || '').trim().toUpperCase()
  if (!landUse) return { homes: null, basis: 'unknown', landUse: null }
  if (landUse in RECORDED) return { homes: RECORDED[landUse], basis: 'recorded', landUse }
  if (landUse in MINIMUM) return { homes: MINIMUM[landUse], basis: 'minimum', landUse }
  if (UNKNOWN_HOUSING.test(landUse)) return { homes: null, basis: 'unknown', landUse }
  if (parcel?.land_use_class === 'RESIDENTIAL' && !NON_DWELLING_RESIDENTIAL.test(landUse)) return { homes: null, basis: 'unknown', landUse }
  return { homes: 0, basis: 'none', landUse }
}

export function homesText(estimate) {
  if (estimate.basis === 'unknown') return estimate.landUse ? `Unknown (${estimate.landUse})` : 'Unknown (no recorded use)'
  if (estimate.basis === 'none') return `None recorded (${estimate.landUse})`
  return `${estimate.homes}${estimate.basis === 'minimum' ? '+' : ''} (${estimate.landUse})`
}

/** Each matched parcel's recorded homes count once when any of its non-accessory footprints is demolished. */
export function homesReplaced(demolitions = [], { parcel, footprint }) {
  const pins = new Set()
  let unmatched = 0
  for (const entry of demolitions) {
    if (entry.unmatched) { unmatched++; continue }
    if (footprint(entry)?.properties?.footprint_role === 'auxiliary') continue
    pins.add(entry.pin)
  }
  const parcels = [...pins].map(pin => {
    const props = parcel(pin)
    return { pin, address: props?.address || pin, ...(props ? recordedHomes(props) : { homes: null, basis: 'unknown', landUse: null }) }
  })
  return {
    replaced: parcels.reduce((n, p) => n + (p.homes ?? 0), 0),
    minimum: parcels.some(p => p.basis === 'minimum'),
    unknown: parcels.filter(p => p.homes === null).length,
    unmatched, parcels,
  }
}

/** One homes estimate for the footprints removed from a single site, which may span parcels. */
export function combinedHomes(replacement) {
  const landUse = [...new Set(replacement.parcels.map(p => p.landUse).filter(Boolean))].join(', ') || null
  if (replacement.unknown || replacement.unmatched && !replacement.parcels.length) return { homes: null, basis: 'unknown', landUse }
  return { homes: replacement.replaced, basis: replacement.minimum ? 'minimum' : replacement.replaced ? 'recorded' : 'none', landUse: landUse || 'no dwelling use recorded' }
}

export const signed = n => n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'

export function netHomes(proposed, replacement) {
  const net = proposed - replacement.replaced
  const notes = [
    replacement.minimum && 'apartment bands count their minimum',
    replacement.unknown && `${replacement.unknown} parcel${replacement.unknown === 1 ? '' : 's'} with unknown homes not subtracted`,
    replacement.unmatched && `${replacement.unmatched} outline${replacement.unmatched === 1 ? '' : 's'} without a parcel record not counted`,
  ].filter(Boolean)
  return {
    proposed, replaced: replacement.replaced, net, uncertain: replacement.minimum || replacement.unknown > 0,
    text: `Net homes: ${replacement.minimum || replacement.unknown ? 'up to ' : ''}${signed(net)} (${proposed} proposed − ${replacement.replaced}${replacement.minimum ? '+' : ''} replaced)`,
    note: `Replaced homes are estimated from County land use${notes.length ? `; ${notes.join('; ')}` : ''}.`,
  }
}

/** Screening ranges, not bids or appraisals. Each is shown beside its result. */
export const IMPACT_ASSUMPTIONS = {
  demolitionPerSqft: [8, 15],
  constructionPerSqft: { single_family: [225, 325], townhouse_duplex: [225, 325], triplex: [250, 350], small_apartment: [275, 375], large_apartment: [300, 425] },
  operatingShare: 0.4,
  capRate: 0.065,
  embodiedKgPerM2: [300, 600],
  storyHeightM: 3.5,
  affordableShare: 0.3,
}

const range = ([lo, hi], factor) => [lo * factor, hi * factor]
const footprintStories = f => {
  const stories = Number(f?.properties?.stories), height = Number(f?.properties?.height_m)
  if (Number.isFinite(stories) && stories >= 1) return Math.round(stories)
  return Number.isFinite(height) && height > 0 ? Math.max(1, Math.round(height / IMPACT_ASSUMPTIONS.storyHeightM)) : 1
}

/**
 * Feasibility screen for replacing recorded buildings on one parcel with the current draft.
 * Observed: assessment fields. Assumed: cost, operating, cap-rate and carbon ranges. Everything else is arithmetic.
 */
export function redevelopmentImpact({ parcel = {}, demolished = [], draft, targetIncome, existingHomes = recordedHomes(parcel), assumptions = IMPACT_ASSUMPTIONS }) {
  const spec = housingSpec(draft), floors = draft.floors ?? spec.floors
  const footprintM2 = demolished.reduce((n, f) => n + geometryArea(f.geometry), 0)
  const demolishedSqft = demolished.reduce((n, f) => n + geometryArea(f.geometry) * footprintStories(f), 0) * SQFT
  const demolition = range(assumptions.demolitionPerSqft, demolishedSqft)
  const newM2 = draft.width * draft.depth * floors, newSqft = newM2 * SQFT
  const constructionRate = assumptions.constructionPerSqft[draft.typeId] || assumptions.constructionPerSqft.small_apartment
  const construction = range(constructionRate, newSqft)
  const total = [demolition[0] + construction[0], demolition[1] + construction[1]]
  const capitalize = monthly => Math.max(0, monthly) * spec.units * 12 * (1 - assumptions.operatingShare) / assumptions.capRate
  const value = capitalize(draft.rent)
  const income = Number.isFinite(targetIncome) && targetIncome > 0 ? targetIncome : null
  const affordableRent = income === null ? null : Math.max(0, income * assumptions.affordableShare / 12 - (draft.utilities || 0))
  const affordableValue = affordableRent === null ? null : capitalize(affordableRent)
  const renterShare = Number.isFinite(parcel.renter_share) ? parcel.renter_share : null
  const homes = existingHomes.homes
  return {
    existing: {
      landUse: parcel.land_use || null, yearBuilt: parcel.year_built ?? null, livingSqft: parcel.living_sqft ?? null,
      sale: Number.isFinite(parcel.last_valid_sale_price) ? { price: parcel.last_valid_sale_price, year: parcel.last_valid_sale_year ?? null } : null,
      homes: existingHomes, buildings: demolished.length, footprintSqft: footprintM2 * SQFT, demolishedSqft,
    },
    replacement: { label: spec.label, units: spec.units, sqft: newSqft, netUnits: homes === null ? null : spec.units - homes },
    cost: { demolition, construction, constructionRate, total, perHome: [total[0] / spec.units, total[1] / spec.units] },
    value: { rent: draft.rent, capitalized: value, gap: [value - total[1], value - total[0]] },
    affordability: affordableRent === null ? null : {
      targetIncome: income, affordableRent, rentBurden: (draft.rent + (draft.utilities || 0)) * 12 / income,
      capitalized: affordableValue, gap: [affordableValue - total[1], affordableValue - total[0]],
    },
    displacement: {
      homes, renterShare,
      renterHouseholds: homes === null || renterShare === null ? null : homes * renterShare,
      screen: Number.isFinite(parcel.scores?.[spec.scoreType]?.displacement_risk) ? parcel.scores[spec.scoreType].displacement_risk : null,
    },
    carbon: { newTonnes: range(assumptions.embodiedKgPerM2, newM2 / 1000), demolishedFloorM2: demolishedSqft / SQFT },
    vacant: { savedDemolition: demolition, displaced: 0 },
  }
}
