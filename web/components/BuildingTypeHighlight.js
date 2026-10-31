import { useId, useState } from 'react'
import { BUILDING_TYPE_CATEGORIES, plannedCategoryColor } from '../lib/buildingTypes.js'

/** Map toggle that colour-codes buildings by recorded County land use, with a legend and per-type show/hide. */
export default function BuildingTypeHighlight({ value, onChange }) {
  const enabled = !!value, hidden = value?.hidden || []
  const [collapsed, setCollapsed] = useState(false)
  const legendId = useId()
  const toggleType = id => onChange({ hidden: hidden.includes(id) ? hidden.filter(h => h !== id) : [...hidden, id] })
  return <div className="type-highlight-control" role="group" aria-label="Building types" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <div className="type-highlight-row">
      <button type="button" className="type-highlight-toggle" aria-pressed={enabled} aria-controls={enabled ? legendId : undefined} onClick={() => { onChange(enabled ? null : { hidden: [] }); setCollapsed(false) }}>
        <span className="type-highlight-icon" aria-hidden="true">{BUILDING_TYPE_CATEGORIES.slice(0, 4).map(c => <i key={c.id} style={{ background: c.color }}/>)}</span>
        <span>Highlight building types</span>
      </button>
      {enabled && <button type="button" className="type-highlight-collapse" aria-expanded={!collapsed} aria-controls={legendId} aria-label={collapsed ? 'Show building type key' : 'Hide building type key'} onClick={() => setCollapsed(c => !c)}><span aria-hidden="true">{collapsed ? '▾' : '▴'}</span></button>}
    </div>
    {enabled && !collapsed && <fieldset id={legendId} className="type-highlight-legend">
      <legend>Recorded County land use · uncheck to hide</legend>
      {BUILDING_TYPE_CATEGORIES.map(c => <label key={c.id} title={c.detail}>
        <input type="checkbox" checked={!hidden.includes(c.id)} onChange={() => toggleType(c.id)}/>
        <i style={{ background: c.color }} aria-hidden="true"/>
        <span>{c.label}</span>
      </label>)}
      <p><i className="type-highlight-planned" style={{ background: plannedCategoryColor('apartments') }} aria-hidden="true"/>Planned buildings use a lighter tint of their typology&apos;s type. Vacant lots are shaded as land.</p>
      <div className="type-highlight-actions">
        <button type="button" disabled={!hidden.length} onClick={() => onChange({ hidden: [] })}>Show all</button>
        <button type="button" disabled={hidden.length === BUILDING_TYPE_CATEGORIES.length} onClick={() => onChange({ hidden: BUILDING_TYPE_CATEGORIES.map(c => c.id) })}>Hide all</button>
      </div>
    </fieldset>}
  </div>
}
