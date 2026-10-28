import { geometryArea } from './plannerGeometry.js'
import { DISPOSITION } from './siteCautions.js'

const SQFT = 10.7639

/** Screening constants. Program terms change yearly; every figure is shown beside its result. */
export const PRO_FORMA_ASSUMPTIONS = {
  publicNominal: [1000, 5000],
  recentSaleYears: 10,
  minSalePrice: 10000,
  benchmarkMinSales: 5,
  lihtc: { smallProjectUnits: 20 },
}

/** Pittsburgh real-estate millage, 2026. One mill is $1 per $1,000 of assessed value. */
export const MILLAGE = [
  { id: 'city', body: 'City of Pittsburgh', mills: 10.42, detail: '9.67 general + 0.50 parks + 0.25 library' },
  { id: 'schools', body: 'Pittsburgh Public Schools', mills: 10.457, detail: 'school district' },
  { id: 'county', body: 'Allegheny County', mills: 6.43, detail: 'county' },
]
export const TOTAL_MILLS = MILLAGE.reduce((n, m) => n + m.mills, 0)

export const PROGRAM_LINKS = {
  lihtc: 'https://www.phfa.org/mhp/developers/lihtc.aspx',
  qct: 'https://www.huduser.gov/portal/datasets/qct.html',
  hof: 'https://www.ura.org/pages/housing-opportunity-fund',
  rentalGap: 'https://www.ura.org/pages/rental-gap-program',
  forSale: 'https://www.ura.org/pages/for-sale-development-program',
  home: 'https://www.hudexchange.info/programs/home/',
  phare: 'https://www.phfa.org/legislation/act105.aspx',
  abatement: 'https://www.pittsburghpa.gov/City-Government/Finance-Budget/Taxes/Real-Estate-Taxes/Real-Estate-Forms',
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const scale = ([lo, hi], f) => [lo * f, hi * f]
const finitePositive = v => Number.isFinite(v) && v > 0
const isAuxiliary = f => f?.properties?.footprint_role === 'auxiliary'
const stories = (f, storyHeightM) => {
  const s = Number(f?.properties?.stories), h = Number(f?.properties?.height_m)
  if (Number.isFinite(s) && s >= 1) return Math.round(s)
  return Number.isFinite(h) && h > 0 ? Math.max(1, Math.round(h / storyHeightM)) : 1
}
const calculatedSqft = (features, storyHeightM) => features.reduce((n, f) => n + geometryArea(f.geometry) * stories(f, storyHeightM), 0) * SQFT

/**
 * Floor area removed, per parcel. Observed County living area (FINISHEDLIVINGAREA) is preferred for principal buildings;
 * outline × stories is used when living area is missing, when several buildings add up to more, and for accessory outlines.
 */
export function demolishedArea(demolished = [], { parcel = {}, parcelFor = () => null, storyHeightM = 3.5 } = {}) {
  const groups = new Map()
  for (const f of demolished) {
    const pin = f?.properties?.pin ?? null
    if (!groups.has(pin)) groups.set(pin, [])
    groups.get(pin).push(f)
  }
  const parts = []
  for (const [pin, features] of groups) {
    const props = pin === null ? null : parcel.pin === pin ? parcel : parcelFor(pin)
    const principal = features.filter(f => !isAuxiliary(f)), accessory = features.filter(isAuxiliary)
    if (principal.length) {
      const calculated = calculatedSqft(principal, storyHeightM), living = props?.living_sqft
      if (!finitePositive(living)) parts.push({ pin, buildings: principal.length, sqft: calculated, basis: 'calculated', reason: props ? 'no living area recorded' : 'no parcel record' })
      else if (principal.length > 1 && calculated > living) parts.push({ pin, buildings: principal.length, sqft: calculated, basis: 'calculated', reason: `${principal.length} buildings exceed the recorded ${Math.round(living).toLocaleString()} sq ft` })
      else parts.push({ pin, buildings: principal.length, sqft: living, basis: 'observed', reason: 'County living area' })
    }
    if (accessory.length) parts.push({ pin, buildings: accessory.length, sqft: calculatedSqft(accessory, storyHeightM), basis: 'calculated', reason: 'accessory outline' })
  }
  const kinds = new Set(parts.map(p => p.basis))
  return { sqft: parts.reduce((n, p) => n + p.sqft, 0), basis: !parts.length ? 'none' : kinds.size > 1 ? 'mixed' : [...kinds][0], parts }
}

export const AREA_BASIS_TEXT = { observed: 'Observed (County assessment)', calculated: 'Calculated (footprint × stories)', mixed: 'Observed + calculated', none: 'No demolition' }

const quantile = (sorted, q) => {
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}
const spread = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  return { n: sorted.length, q1: quantile(sorted, 0.25), median: quantile(sorted, 0.5), q3: quantile(sorted, 0.75) }
}

