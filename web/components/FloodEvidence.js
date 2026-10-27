import { externalLinkLabel } from '../lib/links.js'
import { FLOOD_SCOPE, floodEvidence, floodPercent } from '../lib/floodEvidence.js'

export function FloodSource({ sources }) {
  const { source } = floodEvidence({}, sources)
  return <span><a href={source.url} aria-label={externalLinkLabel(source.name)} target="_blank" rel="noreferrer">{source.name}</a>{source.retrievedAt ? ` · retrieved ${source.retrievedAt}` : ' · retrieval date unavailable'}{source.status && source.status !== 'ok' ? ` · ${source.status.replace(/_/g, ' ')}` : ''}</span>
}

export default function FloodEvidence({ properties, sources }) {
  if (!properties) return null
  const evidence = floodEvidence(properties, sources)
  return <section className="flood-evidence" aria-label="Parcel flood evidence">
    <div className="section-heading"><h3>Flood screen</h3><strong>{evidence.label}</strong></div>
    <p className="compact-help">Parcel area in SFHA: <strong>{floodPercent(evidence.sfha)}</strong> · in 0.2% annual-chance zones: <strong>{floodPercent(evidence.annual02)}</strong></p>
    <p className="compact-help"><FloodSource sources={sources}/></p>
    <details className="planner-details">
      <summary>What this flood screen covers</summary>
      <p className="compact-help">{FLOOD_SCOPE} Fractions describe parcel area, not the chance this parcel floods. The saved data distinguishes SFHA and 0.2% categories; detailed FEMA zone codes are not retained.</p>
      <p className="compact-help">{evidence.source.effectiveDate ? `Map effective date: ${evidence.source.effectiveDate}.` : 'Map panel effective dates are not recorded. The retrieval date above is when this source was downloaded.'} Check current FEMA maps and amendments before a development decision.</p>
    </details>
  </section>
}
