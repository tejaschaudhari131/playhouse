import { geometryArea } from './plannerGeometry.js'
import { DISPOSITION } from './siteCautions.js'

const SQFT = 10.7639

/** Screening constants. Program terms change yearly; every figure is shown beside its result. */
export const PRO_FORMA_ASSUMPTIONS = {
  softShare: 0.2,
  publicNominal: [1000, 5000],
  recentSaleYears: 10,
  minSalePrice: 10000,
  benchmarkMinSales: 5,
  lihtc: { nine: 0.09, four: 0.04, years: 10, price: 0.85, basisBoost: 1.3, smallProjectUnits: 20 },
  /** City of Pittsburgh Chapter 267 (rental) real estate tax credit, 2026 limits. Enhanced needs ≥10% of homes at 50% AMI or ≥60% at 80% AMI. */
  abatement: { standard: { years: 3, cap: 125000 }, enhanced: { years: 10, cap: 250000 } },
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
export const breakEvenRent = (cost, units, { operatingShare, capRate }) => scale(cost, capRate / (units * 12 * (1 - operatingShare)))

/**
 * Pittsburgh gap-financing programs to check for a shortfall. Eligibility here is a band screen only;
 * awards are competitive and terms change, so every program links to its administrator.
 */
export function capitalStack({ gapPerUnit, units, band, basis, qct = false, typeId, assumptions = PRO_FORMA_ASSUMPTIONS }) {
  const t = assumptions.lihtc, boost = qct ? t.basisBoost : 1
  const lihtcStatus = band === null || band === undefined ? 'not_eligible' : band <= 60 ? 'eligible' : band === 80 ? 'conditional' : 'not_eligible'
  const forSale = typeId === 'single_family' || typeId === 'townhouse_duplex'
  const upTo80 = band !== null && band !== undefined && band <= 80
  return {
    gapPerUnit, units, gap: scale(gapPerUnit, units), band, qct,
    programs: [
      { id: 'lihtc', name: 'Low-Income Housing Tax Credit (9% / 4%)', sponsor: 'PHFA Qualified Allocation Plan', status: lihtcStatus, url: PROGRAM_LINKS.lihtc,
        estimate: { nine: scale(basis, t.nine * t.years * t.price * boost), four: scale(basis, t.four * t.years * t.price * boost) },
        note: [
          lihtcStatus === 'eligible' ? 'Rents set for households at or below 60% AMI.' : lihtcStatus === 'conditional' ? '80% AMI units qualify only under income averaging (building average at or below 60% AMI).' : 'Needs units at or below 60% AMI.',
          '9% credits are competitive; 4% credits pair with tax-exempt bonds.',
          qct ? 'This parcel is in a 2026 HUD Qualified Census Tract (QCT): eligible basis may be boosted to 130%.' : 'Not in a 2026 HUD QCT; Difficult Development Area status is not checked here, so no 130% basis boost is assumed.',
          units < t.smallProjectUnits && `${units} ${units === 1 ? 'home is' : 'homes are'} small for a tax-credit deal; small buildings usually join a scattered-site portfolio.`,
        ].filter(Boolean).join(' '),
        assumption: `Equity ≈ eligible basis (hard + soft, no land) × ${t.nine * 100}% or ${t.four * 100}% × ${t.years} years × $${t.price.toFixed(2)} per credit${qct ? ' × 130%' : ''}; 100% of homes income-restricted.` },
      { id: 'hof', name: forSale ? 'URA Housing Opportunity Fund: For-Sale Development Program / Rental Gap Program' : 'URA Housing Opportunity Fund: Rental Gap Program', sponsor: 'Urban Redevelopment Authority of Pittsburgh',
        status: upTo80 ? 'eligible' : 'not_eligible', url: PROGRAM_LINKS.rentalGap, links: forSale ? [PROGRAM_LINKS.forSale, PROGRAM_LINKS.hof] : [PROGRAM_LINKS.hof], estimate: null,
        note: upTo80 ? `Gap financing for homes serving households at 30–80% AMI${forSale ? '; the For-Sale Development Program applies if these homes are sold' : ''}. Per-home limits are set in current HOF guidelines.` : 'Serves households at or below 80% AMI.' },
      { id: 'home', name: 'HOME Investment Partnerships / PHFA PHARE', sponsor: 'HUD via City of Pittsburgh & URA; PHFA (PHARE)',
        status: upTo80 ? 'eligible' : 'not_eligible', url: PROGRAM_LINKS.home, links: [PROGRAM_LINKS.phare], estimate: null,
        note: upTo80 ? 'Soft loans or grants for homes at or below 80% AMI, with rent limits and an affordability period.' : 'Serves households at or below 80% AMI.' },
    ],
  }
}

/** Annual tax at the 2026 millage. `value` is an assessed-value range. */
export const annualTax = (value, mills = TOTAL_MILLS) => scale(value, mills / 1000)

const netOf = (newTax, replacedTax) => [newTax[0] - replacedTax[1], newTax[1] - replacedTax[0]]

/**
 * New-building tax minus the tax of buildings it replaces. New assessed value uses construction cost as a proxy;
 * replaced value uses each parcel's acquisition value (sale or estimate), and public parcels are exempt.
 * The abatement screen applies the City's Chapter 267 rental credit to the City share only; Enhanced needs the target band at or below 80% AMI.
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
  const enhanced = band !== null && band !== undefined && band <= 80
  const tier = enhanced ? assumptions.abatement.enhanced : assumptions.abatement.standard
  const cityNet = bodies[0].net, abated = cityNet.map(v => Math.min(tier.cap, Math.max(0, v)))
  return {
    mills: TOTAL_MILLS, newValue, replacedValue, bodies, newTax, replacedTax, net,
    exempt: replaced.filter(p => p.taxable === false).length,
    unknown: replaced.length - known.length,
    abatement: { applies: cityNet[1] > 0, program: 'City Chapter 267', enhanced, years: tier.years, cap: tier.cap, cityAbated: abated,
      netDuring: [net[0] - abated[0], net[1] - abated[1]], url: PROGRAM_LINKS.abatement },
  }
}
