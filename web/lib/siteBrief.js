import { geometryCenter } from './plannerGeometry.js'
import { lotDimensions } from './lotFit.js'
import { REFORM_PRESETS, simulateReform } from './policyReform.js'

const METRES = 111320
const FT = 3.28084
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d
const rings = geometry => geometry?.type === 'Polygon' ? geometry.coordinates : geometry?.type === 'MultiPolygon' ? geometry.coordinates.flat() : []
const NICE = [2, 5, 10, 20, 25, 50, 100, 200]

/**
 * Plan-view SVG geometry in local metres (east right, north up): parcel boundary, the draft footprint with its
 * width and depth edges labelled, retained and demolished outlines, a north arrow and a scale bar. Map outlines, not a survey.
 */
export function siteDiagram({ parcel, footprint = null, retained = [], demolished = [], bearing = null, size = 300, pad = 30 } = {}) {
  const origin = geometryCenter(parcel)
  if (!origin) return null
  const scaleX = METRES * Math.cos(origin[1] * Math.PI / 180)
  const local = ([lon, lat]) => [(lon - origin[0]) * scaleX, (lat - origin[1]) * METRES]
  const parcelRings = rings(parcel).map(r => r.map(local)), footRings = rings(footprint).map(r => r.map(local))
  const points = [...parcelRings, ...footRings].flat()
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const extent = Math.max(maxX - minX, maxY - minY, 1)
  const k = (size - 2 * pad) / extent
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const svg = ([x, y]) => [round(size / 2 + (x - cx) * k), round(size / 2 - (y - cy) * k)]
  const path = rs => rs.map(r => `M${r.map(p => svg(p).join(' ')).join('L')}Z`).join('')
  const bbox = [minX - extent, minY - extent, maxX + extent, maxY + extent]
  const near = g => rings(g.geometry || g).map(r => r.map(local)).filter(r => r.some(([x, y]) => x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3]))
  const labels = []
  let foot = null
  const ring = footRings[0]
  if (ring && ring.length >= 4) {
    const edge = (a, b) => {
      const [p, q] = [ring[a], ring[b]], length = Math.hypot(q[0] - p[0], q[1] - p[1])
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], c = [ring.slice(0, 4).reduce((n, r) => n + r[0], 0) / 4, ring.slice(0, 4).reduce((n, r) => n + r[1], 0) / 4]
      const out = Math.hypot(mid[0] - c[0], mid[1] - c[1]) || 1, offset = 11 / k
      const at = svg([mid[0] + (mid[0] - c[0]) / out * offset, mid[1] + (mid[1] - c[1]) / out * offset])
      let angle = -Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI
      if (angle > 90) angle -= 180
      if (angle < -90) angle += 180
      return { x: at[0], y: at[1], angle: round(angle), metres: round(length), text: `${round(length)} m (${Math.round(length * FT)} ft)` }
    }
    const w = edge(0, 1), d = edge(1, 2)
    labels.push({ ...w, kind: 'width' }, { ...d, kind: 'depth' })
    foot = { width: w.metres, depth: d.metres, bearing: Number.isFinite(bearing) ? round(bearing) : null }
  }
  const metres = NICE.find(n => n * k >= size * .18) || NICE.at(-1)
  return {
    size, viewBox: `0 0 ${size} ${size}`,
    parcel: path(parcelRings), footprint: footRings.length ? path(footRings) : null,
    retained: retained.map(near).filter(r => r.length).map(path), demolished: demolished.map(near).filter(r => r.length).map(path),
    labels, footprintDims: foot, lot: lotDimensions(parcel),
    north: { x: size - 18, y: 26 }, scale: { x: 12, y: size - 12, length: round(metres * k), label: `${metres} m` },
    metresPerPixel: round(1 / k, 4),
  }
}

const show = (n, id) => {
  if (!Number.isFinite(n)) return '—'
  const unit = { height: ' ft', lot: ' sq ft', coverage: '%', far: '' }[id] ?? ''
  return `${round(n, 2).toLocaleString()}${unit}`
}

/** Title Nine checks with each reform preset's effect on every conflict. */
export function standardsTable(option, code) {
  const checks = option?.titleNine?.checks || []
  const presets = REFORM_PRESETS.filter(p => p.id !== 'current')
  const sims = Object.fromEntries(presets.map(p => [p.id, simulateReform(option, p.id, code)]))
  const rows = checks.filter(c => c.status !== 'not_applicable').map(c => ({
    id: c.id, label: c.label, section: c.section, url: c.url, status: c.status,
    required: Number.isFinite(c.limit) ? `${c.mode === 'max' ? '≤' : '≥'} ${show(c.limit, c.id)}` : null,
    proposed: Number.isFinite(c.actual) ? show(c.actual, c.id) : null,
    detail: c.detail,
    reform: Object.fromEntries(presets.map(p => [p.id, c.status !== 'conflict' ? null : sims[p.id].lifted.some(l => l.check.id === c.id) ? 'Lifted' : 'Applies'])),
  }))
  const listed = r => r.status === 'conflict' || r.status === 'conditional' || r.id === 'use' || r.required !== null
  return { presets: presets.map(p => ({ id: p.id, label: p.label, status: p.status, eligible: sims[p.id].eligible })), rows,
    shown: rows.filter(listed), alsoPass: rows.filter(r => !listed(r) && r.status === 'pass').map(r => r.label), notAssessed: rows.filter(r => !listed(r) && r.status !== 'pass').map(r => r.label) }
}
