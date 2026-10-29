/** Local east/north metres around an origin, for display geometry a few hundred metres across. */
const METRES = 111320

export function localFrame(origin) {
  const scale = METRES * Math.cos(origin[1] * Math.PI / 180)
  return {
    origin,
    project: ([lon, lat]) => [(lon - origin[0]) * scale, (lat - origin[1]) * METRES],
    unproject: ([x, y]) => [origin[0] + x / scale, origin[1] + y / METRES],
  }
}

export function polygons(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates]
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates
  return []
}

/** Open local ring (no repeated closing point) to a closed GeoJSON polygon; extra rings are holes. */
export function toPolygon(frame, ...rings) {
  return { type: 'Polygon', coordinates: rings.map(ring => { const r = ring.map(frame.unproject); return [...r, r[0]] }) }
}

export function openRing(ring) {
  const last = ring.length - 1
  return ring.length > 1 && ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1] ? ring.slice(0, -1) : ring.slice()
}

export function signedArea(ring) {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return sum / 2
}

export function pointInRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

export function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

export function ringDistance(p, ring) {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) best = Math.min(best, segmentDistance(p, ring[i], ring[(i + 1) % ring.length]))
  return best
}

/** Distance along a ray from `p` in unit direction `d` to the first crossing of an open ring, or null. */
export function rayToRing(p, d, ring) {
  let best = null
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const ex = b[0] - a[0], ey = b[1] - a[1], denom = d[0] * ey - d[1] * ex
    if (Math.abs(denom) < 1e-12) continue
    const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / denom
    const s = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / denom
    if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && (best === null || t < best)) best = t
  }
  return best
}

/** Largest outer ring of a parcel, projected and opened, or null. */
export function outerRing(frame, geometry) {
  const rings = polygons(geometry).map(p => p[0]).filter(r => r?.length >= 4).map(r => openRing(r.map(frame.project)))
  return rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0] || null
}

function segmentsCross(a, b, c, d) {
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
}

/** Drop repeated, very short and collinear vertices from an open ring, returning it counter-clockwise. */
export function cleanRing(ring, minEdge = .2) {
  let points = ring.slice()
  for (let changed = true; changed && points.length > 3;) {
    changed = false
    for (let i = 0; i < points.length && points.length > 3; i++) {
      const a = points[(i - 1 + points.length) % points.length], p = points[i], b = points[(i + 1) % points.length]
      const short = Math.hypot(p[0] - a[0], p[1] - a[1]) < minEdge
      const turn = ((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) / Math.max(1e-9, Math.hypot(p[0] - a[0], p[1] - a[1]) * Math.hypot(b[0] - p[0], b[1] - p[1]))
      if (short || Math.abs(turn) < .02) { points.splice(i, 1); changed = true; i-- }
    }
  }
  return signedArea(points) < 0 ? points.reverse() : points
}

/**
 * Inset an open ring, each edge by its own distance `distanceFor(edgeIndex, a, b)` metres (mitred corners). Returns the
 * counter-clockwise inset ring, or null when the inset would collapse or self-intersect.
 */
export function insetRing(ring, distanceFor) {
  const points = cleanRing(ring)
  if (points.length < 3) return null
  const n = points.length
  const edges = points.map((a, i) => {
    const b = points[(i + 1) % n], length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const dir = [(b[0] - a[0]) / length, (b[1] - a[1]) / length], normal = [-dir[1], dir[0]], d = distanceFor(i, a, b)
    return { a, b, dir, d, start: [a[0] + normal[0] * d, a[1] + normal[1] * d] }
  })
  const result = edges.map((edge, i) => {
    const prev = edges[(i - 1 + n) % n], denom = prev.dir[0] * edge.dir[1] - prev.dir[1] * edge.dir[0]
    if (Math.abs(denom) < 1e-9) return edge.start
    const t = ((edge.start[0] - prev.start[0]) * edge.dir[1] - (edge.start[1] - prev.start[1]) * edge.dir[0]) / denom
    return [prev.start[0] + prev.dir[0] * t, prev.start[1] + prev.dir[1] * t]
  })
  if (signedArea(result) <= .5) return null
  for (const p of result) {
    if (!pointInRing(p, points)) return null
    if (edges.some(e => segmentDistance(p, e.a, e.b) < e.d - 1e-6)) return null
  }
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue
    if (segmentsCross(result[i], result[(i + 1) % n], result[j], result[(j + 1) % n])) return null
  }
  return result
}

export function regularPolygon([x, y], radius, sides = 8, phase = Math.PI / 8) {
  return Array.from({ length: sides }, (_, i) => [x + radius * Math.cos(phase + i * 2 * Math.PI / sides), y + radius * Math.sin(phase + i * 2 * Math.PI / sides)])
}

/** Colour helpers for derived material tones. */
const channels = hex => hex.replace('#', '').match(/.{2}/g).map(c => parseInt(c, 16))
export function mixColor(a, b, t) {
  const x = channels(a), y = channels(b)
  return '#' + x.map((c, i) => Math.round(c * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join('')
}
