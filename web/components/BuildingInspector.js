import { buildingHeightDescription, buildingHeightSource } from '../lib/buildingHeights.js'
import { housingSpec } from '../lib/titleNine.js'
import { housingCostConfirmed } from '../lib/housingCosts.js'
import { footprintRef, isDemolished } from '../lib/redevelopment.js'

function relation(building, sitePin) {
  const pin = building.properties?.pin
  return pin === sitePin ? 'Matched to this parcel' : pin ? `Crosses into this parcel · matched to ${pin}` : 'Crosses into this parcel · no matched parcel record'
}

/** Selection is UI state. Removal is an explicit, undoable scenario command. */
export default function BuildingInspector({ existing, placed, sitePin, siteBuildings, demolitions = [], onSelect, onDemolish, onRestore, onEditPlaced, onClose, pending, existingHomes, planNet, children }) {
  const ref = existing && footprintRef(existing, sitePin)
  const isRemoved = existing && isDemolished(existing, demolitions)
  const source = existing && buildingHeightSource(existing.properties)
  const retained = siteBuildings.filter(building => !isDemolished(building, demolitions)).length
  return <section className="building-inspector" aria-label="Buildings on this site">
    {(existing || placed) && <div className="building-selection">
      <div className="section-heading"><h3>{placed ? 'Planned building' : isRemoved ? 'Demolished in this plan' : 'Existing building'}</h3><button onClick={onClose} aria-label="Close building details">×</button></div>
      <strong>{placed ? housingSpec(placed.option).label : existing.properties.use_label || 'Recorded building'}</strong>
      <p>{placed ? `${placed.option.width} × ${placed.option.depth} m · ${placed.option.height} m high` : buildingHeightDescription(existing.properties)}</p>
      {existing && <p className="compact-help">{relation(existing, sitePin)}</p>}
      {existing && <p className="compact-help">{existing.properties.footprint_role === 'auxiliary' ? 'Accessory outline: its parcel’s recorded homes are not counted as replaced when only this is demolished.' : `Recorded homes on its parcel (estimate from land use): ${existingHomes}`}</p>}
      {placed && <p className="compact-help">Adds {housingSpec(placed.option).units} proposed {housingSpec(placed.option).units === 1 ? 'home' : 'homes'}.</p>}
      {planNet && <p className="net-homes"><strong>{planNet.text}</strong><small>Whole plan · {planNet.note}</small></p>}
      {placed && <p className="compact-help">{housingCostConfirmed(placed, placed.option) ? 'Housing costs: confirmed scenario assumptions.' : 'Housing costs: not confirmed, excluded from the plan score. Use Replace planned building to review its saved costs in Advanced and add it back.'}</p>}
      {existing && <details><summary>Building evidence</summary><p>{existing.properties.recorded_land_use || 'Use unknown'} · {existing.properties.use_evidence || 'Occupancy unverified.'}</p>{source && <a href={source} target="_blank" rel="noreferrer">Height source for this building ↗</a>}</details>}
      <div className="placement-actions">{placed ? <><button onClick={() => onEditPlaced(true)} disabled={pending}>Replace planned building</button><button onClick={() => onEditPlaced(false)}>Remove from plan</button></> : isRemoved ? <button onClick={() => onRestore(ref)}>Restore original building</button> : <><button className="primary-build" onClick={() => onDemolish(existing, true)} disabled={pending || !ref}>Demolish & replace</button><button onClick={() => onDemolish(existing, false)} disabled={pending || !ref}>Demolish only</button></>}</div>
      {children}
      <small>Scenario only · reversible with Undo or Restore. Source records are unchanged.</small>
    </div>}
    {!!siteBuildings.length && <details className="site-buildings" open><summary>Existing buildings on this site <span>{retained} standing · {siteBuildings.length - retained} demolished in plan</span></summary>
      <p className="compact-help">County outlines matched to this parcel, plus any outline crossing its boundary. They block new buildings until demolished in the plan.</p>
      <ul>{siteBuildings.map((building, i) => {
        const item = footprintRef(building, sitePin)
        if (!item) return null
        const removed = isDemolished(building, demolitions)
        return <li key={`${item.pin}:${item.id}`}><button aria-label={`Inspect existing building ${i + 1}`} aria-pressed={existing === building} onClick={() => onSelect({ ...item, kind: 'existing' })}><strong>{building.properties.use_label || 'Recorded building'}</strong><small>{relation(building, sitePin)}{removed ? ' · demolished in plan' : ''}</small></button>
          {removed ? <button aria-label={`Restore existing building ${i + 1}`} onClick={() => onRestore(item)}>Restore</button> : <button aria-label={`Demolish existing building ${i + 1}`} disabled={pending} onClick={() => onDemolish(building, false)}>Demolish</button>}</li>
      })}</ul>
    </details>}
  </section>
}
