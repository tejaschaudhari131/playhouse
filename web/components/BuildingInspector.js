import { buildingHeightDescription, buildingHeightSource } from '../lib/buildingHeights.js'
import { housingSpec } from '../lib/titleNine.js'
import { housingCostConfirmed } from '../lib/housingCosts.js'
import { recordedBuildingRef } from '../lib/redevelopment.js'

/** Selection is UI state. Removal is an explicit, undoable scenario command. */
export default function BuildingInspector({ existing, placed, siteBuildings, demolitions = [], onSelect, onDemolish, onRestore, onEditPlaced, onClose, pending }) {
  const removed = ref => demolitions.some(b => b.id === ref.id && b.pin === ref.pin)
  const ref = recordedBuildingRef(existing)
  const isRemoved = ref && removed(ref)
  const source = existing && buildingHeightSource(existing.properties)
  return <section className="building-inspector" aria-label="Buildings on this site">
    {(existing || placed) && <div className="building-selection">
      <div className="section-heading"><h3>{placed ? 'Planned building' : isRemoved ? 'Demolished in this plan' : 'Existing building'}</h3><button onClick={onClose} aria-label="Close building details">×</button></div>
      <strong>{placed ? housingSpec(placed.option).label : existing.properties.use_label || 'Recorded building'}</strong>
      <p>{placed ? `${placed.option.width} × ${placed.option.depth} m · ${placed.option.height} m high` : buildingHeightDescription(existing.properties)}</p>
      {placed && <p className="compact-help">{housingCostConfirmed(placed, placed.option) ? 'Housing costs: confirmed scenario assumptions.' : 'Housing costs: not confirmed, excluded from the plan score. Use Replace planned building to review its saved costs in Advanced and add it back.'}</p>}
      {existing && <details><summary>Building evidence</summary><p>{existing.properties.recorded_land_use || 'Use unknown'} · {existing.properties.use_evidence || 'Occupancy unverified.'}</p>{source && <a href={source} target="_blank" rel="noreferrer">Height source ↗</a>}</details>}
      <div className="placement-actions">{placed ? <><button onClick={() => onEditPlaced(true)} disabled={pending}>Replace planned building</button><button onClick={() => onEditPlaced(false)}>Remove from plan</button></> : isRemoved ? <button onClick={() => onRestore(ref)}>Restore original building</button> : <><button onClick={() => onDemolish(true)} disabled={pending}>Replace building</button><button onClick={() => onDemolish(false)} disabled={pending}>Demolish in plan</button></>}</div>
      <small>Scenario only · reversible with Undo. Costs, demolition emissions and relocation are not assessed.</small>
    </div>}
    {!!siteBuildings.length && <details className="site-buildings"><summary>Recorded buildings on this site <span>{siteBuildings.length}</span></summary><ul>{siteBuildings.map((building, i) => {
      const item = recordedBuildingRef(building)
      if (!item) return null
      return <li key={item.id}><button aria-label={`Inspect recorded building ${i + 1}`} aria-pressed={ref?.id === item.id} onClick={() => onSelect({ ...item, kind: 'existing' })}><strong>{building.properties.use_label || 'Recorded building'}</strong><small>Outline {item.id}{removed(item) ? ' · demolished in plan' : ''}</small></button></li>
    })}</ul></details>}
  </section>
}