/** Recent valid-sale $/sq ft quartiles from loaded parcels. Falls back to every loaded parcel when the neighborhood is thin. */
export function priceBenchmarks(parcels = [], { neighborhood = null, asOfYear = new Date().getFullYear(), assumptions = PRO_FORMA_ASSUMPTIONS } = {}) {
  const recent = p => finitePositive(p?.last_valid_sale_price) && p.last_valid_sale_price >= assumptions.minSalePrice
    && Number.isFinite(p.last_valid_sale_year) && p.last_valid_sale_year >= asOfYear - assumptions.recentSaleYears
  const measure = (pool, scope) => {
    const sales = pool.filter(recent)
    const living = sales.filter(p => finitePositive(p.living_sqft)).map(p => p.last_valid_sale_price / p.living_sqft)
    const lot = sales.filter(p => (p.vacant_lot === true || p.vacant_land_use === true) && finitePositive(p.lot_sqft)).map(p => p.last_valid_sale_price / p.lot_sqft)
    return {
      scope,
      living: living.length >= assumptions.benchmarkMinSales ? spread(living) : null,
      lot: lot.length >= assumptions.benchmarkMinSales ? spread(lot) : null,
    }
  }
  const local = neighborhood ? measure(parcels.filter(p => p?.neighborhood === neighborhood), neighborhood) : null
  const wide = measure(parcels, 'loaded neighborhoods')
  return { living: local?.living || wide.living, livingScope: local?.living ? neighborhood : wide.living ? wide.scope : null,
    lot: local?.lot || wide.lot, lotScope: local?.lot ? neighborhood : wide.lot ? wide.scope : null, asOfYear }
}

/**
 * Acquisition screen for one parcel. Public land uses a nominal disposition price; private land uses its recent valid sale,
 * then a neighborhood $/sq ft range. Owner names and tax-delinquency details are never read.
 */
