/** UI validation, not eligibility or a claim about the population. */
export function commitNumber(raw, { min = 0, max = 100000, integer = false, nullable = false, rejectRange = false, label = 'Value' } = {}) {
  if (String(raw).trim() === '') return nullable ? { valid: true, value: null, message: '' } : { valid: false, message: `${label} is required. This edit was not applied.` }
  const value = Number(raw)
  if (!Number.isFinite(value)) return { valid: false, message: `Enter a finite number for ${label.toLowerCase()}. This edit was not applied.` }
  if (integer && !Number.isInteger(value)) return { valid: false, message: `${label} must be a whole number. This edit was not applied.` }
  if (value < min || value > max) {
    const range = `${min.toLocaleString('en-US')}–${max.toLocaleString('en-US')}`
    if (rejectRange) return { valid: false, message: `${label} must be ${range}. This edit was not applied.` }
    const corrected = Math.min(max, Math.max(min, value))
    return { valid: true, value: corrected, message: `Adjusted to ${corrected.toLocaleString('en-US')}. Allowed range: ${range}.` }
  }
  return { valid: true, value, message: '' }
}
