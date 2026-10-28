const finite = value => typeof value === 'number' && Number.isFinite(value)
const clamp = value => Math.max(0, Math.min(1, value))
const anchor = (value, low, high) => finite(value) ? clamp((value - low) / (high - low)) : null
const rounded = value => finite(value) ? Math.round(value * 1000) / 1000 : null

/**
 * Screening choice, not a probability: vulnerability is the floor, and rent
 * pressure can increase the remaining risk. Flat rents never erase vulnerability.
 * Missing components remain unknown; a single observed component is disclosed.
 * Keep anchors/formula synchronized with pipeline.score.displacement_risk.
 */
export function displacementScreen(props = {}, archivedRisk = null) {
  const renter = anchor(props.renter_share, .25, .75)
  const burden = anchor(props.chas_rent_burden_share, .30, .80)
  const pressure = anchor(props.rent_change_vs_county, 0, .30)
  const present = [renter, burden].filter(finite)
  const vulnerability = present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null
  const supplied = ['renter_share', 'chas_rent_burden_share', 'rent_change_vs_county'].some(id => Object.hasOwn(props, id))
  const value = vulnerability === null ? pressure : pressure === null ? vulnerability : vulnerability + (1 - vulnerability) * pressure
  const fallback = !supplied && value === null && finite(archivedRisk)
  const missing = [renter === null && 'renter share', burden === null && 'low-income renter cost burden', pressure === null && 'relative rent change'].filter(Boolean)
  return {
    risk: fallback ? archivedRisk : value === null ? null : Math.round(value * 1000) / 10,
    renter: rounded(renter), burden: rounded(burden), vulnerability: rounded(vulnerability), pressure: rounded(pressure),
    method: fallback ? 'archived_screen' : 'vulnerability_floor',
    confidence: fallback || missing.length ? 'Low' : 'Medium', missing,
    evidence: fallback ? 'fallback' : 'measured',
    formula: 'Risk = 100 × [vulnerability + (1 − vulnerability) × rent pressure]. Vulnerability is the mean of anchored renter share and cost burden. Missing components are omitted, not set to zero.',
  }
}