export function parcelAcquisition(parcel, { benchmarks = null, asOfYear = new Date().getFullYear(), assumptions = PRO_FORMA_ASSUMPTIONS } = {}) {
  if (!parcel) return { basis: 'unknown', channel: 'unknown', range: null, taxable: null, text: 'No parcel record' }
  const pin = parcel.pin ?? null, use = String(parcel.land_use || '').toUpperCase()
  if (/URBAN RENEWAL/.test(use)) return { pin, basis: 'public', channel: 'ura', range: assumptions.publicNominal, taxable: false, text: 'URA disposition, nominal price' }
  if (parcel.city_owned === true) return DISPOSITION.has(parcel.city_status)
    ? { pin, basis: 'public', channel: 'city', range: assumptions.publicNominal, taxable: false, text: 'City inventory / Land Bank, nominal price' }
    : { pin, basis: 'not_offered', channel: 'city', range: null, taxable: false, text: 'City land with no disposition status' }
  if (parcel.land_use_class === 'GOVERNMENT') return { pin, basis: 'not_offered', channel: 'public', range: null, taxable: false, text: 'Public or institutional land, not offered' }
  const price = parcel.last_valid_sale_price, year = parcel.last_valid_sale_year
  const sold = finitePositive(price) && price >= assumptions.minSalePrice
  if (sold && Number.isFinite(year) && year >= asOfYear - assumptions.recentSaleYears) return { pin, basis: 'sale', channel: 'private', range: [price, price], year, taxable: true, text: `Last valid sale (${year})` }
  if (finitePositive(parcel.living_sqft) && benchmarks?.living) return { pin, basis: 'estimate', channel: 'private', taxable: true,
    range: [benchmarks.living.q1 * parcel.living_sqft, benchmarks.living.q3 * parcel.living_sqft], per: 'living', rate: benchmarks.living, scope: benchmarks.livingScope,
    text: `${benchmarks.livingScope} sales, middle half of $/living sq ft × ${Math.round(parcel.living_sqft).toLocaleString()} sq ft` }
  if (!finitePositive(parcel.living_sqft) && finitePositive(parcel.lot_sqft) && benchmarks?.lot) return { pin, basis: 'estimate', channel: 'private', taxable: true,
    range: [benchmarks.lot.q1 * parcel.lot_sqft, benchmarks.lot.q3 * parcel.lot_sqft], per: 'lot', rate: benchmarks.lot, scope: benchmarks.lotScope,
    text: `${benchmarks.lotScope} vacant-land sales, middle half of $/lot sq ft × ${Math.round(parcel.lot_sqft).toLocaleString()} sq ft` }
  if (sold) return { pin, basis: 'old_sale', channel: 'private', range: [price, price], year: year ?? null, taxable: true, text: `Older sale${Number.isFinite(year) ? ` (${year})` : ''}, likely below today's price` }
  return { pin, basis: 'unknown', channel: 'private', range: null, taxable: true, text: 'No recent sale or comparable sales' }
}

/** Site parcel plus any other parcel whose building is demolished in this site's plan. */
export function siteAcquisition({ parcel = {}, demolished = [], parcelFor = () => null, benchmarks, asOfYear, assumptions = PRO_FORMA_ASSUMPTIONS }) {
  const pins = [...new Set(demolished.map(f => f?.properties?.pin).filter(pin => pin && pin !== parcel.pin))]
  const parcels = [parcelAcquisition(parcel, { benchmarks, asOfYear, assumptions }), ...pins.map(pin => parcelAcquisition(parcelFor(pin), { benchmarks, asOfYear, assumptions }))]
  const known = parcels.filter(p => p.range)
  return { parcels, range: known.reduce((sum, p) => add(sum, p.range), [0, 0]), complete: known.length === parcels.length, public: parcels.some(p => p.basis === 'public') }
}

/** Smallest HUD FY income-limit band containing the household. Percent is relative to the 50% limit for its size. */
export function amiBand(income, householdSize, limits) {
  if (!finitePositive(income) || !limits?.incomeLimits) return null
  const index = Math.min(8, Math.max(1, Math.round(householdSize || 1))) - 1
  const band = [30, 50, 60, 80].find(b => income <= limits.incomeLimits[b][index]) ?? null
  return { band, percent: income / limits.incomeLimits[50][index] * 50, householdSize: index + 1, fiscalYear: limits.fiscalYear ?? null }
}

/** Highest AMI band across placed buildings; null when any building has no band (no income, or above 80% AMI). */
export function planAmiBand(buildings = [], limits) {
  if (!buildings.length) return null
  const bands = buildings.map(b => amiBand(b.targetIncome, b.householdSize, limits)?.band ?? null)
  return bands.includes(null) ? null : Math.max(...bands)
}

/** Monthly rent per home at which capitalized net rent equals the cost. */
export const breakEvenRent = (cost, units, { operatingShare, capRate, vacancyShare = 0 }) => scale(cost, capRate / (units * 12 * (1 - vacancyShare) * (1 - operatingShare)))

