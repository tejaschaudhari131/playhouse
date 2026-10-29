import { cleanRing, insetRing, openRing, polygons, signedArea, mixColor } from './localFrame.js'
import { convexHull } from './sunShadows.js'
import { footprintKey } from './redevelopment.js'
import { USE_BY_ID, placedBuildingColor } from './buildingUses.js'

/**
 * Real-world building geometry for the Three.js map layer. Pure JavaScript with no WebGL or three.js import, so
 * it is unit-testable and cheap to share. Coordinates are metres east (x), north (y) and up (z) from an anchor;
 * the layer places each anchor in one scene with Web Mercator, exactly as MapLibre does.
 *
 * Proposed buildings keep the 2D honesty rule: every part stays inside the checked footprint and at or below
 * the modelled height. Recorded neighbours stay at or below their recorded `height_m`.
 */

const EARTH_RADIUS_M = 6371008.8, RAD = Math.PI / 180

/** MapLibre `MercatorCoordinate.fromLngLat` x/y (0..1 across the world). */
export function mercator([lng, lat]) {
  return [(180 + lng) / 360, (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))) / 360]
}
/** MapLibre `meterInMercatorCoordinateUnits()` at a latitude. */
export const meterInMercator = lat => 1 / (2 * Math.PI * EARTH_RADIUS_M) / Math.cos(lat * RAD)
/** Metres east/north of `origin` for lng/lat points, at the Web Mercator scale of the origin. */
export function metresProjector(origin) {
  const [ox, oy] = mercator(origin), s = meterInMercator(origin[1])
  return point => { const [x, y] = mercator(point); return [(x - ox) / s, -(y - oy) / s] }
}

/**
 * UV mapping per material: `planar` metres divided by `tile` (metres per texture repeat), `fit` 0..1 across a
 * face, `strip` metres along and 0..1 up, `bay` one window bay by one storey per repeat (set by `walls`).
 * `group` names a per-building vertex tint: siding colour, planned/zoning-state roof and trim, door paint.
 */
export const MATERIAL_SPECS = {
  siding: { tile: [2.4, 1.8], group: 'wall' },
  brick: { tile: [1.6, .8] },
  brickBuff: { tile: [1.6, .8] },
  stone: { tile: [1.8, 1.2] },
  rustic: { tile: [2.4, 1.2] },
  limestone: { tile: [1.5, 1.5] },
  concrete: { tile: [3, 3] },
  panel: { tile: [2.4, 3] },
  shingle: { tile: [2, 1], group: 'roof' },
  ridgeCap: { tile: [1, 1], group: 'roof' },
  roofFlat: { tile: [4, 4], group: 'roof' },
  metalRoof: { tile: [1.2, 2] },
  trim: { tile: [1, 1], group: 'trim' },
  wood: { tile: [1.2, 1.2] },
  metal: { tile: [1, 1] },
  bronze: { tile: [1, 1] },
  awning: { tile: [1.2, 1], group: 'awning' },
  lamp: { tile: [1, 1] },
  rim: { tile: [1, 1], group: 'rim' },
  glass: { uv: 'fit' },
  glassWarm: { uv: 'fit' },
  storefront: { uv: 'fit' },
  door: { uv: 'fit', group: 'door' },
  solar: { uv: 'fit' },
  vent: { uv: 'fit' },
  shutter: { uv: 'fit', group: 'shutter' },
  balusterWood: { uv: 'strip', tile: [.16, 1], group: 'trim' },
  balusterMetal: { uv: 'strip', tile: [.14, 1] },
  nbBrick: { uv: 'bay' },
  nbSiding: { uv: 'bay', group: 'wall' },
  nbCommercial: { uv: 'bay' },
  nbStorefront: { uv: 'bay' },
  nbOffice: { uv: 'bay' },
  nbApartment: { uv: 'bay' },
  aptFacade: { uv: 'bay' },
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0)]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + (a[2] ?? 0) * (b[2] ?? 0)
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const length = a => Math.hypot(a[0], a[1], a[2] ?? 0)
const unit = a => { const l = length(a) || 1; return a.map(c => c / l) }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] }
const WHITE = [1, 1, 1]

/** Stable 32-bit seed for display variation (siding colour, roof form); never an input to any score. */
export function seedOf(text) {
  let h = 2166136261
  for (const c of String(text)) h = Math.imul(h ^ c.codePointAt(0), 16777619)
  return h >>> 0
}
const pick = (list, seed) => list[seed % list.length]

function newell(points) {
  const n = [0, 0, 0]
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1])
  }
  return n
}

/** Tangent (along a wall or eave, to a viewer's right) and bitangent (up the face) for a face normal. */
function uvAxes(n) {
  if (Math.abs(n[2]) > .9) return [[1, 0, 0], n[2] > 0 ? [0, 1, 0] : [0, -1, 0]]
  const t = unit([-n[1], n[0], 0])
  return [t, cross(n, t)]
}

function faceUVs(points, n, spec) {
  const [t, b] = uvAxes(n), raw = points.map(p => [dot(p, t), dot(p, b)])
  const mode = spec.uv || 'planar'
  if (mode === 'fit' || mode === 'strip') {
    const us = raw.map(r => r[0]), vs = raw.map(r => r[1])
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs)
    return raw.map(([u, v]) => [mode === 'fit' ? (u - u0) / ((u1 - u0) || 1) : (u - u0) / spec.tile[0], (v - v0) / ((v1 - v0) || 1)])
  }
  const [tw, th] = spec.tile || [3, 3]
  return raw.map(([u, v]) => [u / tw, v / th])
}

const inTriangle = (p, a, b, c) => {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1])
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1])
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1])
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

/** Ear-clipping triangulation of a simple counter-clockwise ring; returns index triples. */
export function triangulate(ring) {
  const index = ring.map((_, i) => i), triangles = []
  const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  while (index.length > 3) {
    let clipped = false
    for (let i = 0; i < index.length; i++) {
      const ia = index[(i + index.length - 1) % index.length], ib = index[i], ic = index[(i + 1) % index.length]
      const a = ring[ia], b = ring[ib], c = ring[ic]
      if (turn(a, b, c) <= 1e-10) continue
      if (index.some(j => j !== ia && j !== ib && j !== ic && inTriangle(ring[j], a, b, c))) continue
      triangles.push([ia, ib, ic]); index.splice(i, 1); clipped = true
      break
    }
    if (!clipped) break
  }
  for (let i = 1; i < index.length - 1; i++) triangles.push([index[0], index[i], index[i + 1]])
  return triangles
}

/**
 * Accumulates non-indexed triangles per material in a local building frame (x across, y toward the front, z up),
 * written out in anchor metres. Faces are flipped to face their outward `hint`, so winding is never guessed.
 */
