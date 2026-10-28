import { useEffect, useRef } from 'react'
import { siteDiagram, standardsTable } from '../lib/siteBrief.js'
import { factorReceipt } from '../lib/factorReceipts.js'
import { PLANNER_FACTORS } from '../lib/plannerState.js'
import { PREFERENCE_FACTOR_IDS } from '../lib/scoringPolicy.js'
import { FACTOR_LABELS, zoningBadge, comparisonScore, zoningReviewLabel, proposalStatus, proposalChecks } from '../lib/studioPresentation.js'
import { stanceFor } from '../lib/priorityStances.js'
import { money, dollars, span } from './RedevelopmentImpact.js'
import { trapDialogTab } from '../lib/dialogFocus.js'

const FT = 3.28084
const STATUS = { pass: 'Pass', conflict: 'Conflict', unknown: 'Not assessed', conditional: 'Approval needed' }
const REFORM_SHORT = { 'bill-2025-1545': 'Bill 2025-1545', 'missing-middle': 'Missing-Middle', 'by-right': 'Full By-Right' }
function reformText(row, presets) {
  if (row.status !== 'conflict') return ''
  const lifted = presets.filter(p => row.reform[p.id] === 'Lifted').map(p => REFORM_SHORT[p.id])
  return !lifted.length ? 'Applies under all' : lifted.length === presets.length ? 'Lifted under all' : `Lifted: ${lifted.join(', ')}`
}
const fmt = n => Number.isFinite(n) ? n.toFixed(1) : '—'

function Diagram({ d, label }) {
  const lot = d.lot, foot = d.footprintDims
  return <figure className="brief-diagram">
    <svg viewBox={d.viewBox} role="img" aria-label={`Site plan of ${label}: parcel boundary, proposed footprint, north arrow and scale`}>
      <rect width={d.size} height={d.size} fill="#fff"/>
      <path d={d.parcel} fill="#eef3e8" stroke="#2f5d45" strokeWidth="1.6" fillRule="evenodd"/>
      {d.retained.map(p => <path key={p} d={p} fill="#d9d4c7" stroke="#8a826e" strokeWidth=".8"/>)}
      {d.demolished.map(p => <path key={p} d={p} fill="none" stroke="#b4462f" strokeWidth="1" strokeDasharray="3 2"/>)}
      {d.footprint && <path d={d.footprint} fill="#e8a33d" fillOpacity=".8" stroke="#7a4b07" strokeWidth="1.2"/>}
      {d.labels.map(l => <text key={l.kind} x={l.x} y={l.y} transform={`rotate(${l.angle} ${l.x} ${l.y})`} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="#3b2a06">{l.text}</text>)}
      <g transform={`translate(${d.north.x} ${d.north.y})`}><path d="M0 -14 L6 6 L0 2 L-6 6 Z" fill="#1f2a22"/><text y="17" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1f2a22">N</text></g>
      <g><line x1={d.scale.x} y1={d.scale.y} x2={d.scale.x + d.scale.length} y2={d.scale.y} stroke="#1f2a22" strokeWidth="2"/><text x={d.scale.x} y={d.scale.y - 4} fontSize="8.5" fill="#1f2a22">{d.scale.label}</text></g>
    </svg>
    <figcaption>
      {lot ? `Lot ≈ ${lot.width} × ${lot.depth} m (${Math.round(lot.width * FT)} × ${Math.round(lot.depth * FT)} ft). ` : ''}
      {foot ? `Footprint ${foot.width} × ${foot.depth} m${foot.bearing !== null ? `, depth axis ${Math.round(foot.bearing)}° from N` : ''}. ` : 'No footprint placed. '}
      Grey retained, dashed red demolished. Map outlines, not a survey.
    </figcaption>
  </figure>
}

