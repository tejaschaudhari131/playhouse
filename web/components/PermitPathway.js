const Links = ({ links }) => links?.length ? <p className="pathway-links">{links.map(([label, url]) => <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`${label} (opens in a new tab)`}>{label} ↗</a>)}</p> : null

export function VarianceWorksheet({ worksheet }) {
  return <section className="variance-worksheet" aria-label={`ZBA § ${worksheet.section} variance worksheet`}>
    <h4>ZBA § {worksheet.section} variance worksheet <span className="data-badge">Pre-filled draft</span></h4>
    <table className="impact-table worksheet-table">
      <thead><tr><th scope="col">Failed standard</th><th scope="col">Required</th><th scope="col">Proposed</th><th scope="col">Relief requested</th></tr></thead>
      <tbody>{worksheet.failed.map(f => <tr key={f.id}>
        <th scope="row">{f.label} {f.url ? <a href={f.url} target="_blank" rel="noreferrer" aria-label={`Zoning code section ${f.section} (opens in a new tab)`}>§ {f.section}</a> : <small>§ {f.section}</small>}</th>
        <td>{f.required}</td><td>{f.proposed}</td><td>{f.relief}</td>
      </tr>)}</tbody>
    </table>
    <ol className="variance-criteria">{worksheet.criteria.map(c => <li key={c.id} className={c.status}>
      <strong>{c.label}</strong> <span className={`data-badge${c.status === 'evidence' ? ' observed' : ''}`}>{c.status === 'evidence' ? 'Pre-filled from public records' : 'Applicant to supply'}</span>
      <p>{c.text}</p>
      {!!c.evidence.length && <ul>{c.evidence.map(e => <li key={e}>{e}</li>)}</ul>}
      <small>{c.prompt}</small>
    </li>)}</ol>
    <small>The Board must find all five criteria. Pre-filled facts come from the map and County records, not a survey. This is a planning aid, not legal advice.</small>
  </section>
}

/** Acquisition channel, zoning approval route and, when a standard fails, the § 922.09.E worksheet. */
export default function PermitPathway({ pathway, open = false }) {
  if (!pathway) return null
  const { acquisition, zoning, worksheet } = pathway
  return <details className="impact-panel pathway-panel" open={open}>
    <summary><strong>Permit & Acquisition Pathway</strong><span>{zoning.label}</span></summary>
    <section className="pathway-step" aria-label="Acquisition">
      <h4>1 · Acquisition: {acquisition.label}</h4>
      <p className="compact-help">{acquisition.owner}{acquisition.privacy ? '. Owner name withheld.' : '.'}</p>
      <ol>{acquisition.steps.map(s => <li key={s}>{s}</li>)}</ol>
      <Links links={acquisition.links}/>
      {acquisition.note && <small>{acquisition.note}</small>}
    </section>
    <section className="pathway-step" aria-label="Zoning approval">
      <h4>2 · Zoning: {zoning.label}</h4>
      <p className="compact-help">{zoning.detail}{zoning.codeUrl ? <> <a href={zoning.codeUrl} target="_blank" rel="noreferrer" aria-label={`Zoning code section ${zoning.section} (opens in a new tab)`}>§ {zoning.section} ↗</a></> : null}</p>
      <ol>{zoning.steps.map(s => <li key={s}>{s}</li>)}</ol>
      <Links links={zoning.links}/>
    </section>
    {worksheet && <VarianceWorksheet worksheet={worksheet}/>}
    <small>Routes follow the screened checks and public ownership records. Fees and timelines are from City guides and may change; confirm with City Planning, PLI, the URA or the Department of Finance.</small>
  </details>
}