export class PartBuilder {
  constructor() { this.buffers = new Map(); this.tints = {}; this.frame([0, 0], [1, 0]) }
  frame(origin, xAxis) {
    const l = Math.hypot(xAxis[0], xAxis[1]) || 1
    this.o = origin; this.X = [xAxis[0] / l, xAxis[1] / l]; this.Y = [-this.X[1], this.X[0]]
    return this
  }
  tint(group, hex) { if (hex) this.tints[group] = rgb(hex); else delete this.tints[group]; return this }
  world(p) { return [this.o[0] + this.X[0] * p[0] + this.Y[0] * p[1], this.o[1] + this.X[1] * p[0] + this.Y[1] * p[1], p[2]] }
  face(key, input, hint, inputUVs) {
    const spec = MATERIAL_SPECS[key]
    if (!spec) throw new Error(`Unknown building material: ${key}`)
    let points = [], uvs = inputUVs ? [] : null
    input.forEach((p, i) => {
      const last = points[points.length - 1]
      if (last && Math.abs(last[0] - p[0]) + Math.abs(last[1] - p[1]) + Math.abs(last[2] - p[2]) < 1e-7) return
      points.push(p); uvs?.push(inputUVs[i])
    })
    if (points.length > 3 && length(sub(points[0], points[points.length - 1])) < 1e-7) { points.pop(); uvs?.pop() }
    if (points.length < 3) return
    let n = newell(points)
    const l = length(n)
    if (l < 1e-9) return
    n = n.map(c => c / l)
    if (hint && dot(n, hint) < 0) { points = points.reverse(); uvs = uvs?.reverse(); n = n.map(c => -c) }
    uvs ??= faceUVs(points, n, spec)
    let buffer = this.buffers.get(key)
    if (!buffer) this.buffers.set(key, buffer = { position: [], normal: [], uv: [], color: [] })
    const color = this.tints[spec.group] || WHITE
    const normal = [this.X[0] * n[0] + this.Y[0] * n[1], this.X[1] * n[0] + this.Y[1] * n[1], n[2]]
    const world = points.map(p => this.world(p))
    for (let i = 1; i < points.length - 1; i++) for (const j of [0, i, i + 1]) {
      buffer.position.push(world[j][0], world[j][1], world[j][2])
      buffer.normal.push(normal[0], normal[1], normal[2])
      buffer.uv.push(uvs[j][0], uvs[j][1])
      buffer.color.push(color[0], color[1], color[2])
    }
  }
  /** Six-sided solid: corners 0-3 are the bottom ring, 4-7 the matching top ring. `keys` is a material or { top, bottom, side }. */
  hexa(keys, c) {
    const centre = [0, 1, 2].map(axis => c.reduce((sum, p) => sum + p[axis], 0) / 8)
    for (const [role, index] of [['bottom', [0, 3, 2, 1]], ['top', [4, 5, 6, 7]], ['side', [0, 1, 5, 4]], ['side', [1, 2, 6, 5]], ['side', [2, 3, 7, 6]], ['side', [3, 0, 4, 7]]]) {
      const key = typeof keys === 'string' ? keys : role in keys ? keys[role] : keys.side
      if (!key) continue
      const points = index.map(i => c[i])
      const mid = [0, 1, 2].map(axis => points.reduce((sum, p) => sum + p[axis], 0) / 4)
      this.face(key, points, sub(mid, centre))
    }
  }
  box(keys, x0, x1, y0, y1, z0, z1) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return
    this.hexa(keys, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])
  }
  /** Square-section member from a to b: rails, ridge caps, rods, hip boards. */
  beam(key, a, b, width, height) {
    const d = unit(sub(b, a))
    let side = cross(d, [0, 0, 1])
    side = length(side) < 1e-6 ? [1, 0, 0] : unit(side)
    const up = cross(side, d)
    const at = (p, s, u) => [0, 1, 2].map(i => p[i] + side[i] * s * width / 2 + up[i] * u * height / 2)
    this.hexa(key, [at(a, -1, -1), at(a, 1, -1), at(b, 1, -1), at(b, -1, -1), at(a, -1, 1), at(a, 1, 1), at(b, 1, 1), at(b, -1, 1)])
  }
  /** Vertical walls around a counter-clockwise ring (clockwise faces inward). `bay`: [bayWidth, storeyHeight, base]. */
  walls(key, ring, z0, z1, { bay, plain, minBay = 1.4 } = {}) {
    if (!(z1 - z0 > 1e-3)) return
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (l < 1e-3) continue
      const n = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l, 0]
      const points = [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]
      if (!bay) { this.face(key, points, n); continue }
      if (l < minBay && plain) { this.face(plain, points, n); continue }
      const [bayWidth, storey, base = z0] = bay, bays = Math.max(1, Math.round(l / bayWidth))
      const v0 = (z0 - base) / storey, v1 = (z1 - base) / storey
      this.face(key, points, n, [[0, v0], [bays, v0], [bays, v1], [0, v1]])
    }
  }
  /** Horizontal cap over a simple ring, facing up (or down for soffits). */
  cap(key, ring, z, down = false) {
    const ccw = signedArea(ring) < 0 ? ring.slice().reverse() : ring
    for (const [i, j, k] of triangulate(ccw)) this.face(key, [[...ccw[i], z], [...ccw[j], z], [...ccw[k], z]], [0, 0, down ? -1 : 1])
  }
  geometries() {
    const out = new Map()
    for (const [key, b] of this.buffers) out.set(key, { position: Float32Array.from(b.position), normal: Float32Array.from(b.normal), uv: Float32Array.from(b.uv), color: Float32Array.from(b.color) })
    return out
  }
}

/** Triangle count of built geometries. */
export const triangleCount = geometries => [...geometries.values()].reduce((n, g) => n + g.position.length / 9, 0)

/* ---------- Facade elements, all in the local building frame ---------- */

/** Wall from a to b of a counter-clockwise outline: `t` runs to a viewer's right, `n` faces out. */
function segmentWall(a, b) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]), t = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
  return { p: a, t, n: [t[1], -t[0]], length: l }
}
function rectWalls(x0, x1, y0, y1) {
  return {
    back: segmentWall([x0, y0], [x1, y0]), right: segmentWall([x1, y0], [x1, y1]),
    front: segmentWall([x1, y1], [x0, y1]), left: segmentWall([x0, y1], [x0, y0]),
  }
}
const rectRing = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const wallPoint = (w, s, z, d = 0) => [w.p[0] + w.t[0] * s + w.n[0] * d, w.p[1] + w.t[1] * s + w.n[1] * d, z]
const wallHint = w => [w.n[0], w.n[1], 0]
function wallQuad(b, key, w, s0, s1, z0, z1, d = 0, uvs) {
  b.face(key, [wallPoint(w, s0, z0, d), wallPoint(w, s1, z0, d), wallPoint(w, s1, z1, d), wallPoint(w, s0, z1, d)], wallHint(w), uvs)
}
function wallBox(b, keys, w, s0, s1, z0, z1, d0, d1) {
  if (s1 - s0 < 1e-4 || z1 - z0 < 1e-4) return
  b.hexa(keys, [wallPoint(w, s0, z0, d0), wallPoint(w, s1, z0, d0), wallPoint(w, s1, z0, d1), wallPoint(w, s0, z0, d1),
    wallPoint(w, s0, z1, d0), wallPoint(w, s1, z1, d0), wallPoint(w, s1, z1, d1), wallPoint(w, s0, z1, d1)])
}
const offsetWall = (w, d) => ({ ...w, p: [w.p[0] + w.n[0] * d, w.p[1] + w.n[1] * d] })
const wallX = (w, s) => [w.p[0] + w.t[0] * s, w.p[1] + w.t[1] * s]

/** Framed multi-pane window: glass, casing, sill, head or stone lintel, optional shutters and mullion. */
function windowUnit(b, w, s, z0, width, height, o = {}) {
  const frame = o.frame || 'trim', fw = o.frameWidth ?? .09, depth = o.depth ?? .08
  const x0 = s - width / 2, x1 = s + width / 2, z1 = z0 + height
  wallQuad(b, o.glass || 'glass', w, x0, x1, z0, z1, .03)
  wallBox(b, frame, w, x0 - fw, x0, z0, z1, 0, depth)
  wallBox(b, frame, w, x1, x1 + fw, z0, z1, 0, depth)
  if (o.lintel) wallBox(b, o.lintel, w, x0 - fw - .08, x1 + fw + .08, z1, z1 + .2, 0, depth + .02)
  else wallBox(b, frame, w, x0 - fw - .03, x1 + fw + .03, z1, z1 + fw + .02, 0, depth + .02)
  wallBox(b, o.sill || frame, w, x0 - fw - .05, x1 + fw + .05, z0 - .07, z0, 0, depth + .06)
  if (o.mullion) wallBox(b, frame, w, s - .03, s + .03, z0, z1, 0, depth * .7)
  if (o.shutters) {
    const sw = width * .48
    wallBox(b, 'shutter', w, x0 - fw - .03 - sw, x0 - fw - .03, z0, z1, 0, .045)
    wallBox(b, 'shutter', w, x1 + fw + .03, x1 + fw + .03 + sw, z0, z1, 0, .045)
  }
}
const shutterSpan = width => width * 1.96 + .4

/** Evenly spaced windows between along-wall offsets `from`..`to`; shutters only when there is room. */
function windowRow(b, w, z0, count, width, height, o = {}, from = 0, to = w.length) {
  if (count < 1 || to - from < width + .3) return
  const spacing = (to - from) / count, style = o.shutters && spacing < shutterSpan(width) ? { ...o, shutters: false } : o
  for (let i = 0; i < count; i++) windowUnit(b, w, from + spacing * (i + .5), z0, Math.min(width, spacing - .3), height, style)
}
const fits = (span, pitch) => Math.max(0, Math.floor(span / pitch))

/** Paneled door with casing, warm transom and an optional porch light. Returns the head height. */
function doorUnit(b, w, s, z0, o = {}) {
  const width = o.width ?? .95, height = o.height ?? 2.1, fw = .1, transom = o.transom ?? .4
  const x0 = s - width / 2, x1 = s + width / 2
  wallQuad(b, o.leaf || 'door', w, x0, x1, z0, z0 + height, .03)
  let top = z0 + height
  if (transom) {
    wallBox(b, o.frame || 'trim', w, x0, x1, top, top + .07, 0, .06)
    wallQuad(b, 'glassWarm', w, x0, x1, top + .07, top + .07 + transom, .03)
    top += .07 + transom
  }
  wallBox(b, o.frame || 'trim', w, x0 - fw, x0, z0, top, 0, .1)
  wallBox(b, o.frame || 'trim', w, x1, x1 + fw, z0, top, 0, .1)
  wallBox(b, o.head || o.frame || 'trim', w, x0 - fw - .05, x1 + fw + .05, top, top + .16, 0, .14)
  if (o.lamp !== false) {
    const ls = s + (o.lampSide ?? 1) * (width / 2 + .36)
    wallBox(b, 'metal', w, ls - .08, ls + .08, z0 + 2, z0 + 2.06, 0, .19)
    wallBox(b, 'lamp', w, ls - .06, ls + .06, z0 + 1.76, z0 + 2, .03, .17)
  }
  return top + .16
}