/**
 * Pittsburgh gap-financing programs to check for a shortfall. No eligibility or award is inferred from a household income setting;
 * every program links to its administrator for project-specific review.
 */
export function capitalStack({ gapPerUnit, units, band, basis, qct = false, typeId, assumptions = PRO_FORMA_ASSUMPTIONS }) {
  const forSale = typeId === 'single_family' || typeId === 'townhouse_duplex'
  return {
    gapPerUnit, units, gap: scale(gapPerUnit, units), band, qct,
    programs: [
      { id: 'lihtc', name: 'Low-Income Housing Tax Credit (9% / 4%)', sponsor: 'PHFA', status: 'not_assessed', url: PROGRAM_LINKS.lihtc, estimate: null,
        note: `Credit equity is not counted. Needs a rental project, verified eligible basis, restricted-unit and floor-area fractions, rent compliance, and an allocation or bond qualification. The target household income is not a restriction commitment.${qct ? ' Mapped QCT status alone does not establish a basis boost.' : ''}${units < assumptions.lihtc.smallProjectUnits ? ' Small buildings may need a scattered-site portfolio; this is not a stand-alone award assumption.' : ''}` },
      { id: 'hof', name: forSale ? 'URA Housing Opportunity Fund: For-Sale / Rental Gap' : 'URA Housing Opportunity Fund: Rental Gap', sponsor: 'URA', status: 'not_assessed', url: PROGRAM_LINKS.rentalGap, links: forSale ? [PROGRAM_LINKS.forSale, PROGRAM_LINKS.hof] : [PROGRAM_LINKS.hof], estimate: null,
        note: 'Program lead only. Income restrictions, project tenure, funding availability and agency approval are not established by this model.' },
      { id: 'home', name: 'HOME / PHFA PHARE', sponsor: 'HUD / City / URA / PHFA', status: 'not_assessed', url: PROGRAM_LINKS.home, links: [PROGRAM_LINKS.phare], estimate: null,
        note: 'No award is counted. Program-specific rents, unit mix, affordability periods, costs and agency review are required.' },
    ],
  }
}

/** Annual tax at the 2026 millage. `value` is an assessed-value range. */
export const annualTax = (value, mills = TOTAL_MILLS) => scale(value, mills / 1000)

const netOf = (newTax, replacedTax) => [newTax[0] - replacedTax[1], newTax[1] - replacedTax[0]]

/**
 * Illustrative tax on caller-supplied project-value ranges, minus the existing-value proxy;
 * replaced value uses each parcel's acquisition value (sale or estimate), and public parcels are exempt.
 * Income settings never establish an abatement; no credit is counted without project evidence.
 */
export function taxLedger({ newValues = [], replaced = [], band = null, assumptions = PRO_FORMA_ASSUMPTIONS }) {
  const newValue = newValues.reduce(add, [0, 0])
  const known = replaced.filter(p => p.taxable === false || p.range)
  const replacedValue = known.reduce((sum, p) => p.taxable === false ? sum : add(sum, p.range), [0, 0])
  const newTax = annualTax(newValue), replacedTax = annualTax(replacedValue), net = netOf(newTax, replacedTax)
  const bodies = MILLAGE.map(m => {
    const bodyNew = annualTax(newValue, m.mills), bodyReplaced = annualTax(replacedValue, m.mills)
    return { ...m, newTax: bodyNew, replacedTax: bodyReplaced, net: netOf(bodyNew, bodyReplaced) }
  })

  return {
    mills: TOTAL_MILLS, newValue, replacedValue, bodies, newTax, replacedTax, net,
    exempt: replaced.filter(p => p.taxable === false).length,
    unknown: replaced.length - known.length,
    abatement: { applies: false, status: 'not_assessed', program: 'City Chapters 265 / 267', cityAbated: [0, 0], netDuring: net, url: PROGRAM_LINKS.abatement },
  }
}
