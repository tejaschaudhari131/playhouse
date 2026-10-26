import { placedBuildingColor } from './buildingUses.js'

let sequence = 0
const collection = features => ({ type: 'FeatureCollection', features })

/** Subdivide the accepted, rotated footprint; seams never expand its outer boundary. */
export function constructionCells(geometry) {
  const ring = geometry?.coordinates?.[0]
  if (geometry?.type !== 'Polygon' || geometry.coordinates.length !== 1 || ring?.length !== 5 ||
    ring.some(point => point?.length !== 2 || !point.every(Number.isFinite)) ||
    ring[0][0] !== ring[4][0] || ring[0][1] !== ring[4][1]) return null
  const corners = ring.slice(0, 4), latitude = corners.reduce((sum, point) => sum + point[1], 0) / 4
  const scale = 111320 * Math.cos(latitude * Math.PI / 180)
  const local = corners.map(point => [(point[0] - corners[0][0]) * scale, (point[1] - corners[0][1]) * 111320])
  const turns = local.map((a, i) => {
    const b = local[(i + 1) % 4], c = local[(i + 2) % 4]
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
  })
  if (!turns.every(turn => turn > .001) && !turns.every(turn => turn < -.001)) return null
  const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
  const columns = Math.min(4, Math.max(2, Math.ceil(distance(local[0], local[1]) / 4)))
  const rows = Math.min(4, Math.max(2, Math.ceil(distance(local[0], local[3]) / 4)))
  const point = (u, v) => [0, 1].map(axis =>
    corners[0][axis] * (1 - u) * (1 - v) + corners[1][axis] * u * (1 - v) +
    corners[2][axis] * u * v + corners[3][axis] * (1 - u) * v)
  return collection(Array.from({ length: columns * rows }, (_, id) => {
    const column = id % columns, row = Math.floor(id / columns)
    const u0 = (column + (column ? .015 : 0)) / columns
    const u1 = (column + 1 - (column < columns - 1 ? .015 : 0)) / columns
    const v0 = (row + (row ? .015 : 0)) / rows
    const v1 = (row + 1 - (row < rows - 1 ? .015 : 0)) / rows
    const coordinates = [point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)]
    return { type: 'Feature', id, properties: {}, geometry: { type: 'Polygon', coordinates: [[...coordinates, coordinates[0]]] } }
  }))
}

/** One tiny source; bounded block placements change feature state, never geometry. */
export function playConstructionEffect(map, event, onDone) {
  const motion = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')
  const cells = constructionCells(event?.geometry), height = Number(event?.height)
  if (motion?.matches || !cells || !Number.isFinite(height) || height <= 0 || event?.id == null || event?.pin == null) {
    onDone?.()
    return
  }
  const sourceId = `construction-effect-${++sequence}`, layers = [], filters = [], visibility = [], timers = new Set()
  const bands = height > 10 ? 4 : 3, step = height / bands
  const cellIds = cells.features.map(feature => feature.id), blockCount = cellIds.length * bands
  const interval = Math.max(8, 420 / (blockCount - 1))
  const container = map.getContainer()
  let disposed = false, removed = false, uploaded = false, waitingForRender = false
  const later = (callback, delay) => timers.add(setTimeout(() => { if (!disposed) callback() }, delay))
  const cleanup = () => {
    if (disposed) return
    disposed = true
    for (const timer of timers) clearTimeout(timer)
    motion?.removeEventListener('change', cleanup)
    map.off('remove', onRemove)
    map.off('sourcedata', onSourceData)
    map.off('error', onError)
    map.off('render', begin)
    delete container.dataset.constructionPhase
    delete container.dataset.constructionCells
    if (!removed) {
      // A style reset may already have removed our layers; never retain a hidden building.
      for (const [id, filter] of filters) if (map.getLayer(id)) map.setFilter(id, filter ?? null)
      for (const [id, value] of visibility) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', value ?? null)
      for (const id of layers.reverse()) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
    onDone?.()
  }
  const onRemove = () => { removed = true; cleanup() }
  const onError = error => { if (error.sourceId === sourceId) cleanup() }
  const begin = () => {
    map.off('render', begin)
    if (disposed) return
    container.dataset.constructionPhase = 'building'
    layers.forEach((id, band) => {
      // Sweep back across the next level, so each block rests on a completed level.
      const order = band % 2 ? [...cellIds].reverse() : cellIds
      order.forEach((cellId, index) => later(() => {
        if (!map.getLayer(id)) { cleanup(); return }
        if (!index) map.setPaintProperty(id, 'fill-extrusion-opacity', .96)
        map.setFeatureState({ source: sourceId, id: cellId }, { builtLevels: band + 1 })
      }, (band * cellIds.length + index) * interval))
    })
    later(cleanup, (blockCount - 1) * interval + 60)
  }
  const ready = () => {
    if (disposed || !uploaded || waitingForRender || !map.getSource(sourceId) || !map.isSourceLoaded(sourceId) ||
      (map.getSource('placed-buildings') && !map.isSourceLoaded('placed-buildings'))) return
    waitingForRender = true
    map.on('render', begin)
    map.triggerRepaint()
  }
  const onSourceData = data => { if (data.sourceId === sourceId || data.sourceId === 'placed-buildings') ready() }
  motion?.addEventListener('change', cleanup)
  map.on('remove', onRemove)
  map.on('sourcedata', onSourceData)
  map.on('error', onError)
  container.dataset.constructionPhase = 'loading'
  container.dataset.constructionCells = String(cells.features.length)
  // Slow/offscreen source preparation must never leave a permanent building hidden.
  later(cleanup, 1500)
  try {
    const exclude = ['any', ['!=', ['to-string', ['get', 'id']], String(event.id)], ['!=', ['to-string', ['get', 'pin']], String(event.pin)]]
    for (const id of ['placed-buildings-fill', 'placed-buildings-outline']) if (map.getLayer(id)) {
      const filter = map.getFilter(id)
      filters.push([id, filter])
      map.setFilter(id, filter ? ['all', filter, exclude] : exclude)
    }
    for (const id of ['building-fill', 'building-outline']) if (map.getLayer(id)) {
      visibility.push([id, map.getLayoutProperty(id, 'visibility')])
      map.setLayoutProperty(id, 'visibility', 'none')
    }
    map.addSource(sourceId, { type: 'geojson', data: collection([]), maxzoom: 22, tolerance: 0 })
    const minzoom = map.getLayer('placed-buildings-fill')?.minzoom ?? 0
    for (let band = 0; band < bands; band++) {
      const id = `${sourceId}-${band}`, base = step * band + (band ? Math.min(.08, step * .015) : 0)
      const built = ['>=', ['coalesce', ['feature-state', 'builtLevels'], 0], band + 1]
      map.addLayer({ id, type: 'fill-extrusion', source: sourceId, minzoom, paint: {
        'fill-extrusion-color': placedBuildingColor(event.typeId), 'fill-extrusion-opacity': 0,
        'fill-extrusion-opacity-transition': { duration: 0, delay: 0 },
        'fill-extrusion-base': ['case', built, base, 0],
        'fill-extrusion-height': ['case', built, step * (band + 1), 0],
        'fill-extrusion-height-transition': { duration: 0, delay: 0 },
      } })
      layers.push(id)
    }
    Promise.resolve(map.getSource(sourceId).setData(cells)).then(() => { uploaded = true; ready() }, cleanup)
  } catch {
    cleanup()
  }
  return cleanup
}