/** Railing between two ground points: top and bottom rails with a baluster panel between. */
function railing(b, a, c, z0, height, panel, rail) {
  const l = Math.hypot(c[0] - a[0], c[1] - a[1])
  if (l < .3) return
  b.beam(rail, [a[0], a[1], z0 + height], [c[0], c[1], z0 + height], .08, .06)
  b.beam(rail, [a[0], a[1], z0 + .1], [c[0], c[1], z0 + .1], .06, .05)
  const n = [(c[1] - a[1]) / l, -(c[0] - a[0]) / l, 0]
  b.face(panel, [[a[0], a[1], z0 + .13], [c[0], c[1], z0 + .13], [c[0], c[1], z0 + height - .03], [a[0], a[1], z0 + height - .03]], n)
}

/** Steps from a landing edge at `yTop` (height `height`) down to grade at `yBottom`. */
function stairs(b, keys, x0, x1, yTop, yBottom, height, count) {
  const dir = Math.sign(yBottom - yTop), tread = Math.abs(yBottom - yTop) / count, rise = height / count
  for (let i = 0; i < count; i++) {
    const end = yBottom - dir * i * tread
    b.box(keys, x0, x1, Math.min(yTop, end), Math.max(yTop, end), i * rise, (i + 1) * rise)
  }
}

/**
 * Pitched roof whose eaves and rakes reach the outline x0..x1 × y0..y1, ridge along `along`, top of the ridge cap
 * at `zTop + 0.07`. Solves the pitch for a wall-top target, clamped to a believable range. Returns the wall
 * rectangle (inset by the overhangs), the wall-top height and the gable ends.
 */
export function pitchedRoof(b, { x0, x1, y0, y1, along, hip = false, zTop, wallTarget, eave, rake = eave, keys, thickness = .16, minPitch = 20, maxPitch = 52 }) {
  const ax = along === 'x', cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const La = (ax ? x1 - x0 : y1 - y0) / 2, Hc = (ax ? y1 - y0 : x1 - x0) / 2
  const P = (a, c, z) => ax ? [cx + a, cy + c, z] : [cx + c, cy + a, z]
  const V = (a, c, z) => ax ? [a, c, z] : [c, a, z]
  const span = hip ? Hc : Hc - eave
  const tan = clamp((zTop - wallTarget - thickness * 1.15) / Math.max(.5, span), Math.tan(minPitch * RAD), Math.tan(maxPitch * RAD))
  const tv = thickness * Math.sqrt(1 + tan * tan), zEdge = zTop - tan * Hc
  const wallTop = hip ? zEdge - tv : zTop - tv - tan * (Hc - eave)
  const endIn = hip ? eave : rake
  const wall = ax
    ? { x0: cx - (La - endIn), x1: cx + (La - endIn), y0: cy - (Hc - eave), y1: cy + (Hc - eave) }
    : { x0: cx - (Hc - eave), x1: cx + (Hc - eave), y0: cy - (La - endIn), y1: cy + (La - endIn) }
  const gables = []
  if (!hip) {
    for (const s of [-1, 1]) {
      const top = [P(-La, 0, zTop), P(La, 0, zTop), P(La, s * Hc, zEdge), P(-La, s * Hc, zEdge)]
      b.hexa({ top: keys.roof, bottom: keys.soffit || 'trim', side: keys.fascia || 'trim' }, [...top.map(p => [p[0], p[1], p[2] - tv]), ...top])
    }
    for (const e of [-1, 1]) {
      const a = e * (La - rake)
      b.face(keys.gable, [P(a, -(Hc - eave), wallTop), P(a, Hc - eave, wallTop), P(a, 0, zTop - tv)], V(e, 0, 0))
      gables.push({ end: e, a, base: wallTop, apex: zTop - tv, halfWidth: Hc - eave })
    }
    b.beam(keys.ridge || keys.roof, P(-La, 0, zTop), P(La, 0, zTop), .3, .14)
  } else {
    const r = Math.max(0, La - Hc)
    b.face(keys.roof, [P(-La, Hc, zEdge), P(La, Hc, zEdge), P(r, 0, zTop), P(-r, 0, zTop)], V(0, 1, 1))
    b.face(keys.roof, [P(La, -Hc, zEdge), P(-La, -Hc, zEdge), P(-r, 0, zTop), P(r, 0, zTop)], V(0, -1, 1))
    b.face(keys.roof, [P(La, -Hc, zEdge), P(La, Hc, zEdge), P(r, 0, zTop)], V(1, 0, 1))
    b.face(keys.roof, [P(-La, Hc, zEdge), P(-La, -Hc, zEdge), P(-r, 0, zTop)], V(-1, 0, 1))
    const corners = [[-La, -Hc], [La, -Hc], [La, Hc], [-La, Hc]]
    corners.forEach(([a, c], i) => {
      const [a2, c2] = corners[(i + 1) % 4]
      b.face(keys.fascia || 'trim', [P(a, c, zEdge - tv), P(a2, c2, zEdge - tv), P(a2, c2, zEdge), P(a, c, zEdge)], V((a + a2) / 2, (c + c2) / 2, 0))
    })
    b.face(keys.soffit || 'trim', corners.map(([a, c]) => P(a, c, zEdge - tv)), [0, 0, -1])
    if (r > .2) b.beam(keys.ridge || keys.roof, P(-r, 0, zTop), P(r, 0, zTop), .28, .12)
    const reach = clamp(1 - .3 / Math.max(.6, Hc), .5, .95)
    for (const [a, c] of corners) {
      const end = P(Math.sign(a) * r, 0, zTop), corner = P(a, c, zEdge)
      b.beam(keys.ridge || keys.roof, end, end.map((v, i) => v + (corner[i] - v) * reach), .24, .1)
    }
  }
  return { wall, wallTop, tan, zEdge, tv, gables, La, Hc, P }
}

/* ---------- Proposed typologies ---------- */

const SIDING_TONES = ['#f2eee4', '#c9d7c4', '#bccbdc', '#efdfb2', '#dcd3c6']
const DOOR_TONES = ['#7c2d2d', '#24433a', '#1f3557', '#3a3a3a', '#8a5a2b']
const SHUTTER_TONES = ['#22372e', '#1f2b3d', '#2c2c2c', '#5b2626']
/** Preview rim rises clear of the 0.15 m yard pad, as the 2D massing's state rim did. */
const RIM_M = .45
const AWNING_TONES = ['#1f4e5f', '#7c2d2d', '#2f4f2f', '#3d3a6b']

