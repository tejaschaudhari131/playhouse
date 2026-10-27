import { fitMassing, geometryArea, geometryCenter } from './plannerGeometry.js'

const METRES = 111320
const round1 = value => Math.round(value * 10) / 10
const floorHalf = value => Math.floor(value * 2 + 1e-9) / 2

/** Smallest footprint the fit search will propose for each type (metres). Team assumptions, not code minimums. */
export const TYPE_MINIMUMS = {
  single_family: { width: 4.5, depth: 8 },
  townhouse_duplex: { width: 5, depth: 10 },
  triplex: { width: 5.5, depth: 12 },
  small_apartment: { width: 9, depth: 15 },
  large_apartment: { width: 15, depth: 20 },
}
const MAX_DEPTH_GROWTH = 2
const MAX_DEPTH = 40

function outerRings(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates[0]]
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map(polygon => polygon[0])
  return []
}

/** Minimum-area oriented rectangle around the largest outer ring. A map measurement, not legal frontage or lot width. */
export function lotDimensions(geometry) {
  const origin = geometryCenter(geometry)
  if (!origin) return null
  const scale = METRES * Math.cos(origin[1] * Math.PI / 180)
  const rings = outerRings(geometry).map(ring => ring.map(([lon, lat]) => [(lon - origin[0]) * scale, (lat - origin[1]) * METRES]))
  const ring = rings.sort((a, b) => b.length - a.length)[0]
  if (!ring || ring.length < 4) return null
  let best = null
  for (let i = 0; i < ring.length - 1; i++) {
    const dx = ring[i + 1][0] - ring[i][0], dy = ring[i + 1][1] - ring[i][1]
    if (Math.hypot(dx, dy) < .1) continue
    const angle = Math.atan2(dy, dx), c = Math.cos(angle), s = Math.sin(angle)
    const along = ring.map(([x, y]) => x * c + y * s), across = ring.map(([x, y]) => -x * s + y * c)
    const a = Math.max(...along) - Math.min(...along), b = Math.max(...across) - Math.min(...across)
    if (!best || a * b < best.area) best = { area: a * b, angle: a >= b ? angle : angle + Math.PI / 2, width: Math.min(a, b), depth: Math.max(a, b) }
  }
  if (!best) return null
  // Compass bearing of the long side, 0–180°.
  const bearing = ((90 - best.angle * 180 / Math.PI) % 180 + 180) % 180
  return { width: round1(best.width), depth: round1(best.depth), bearing: round1(bearing), areaM2: round1(geometryArea(geometry)) }
}

/** Plain-language reasons a draft's footprint does not fit the parcel outline. */
export function fitDiagnosis(option, geometry, massing) {
  if (!massing || massing.fits) return null
  const lot = lotDimensions(geometry)
  const narrow = Math.min(option.width, option.depth), long = Math.max(option.width, option.depth)
  const reasons = []
  if (option.placement) reasons.push({ id: 'manual', text: 'Your manual position crosses the parcel edge.' })
  if (lot && narrow >= lot.width) reasons.push({ id: 'width', text: `Footprint is ${round1(narrow)} m across; the lot is about ${lot.width} m wide.` })
  if (lot && long >= lot.depth) reasons.push({ id: 'depth', text: `Footprint is ${round1(long)} m long; the lot is about ${lot.depth} m deep.` })
  if (lot && option.width * option.depth >= lot.areaM2) reasons.push({ id: 'area', text: `Footprint covers ${Math.round(option.width * option.depth)} m²; the lot is about ${Math.round(lot.areaM2)} m².` })
  if (!reasons.length) reasons.push({ id: 'shape', text: 'The outline is irregular: no position aligned to a parcel edge fits this rectangle.' })
  return { lot, reasons }
}

function candidates(option, lot, maxFootprintM2) {
  const min = TYPE_MINIMUMS[option.typeId] || { width: 4, depth: 6 }
  const area = Math.min(option.width * option.depth, maxFootprintM2 ?? Infinity)
  const widest = Math.min(option.width, lot ? floorHalf(lot.width) : option.width)
  const list = []
  for (let width = widest; width + 1e-9 >= min.width; width = round1(width - .5)) {
    const deepest = Math.min(floorHalf(area / width), round1(option.depth * MAX_DEPTH_GROWTH), MAX_DEPTH, lot ? floorHalf(lot.depth) : Infinity)
    for (let depth = deepest; depth + 1e-9 >= min.depth; depth = round1(depth - .5)) list.push({ width: round1(width), depth: round1(depth) })
  }
  return list.sort((a, b) => b.width * b.depth - a.width * a.depth || b.width - a.width)
}

/**
 * Largest footprint at or above the type minimum that fits the outline at an edge-aligned
 * position, preferring one clear of retained buildings and obstacles. Keeps stories and height.
 * Returns null when nothing at the minimum fits.
 */
export function fitToLot({ option, geometry, obstacles = null, maxFootprintM2 = null }) {
  if (!geometry) return null
  const lot = lotDimensions(geometry)
  let occupied = null
  for (const size of candidates(option, lot, maxFootprintM2)) {
    const massing = fitMassing(geometry, size.width, size.depth, null, obstacles)
    if (!massing.fits) continue
    const result = { ...size, bearing: round1(massing.placement.bearing), collisions: massing.collisions, lot,
      changed: size.width !== option.width || size.depth !== option.depth || !!option.placement }
    if (!massing.collisions) return result
    occupied ||= result
  }
  return occupied
}

export function fitSummary(fit, option) {
  if (!fit) {
    const min = TYPE_MINIMUMS[option.typeId]
    return `No ${min ? `${min.width} × ${min.depth} m or larger ` : ''}footprint fits this outline at an edge-aligned position. Try a smaller housing type.`
  }
  return `${fit.width} × ${fit.depth} m (was ${option.width} × ${option.depth} m), aligned to a parcel edge at bearing ${fit.bearing}°${fit.collisions ? `; it still overlaps ${fit.collisions} existing ${fit.collisions === 1 ? 'building' : 'buildings'}` : ''}. Stories and height are unchanged.`
}
