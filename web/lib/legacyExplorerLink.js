/** Retire old bookmarks without applying six-factor assumptions to Studio. */
export function legacyStudioHref(params = {}) {
  const validPin = value => typeof value === 'string' && /^[A-Za-z0-9]{1,32}$/.test(value.trim()) ? value.trim().toUpperCase() : null
  let pin = validPin(params.pin)
  // Old share links contain base64url JSON. Only recover a parcel, never a plan.
  if (!pin && typeof params.s === 'string' && params.s.length <= 4000 && /^[A-Za-z0-9_-]+$/.test(params.s)) {
    try {
      const saved = JSON.parse(Buffer.from(params.s, 'base64url').toString('utf8'))
      if (saved?.v === 1) pin = validPin(saved.pin) || validPin(saved.drops?.[0]?.pin)
    } catch { /* Malformed bookmarks safely open Studio. */ }
  }
  const query = new URLSearchParams({ from: 'explorer' })
  if (pin) query.set('pin', pin)
  return `/?${query}`
}