/** Single-family house or ADU: pitched gable or hip roof with eaves, porch facing the street, chimney. */
function house(b, { W, D, h, floors, seed, adu = false }) {
  const hw = W / 2, hd = D / 2, brick = !adu && seed % 3 === 0, wallKey = brick ? 'brick' : 'siding'
  if (!brick) b.tint('wall', pick(SIDING_TONES, seed >>> 3))
  b.tint('door', pick(DOOR_TONES, seed >>> 5)); b.tint('shutter', pick(SHUTTER_TONES, seed >>> 7))
  const eave = clamp(W * .06, .25, .45), rake = clamp(D * .03, .25, .35)
  const fullPorch = D >= 7 && W >= 4.5, porch = fullPorch ? clamp(D * .2, 1.8, 2.4) : clamp(D * .16, .8, 1.2)
  const hip = !adu && seed % 4 === 1, roofDepth = D - porch
  const along = hip ? (roofDepth >= W ? 'y' : 'x') : roofDepth >= W * .95 ? 'y' : 'x'
  const frontOver = along === 'y' && !hip ? rake : eave
  const base = .55, count = Math.max(1, floors)
  const roof = pitchedRoof(b, { x0: -hw, x1: hw, y0: -hd, y1: hd - porch + frontOver, along, hip, zTop: h - .08, wallTarget: base + count * 2.6, eave, rake, keys: { roof: 'shingle', gable: wallKey, ridge: 'ridgeCap' } })
  const { wall, wallTop } = roof
  const storey = (wallTop - base) / count
  const ring = rectRing(wall.x0, wall.x1, wall.y0, wall.y1), walls = rectWalls(wall.x0, wall.x1, wall.y0, wall.y1)
  b.box({ top: 'stone', side: 'stone', bottom: null }, wall.x0 - .04, wall.x1 + .04, wall.y0 - .04, wall.y1 + .04, 0, base)
  b.walls(wallKey, ring, base, wallTop)
  if (!brick) {
    for (const [x, y] of ring) b.box('trim', x - .08, x + .08, y - .08, y + .08, base, wallTop)
    b.box({ side: 'trim', bottom: 'trim', top: null }, wall.x0 - .03, wall.x1 + .03, wall.y0 - .03, wall.y1 + .03, wallTop - .24, wallTop)
  }
  const width = clamp(storey * .34, .7, 1), height = storey * .52, sill = f => base + f * storey + storey * .3
  const style = brick ? { lintel: 'limestone', sill: 'limestone' } : { shutters: true }
  const F = walls.front, L = F.length, pitch = brick ? 1.6 : 2.15
  const doorS = L >= 4.6 ? L - 1.15 : L / 2, doorX = wallX(F, doorS)[0]
  for (let f = 0; f < count; f++) {
    if (f === 0) {
      doorUnit(b, F, doorS, base, { lampSide: L >= 4.6 ? -1 : 1 })
      if (L >= 4.6) windowRow(b, F, sill(0), fits(doorS - 1.05, pitch), width, height, style, .1, doorS - .95)
    } else windowRow(b, F, sill(f), Math.max(1, fits(L - .2, pitch)), width, height, style)
    windowRow(b, walls.back, sill(f), Math.max(1, fits(walls.back.length - .2, pitch)), width, height, style)
    for (const side of [walls.left, walls.right]) windowRow(b, side, sill(f), fits(side.length - .6, 3), width, height, { ...style, shutters: false })
  }
  for (const g of roof.gables) {
    const rise = g.apex - g.base
    if (rise < 1.1) continue
    const facing = along === 'y' ? (g.end > 0 ? F : walls.back) : (g.end > 0 ? walls.right : walls.left)
    const z0 = g.base + rise * .22, wh = rise * .3, ww = Math.min(.85, 2 * (g.halfWidth * .48 - .14))
    if (ww < .32) continue
    if (facing === F) windowUnit(b, facing, facing.length / 2, z0, ww, wh, { ...style, shutters: false, glass: 'glassWarm' })
    else {
      wallQuad(b, 'vent', facing, facing.length / 2 - ww / 2, facing.length / 2 + ww / 2, z0, z0 + wh, .03)
      wallBox(b, 'trim', facing, facing.length / 2 - ww / 2 - .07, facing.length / 2 + ww / 2 + .07, z0 - .07, z0, 0, .08)
      wallBox(b, 'trim', facing, facing.length / 2 - ww / 2 - .07, facing.length / 2 + ww / 2 + .07, z0 + wh, z0 + wh + .07, 0, .08)
    }
  }
  const frontWall = wall.y1
  if (fullPorch) {
    const stepRun = Math.min(.9, porch * .4), deckFront = hd - stepRun
    const px0 = wall.x0, px1 = wall.x1
    b.box({ top: 'wood', side: 'stone', bottom: null }, px0, px1, frontWall, deckFront, 0, base)
    const sx0 = clamp(doorX - .75, px0, px1 - 1.5), sx1 = sx0 + 1.5
    stairs(b, { top: 'wood', side: 'stone', bottom: null }, sx0, sx1, deckFront, hd, base, 3)
    const high = Math.min(base + storey + .1, wallTop - .2), low = high - (hd - frontWall) * .27, t = .14
    const at = y => high + (low - high) * (y - frontWall) / (hd - frontWall)
    const top = [[px0, frontWall, high], [px1, frontWall, high], [px1, hd, low], [px0, hd, low]]
    b.hexa({ top: 'shingle', bottom: 'trim', side: 'trim' }, [...top.map(p => [p[0], p[1], p[2] - t * 1.04]), ...top])
    const colY = deckFront - .2, colTop = at(colY + .12) - t * 1.04
    const columns = [px0 + .2, px1 - .2]
    if (px1 - px0 > 4.2) columns.push(sx0 - .12, sx1 + .12)
    for (const x of columns) {
      b.box('trim', x - .1, x + .1, colY - .1, colY + .1, base, colTop)
      b.box('trim', x - .15, x + .15, colY - .15, colY + .15, base, base + .18)
      b.box('trim', x - .14, x + .14, colY - .14, colY + .14, colTop - .14, colTop)
    }
    b.box('trim', px0 + .05, px1 - .05, colY - .12, colY + .12, colTop - .22, colTop)
    const rail = (a, c) => { if (c[0] - a[0] > .3 || c[1] - a[1] > .3) railing(b, a, c, base, .85, 'balusterWood', 'trim') }
    rail([px0 + .3, colY], [sx0 - .22, colY]); rail([sx1 + .22, colY], [px1 - .3, colY])
    rail([px0 + .2, frontWall + .05], [px0 + .2, colY - .1]); rail([px1 - .2, frontWall + .05], [px1 - .2, colY - .1])
  } else {
    const sx0 = clamp(doorX - .7, wall.x0, wall.x1 - 1.4), sx1 = sx0 + 1.4
    stairs(b, { top: 'stone', side: 'stone', bottom: null }, sx0, sx1, frontWall, hd, base, 3)
    const z = base + 2.1 + .47 + .22, depth = Math.min(.85, hd - frontWall - .02)
    const top = [[sx0, frontWall, z + .35], [sx1, frontWall, z + .35], [sx1, frontWall + depth, z], [sx0, frontWall + depth, z]]
    b.hexa({ top: 'shingle', bottom: 'trim', side: 'trim' }, [...top.map(p => [p[0], p[1], p[2] - .12]), ...top])
  }
  const cA = along === 'y' ? -roof.La * .45 : roof.La * .4, cC = (along === 'y' ? 1 : -1) * Math.min(roof.Hc * .36, roof.Hc - eave - .45)
  if (roof.Hc - eave - .45 > .2) {
    const [cx, cy] = roof.P(cA, cC, 0)
    b.box({ side: 'brick', top: 'stone', bottom: null }, cx - .32, cx + .32, cy - .32, cy + .32, wallTop - .3, h - .12)
    b.box('limestone', cx - .38, cx + .38, cy - .38, cy + .38, h - .12, h)
  }
}

/** Three-sided bay window projecting `depth` from wall `w` between along-wall offsets s0..s1. */
function bayWindow(b, w, s0, s1, z0, z1, depth, storeys, o) {
  const k = depth, pts = [wallX(w, s0), [...wallX(w, s0 + k)], [...wallX(w, s1 - k)], wallX(w, s1)]
  pts[1] = [pts[1][0] + w.n[0] * depth, pts[1][1] + w.n[1] * depth]; pts[2] = [pts[2][0] + w.n[0] * depth, pts[2][1] + w.n[1] * depth]
  const storey = (z1 - o.floor) / storeys
  for (let i = 0; i < 3; i++) {
    const seg = segmentWall(pts[i], pts[i + 1])
    wallQuad(b, 'stone', seg, 0, seg.length, 0, o.floor)
    wallQuad(b, o.wall, seg, 0, seg.length, o.floor, z1)
    for (let f = 0; f < storeys; f++) {
      const ww = i === 1 ? seg.length - .42 : seg.length - .3
      if (ww > .3) windowUnit(b, seg, seg.length / 2, o.floor + f * storey + storey * .26, ww, storey * .56, { frame: 'trim', sill: 'limestone', depth: .06, frameWidth: .07 })
    }
  }
  const lift = (p, z) => [p[0], p[1], z]
  b.hexa({ top: 'metalRoof', side: 'trim', bottom: 'trim' }, [...pts.map(p => lift(p, z1)), lift(pts[0], z1 + .5), lift(pts[1], z1 + .14), lift(pts[2], z1 + .14), lift(pts[3], z1 + .5)])
}

