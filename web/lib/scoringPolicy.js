/** Five preference dimensions. Eligibility and capacity checks never dilute these shares. */
export const PREFERENCE_FACTOR_IDS = ['demand', 'affordability', 'displacement', 'access', 'carbon']
export const CHECK_FACTOR_IDS = ['physical', 'capacity']
export const CLOSE_CALL_POINTS = 3
export const LIVE_MODEL_ID = 'studio-five-preferences-v3'
export const ARCHIVED_MODEL_ID = 'legacy-six-factor-source'
export const preferenceFactor = id => PREFERENCE_FACTOR_IDS.includes(id)
