const finite = value => typeof value === 'number' && Number.isFinite(value)
const CURVES = {
  single_family: 'Below 1,500 sq ft: 15; 1,500–4,000: linear 15→100; 4,000–20,000: 100; above 20,000: 75.',
  townhouse_duplex: 'Below 800 sq ft: 20; 800–1,800: linear 20→100; 1,800–5,000: 100; 5,000–10,000: linear 100→50; above 10,000: 35.',
  small_apartment: 'Below 2,500 sq ft: 15; 2,500–6,000: linear 15→100; 6,000–25,000: 100; above 25,000: 70.',
  large_apartment: 'Below 6,000 sq ft: 10; 6,000–15,000: linear 10→100; 15,000–80,000: 100; above 80,000: 80.',
}
export const MARKET_FIT_CURVES = CURVES

/** Explain the existing source formula. These curves are policy assumptions, not measured demand. */
export function marketFitEvidence(props = {}, typeId) {
  const factors = props.factors || {}
  const lotFit = factors.lot_fit?.[typeId]
  const missing = !finite(factors.market_heat) || !finite(lotFit)
  return {
    lotSqft: finite(props.lot_sqft) ? props.lot_sqft : null,
    marketHeat: finite(factors.market_heat) ? factors.market_heat * 100 : null,
    lotFit: finite(lotFit) ? lotFit * 100 : null,
    pricePerSqft: finite(factors.price_per_sqft) ? factors.price_per_sqft : null,
    turnoverPer100: finite(factors.turnover_per_100) ? factors.turnover_per_100 : null,
    validSales: finite(factors.valid_sales) ? factors.valid_sales : null,
    curve: CURVES[typeId] || null,
    formula: '50% neighborhood market activity + 50% assumed type/lot-size fit. Market activity uses 60% sale-price anchor ($80–350/sq ft) and 40% turnover anchor (5–30 sales per 100 parcels).',
    evidence: 'mixed', confidence: missing ? 'Low' : 'Medium',
    limitation: 'The type/lot curve is a team preference, not demand or physical feasibility. It deliberately favors a duplex on 1,800–5,000 sq ft lots and penalizes it on larger sites, which can place a single-family house above a duplex. Geometry is checked separately.',
    missing: missing ? 'Underlying market or lot-curve inputs are unavailable in this record; the archived source score cannot be fully reconstructed here.' : null,
  }
}