/** Pittsburgh double house: twin front gables or an Italianate cornice, brick party wall, twin stoops, bays. */
function doubleHouse(b, { W, D, h, floors, seed }) {
  const hw = W / 2, hd = D / 2, count = Math.max(2, floors)
  const zone = clamp(D * .14, 1.2, 1.9), side = clamp(W * .045, .25, .4), rake = .3
  const wallKey = seed % 4 === 3 ? 'brickBuff' : 'brick', base = .9
  b.tint('door', pick(DOOR_TONES, seed >>> 2))
  const italianate = h > 11.6 || seed % 2 === 1
  const front = hd - zone, back = -hd + (italianate ? side : rake), x0 = -hw + side, x1 = hw - side
  let wallTop, valleyTop, party
  const gables = []
  if (italianate) {
    wallTop = h - Math.min(.95, h * .09); valleyTop = wallTop; party = .22
    b.box({ side: 'trim', bottom: 'trim', top: null }, x0 - side * .5, x1 + side * .5, back - side * .5, front + side * .5, wallTop, wallTop + .3)
    b.box({ top: 'roofFlat', side: 'trim', bottom: 'trim' }, -hw, hw, -hd, front + side, wallTop + .3, h - .06)
    const brackets = Math.max(2, Math.floor((x1 - x0) / .9))
    for (let i = 0; i <= brackets; i++) {
      const x = x0 + .1 + (x1 - x0 - .2) * i / brackets
      b.box('trim', x - .07, x + .07, front, front + side * .9, wallTop - .38, wallTop + .3)
    }
    b.box({ side: wallKey, top: 'limestone', bottom: null }, -party, party, back, front + .14, 0, h)
  } else {
    for (const u of [-1, 1]) {
      const r = pitchedRoof(b, { x0: u < 0 ? -hw : 0, x1: u < 0 ? 0 : hw, y0: -hd, y1: front + rake, along: 'y', zTop: h - .08, wallTarget: base + count * 2.85, eave: side, rake, keys: { roof: 'shingle', gable: wallKey, ridge: 'ridgeCap' } })
      wallTop = r.wallTop; valleyTop = r.zEdge - r.tv - .02; party = side
      gables.push(...r.gables.map(g => ({ ...g, unit: u })))
      b.walls(wallKey, rectRing(r.wall.x0, r.wall.x1, r.wall.y0, r.wall.y1), valleyTop, wallTop)
    }
    b.box({ side: wallKey, top: 'limestone', bottom: null }, -party, party, back, front + .14, 0, valleyTop)
  }
  const ring = rectRing(x0, x1, back, front), walls = rectWalls(x0, x1, back, front)
  b.box({ side: 'rustic', top: 'limestone', bottom: null }, x0 - .05, x1 + .05, back - .05, front + .05, 0, base)
  b.walls(wallKey, ring, base, valleyTop)
  const storey = (wallTop - base) / count
  for (let f = 1; f < count; f++) {
    const z = base + f * storey
    if (z < valleyTop - .1) b.box({ side: 'limestone', top: 'limestone', bottom: null }, x0 - .03, x1 + .03, back - .03, front + .03, z - .08, z + .06)
  }
  const sill = f => base + f * storey + storey * .28, width = clamp(storey * .32, .75, 1), height = storey * .55
  const style = { lintel: 'limestone', sill: 'limestone' }
  const F = walls.front, unitW = hw - side - party, sOf = x => x1 - x
  for (const u of [-1, 1]) {
    const doorX = u * (party + .7), inner = u * party, outer = u * (hw - side)
    doorUnit(b, F, sOf(doorX), base, { lampSide: u > 0 ? -1 : 1, width: .92 })
    const sx0 = Math.min(doorX - .7, doorX + .7), sx1 = sx0 + 1.4
    stairs(b, { top: 'stone', side: 'stone', bottom: null }, sx0, sx1, front, hd, base, 4)
    for (const x of [sx0 + .05, sx1 - .05]) {
      b.beam('metal', [x, front + .1, base + .9], [x, hd - .12, base / 4 + .9], .05, .05)
      b.box('metal', x - .025, x + .025, hd - .15, hd - .1, 0, base / 4 + .9)
    }
    const bayFrom = party + 1.55, bayTo = hw - side - .25, bayStoreys = count >= 3 ? 2 : 1
    if (unitW >= 3.6 && bayTo - bayFrom >= 1.8) {
      const a = sOf(u * (u > 0 ? bayTo : bayFrom)), c = sOf(u * (u > 0 ? bayFrom : bayTo))
      bayWindow(b, F, Math.min(a, c), Math.max(a, c), 0, base + bayStoreys * storey, Math.min(.6, zone - .4), bayStoreys, { wall: 'trim', floor: base })
    } else windowUnit(b, F, sOf(u * (party + 1.55 + Math.max(.5, (unitW - 1.55) / 2))), sill(0), width, height, style)
    const lo = Math.min(sOf(inner), sOf(outer)), hi = Math.max(sOf(inner), sOf(outer))
    for (let f = 1; f < count; f++) {
      if (f < (unitW >= 3.6 ? 1 + bayStoreys : 1)) {
        windowUnit(b, F, sOf(u * (party + .7)), sill(f), width * .85, height, style)
        continue
      }
      windowRow(b, F, sill(f), unitW >= 3.4 ? 2 : 1, width, height, style, lo + .2, hi - .2)
    }
    const B = walls.back, blo = Math.min(B.length - lo, B.length - hi), bhi = Math.max(B.length - lo, B.length - hi)
    for (let f = 0; f < count; f++) windowRow(b, B, sill(f), unitW >= 3.4 ? 2 : 1, width, height, style, blo + .2, bhi - .2)
  }
  for (let f = 0; f < count; f++) for (const s of [walls.left, walls.right]) windowRow(b, s, sill(f), fits(s.length - .8, 3), width, height, style)
  for (const g of gables) {
    const rise = g.apex - g.base
    if (g.end < 0 || rise < 1.2) continue
    const ww = Math.min(.8, 2 * (g.halfWidth * .48 - .14)), z0 = g.base + rise * .2
    if (ww > .32) windowUnit(b, F, sOf(g.unit * hw / 2), z0, ww, rise * .32, { ...style, glass: 'glassWarm' })
  }
}

/** Three-storey brick walk-up: rusticated stone base, limestone lintels, front balconies, bracketed cornice. */
function walkUp(b, { W, D, h, floors, seed }) {
  const hw = W / 2, hd = D / 2, count = Math.max(2, floors)
  const zone = clamp(D * .1, 1, 1.5), side = clamp(W * .04, .25, .35)
  const x0 = -hw + side, x1 = hw - side, y0 = -hd + side, y1 = hd - zone
  const wallTop = h - Math.min(.85, h * .08), storey = wallTop / count
  b.tint('door', pick(['#3a2a1e', '#1f3557', '#24433a'], seed))
  const ring = rectRing(x0, x1, y0, y1), walls = rectWalls(x0, x1, y0, y1)
  b.walls('rustic', ring, 0, storey)
  b.walls('brick', ring, storey, wallTop)
  b.box({ side: 'limestone', top: 'limestone', bottom: null }, x0 - .05, x1 + .05, y0 - .05, y1 + .05, storey - .12, storey + .1)
  b.box({ side: 'trim', bottom: 'trim', top: null }, x0 - side * .4, x1 + side * .4, y0 - side * .4, y1 + side * .4, wallTop - .35, wallTop)
  b.box({ side: 'trim', bottom: 'trim', top: 'roofFlat' }, x0 - side, x1 + side, y0 - side, y1 + side, wallTop, wallTop + .22)
  b.box({ side: 'brick', top: 'roofFlat', bottom: null }, x0, x1, y0, y1, wallTop + .22, h)
  const brackets = Math.max(2, Math.floor((x1 - x0) / 1.1))
  for (let i = 0; i <= brackets; i++) {
    const x = x0 + .12 + (x1 - x0 - .24) * i / brackets
    b.box('trim', x - .07, x + .07, y1, y1 + side * .9, wallTop - .5, wallTop)
  }
  const style = { lintel: 'limestone', sill: 'limestone' }, width = clamp(storey * .3, .8, 1.05), height = storey * .55
  const sill = f => f * storey + storey * .28
  const F = walls.front, L = F.length
  const doorTop = doorUnit(b, F, L / 2, .15, { width: 1.1, transom: .45, lamp: false })
  b.box('metal', -1, 1, y1, y1 + zone - .12, doorTop + .05, doorTop + .17)
  for (const x of [-.9, .9]) b.beam('metal', [x, y1 + zone - .2, doorTop + .17], [x, y1, doorTop + .9], .03, .03)
  stairs(b, 'stone', -.8, .8, y1, y1 + .5, .15, 1)
  windowRow(b, F, sill(0), fits(L / 2 - 1, 1.6), width, height, style, .15, L / 2 - .9)
  windowRow(b, F, sill(0), fits(L / 2 - 1, 1.6), width, height, style, L / 2 + .9, L - .15)
  const balcony = Math.min(hw * .62, 2.6)
  for (let f = 1; f < count; f++) {
    const z = f * storey
    b.box({ top: 'concrete', side: 'concrete', bottom: 'concrete' }, -balcony, balcony, y1, y1 + zone - .08, z - .16, z + .02)
    const yr = y1 + zone - .14
    railing(b, [-balcony + .06, yr], [balcony - .06, yr], z, .95, 'balusterMetal', 'metal')
    railing(b, [-balcony + .06, y1 + .05], [-balcony + .06, yr], z, .95, 'balusterMetal', 'metal')
    railing(b, [balcony - .06, y1 + .05], [balcony - .06, yr], z, .95, 'balusterMetal', 'metal')
    windowUnit(b, F, L / 2, z + .04, Math.min(1.5, balcony), Math.min(2.2, storey - .55), { ...style, glass: 'glassWarm', mullion: true })
    windowRow(b, F, sill(f), fits(L / 2 - 1.2, 1.6), width, height, style, .15, L / 2 - 1.05)
    windowRow(b, F, sill(f), fits(L / 2 - 1.2, 1.6), width, height, style, L / 2 + 1.05, L - .15)
  }
  for (let f = 0; f < count; f++) {
    windowRow(b, walls.back, sill(f), Math.max(1, fits(walls.back.length - .4, 1.8)), width, height, style)
    for (const s of [walls.left, walls.right]) windowRow(b, s, sill(f), fits(s.length - .8, 2.8), width, height, style)
  }
}

