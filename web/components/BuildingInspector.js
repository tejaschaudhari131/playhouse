import { useEffect, useRef } from 'react'
import { buildingInspectionRow } from '../lib/buildingIdentity.js'
import { housingSpec } from '../lib/titleNine.js'
import { housingCostConfirmed } from '../lib/housingCosts.js'
import { footprintKey, footprintRef, isDemolished } from '../lib/redevelopment.js'
import './buildingInspector.css'

function parcelRelation(building, sitePin, relation) {
  const pin = building.properties?.pin
  if (relation === 'outside') return pin ? `Outside this parcel; matched to parcel ${pin}.` : 'Outside this parcel; no matched parcel record.'
  return pin === sitePin ? 'Matched to this parcel.' : pin ? `Crosses into this parcel; matched to parcel ${pin}.` : 'Crosses into this parcel; no matched parcel record.'
}

function BuildingStatus({ relation, removed }) {
  if (!removed && relation !== 'crossing' && relation !== 'unmatched' && relation !== 'outside') return null
  return <span className="building-statuses">
    {relation === 'outside' && <span className="building-status">Outside selected parcel</span>}
    {relation === 'crossing' && <span className="building-status">Crossing parcel</span>}
    {relation === 'unmatched' && <span className="building-status">Unmatched parcel</span>}
    {removed && <span className="building-status is-demolished">Demolished in plan</span>}
  </span>
}

/** Selection is UI state. Removal is an explicit, undoable scenario command. */
export default function BuildingInspector({ parcel, existing, placed, sitePin, buildingRows = [], demolitions = [], onSelect, onDemolish, onRestore, onEditPlaced, onClose, pending, existingHomes, planNet, children }) {
  const heading = useRef(null)
  const existingKey = existing && footprintKey(existing)
  const selectedRow = existingKey && buildingRows.find(row => row.key === existingKey)
  const evidenceRow = buildingInspectionRow(existing, parcel, buildingRows)
  const selectionKey = existing ? `${sitePin}:${existingKey}` : placed?.id
  useEffect(() => { if (selectionKey) heading.current?.focus({ preventScroll: true }) }, [selectionKey])
  const ref = existing && footprintRef(existing, sitePin)
  const isRemoved = existing && isDemolished(existing, demolitions)
  const selectedName = selectedRow ? `existing building ${selectedRow.number}` : 'existing building'
  const removedCount = buildingRows.filter(row => isDemolished(row.building, demolitions)).length
  return <section className="building-inspector" aria-label="Buildings on this site">
    {(existing || placed) && <div className="building-selection">
      <div className="section-heading"><h3 ref={heading} tabIndex={-1}>{placed ? 'Planned building' : `Existing building${selectedRow ? ` #${selectedRow.number}` : ''}`}</h3><button onClick={onClose} aria-label="Close building details">×</button></div>
      <strong className="building-selection-use">{placed ? housingSpec(placed.option).label : existing.properties.use_label || 'Use unknown'}</strong>
      {placed ? <p className="building-selection-measures">{placed.option.width} × {placed.option.depth} m · {placed.option.height} m high</p> : evidenceRow && <p className="building-selection-measures"><span>{evidenceRow.areaLabel}</span><span>{evidenceRow.heightLabel}</span></p>}
      {existing && <BuildingStatus relation={evidenceRow?.relation} removed={isRemoved}/>}
      {evidenceRow?.relation === 'outside' && <p className="compact-help">Overlaps the draft, not the selected parcel. Removing it does not enlarge this lot.</p>}
      {placed && <p className="compact-help">Adds {housingSpec(placed.option).units} proposed {housingSpec(placed.option).units === 1 ? 'home' : 'homes'}.</p>}
      {placed && <p className="compact-help">{housingCostConfirmed(placed, placed.option) ? 'Housing costs: included as scenario assumptions recorded at placement.' : 'Housing costs: excluded from the plan score. Turn on Housing costs in score (Build, Compare or Advanced) to include them.'}</p>}
      <div className="placement-actions">{placed ? <><button onClick={() => onEditPlaced(true)} disabled={pending}>Edit shape & position</button><button onClick={() => onEditPlaced(false)}>Remove from plan</button></> : isRemoved ? <button aria-label={`Restore original ${selectedName}`} onClick={() => onRestore(ref)}>Restore original building</button> : <><button className="primary-build" aria-label={`Demolish and replace ${selectedName}`} onClick={() => onDemolish(existing, true)} disabled={pending || !ref}>Demolish & replace</button><button aria-label={`Demolish ${selectedName} only`} onClick={() => onDemolish(existing, false)} disabled={pending || !ref}>Demolish only</button></>}</div>
      <details className="building-evidence"><summary>{existing ? 'Building evidence' : 'Plan notes'}</summary>
        {existing && <>
          <p>{evidenceRow?.heightDescription || 'Height unknown. No recorded height evidence is available.'}</p>
          {evidenceRow?.heightSource && <a href={evidenceRow.heightSource} target="_blank" rel="noreferrer">Height source for this building ↗</a>}
          <p>Recorded outline ID: {existing.properties.id ?? existing.id ?? 'Unknown'}</p>
          <p>{parcelRelation(existing, sitePin, evidenceRow?.relation)}</p>
          <p>{existing.properties.recorded_land_use || 'Use unknown'} · {existing.properties.use_evidence || 'Occupancy unverified.'}</p>
          <p>{existing.properties.footprint_role === 'auxiliary' ? 'Accessory outline: its parcel’s recorded homes are not counted as replaced when only this is demolished.' : `Recorded homes on its parcel (estimate from land use): ${existingHomes}`}</p>
        </>}
        <p>Scenario only · reversible with Undo or Restore. Source records are unchanged.</p>
      </details>
      {planNet && <p className="net-homes"><strong>{planNet.text}</strong><small>Whole plan · {planNet.note}</small></p>}
      {children}
    </div>}
    {!!buildingRows.length && <details className="site-buildings" open><summary>Existing buildings <span className="site-buildings-count">{buildingRows.length}</span>{removedCount > 0 && <span className="site-buildings-removed">{removedCount} demolished</span>}</summary>
      <ul>{buildingRows.map(row => {
        const { building, key, number, areaLabel, heightLabel, relation } = row
        const item = footprintRef(building, sitePin)
        if (!item) return null
        const removed = isDemolished(building, demolitions)
        return <li key={key}><button className="building-row-inspect" aria-label={`Inspect existing building ${number}`} aria-pressed={existingKey === key} onClick={event => onSelect({ ...item, kind: 'existing' }, event.currentTarget)}><span className="building-number" aria-hidden="true">#{number}</span><span className="building-row-info"><strong>{building.properties?.use_label || 'Use unknown'}</strong><small className="building-row-measures"><span>{areaLabel}</span><span>{heightLabel}</span></small><BuildingStatus relation={relation} removed={removed}/></span></button>
          {removed ? <button className="building-row-action" aria-label={`Restore existing building ${number}`} onClick={() => onRestore(item)}>Restore</button> : <button className="building-row-action" aria-label={`Demolish existing building ${number}`} disabled={pending} onClick={() => onDemolish(building, false)}>Demolish</button>}</li>
      })}</ul>
      <details className="building-list-evidence"><summary>About these outlines</summary><p>County outlines matched to this parcel, plus any outline crossing its boundary. They block new buildings until demolished in the plan. Numbers are map labels, not street addresses; they identify the same outlines in this list and on the map. Zoom in to separate closely spaced labels.</p></details>
    </details>}
  </section>
}