/** One-page printable site brief for the current draft. */
export default function SiteBrief({ props, geometry, option, evaluated, label, retained = [], demolished = [], impact, pathway, comparison, weights, call, reformPreset, snapshot, onClose }) {
  const dialog = useRef(null), closeButton = useRef(null), backdropPress = useRef(false)
  useEffect(() => {
    const node = dialog.current
    const prior = document.activeElement
    document.body.classList.add('site-brief-open')
    // Native modal containment keeps keyboard and pointer interaction off the map.
    node.showModal()
    closeButton.current?.focus({ preventScroll: true })
    return () => {
      node.close()
      document.body.classList.remove('site-brief-open')
      const target = prior?.isConnected && prior !== document.body ? prior : document.querySelector('.studio-brief')
      target?.focus({ preventScroll: true })
    }
  }, [])
  const diagram = siteDiagram({ parcel: geometry, footprint: evaluated?.massing?.geometry, bearing: evaluated?.massing?.placement?.bearing, retained, demolished })
  const table = evaluated ? standardsTable(evaluated, props.zoning_code ?? null) : null
  const score = evaluated ? comparisonScore(evaluated) : null, badge = evaluated ? zoningBadge(evaluated) : null
  const stance = stanceFor(weights)
  const relief = pathway?.worksheet ? Object.fromEntries(pathway.worksheet.failed.map(f => [f.id, f.relief])) : null
  const share = id => comparison?.factors.find(f => f.id === id)
  const { cost, value, affordability, capitalStack, tax, replacement } = impact
  const generated = new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })
  return <dialog className="site-brief-overlay" aria-label="1-page site brief" tabIndex={-1} ref={dialog}
    onKeyDown={event => { event.stopPropagation(); trapDialogTab(event, dialog.current) }}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose() }}
    onPointerDown={event => { backdropPress.current = event.target === event.currentTarget; event.stopPropagation() }}
    onPointerCancel={() => { backdropPress.current = false }}
    onClick={event => { event.stopPropagation(); if (backdropPress.current && event.target === event.currentTarget) onClose(); backdropPress.current = false }}>
    <div className="site-brief-toolbar"><strong>1-page site brief</strong><span><button type="button" className="primary-build" onClick={() => window.print()}>Print</button><button type="button" ref={closeButton} onClick={onClose}>Close</button></span></div>
    <article className="site-brief">
      <header className="brief-head">
        <h1>{label} at {props.address || props.pin}</h1>
        <p className="brief-meta">PIN {props.pin} · {props.neighborhood || props.area || 'Neighborhood unknown'}, Pittsburgh · Zoning {props.zoning_code || 'unknown'} · {Number.isFinite(props.lot_sqft) ? `${props.lot_sqft.toLocaleString()} sq ft recorded lot` : 'Lot area unknown'} · {props.land_use || 'Use unknown'} · <span className="brief-kicker">Playhouse site brief · {generated}</span></p>
        <p className="brief-callout"><strong>Screening aid only.</strong> Not a permit, survey, appraisal or legal opinion. Confirm with City Planning, PLI and a qualified professional.</p>
      </header>
      <div className="brief-top">
        {diagram ? <Diagram d={diagram} label={props.address || props.pin}/> : <p>Parcel outline unavailable.</p>}
        <section className="brief-summary">
          <h2>Proposal</h2>
          <p><strong>{label}</strong>: {replacement.units} {replacement.units === 1 ? 'home' : 'homes'}, {option.width} × {option.depth} m, {evaluated?.floors ?? option.floors} stories, {Math.round(option.height * FT)} ft ({option.height} m), {Math.round(replacement.sqft).toLocaleString()} sq ft. Net homes: {replacement.netUnits === null ? 'unknown' : `${replacement.netUnits >= 0 ? '+' : '−'}${Math.abs(replacement.netUnits)}`}.</p>
          {score && <><p><strong>{score.kind === 'underlying' || score.value === null ? 'Not ranked' : `${fmt(score.value)} / 100`}</strong> · {proposalStatus(evaluated)}</p><p>{badge.text} · {zoningReviewLabel(evaluated)}</p><p>{proposalChecks(evaluated).map(check => `${check.label}: ${check.status === 'pass' ? 'pass' : check.status === 'fail' ? 'does not pass' : 'not assessed'} — ${check.detail}`).join('; ')}</p></>}
          {evaluated?.area && <p>Score scope: existing plan + this next building ({evaluated.area.units} proposed homes in {evaluated.area.buildings} buildings), averaged per home. Dimensions and cost inputs below describe the next building.</p>}
          <p>Priorities: {stance ? stance.label : 'Custom weights'} (team value judgment).{call ? ` ${call.close ? `${call.badge}: ` : ''}${call.text}` : ''}</p>
          <p>Rent {dollars(option.rent)} + utilities {dollars(option.utilities)} per month{affordability ? `; target income ${dollars(affordability.targetIncome)}${affordability.band ? ` (about ${Math.round(affordability.band.percent)}% AMI)` : ''}` : ''}.</p>
          {pathway && <div className="brief-pathway">
            <h2>Permit and acquisition pathway</h2>
            <p><strong>Acquisition:</strong> {pathway.acquisition.label}. {pathway.acquisition.steps[0]}{pathway.acquisition.privacy ? ' Owner name withheld.' : ''}</p>
            <p><strong>Zoning only:</strong> {pathway.zoning.label} (§ {pathway.zoning.section}). {pathway.zoning.detail}</p>
            {pathway.worksheet && <p className="brief-small">§ {pathway.worksheet.section} worksheet: {pathway.worksheet.failed.length} {pathway.worksheet.failed.length === 1 ? 'standard needs' : 'standards need'} relief (see the table below). Five findings: {pathway.worksheet.criteria.map(c => `${c.label} (${c.status === 'evidence' ? 'pre-filled' : 'applicant'})`).join('; ')}.</p>}
          </div>}
        </section>
      </div>

      {table && <section>
        <h2>Title Nine standards and reform presets</h2>
        <table className={`brief-table standards${relief ? ' with-relief' : ''}`} tabIndex={0} aria-label="Title Nine standards and reform presets">
          <thead><tr><th>Standard</th><th>§</th><th>Required</th><th>Proposed</th><th>Current code</th>{relief && <th>Relief needed (ZBA)</th>}<th>Reform presets<small>{table.presets.map(p => `${REFORM_SHORT[p.id]} ${p.status}`).join(' · ')}</small></th></tr></thead>
          <tbody>{table.shown.map(r => <tr key={r.id} className={r.status}>
            <td>{r.label}</td><td>{r.section}</td><td>{r.required || '—'}</td><td>{r.proposed || '—'}</td><td>{STATUS[r.status] || r.status}</td>{relief && <td>{relief[r.id] || ''}</td>}
            <td>{reformText(r, table.presets)}</td>
          </tr>)}</tbody>
          <tfoot><tr><td colSpan={relief ? 7 : 6}>Passes assessed zoning checks only (physical fit is separate): current code {evaluated.titleNine.conflict ? 'no' : 'yes'}; {table.presets.map(p => `${REFORM_SHORT[p.id]} ${p.eligible ? 'yes' : 'no'}`).join('; ')}.</td></tr></tfoot>
        </table>
        <p className="brief-small">{table.alsoPass.length ? `Also passes: ${table.alsoPass.join('; ')}. ` : ''}{table.notAssessed.length ? `Not assessed: ${table.notAssessed.join('; ')}. ` : ''}Current code includes Bill 2025-1579. Reform presets lift only the conflicts their rules name; {reformPreset !== 'current' ? `the Studio is set to ${REFORM_SHORT[reformPreset]}. ` : ''}Unassessed checks are excluded, not passed.</p>
      </section>}

      <section className="brief-proforma">
        <h2>Pro forma and tax ledger</h2>
        <div className="brief-two">
          <table className="brief-table numeric">
            <tbody>
              <tr><td>Hard Redevelopment Cost</td><td>{span(cost.hard)}</td></tr>
              <tr><td>Acquisition{cost.acquisition.complete ? '' : ' (partial)'}</td><td>{span(cost.acquisition.range)}</td></tr>
              <tr className="total"><td>Total Development Cost incl. Acquisition</td><td>{span(cost.development)}</td></tr>
              <tr><td>Per home</td><td>{span(cost.perHome)}</td></tr>
              <tr><td>Break-even rent per home / month</td><td>{span(value.breakEvenRent, dollars)}</td></tr>
              <tr><td>Residual land value at draft rent</td><td>{span(value.residualLand)}</td></tr>
              {capitalStack && <tr><td>Subsidy gap per home{affordability?.band?.band ? ` at ${affordability.band.band}% AMI` : ''}</td><td>{span(capitalStack.gapPerUnit)}</td></tr>}
              <tr className="total"><td>Net New Annual Tax Revenue ({tax.mills.toFixed(3)} mills)</td><td>{span(tax.net, dollars)}</td></tr>
            </tbody>
          </table>
          <div>
            {capitalStack && <p className="brief-small">Capital stack screen: {capitalStack.programs.map(p => `${p.name} ${p.status === 'eligible' ? 'screens in' : p.status === 'conditional' ? 'conditional' : 'does not screen in'}`).join('; ')}.</p>}
            <p className="brief-small">Tax: City {tax.bodies.find(b => b.id === 'city')?.mills}, schools {tax.bodies.find(b => b.id === 'schools')?.mills} and County {tax.bodies.find(b => b.id === 'county')?.mills} mills on construction cost as the assessment proxy, minus the replaced parcel tax. {tax.abatement.applies ? `City Chapter 267${tax.abatement.enhanced ? ' Enhanced' : ''} abatement may apply: ${tax.abatement.years} years, up to ${money(tax.abatement.cap)} a year. ` : ''}Costs are scenario assumptions.</p>
          </div>
        </div>
      </section>

      <section>
        <h2>Five preference-factor receipts</h2>
        <table className="brief-table receipts" tabIndex={0} aria-label="Five preference-factor receipts">
          <thead><tr><th>Factor</th><th>Score</th><th>Share</th><th>Evidence · confidence</th><th>Dataset</th><th>Formula · this draft</th></tr></thead>
          <tbody>{PLANNER_FACTORS.filter(f => PREFERENCE_FACTOR_IDS.includes(f.id)).map(f => {
            const r = factorReceipt(f.id, evaluated), s = share(f.id)
            return <tr key={f.id}><td>{FACTOR_LABELS[f.id]}</td><td>{fmt(r.score)}</td><td>{s?.included ? `${Math.round(s.effectiveWeight * 100)}%` : 'Excluded'}</td><td>{r.badge} · {r.confidence}</td><td>{r.dataset}</td><td>{r.formula}{r.inputs ? ` · ${r.inputs}` : ''}</td></tr>
          })}</tbody>
        </table>
      </section>
      <footer className="brief-small">Snapshot {snapshot || 'unknown'} · County parcels and assessments, ACS, HUD CHAS and FY2026 income limits, PRT, OpenStreetMap, Title Nine · no owner names or tax-delinquency records.</footer>
    </article>
  </dialog>
}