/** Panel rows tilted toward `south` (a local unit vector) inside `area`, avoiding `blocked` rectangles. */
function solarArray(b, area, blocked, z, south, max = 48) {
  const S = unit([south[0], south[1], 0]), E = [-S[1], S[0], 0], tilt = 22 * RAD
  const half = [.85, .5 * Math.cos(tilt)], rise = Math.sin(tilt)
  const inside = ([x, y]) => x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1 && !blocked.some(r => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)
  const cx = (area.x0 + area.x1) / 2, cy = (area.y0 + area.y1) / 2, reach = Math.hypot(area.x1 - area.x0, area.y1 - area.y0) / 2
  let placed = 0
  for (let r = -Math.ceil(reach / 2.1); r <= Math.ceil(reach / 2.1); r++) for (let c = -Math.ceil(reach / 1.8); c <= Math.ceil(reach / 1.8); c++) {
    if (placed >= max) return placed
    const centre = [cx + S[0] * r * 2.1 + E[0] * c * 1.8, cy + S[1] * r * 2.1 + E[1] * c * 1.8]
    const corner = (s, e) => [centre[0] + S[0] * s * half[1] + E[0] * e * half[0], centre[1] + S[1] * s * half[1] + E[1] * e * half[0]]
    const ring = [corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)]
    if (!ring.every(inside)) continue
    const lift = (p, i) => [p[0], p[1], z + .35 + (i >= 2 ? rise : 0)]
    const bottom = ring.map(lift)
    b.hexa({ top: 'solar', side: 'metal', bottom: 'metal' }, [...bottom, ...bottom.map(p => [p[0], p[1], p[2] + .05])])
    const north = [(ring[2][0] + ring[3][0]) / 2, (ring[2][1] + ring[3][1]) / 2]
    b.beam('metal', [north[0], north[1], z], [north[0], north[1], z + .35 + rise], .06, .06)
    placed++
  }
  return placed
}

/** Mid-rise apartments: storefront or lobby podium, articulated bays, balconies, cornice, penthouse, solar. */
function apartment(b, { W, D, h, floors, seed, south }) {
  const hw = W / 2, hd = D / 2
  const zone = clamp(D * .07, .9, 1.4), side = clamp(Math.min(W, D) * .03, .3, .45)
  const x0 = -hw + side, x1 = hw - side, y0 = -hd + side, y1 = hd - zone
  const podium = clamp(h * .3, 3.2, 4.4), penthouse = h >= 9 ? 2.6 : 0, parapet = .9
  const deck = h - Math.max(penthouse, parapet), upper = Math.max(1, floors - 1), storey = (deck - podium) / upper
  const brick = seed % 3 === 2 ? 'brickBuff' : 'brick'
  b.tint('awning', pick(AWNING_TONES, seed >>> 4))
  const walls = rectWalls(x0, x1, y0, y1), F = walls.front, L = F.length
  for (const w of Object.values(walls)) wallQuad(b, 'stone', w, 0, w.length, 0, podium)
  const bays = Math.max(2, Math.round(L / 3.6)), bw = L / bays, pier = Math.min(.6, bw * .18), lobby = Math.floor(bays / 2)
  for (let i = 0; i <= bays; i++) wallBox(b, { side: 'stone', top: 'limestone', bottom: null }, F, Math.max(0, i * bw - pier / 2), Math.min(L, i * bw + pier / 2), 0, podium - .3, 0, .2)
  for (let i = 0; i < bays; i++) {
    const s0 = i * bw + pier / 2, s1 = (i + 1) * bw - pier / 2, mid = (s0 + s1) / 2
    wallBox(b, 'bronze', F, s0, s1, 0, .45, 0, .05)
    if (i === lobby) {
      const door = Math.min(1.8, s1 - s0 - .5)
      wallQuad(b, 'storefront', F, s0 + .06, mid - door / 2, .45, podium - .75, .03)
      wallQuad(b, 'storefront', F, mid + door / 2, s1 - .06, .45, podium - .75, .03)
      wallQuad(b, 'glassWarm', F, mid - door / 2, mid + door / 2, 0, 2.4, .03)
      wallQuad(b, 'storefront', F, mid - door / 2, mid + door / 2, 2.5, podium - .75, .03)
      for (const s of [mid - door / 2, mid, mid + door / 2]) wallBox(b, 'bronze', F, s - .04, s + .04, 0, 2.5, 0, .08)
      wallBox(b, 'bronze', F, mid - door / 2, mid + door / 2, 2.4, 2.5, 0, .08)
      wallBox(b, { top: 'metal', side: 'metal', bottom: 'trim' }, F, s0 - .1, s1 + .1, podium - .72, podium - .58, 0, zone - .1)
      for (const s of [s0 + .2, s1 - .2]) b.beam('metal', wallPoint(F, s, podium - .58, zone - .2), wallPoint(F, s, podium + .3, .05), .03, .03)
    } else {
      wallQuad(b, 'storefront', F, s0 + .05, s1 - .05, .45, podium - .8, .03)
      if (s1 - s0 > 2.2) wallBox(b, 'bronze', F, mid - .04, mid + .04, .45, podium - .8, 0, .08)
      wallBox(b, 'bronze', F, s0, s1, podium - .8, podium - .7, 0, .08)
      const top = [wallPoint(F, s0 + .04, podium - .74, 0), wallPoint(F, s1 - .04, podium - .74, 0), wallPoint(F, s1 - .04, podium - 1.2, zone - .2), wallPoint(F, s0 + .04, podium - 1.2, zone - .2)]
      b.hexa({ top: 'awning', side: 'awning', bottom: 'awning' }, [...top.map(p => [p[0], p[1], p[2] - .04]), ...top])
    }
  }
  b.box({ side: 'limestone', top: 'limestone', bottom: null }, x0 - .06, x1 + .06, y0 - .06, y1 + .06, podium - .3, podium)
  for (const w of [walls.back, walls.left, walls.right]) {
    const n = Math.max(1, Math.round(w.length / 3)), v1 = (deck - podium) / storey
    wallQuad(b, 'aptFacade', w, 0, w.length, podium, deck, 0, [[0, 0], [n, 0], [n, v1], [0, v1]])
  }
  wallQuad(b, brick, F, 0, L, podium, deck)
  b.walls(brick, rectRing(x0, x1, y0, y1), deck, deck + parapet)
  const modules = Math.max(2, Math.round(L / 3.4)), mw = L / modules
  for (let i = 0; i < modules; i++) {
    const s0 = i * mw, sc = s0 + mw / 2, projecting = modules >= 3 && i % 2 === 1
    if (projecting) {
      const pd = Math.min(.6, zone - .3)
      wallBox(b, { side: 'panel', top: 'metal', bottom: 'panel' }, F, s0 + .25, s0 + mw - .25, podium + .15, deck - .25, 0, pd)
      const face = offsetWall(F, pd)
      for (let f = 0; f < upper; f++) windowUnit(b, face, sc, podium + f * storey + storey * .22, (mw - .5) * .72, storey * .6, { frame: 'bronze', sill: 'bronze', depth: .12, glass: seedOf(`${seed}:${i}:${f}`) % 10 < 5 ? 'glassWarm' : 'glass', mullion: true })
    } else {
      for (let f = 0; f < upper; f++) {
        const z = podium + f * storey
        windowUnit(b, F, sc, z + .08, mw * .5, Math.min(storey - .5, 2.25), { frame: 'bronze', sill: 'concrete', depth: .2, glass: seedOf(`${seed}:${f}:${i}`) % 10 < 4 ? 'glassWarm' : 'glass', mullion: true })
        const half = mw * .42, out = zone - .14
        wallBox(b, 'concrete', F, sc - half, sc + half, z - .14, z + .02, 0, out)
        const a = wallX(F, sc - half + .05), c = wallX(F, sc + half - .05)
        const fa = [a[0] + F.n[0] * (out - .05), a[1] + F.n[1] * (out - .05)], fc = [c[0] + F.n[0] * (out - .05), c[1] + F.n[1] * (out - .05)]
        railing(b, fa, fc, z, 1, 'balusterMetal', 'metal'); railing(b, a, fa, z, 1, 'balusterMetal', 'metal'); railing(b, c, fc, z, 1, 'balusterMetal', 'metal')
      }
    }
  }
  for (let f = 1; f < upper; f++) wallBox(b, 'concrete', F, 0, L, podium + f * storey - .1, podium + f * storey + .04, 0, .05)
  b.box({ side: 'limestone', bottom: 'limestone', top: null }, x0 - side * .6, x1 + side * .6, y0 - side * .6, y1 + side * .6, deck - .45, deck - .1)
  const k = .25, inner = rectRing(x0 + k, x1 - k, y0 + k, y1 - k)
  b.walls(brick, inner.slice().reverse(), deck, deck + parapet)
  b.cap('roofFlat', inner, deck)
  for (const [ax0, ax1, ay0, ay1] of [[x0, x1, y0, y0 + k], [x0, x1, y1 - k, y1], [x0, x0 + k, y0 + k, y1 - k], [x1 - k, x1, y0 + k, y1 - k]]) b.box('limestone', ax0, ax1, ay0, ay1, deck + parapet - .08, deck + parapet)
  const blocked = []
  if (penthouse) {
    const px = Math.min(2.8, (x1 - x0) * .2), py0 = y0 + 1.2, py1 = py0 + Math.min(5, (y1 - y0) * .28)
    b.box({ side: 'panel', top: 'roofFlat', bottom: null }, -px, px, py0, py1, deck, h)
    const pw = rectWalls(-px, px, py0, py1)
    wallQuad(b, 'door', pw.front, pw.front.length / 2 - .45, pw.front.length / 2 + .45, deck, deck + 2.1, .03)
    wallQuad(b, 'vent', pw.right, .4, pw.right.length - .4, deck + .9, deck + 2, .03)
    blocked.push({ x0: -px - .8, x1: px + .8, y0: py0 - .8, y1: py1 + .8 })
    const hx = Math.min(x1 - k - 2.4, px + 2.2)
    if (hx - .8 > px + .6) { b.box({ side: 'metal', top: 'vent', bottom: null }, hx - .8, hx + .8, py0, py0 + 1.2, deck, deck + 1.1); blocked.push({ x0: hx - 1.4, x1: hx + 1.4, y0: py0 - .6, y1: py0 + 1.8 }) }
  }
  solarArray(b, { x0: x0 + k + .5, x1: x1 - k - .5, y0: y0 + k + .6, y1: y1 - k - .6 }, blocked, deck, south)
}

