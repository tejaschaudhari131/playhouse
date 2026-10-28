export const EvidenceBadge = ({ receipt }) => receipt ? <span className={`evidence-badge ${receipt.evidence}`}>{receipt.badge}</span> : null

/** Clickable source receipt. `rows` lists the inputs behind each compared option's score. */
export function FactorReceipt({ receipt, rows = null }) {
  if (!receipt) return null
  const lines = rows || (receipt.inputs ? [{ label: 'This option', inputs: receipt.inputs }] : [])
  return <details className="factor-receipt">
    <summary>Receipt</summary>
    <dl>
      <div><dt>Evidence</dt><dd>{receipt.badge}</dd></div>
      <div><dt>Source</dt><dd><strong>{receipt.dataset}.</strong> {receipt.source}</dd></div>
      <div><dt>Formula</dt><dd>{receipt.formula}</dd></div>
      {lines.map(line => <div key={line.label}><dt>{line.label}</dt><dd>{line.inputs || '—'}</dd></div>)}
      {receipt.id === 'demand' && receipt.details && <>
        <div><dt>Lot-fit curve</dt><dd>{receipt.details.curve || 'Curve unavailable.'}</dd></div>
        <div><dt>Why types differ</dt><dd>{receipt.details.limitation}</dd></div>
        {receipt.details.missing && <div><dt>Missing evidence</dt><dd>{receipt.details.missing}</dd></div>}
      </>}
      {receipt.id === 'affordability' && Object.entries(receipt.details || {}).map(([id, evidence]) => <div key={id}><dt>{evidence.label}</dt><dd><strong>{evidence.kind === 'fallback' ? 'Fallback' : evidence.kind === 'measured' ? 'Measured' : 'Assumed'}.</strong> {evidence.source}</dd></div>)}
      <div><dt>Confidence</dt><dd><span className={`confidence ${receipt.confidence.toLowerCase()}`}>{receipt.confidence}</span></dd></div>
    </dl>
  </details>
}
