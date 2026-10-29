import { financeInputs, FINANCE_DEFAULTS, FINANCE_VERSION, SMALL_INFILL, constructionRates, operatingStatement, developmentBudget } from './financeInputs.js'
import { geometryArea } from './plannerGeometry.js'
import { housingSpec } from './titleNine.js'
import { PRO_FORMA_ASSUMPTIONS, demolishedArea, siteAcquisition, parcelAcquisition, amiBand, breakEvenRent, capitalStack, taxLedger } from './proForma.js'

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
  constructionPerSqft: { single_family: SMALL_INFILL.single_family.rate, townhouse_duplex: SMALL_INFILL.townhouse_duplex.rate, triplex: SMALL_INFILL.triplex.rate, small_apartment: [285, 385], large_apartment: [340, 485] },
  operatingShare: FINANCE_DEFAULTS.operatingShare,
  vacancyShare: FINANCE_DEFAULTS.vacancyShare,
  capRate: FINANCE_DEFAULTS.capRate,
  embodiedKgPerM2: [300, 600],
  storyHeightM: 3.5,
  affordableShare: 0.3,
}

const range = ([lo, hi], factor) => [lo * factor, hi * factor]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const minus = (value, cost) => [value - cost[1], value - cost[0]]

/** Construction cost range for one housing option: costed gross floor area × the type's $/sq ft range. */
export function constructionCost(option, assumptions = IMPACT_ASSUMPTIONS) {
  const spec = housingSpec(option), drawnSqft = option.width * option.depth * (option.floors ?? spec.floors) * SQFT
  const sqftCap = SMALL_INFILL[option.typeId] ? SMALL_INFILL[option.typeId].sqftPerHome * spec.units : null
  const sqft = sqftCap === null ? drawnSqft : Math.min(drawnSqft, sqftCap)
  const rate = assumptions.constructionByType?.[option.typeId] || (assumptions !== IMPACT_ASSUMPTIONS ? assumptions.constructionPerSqft?.[option.typeId] : null) || constructionRates(option)
  return { sqft, drawnSqft, sqftCap, capped: sqft < drawnSqft, rate, cost: range(rate, sqft) }
}

/** Parcels whose principal (non-accessory) building is demolished; their current tax is replaced. */
export function replacedParcels(demolished, acquisitionParcels) {
  const pins = new Set(demolished.filter(f => f?.properties?.footprint_role !== 'auxiliary').map(f => f?.properties?.pin).filter(Boolean))
  return acquisitionParcels.filter(p => pins.has(p.pin))
}

/**
 * Feasibility screen and pro forma for building the current draft on one parcel, replacing any demolished buildings.
 * Observed: assessment fields, sales and HUD limits. Assumed: cost, soft-cost, operating, cap-rate, millage-proxy and carbon ranges.
 */