/** Fallback for unknown types: brick block with a window grid, cornice and flat roof. */
function block(b, { W, D, h, floors }) {
  const hw = W / 2, hd = D / 2, side = clamp(Math.min(W, D) * .04, .2, .35), cap = Math.min(.6, h * .06)
  const x0 = -hw + side, x1 = hw - side, y0 = -hd + side, y1 = hd - side, storey = (h - cap) / Math.max(1, floors)
  b.walls('nbApartment', rectRing(x0, x1, y0, y1), 0, h - cap, { bay: [3, storey, 0], plain: 'brick' })
  b.box({ side: 'trim', bottom: 'trim', top: 'roofFlat' }, -hw, hw, -hd, hd, h - cap, h)
}

/**
 * Real-world mesh for a drafted or placed building on its exact footprint. `ring`: four corners in anchor
 * metres; `front`: unit vector toward the street (the 2D massing's front guess), snapped to a footprint axis.
 * `state` 'invalid' tints roof and trim red, 'pending' grey; previews also get a ground rim in the state colour.
 */
export function buildProposedBuilding({ ring, front = null, typeId, height, floors, state = 'placed', flagged = false, seed = 0 }) {
  const corners = openRing(ring || [])
  if (corners.length !== 4 || !(height > 0)) return null
  const centre = [corners.reduce((n, p) => n + p[0], 0) / 4, corners.reduce((n, p) => n + p[1], 0) / 4]
  const e1 = unit(sub(corners[1], corners[0])), e3 = unit(sub(corners[3], corners[0]))
  const want = front && Math.hypot(front[0], front[1]) > 0 ? unit([front[0], front[1], 0]) : e3
  const axis = Math.abs(dot(want, e3)) >= Math.abs(dot(want, e1)) ? e3 : e1
  const F = dot(want, axis) < 0 ? [-axis[0], -axis[1]] : [axis[0], axis[1]], X = [F[1], -F[0]]
  const local = corners.map(p => [(p[0] - centre[0]) * X[0] + (p[1] - centre[1]) * X[1], (p[0] - centre[0]) * F[0] + (p[1] - centre[1]) * F[1]])
  const W = Math.max(...local.map(p => p[0])) - Math.min(...local.map(p => p[0])), D = Math.max(...local.map(p => p[1])) - Math.min(...local.map(p => p[1]))
  if (!(W >= 1.5 && D >= 1.5)) return null
  const b = new PartBuilder().frame(centre, X)
  const type = typeId === 'apartment' ? 'small_apartment' : typeId
  if (state === 'invalid') b.tint('roof', '#c8432f').tint('trim', '#f19a90')
  else if (state === 'pending') b.tint('roof', '#a7aeb6').tint('trim', '#d6dade')
  else b.tint('roof', mixColor('#ffffff', placedBuildingColor(type === 'adu' ? 'single_family' : type), .6))
  const ctx = { W, D, h: height, floors: floors > 0 ? Math.round(floors) : Math.max(1, Math.round(height / 3.2)), seed: seed >>> 0 }
  if (type === 'single_family' || type === 'adu') house(b, { ...ctx, adu: type === 'adu' })
  else if (type === 'townhouse_duplex') doubleHouse(b, ctx)
  else if (type === 'triplex') walkUp(b, ctx)
  else if (type === 'small_apartment' || type === 'large_apartment') apartment(b, { ...ctx, south: [-X[1], -F[1]] })
  else block(b, ctx)
  const rim = state === 'invalid' || flagged ? '#dc2626' : state === 'pending' ? '#94a3b8' : state === 'valid' ? '#16a34a' : null
  if (rim) {
    b.tint('rim', rim)
    const hw = W / 2, hd = D / 2, r = Math.min(.3, W * .05)
    b.box('rim', -hw, hw, -hd, -hd + r, 0, RIM_M); b.box('rim', -hw, hw, hd - r, hd, 0, RIM_M)
    b.box('rim', -hw, -hw + r, -hd + r, hd - r, 0, RIM_M); b.box('rim', hw - r, hw, -hd + r, hd - r, 0, RIM_M)
  }
  const geometries = b.geometries()
  return { geometries, width: W, depth: D, height, type, triangles: triangleCount(geometries) }
}

/* ---------- Recorded neighbourhood buildings ---------- */

/** Minimum-area oriented rectangle of a point set (rotating calipers over the convex hull); `axis` is the long side. */
export function orientedBoundingBox(points) {
  const hull = convexHull(points)
  if (hull.length < 3) return null
  let best = null
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l < 1e-9) continue
    const u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], v = [-u[1], u[0]]
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const p of hull) {
      const pu = p[0] * u[0] + p[1] * u[1], pv = p[0] * v[0] + p[1] * v[1]
      u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv)
    }
    const area = (u1 - u0) * (v1 - v0)
    if (!best || area < best.area - 1e-9) best = { u, v, u0, u1, v0, v1, area }
  }
  const { u, v, u0, u1, v0, v1, area } = best, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2
  const centre = [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv]
  const long = u1 - u0 >= v1 - v0
  return { centre, axis: long ? u : v, length: Math.max(u1 - u0, v1 - v0), width: Math.min(u1 - u0, v1 - v0), area }
}

const RESIDENTIAL_USES = new Set(['single_family', 'townhouse_duplex', 'small_apartment', 'other_residential'])
const RESIDENTIAL_ROOF_MAX_M = 13.5

function outerRingOf(geometry) {
  return polygons(geometry).map(p => p[0]).filter(r => r?.length >= 4).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0] || null
}

