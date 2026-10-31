import { localFrame, openRing, outerRing, pointInRing, polygons } from './localFrame.js'
import { PITTSBURGH_LATITUDE, daylight, seasonFor, shadowHull, sunPosition } from './sunShadows.js'
import { geometryBounds } from './plannerGeometry.js'

/** CEQR's analysis window: shadows from 1.5 h after sunrise to 1.5 h before sunset; earlier ones are long and fleeting. */
export const CEQR_MARGIN_H = 1.5
export const SHADE_STEP_H = .25
/** A neighbour counts as shaded at a moment when at least this share of its lot is inside the project's shadow. */
export const SHADE_COVERAGE = .1
const SAMPLE_TARGET = 60
const METRES = 111320

export function analysisWindow(latitude = PITTSBURGH_LATITUDE, declination = 0, margin = CEQR_MARGIN_H) {
  const { sunrise, sunset } = daylight(latitude, declination)
  return { start: sunrise + margin, end: sunset - margin }
}

export function studyTimes(window, step = SHADE_STEP_H) {
  const times = []
  for (let t = window.start + step / 2; t < window.end; t += step) times.push(t)
  return times
}

/** Longest shadow (m) any of these buildings casts inside the analysis window: the lowest sun is at its edges. */
export function maxShadowLength(buildings, { season = 'equinox', latitude = PITTSBURGH_LATITUDE, margin = CEQR_MARGIN_H } = {}) {
  const day = seasonFor(season), { start } = analysisWindow(latitude, day.declination, margin)
  const altitude = sunPosition(latitude, start, day.declination).altitude
  const height = Math.max(0, ...buildings.map(b => Number(b.height) || 0))
  return altitude > 1 ? height / Math.tan(altitude * Math.PI / 180) : 0
}

/** Lon/lat bounds that every project shadow stays inside, for a parcel index query. */
export function shadeBounds(buildings, options = {}) {
  const boxes = buildings.map(b => geometryBounds(b.geometry)).filter(Boolean)
  if (!boxes.length) return null
  const reach = maxShadowLength(buildings, options) + 2
  const south = Math.min(...boxes.map(b => b[1])), north = Math.max(...boxes.map(b => b[3]))
  const lat = reach / METRES, lon = reach / (METRES * Math.cos((south + north) / 2 * Math.PI / 180))
  return [Math.min(...boxes.map(b => b[0])) - lon, south - lat, Math.max(...boxes.map(b => b[2])) + lon, north + lat]
}

const ringBox = ring => [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))]
const overlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
const inBox = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]

/** Evenly spaced points inside a local ring (about `target` of them), used to measure the shaded share of a lot. */
export function samplePoints(ring, target = SAMPLE_TARGET) {
  const box = ringBox(ring), area = Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)) / 2
  const spacing = Math.max(.5, Math.sqrt(area / target)), points = []
  for (let x = box[0] + spacing / 2; x < box[2]; x += spacing) for (let y = box[1] + spacing / 2; y < box[3]; y += spacing) {
    if (pointInRing([x, y], ring)) points.push([x, y])
  }
  return points.length ? points : [ring.reduce((c, p) => [c[0] + p[0] / ring.length, c[1] + p[1] / ring.length], [0, 0])]
}

/**
 * Hours of shade the proposed buildings cast on each neighbouring parcel on one representative day.
 * Samples the sun every `step` hours inside the CEQR window; a parcel is shaded at a sample when at least
 * `coverage` of its lot falls in the project's shadow. Existing buildings' own shadows are not subtracted, so this
 * is the project's shadow footprint, not the net loss of sunlight.
 */
export function shadeStudy({ buildings, parcels, season = 'equinox', latitude = PITTSBURGH_LATITUDE, step = SHADE_STEP_H, coverage = SHADE_COVERAGE, margin = CEQR_MARGIN_H }) {
  const sources = (buildings || []).filter(b => polygons(b.geometry).length && Number(b.height) > 0)
  if (!sources.length) return null
  const day = seasonFor(season), window = analysisWindow(latitude, day.declination, margin), times = studyTimes(window, step)
  const frame = localFrame(polygons(sources[0].geometry)[0][0][0])
  const own = new Set(sources.map(b => b.pin).filter(Boolean))
  const footprints = sources.map(b => ({ points: polygons(b.geometry).flatMap(p => openRing(p[0] || [])).map(frame.project), height: Number(b.height) }))
  const shadows = times.map(t => {
    const sun = sunPosition(latitude, t, day.declination)
    return footprints.map(f => shadowHull(f.points, f.height, sun)).filter(Boolean).map(ring => ({ ring, box: ringBox(ring) }))
  })
  const all = shadows.flat()
  if (!all.length) return { season: day.id, window, step, coverage, samples: times.length, neighbours: [] }
  const reach = all.reduce((b, s) => [Math.min(b[0], s.box[0]), Math.min(b[1], s.box[1]), Math.max(b[2], s.box[2]), Math.max(b[3], s.box[3])], [Infinity, Infinity, -Infinity, -Infinity])
  const neighbours = []
  for (const parcel of parcels || []) {
    const pin = parcel.properties?.pin
    if (!pin || own.has(pin)) continue
    const ring = outerRing(frame, parcel.geometry)
    if (!ring || ring.length < 3) continue
    const box = ringBox(ring)
    if (!overlap(box, reach)) continue
    const points = samplePoints(ring)
    let hours = 0, peak = 0, first = null, last = null
    shadows.forEach((hulls, i) => {
      const near = hulls.filter(h => overlap(h.box, box))
      if (!near.length) return
      const shaded = points.filter(p => near.some(h => inBox(p, h.box) && pointInRing(p, h.ring))).length / points.length
      peak = Math.max(peak, shaded)
      if (shaded >= coverage) { hours += step; first ??= times[i] - step / 2; last = times[i] + step / 2 }
    })
    if (hours > 0) neighbours.push({ pin, address: parcel.properties.address || null, hours, peak, first, last })
  }
  neighbours.sort((a, b) => b.hours - a.hours || b.peak - a.peak)
  return { season: day.id, window, step, coverage, samples: times.length, neighbours }
}

/** Map features for shaded neighbours, carrying hours for the fill ramp and a short label. */
export function shadeFeatures(study, parcels) {
  if (!study?.neighbours.length) return []
  const byPin = new Map((parcels || []).map(p => [p.properties?.pin, p]))
  return study.neighbours.filter(n => byPin.has(n.pin)).map(n => ({
    type: 'Feature',
    properties: { pin: n.pin, hours: n.hours, label: `${formatHours(n.hours)}` },
    geometry: byPin.get(n.pin).geometry,
  }))
}

export function formatHours(hours) {
  const minutes = Math.round(hours * 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
}