export function redevelopmentImpact({ parcel = {}, demolished = [], draft, targetIncome, householdSize = 1, limits = null, existingHomes = recordedHomes(parcel),
  parcelFor = () => null, benchmarks = null, asOfYear, finance = {}, assumptions = IMPACT_ASSUMPTIONS, proForma = PRO_FORMA_ASSUMPTIONS }) {
  const financial = financeInputs(finance)
  const spec = housingSpec(draft), units = spec.units
  const footprintM2 = demolished.reduce((n, f) => n + geometryArea(f.geometry), 0)
  const area = demolishedArea(demolished, { parcel, parcelFor, storyHeightM: assumptions.storyHeightM })
  const demolition = range(assumptions.demolitionPerSqft, area.sqft)
  const built = constructionCost(draft, { ...assumptions, constructionPerSqft: assumptions === IMPACT_ASSUMPTIONS ? undefined : assumptions.constructionPerSqft, constructionByType: financial.constructionByType }), construction = built.cost
  const acquisition = siteAcquisition({ parcel, demolished, parcelFor, benchmarks, asOfYear, assumptions: proForma })
  const budget = developmentBudget({ construction, demolition, acquisition: acquisition.range, units, assumptions: financial })
  const { beforeLand, development, hard, soft } = budget
  const operations = operatingStatement(draft.rent, units, financial)
  const capitalize = monthly => operatingStatement(monthly, units, financial).capitalized
  const value = operations.capitalized
  const income = Number.isFinite(targetIncome) && targetIncome > 0 ? targetIncome : null
  const affordableRent = income === null ? null : Math.max(0, income * assumptions.affordableShare / 12 - (draft.utilities || 0))
  const affordableValue = affordableRent === null ? null : capitalize(affordableRent)
  const subsidyPerUnit = affordableValue === null ? null : [Math.max(0, development[0] - affordableValue) / units, Math.max(0, development[1] - affordableValue) / units]
  const band = income === null ? null : amiBand(income, householdSize, limits)
  const marketGap = minus(value, development)
  const shortfallPerUnit = subsidyPerUnit || [Math.max(0, -marketGap[1]) / units, Math.max(0, -marketGap[0]) / units]
  const renterShare = Number.isFinite(parcel.renter_share) ? parcel.renter_share : null
  const homes = existingHomes.homes
  return {
    finance: { version: FINANCE_VERSION, ...financial },
    operations,
    existing: {
      landUse: parcel.land_use || null, yearBuilt: parcel.year_built ?? null, livingSqft: parcel.living_sqft ?? null,
      sale: Number.isFinite(parcel.last_valid_sale_price) ? { price: parcel.last_valid_sale_price, year: parcel.last_valid_sale_year ?? null } : null,
      homes: existingHomes, buildings: demolished.length, footprintSqft: footprintM2 * SQFT, demolishedSqft: area.sqft, area,
    },
    replacement: { label: spec.label, units, sqft: built.sqft, drawnSqft: built.drawnSqft, sqftCap: built.sqftCap, capped: built.capped, netUnits: homes === null ? null : units - homes },
    cost: { ...budget, demolition, construction, constructionRate: built.rate, hard, soft, softShare: financial.softShare, acquisition, development,
      perHome: range(development, 1 / units), hardPerHome: range(hard, 1 / units) },
    value: { rent: draft.rent, capitalized: value, gap: marketGap, residualLand: minus(value, beforeLand), breakEvenRent: breakEvenRent(development, units, financial) },
    affordability: affordableRent === null ? null : {
      targetIncome: income, affordableRent, band, rentBurden: (draft.rent + (draft.utilities || 0)) * 12 / income,
      capitalized: affordableValue, gap: minus(affordableValue, development), residualLand: minus(affordableValue, beforeLand), subsidyPerUnit,
    },
    capitalStack: shortfallPerUnit[1] > 0 ? capitalStack({ gapPerUnit: shortfallPerUnit, units, band: band?.band ?? null, basis: beforeLand, qct: parcel.qct_2026 === true, typeId: draft.typeId, assumptions: proForma }) : null,
    tax: taxLedger({ newValues: [development], replaced: acquisition.parcels, band: band?.band ?? null, assumptions: proForma }),
    displacement: {
      homes, renterShare,
      renterHouseholds: homes === null || renterShare === null ? null : homes * renterShare,
      screen: Number.isFinite(parcel.scores?.[spec.scoreType]?.displacement_risk) ? parcel.scores[spec.scoreType].displacement_risk : null,
    },
    carbon: { newTonnes: range(assumptions.embodiedKgPerM2, built.sqft / SQFT / 1000), demolishedFloorM2: area.sqft / SQFT },
    vacant: { savedDemolition: demolition, displaced: 0 },
  }
}

/** Saved demolition records as pin + role stubs, so parcels outside the loaded building context still count. */
export const demolitionRecords = (demolitions = [], footprint = () => null) => demolitions.filter(d => !d.unmatched)
  .map(d => ({ properties: { pin: d.pin, footprint_role: footprint(d)?.properties?.footprint_role ?? null } }))

/** Annual tax ledger for the whole plan: every placed building against every parcel whose principal building is demolished. */
export function planTaxLedger({ buildings = [], demolished = [], parcelFor = () => null, benchmarksFor = () => null, band = null, asOfYear, finance = {}, assumptions = IMPACT_ASSUMPTIONS, proForma = PRO_FORMA_ASSUMPTIONS }) {
  const financial = financeInputs(finance)
  // Land is counted once per site, not once per proposed building.
  const pins = [...new Set([...buildings.map(b => b.pin), ...demolished.filter(f => f?.properties?.footprint_role !== 'auxiliary').map(f => f?.properties?.pin)].filter(Boolean))]
  const replaced = pins.map(pin => {
    const props = parcelFor(pin)
    return parcelAcquisition(props, { benchmarks: benchmarksFor(props?.neighborhood ?? null), asOfYear, assumptions: proForma })
  })
  const construction = buildings.map(b => constructionCost(b.option, { ...assumptions, constructionPerSqft: assumptions === IMPACT_ASSUMPTIONS ? undefined : assumptions.constructionPerSqft, constructionByType: financial.constructionByType }).cost).reduce(add, [0, 0])
  const acquisition = replaced.filter(p => p.range).reduce((sum,p) => add(sum,p.range),[0,0])
  const units = buildings.reduce((n,b) => n + housingSpec(b.option).units,0)
  const budget = developmentBudget({ construction, acquisition, demolition:[0,0], units, assumptions:financial })
  return { ...taxLedger({ newValues: buildings.length ? [budget.development] : [], replaced, band, assumptions:proForma }),
    basisNote: 'Whole-plan cost proxy includes known acquisition once per parcel and financial allowances. Demolition is omitted from this aggregate proxy; retained existing-building value and official assessments are not established.' }
}
