const NEW_TAB = ' (opens in a new tab)'

/** Accessible name for a link that opens in a new tab; never empty. */
export function externalLinkLabel(text, fallback = 'Source') {
  const name = String(text ?? '').replace(/[↗↓]/g, '').replace(/\s+/g, ' ').trim()
  return `${name || fallback}${NEW_TAB}`
}

/** Accessible name for a zoning-code citation such as "§903.03". */
export function codeLinkLabel(section, topic) {
  const cite = section ? `Pittsburgh Zoning Code §${String(section).replace(/^§/, '')}` : 'Pittsburgh Zoning Code'
  return externalLinkLabel(topic ? `${cite}: ${topic}` : cite)
}

export function linkHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}
