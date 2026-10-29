import { cleanRing, insetRing, localFrame, outerRing, pointInRing, polygons, regularPolygon, ringDistance, signedArea, toPolygon } from './localFrame.js'
import { footprintBox, withFront, slab } from './architecture3d.js'

/** Display-only landscape. Heights in metres; none of it enters fit, zoning or scoring. */
export const YARD_TOP_M = 0.15
const TURF = '#a9c98f', CURB = '#6f8f62', PAVING = '#d9d4ca'
const TRUNK = '#6b4a2f', CANOPY = [['#5f8f4e', '#7aa65f'], ['#4f8045', '#6c9b57'], ['#678f45', '#86ad62']]

const feature = (geometry, base, top, color, part) => ({ type: 'Feature', properties: { base, top, color, part }, geometry })

/** Raised turf pad over the whole lot plus a thin darker curb on its outer edge. */
export function yardPad(parcelGeometry) {
  const parts = polygons(parcelGeometry)
  if (!parts.length) return []
  const pad = feature(parcelGeometry, 0, YARD_TOP_M, TURF, 'yard')
  const frame = localFrame(parts[0][0][0]), ring = outerRing(frame, parcelGeometry)
  if (!ring) return [pad]
  const outer = cleanRing(ring), inner = insetRing(outer, () => .3)
  if (!inner) return [pad]
  return [pad, feature(toPolygon(frame, outer, inner.reverse()), YARD_TOP_M, YARD_TOP_M + .12, CURB, 'curb')]
}

/** Paved walk from the building's guessed front edge straight out to the lot line, or null when none is reachable. */
export function frontWalk(buildingGeometry, parcelGeometry, width = 1.2, neighbors = []) {
  const box = withFront(footprintBox(buildingGeometry), parcelGeometry, neighbors)
  if (!box?.frontReach || box.frontReach > 40) return null
  return feature(toPolygon(box.frame, slab(box, -width / 2, width / 2, -box.frontReach, 0)), YARD_TOP_M - .02, YARD_TOP_M + .06, PAVING, 'walk')
}

/** One procedural tree: octagonal trunk and two layered canopies. */
export function treeParts(frame, point, seed = 0, scale = 1) {
  const [dark, light] = CANOPY[Math.abs(seed) % CANOPY.length], s = scale
  return [
    feature(toPolygon(frame, regularPolygon(point, .22 * s)), 0, 2.2 * s, TRUNK, 'trunk'),
    feature(toPolygon(frame, regularPolygon(point, 2.1 * s)), 2.2 * s, 5.5 * s, dark, 'canopy'),
    feature(toPolygon(frame, regularPolygon(point, 1.45 * s, 8, 0)), 3.5 * s, 6.8 * s, light, 'canopy'),
  ]
}

const jitter = (i, amount) => Math.sin(i * 12.9898) * 43758.5453 % 1 * amount

/** Staggered grid of trees inside a park polygon, kept 2.5 m from its edge. */
export function parkTreePoints(frame, geometry, spacing = 10, max = 36) {
  const points = []
  for (const polygon of polygons(geometry)) {
    const ring = polygon[0]?.map(frame.project)
    if (!ring || ring.length < 4) continue
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1])
    let row = 0
    for (let y = Math.min(...ys) + spacing / 2; y < Math.max(...ys); y += spacing * .87, row++) {
      for (let x = Math.min(...xs) + (row % 2 ? spacing / 2 : spacing / 4); x < Math.max(...xs); x += spacing) {
        const p = [x + jitter(points.length + 1, 1.5), y + jitter(points.length + 7, 1.5)]
        if (pointInRing(p, ring) && ringDistance(p, ring) >= 2.5 && !polygon.slice(1).some(h => pointInRing(p, h.map(frame.project)))) points.push(p)
        if (points.length >= max) return points
      }
    }
  }
  return points
}

/** Street trees alternating either side of a drawn path, every `spacing` metres. */
export function pathTreePoints(frame, coordinates, spacing = 14, offset = 4.5, max = 30) {
  const line = coordinates.map(frame.project), points = []
  let carry = spacing / 2, side = 1
  for (let i = 1; i < line.length && points.length < max; i++) {
    const [a, b] = [line[i - 1], line[i]], length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length < .1) continue
    const d = [(b[0] - a[0]) / length, (b[1] - a[1]) / length], n = [-d[1], d[0]]
    for (let t = carry; t < length && points.length < max; t += spacing, side = -side) points.push([a[0] + d[0] * t + n[0] * offset * side, a[1] + d[1] * t + n[1] * offset * side])
    carry = (carry - length) % spacing
    if (carry < 0) carry += spacing
  }
  return points
}

function distanceToFootprint(p, ring) {
  return pointInRing(p, ring) ? 0 : ringDistance(p, ring)
}

/**
 * A couple of yard trees on a lot: inside the parcel, 2 m from its line, 3.2 m clear of every footprint
 * and 6 m apart, chosen farthest-first from the buildings.
 */
export function yardTreePoints(frame, parcelGeometry, footprints = [], max = 3) {
  const ring = outerRing(frame, parcelGeometry)
  if (!ring) return []
  const blocks = footprints.flatMap(g => polygons(g).map(p => p[0].map(frame.project)))
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1])
  const step = Math.max(1.5, Math.sqrt(Math.abs(signedArea(ring)) / 500))
  const candidates = []
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
    const p = [x, y]
    if (!pointInRing(p, ring) || ringDistance(p, ring) < 2) continue
    const clear = blocks.reduce((n, b) => Math.min(n, distanceToFootprint(p, b)), Infinity)
    if (clear >= 3.2) candidates.push({ p, clear })
  }
  const chosen = []
  while (chosen.length < max) {
    let best = null
    for (const c of candidates) {
      const spacing = chosen.reduce((n, q) => Math.min(n, Math.hypot(c.p[0] - q[0], c.p[1] - q[1])), Infinity)
      if (spacing < 6) continue
      const score = Math.min(c.clear, spacing)
      if (!best || score > best.score) best = { p: c.p, score }
    }
    if (!best) break
    chosen.push(best.p)
  }
  return chosen
}

/** Trees for parks, drawn paths and lots with placed buildings, capped for rendering. */
export function streetscapeTrees({ parks = [], paths = [], lots = [], max = 160 }) {
  const features = []
  let seed = 0
  const plant = (frame, points, scale) => {
    for (const p of points) {
      if (features.length >= max * 3) return
      features.push(...treeParts(frame, p, seed++, scale))
    }
  }
  for (const park of parks) {
    const origin = polygons(park)[0]?.[0]?.[0]
    if (origin) { const frame = localFrame(origin); plant(frame, parkTreePoints(frame, park), 1) }
  }
  for (const path of paths) {
    if (path?.length < 2) continue
    const frame = localFrame(path[0]); plant(frame, pathTreePoints(frame, path), .9)
  }
  for (const lot of lots) {
    const origin = polygons(lot.parcel)[0]?.[0]?.[0]
    if (origin) { const frame = localFrame(origin); plant(frame, yardTreePoints(frame, lot.parcel, lot.footprints), .85) }
  }
  return features
}