/** Neighbourhood roof form for a recorded footprint: 'gable', 'hip' or 'flat', with the oriented box it follows. */
export function neighborhoodForm(ring, height, useType, seed = 0) {
  const obb = orientedBoundingBox(ring)
  if (!obb) return null
  const area = Math.abs(signedArea(ring)), rectangularity = area / Math.max(1e-9, obb.length * obb.width)
  const residential = RESIDENTIAL_USES.has(useType) || ((!useType || useType === 'unknown') && height <= 12)
  const pitched = useType !== 'nonresidential' && useType !== 'large_apartment' && residential && height <= RESIDENTIAL_ROOF_MAX_M &&
    obb.width <= 16 && rectangularity >= .72 && height >= 3.4
  const roof = !pitched ? 'flat' : rectangularity < .8 || seed % 4 === 0 ? 'hip' : 'gable'
  return { roof, obb, rectangularity, residential }
}

/**
 * Real-world mesh for one recorded building, in metres from its first outline vertex (`anchor`). Low residential
 * footprints get gable or hip roofs along their oriented box over brick or siding with window grids; others
 * get storefront or office facades, a cornice band, parapet and rooftop plant. Top stays at `height_m`.
 */
export function buildNeighborhoodBuilding(feature) {
  const p = feature?.properties || {}, h = Number(p.height_m)
  const outer = outerRingOf(feature?.geometry)
  if (!outer || !(h >= 2.5)) return null
  const anchor = outer[0], project = metresProjector(anchor)
  const ring = cleanRing(openRing(outer).map(project), .3)
  if (ring.length < 3 || Math.abs(signedArea(ring)) < 8) return null
  const seed = seedOf(footprintKey(feature) ?? JSON.stringify(anchor))
  const form = neighborhoodForm(ring, h, p.use_type, seed)
  if (!form) return null
  const b = new PartBuilder()
  const useColor = USE_BY_ID[p.use_type]?.color || USE_BY_ID.unknown.color
  b.tint('roof', mixColor('#ffffff', useColor, .42))
  const stories = Number(p.stories) > 0 ? Math.round(Number(p.stories)) : 0
  if (form.roof !== 'flat') {
    const { obb } = form, A = obb.length / 2, B = obb.width / 2, pitch = (34 + seed % 10) * RAD
    let rise = Math.min(B * Math.tan(pitch), h * .45), eaveZ = h - rise
    if (eaveZ < 2.6) { eaveZ = 2.6; rise = h - eaveZ }
    const brick = seed % 3 !== 1, facade = brick ? 'nbBrick' : 'nbSiding', plain = brick ? 'brick' : 'siding'
    if (!brick) b.tint('wall', pick(SIDING_TONES, seed >>> 3))
    const floorsN = Math.max(1, Math.min(stories || 9, Math.round((eaveZ - .5) / 2.7)))
    b.walls('stone', ring, 0, .5)
    b.walls(facade, ring, .5, eaveZ, { bay: [3.1, (eaveZ - .5) / floorsN, .5], plain })
    b.frame(obb.centre, obb.axis)
    const tan = rise / B, corners = [[-A, -B], [A, -B], [A, B], [-A, B]]
    b.face('trim', corners.map(([x, y]) => [x, y, eaveZ - .02]), [0, 0, -1])
    if (form.roof === 'gable') {
      b.face('shingle', [[-A, B, eaveZ], [A, B, eaveZ], [A, 0, h - .06], [-A, 0, h - .06]], [0, 1, 1])
      b.face('shingle', [[A, -B, eaveZ], [-A, -B, eaveZ], [-A, 0, h - .06], [A, 0, h - .06]], [0, -1, 1])
      for (const e of [-1, 1]) b.face(plain, [[e * A, -B, eaveZ], [e * A, B, eaveZ], [e * A, 0, h - .06]], [e, 0, 0])
      b.beam('ridgeCap', [-A, 0, h - .06], [A, 0, h - .06], .26, .1)
    } else {
      const r = Math.max(0, A - B), top = eaveZ + tan * B
      b.face('shingle', [[-A, B, eaveZ], [A, B, eaveZ], [r, 0, top], [-r, 0, top]], [0, 1, 1])
      b.face('shingle', [[A, -B, eaveZ], [-A, -B, eaveZ], [-r, 0, top], [r, 0, top]], [0, -1, 1])
      b.face('shingle', [[A, -B, eaveZ], [A, B, eaveZ], [r, 0, top]], [1, 0, 1])
      b.face('shingle', [[-A, B, eaveZ], [-A, -B, eaveZ], [-r, 0, top]], [-1, 0, 1])
    }
    if (seed % 3 === 0 && B > 2.4) {
      const cx = A * .45, cy = B * .4
      b.box({ side: 'brick', top: 'stone', bottom: null }, cx - .3, cx + .3, cy - .3, cy + .3, eaveZ - .2, h)
    }
  } else {
    const nonres = p.use_type === 'nonresidential', tall = h > 18
    const top = h - 1, storey = tall ? 3.6 : nonres ? 3.5 : 3
    const facade = nonres ? (tall ? 'nbOffice' : 'nbCommercial') : 'nbApartment', plain = nonres && tall ? 'concrete' : nonres ? 'brickBuff' : 'brick'
    const ground = nonres && !tall && top > 4.5 ? Math.min(4.2, top * .45) : 0
    if (ground) b.walls('nbStorefront', ring, 0, ground, { bay: [3.4, ground, 0], plain })
    const floorsN = Math.max(1, stories ? stories - (ground ? 1 : 0) : Math.round((top - ground - .4) / storey))
    b.walls(facade, ring, ground, top - .4, { bay: [3.2, (top - .4 - ground) / floorsN, ground], plain })
    b.walls(nonres ? 'limestone' : 'trim', ring, top - .4, top)
    b.walls(plain, ring, top, h)
    const inner = insetRing(ring, () => .3)
    if (inner?.length === ring.length) {
      b.walls(plain, inner.slice().reverse(), h - 1.2, h)
      b.cap('roofFlat', inner, h - 1.2)
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length
        b.face('limestone', [[...ring[i], h], [...ring[j], h], [...inner[j], h], [...inner[i], h]], [0, 0, 1])
      }
      const { obb } = form, A = obb.length / 2, B = obb.width / 2
      b.frame(obb.centre, obb.axis)
      const units = A * B * 4 > 600 ? 3 : A * B * 4 > 150 ? 2 : A * B * 4 > 70 ? 1 : 0
      for (let i = 0; i < units; i++) {
        const x = (i - (units - 1) / 2) * A * .55, y = (seed >>> i) % 2 ? B * .2 : -B * .2
        const sx = Math.min(1.6, A * .2), sy = Math.min(1.1, B * .25)
        if (sx > .4 && sy > .3) b.box({ side: 'metal', top: 'vent', bottom: null }, x - sx, x + sx, y - sy, y + sy, h - 1.2, h - .2)
      }
      if (h > 15 && A > 4 && B > 3) b.box({ side: plain, top: 'roofFlat', bottom: null }, A * .2, A * .2 + Math.min(3.5, A * .4), -Math.min(2, B * .4), Math.min(2, B * .4), h - 1.2, h)
    } else b.cap('roofFlat', ring, h)
  }
  return { anchor, geometries: b.geometries(), roof: form.roof, obb: form.obb }
}

/** Cache key for a recorded building mesh: identity, height, use and outline. */
export function buildingCacheKey(feature) {
  const p = feature?.properties || {}, ring = outerRingOf(feature?.geometry) || []
  return [footprintKey(feature) ?? '', p.height_m, p.use_type, p.stories ?? '', ring.length, ring[0]?.join(','), ring[Math.floor(ring.length / 2)]?.join(',')].join('|')
}

function ringCentre(geometry) {
  const ring = outerRingOf(geometry)
  if (!ring) return null
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y) }
  return [(w + e) / 2, (s + n) / 2]
}

/**
 * Recorded buildings to mesh: the nearest `limit` within `radius` metres of `centre`, skipping demolished
 * footprints (`exclude`: demolition keys). Everything else stays a flat-colour extrusion.
 */
export function neighborhoodSelection(features, centre, { limit = 140, radius = 260, exclude = [] } = {}) {
  if (!centre || !Array.isArray(features)) return []
  const removed = exclude instanceof Set ? exclude : new Set(exclude)
  const kx = 111320 * Math.cos(centre[1] * RAD), ky = 110574
  const scored = []
  for (const feature of features) {
    if (!(Number(feature?.properties?.height_m) >= 2.5)) continue
    const key = footprintKey(feature)
    if (key && removed.has(key)) continue
    const c = ringCentre(feature.geometry)
    if (!c) continue
    const d = Math.hypot((c[0] - centre[0]) * kx, (c[1] - centre[1]) * ky)
    if (d <= radius) scored.push([d, feature])
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, feature]) => feature)
}
