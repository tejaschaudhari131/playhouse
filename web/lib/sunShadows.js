import { localFrame, polygons, toPolygon } from './localFrame.js'

/** Equinox sun at 9:00, 12:00 and 15:00 local solar time. Representative angles, not a dated shadow study. */
export const SUN_TIMES = [
  { id: 'morning', label: 'Morning', hour: 9 },
  { id: 'noon', label: 'Noon', hour: 12 },
  { id: 'afternoon', label: 'Afternoon', hour: 15 },
]
export const PITTSBURGH_LATITUDE = 40.44
const rad = Math.PI / 180

/** Solar altitude and compass azimuth (degrees clockwise from north) for a latitude, solar hour and declination. */
export function sunPosition(latitude = PITTSBURGH_LATITUDE, hour = 12, declination = 0) {
  const phi = latitude * rad, delta = declination * rad, h = (hour - 12) * 15 * rad
  const altitude = Math.asin(Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(h))
  const azimuth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)) / rad + 180
  return { altitude: altitude / rad, azimuth: (azimuth + 360) % 360 }
}

export function sunFor(id, latitude = PITTSBURGH_LATITUDE) {
  const time = SUN_TIMES.find(t => t.id === id) || SUN_TIMES[1]
  return { ...time, ...sunPosition(latitude, time.hour) }
}

/** Ground offset (east, north metres) of a roof corner's shadow; it falls away from the sun. */
export function shadowVector(height, sun) {
  if (!(height > 0) || !(sun?.altitude > 1)) return [0, 0]
  const length = height / Math.tan(sun.altitude * rad), a = sun.azimuth * rad
  return [-Math.sin(a) * length, -Math.cos(a) * length]
}

export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3) return sorted
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = list => list.reduce((hull, p) => {
    while (hull.length >= 2 && cross(hull.at(-2), hull.at(-1), p) <= 0) hull.pop()
    hull.push(p); return hull
  }, [])
  const lower = half(sorted), upper = half([...sorted].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * Ground shadow of an extruded footprint: the convex outline of the footprint and its roof outline cast
 * along the sun vector. Exact for convex footprints; slightly generous for L-shapes and courtyards.
 */
export function shadowPolygon(geometry, height, sun) {
  const rings = polygons(geometry).map(p => p[0]).filter(r => r?.length >= 4)
  if (!rings.length) return null
  const [dx, dy] = shadowVector(height, sun)
  if (!dx && !dy) return null
  const frame = localFrame(rings[0][0])
  const points = rings.flat().map(frame.project)
  const hull = convexHull([...points, ...points.map(([x, y]) => [x + dx, y + dy])])
  return hull.length >= 3 ? toPolygon(frame, hull) : null
}

/** Shadow features for buildings `{ geometry, height, kind }`; `kind` lets proposed shadows read darker. */
export function buildingShadows(buildings, sun) {
  const features = []
  for (const b of buildings) {
    const geometry = shadowPolygon(b.geometry, b.height, sun)
    if (geometry) features.push({ type: 'Feature', properties: { kind: b.kind || 'existing' }, geometry })
  }
  return features
}

/** MapLibre light from the same sun, so lit and shaded walls agree with the ground shadows. */
export function sunLight(sun) {
  return { anchor: 'map', position: [1.5, sun.azimuth, Math.min(80, Math.max(25, 90 - sun.altitude))], color: '#fff4e2', intensity: .42 }
}
