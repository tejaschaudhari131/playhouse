import { useId, useState } from 'react'
import { SLOPE_CLASSES, TERRAIN_LINKS } from '../lib/terrain.js'

const STATUS = {
  loading: 'Loading elevation tiles…',
  partial: 'Some elevation tiles did not load; slope and contours are shown where data arrived.',
  error: 'Terrain tiles did not load. The map stays flat and every other tool still works.',
  'too-large': 'Zoom in to draw contours and parcel slope.',
  idle: 'Zoom in to draw contours and parcel slope.',
}

/** Map toggle for real topography: 3D terrain (3D view), hillshade, optional contours and a parcel slope overlay. */
export default function TerrainControl({ value, onChange, status, view3d, mapFailed }) {
  const enabled = !!value
  const [collapsed, setCollapsed] = useState(false)
  const panelId = useId()
  const set = patch => onChange({ ...value, ...patch })
  const message = mapFailed ? STATUS.error : status !== 'ready' ? STATUS[status] : null
  return <div className="terrain-control" role="group" aria-label="Terrain" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <div className="type-highlight-row">
      <button type="button" className="terrain-toggle" aria-pressed={enabled} aria-controls={enabled ? panelId : undefined} onClick={() => { onChange(enabled ? null : { contours: true, slope: true }); setCollapsed(false) }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m2 19 6.5-10 4 6 2.5-3.5L22 19Z"/><path d="m6.6 12 1.9 1.4L10 12"/></svg>
        <span>Terrain</span>
      </button>
      {enabled && <button type="button" className="type-highlight-collapse" aria-expanded={!collapsed} aria-controls={panelId} aria-label={collapsed ? 'Show terrain options' : 'Hide terrain options'} onClick={() => setCollapsed(c => !c)}><span aria-hidden="true">{collapsed ? '▾' : '▴'}</span></button>}
    </div>
    {enabled && !collapsed && <fieldset id={panelId} className="terrain-panel">
      <legend>{mapFailed ? 'Terrain unavailable · flat ground' : `${view3d ? '3D terrain and hillshade' : 'Hillshade'} · real elevation`}</legend>
      <label><input type="checkbox" checked={!!value.contours} onChange={() => set({ contours: !value.contours })}/><span>Contours · 5 m, labelled every 25 m</span></label>
      <label><input type="checkbox" checked={!!value.slope} onChange={() => set({ slope: !value.slope })}/><span>Parcel slope (typical %)</span></label>
      {value.slope && <ul className="terrain-legend" aria-label="Parcel slope colours">{SLOPE_CLASSES.map(c => <li key={c.id}><i style={{ background: c.color }} aria-hidden="true"/>{c.label}</li>)}</ul>}
      <p>25%+ is the City’s landslide-risk proxy and the §915.02.A cut/fill limit; 15%+ triggers slope planting (§915.02.B).{view3d && !mapFailed ? ' Detailed meshes show as extrusions while terrain is on, so every building sits on the ground.' : ''}</p>
      {message && <p className="terrain-status" role="status">{message}</p>}
      <p className="terrain-credit">Elevation: <a href={TERRAIN_LINKS.registry} target="_blank" rel="noreferrer">Terrain Tiles on AWS</a> · USGS 3DEP (<a href={TERRAIN_LINKS.attribution} target="_blank" rel="noreferrer">attribution</a>)</p>
    </fieldset>}
  </div>
}
