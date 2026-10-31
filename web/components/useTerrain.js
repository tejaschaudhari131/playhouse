import { useEffect, useState } from 'react'
import { createTerrainTiles } from '../lib/terrainTiles.js'

let shared = null
/** One decoded-tile cache per page, shared by the parcel panel and the map overlays. */
export function terrainTiles() {
  shared ||= createTerrainTiles()
  return shared
}

/**
 * Loads DEM tiles for `bounds` while `enabled`. Status is 'idle', 'loading', 'ready', 'partial', 'error' or 'too-large';
 * `version` changes whenever newly loaded tiles may change sampled values.
 */
export default function useTerrainArea(bounds, enabled = true) {
  const key = enabled && bounds ? bounds.map(v => v.toFixed(5)).join(',') : null
  const [state, setState] = useState({ key: null, status: 'idle', version: 0 })
  useEffect(() => {
    if (!key) return
    let live = true
    setState(s => ({ ...s, key, status: 'loading' }))
    terrainTiles().load(key.split(',').map(Number)).then(result => {
      if (!live) return
      setState(s => ({ key, status: result.tooLarge ? 'too-large' : result.ok ? 'ready' : result.failed < result.total ? 'partial' : 'error', version: s.version + 1 }))
    })
    return () => { live = false }
  }, [key])
  return { status: key && state.key === key ? state.status : 'idle', version: state.version, sampler: terrainTiles().sampler }
}
