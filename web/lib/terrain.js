import { localFrame, outerRing } from './localFrame.js'
import { samplePoints } from './shadeStudy.js'

/**
 * Terrain Tiles on AWS (Mapzen / Linux Foundation), Terrarium PNG encoding. Keyless and CORS-open. In Pittsburgh the
 * tiles come from USGS 3DEP (NED 1/9 arc-second, about 3 m), which requires the attribution below.
 */
export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
export const TERRAIN_MAX_ZOOM = 15
export const TERRAIN_ATTRIBUTION = '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain Tiles on AWS</a> · USGS 3DEP'
export const TERRAIN_LINKS = {
  registry: 'https://registry.opendata.aws/terrain-tiles/',
  attribution: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
}
export const FEET_PER_METRE = 3.28084

/**
 * Slope bands. 15% is where Pittsburgh's §915.02.B planting schedule starts for exposed slopes; 25% is the §915.02.A
 * cut/fill limit and the City's 25%+ steep-slope layer, which PlayHouse already uses as a landslide-risk proxy.
 */
export const SLOPE_CLASSES = [
  { id: 'gentle', label: 'Under 15%', short: 'gentle', max: 15, color: '#9cc29a' },
  { id: 'steep', label: '15–25% steep', short: 'steep', max: 25, color: '#f0a85a' },
  { id: 'very-steep', label: '25%+ very steep', short: 'very steep', max: Infinity, color: '#c2412d' },
]

export function slopeClass(percent) {
  if (!Number.isFinite(percent)) return null
  return SLOPE_CLASSES.find(c => percent < c.max) || SLOPE_CLASSES.at(-1)
}

export function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768
}

/** Elevations (m) for one RGBA tile, row-major. */
export function decodeTile(rgba, size = 256) {
  const out = new Float32Array(size * size)
  for (let i = 0; i < out.length; i++) out[i] = decodeTerrarium(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])
  return out
}

/** Web Mercator global pixel position of a lon/lat at a zoom (256 px tiles). */
export function worldPixel(lon, lat, zoom) {
  const size = 256 * 2 ** zoom, sin = Math.sin(lat * Math.PI / 180)
  return [(lon + 180) / 360 * size, (.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size]
}

export function tileKey(z, x, y) { return `${z}/${x}/${y}` }

/** Tiles (z/x/y) covering lon/lat bounds [west, south, east, north]. */
export function tilesForBounds(bounds, zoom = TERRAIN_MAX_ZOOM) {
  const [x0, y0] = worldPixel(bounds[0], bounds[3], zoom).map(v => Math.floor(v / 256))
  const [x1, y1] = worldPixel(bounds[2], bounds[1], zoom).map(v => Math.floor(v / 256))
  const tiles = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ z: zoom, x, y })
  return tiles
}

/**
 * Bilinear elevation lookup over decoded tiles. `tileAt(z, x, y)` returns a Float32Array or null; the sampler returns
 * null wherever a needed tile is missing, so callers can fall back to flat ground.
 */
export function createSampler(tileAt, zoom = TERRAIN_MAX_ZOOM) {
  const value = (px, py) => {
    const tx = Math.floor(px / 256), ty = Math.floor(py / 256), tile = tileAt(zoom, tx, ty)
    return tile ? tile[(py - ty * 256) * 256 + (px - tx * 256)] : null
  }
  return (lon, lat) => {
    const [fx, fy] = worldPixel(lon, lat, zoom), x = fx - .5, y = fy - .5
    const x0 = Math.floor(x), y0 = Math.floor(y), dx = x - x0, dy = y - y0
    const a = value(x0, y0), b = value(x0 + 1, y0), c = value(x0, y0 + 1), d = value(x0 + 1, y0 + 1)
    if (a === null || b === null || c === null || d === null) return null
    return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy
  }
}

/**
 * Horn (1981) slope in percent from a 3×3 window of elevations `[[a, b, c], [d, e, f], [g, h, i]]` (north row first)
 * spaced `cell` metres apart: the same estimator GDAL and ArcGIS use.
 */
export function hornSlope(window, cell) {
  const [[a, b, c], [d, , f], [g, h, i]] = window
  const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cell)
  const dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cell)
  return 100 * Math.hypot(dzdx, dzdy)
}

/** Slope (%) at a lon/lat from the sampler, with a Horn window `cell` metres wide; null without data. */
export function slopeAt(sampler, lon, lat, cell = 4) {
  const dLon = cell / (111320 * Math.cos(lat * Math.PI / 180)), dLat = cell / 111320
  const window = [1, 0, -1].map(r => [-1, 0, 1].map(c => sampler(lon + c * dLon, lat + r * dLat)))
  return window.flat().some(v => v === null || !Number.isFinite(v)) ? null : hornSlope(window, cell)
}

const quantile = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] : null

/**
 * Elevation and slope over a parcel: evenly spaced points inside the lot, each with its elevation and Horn slope.
 * `typical` is the median slope; `steepShare` and `verySteepShare` are the shares of the lot at 15%+ and 25%+.
 */
export function parcelTerrain(sampler, geometry, { target = 24, cell = 4 } = {}) {
  const center = geometry?.type === 'Polygon' ? geometry.coordinates[0][0] : geometry?.type === 'MultiPolygon' ? geometry.coordinates[0][0][0] : null
  if (!center) return null
  const frame = localFrame(center), ring = outerRing(frame, geometry)
  if (!ring) return null
  const points = samplePoints(ring, target).map(frame.unproject)
  const elevations = [], slopes = []
  for (const [lon, lat] of points) {
    const z = sampler(lon, lat), s = slopeAt(sampler, lon, lat, cell)
    if (z === null || s === null) return null
    elevations.push(z); slopes.push(s)
  }
  const sorted = [...slopes].sort((a, b) => a - b), typical = quantile(sorted, .5)
  return {
    elevation: elevations.reduce((s, z) => s + z, 0) / elevations.length,
    minElevation: Math.min(...elevations), maxElevation: Math.max(...elevations),
    typical, max: sorted.at(-1),
    steepShare: slopes.filter(s => s >= 15).length / slopes.length,
    verySteepShare: slopes.filter(s => s >= 25).length / slopes.length,
    class: slopeClass(typical)?.id ?? null,
    samples: slopes.length,
  }
}

/** Regular elevation grid over bounds, `spacing` metres apart; rows run north to south. Null if any sample is missing. */
export function elevationGrid(sampler, bounds, spacing) {
  const midLat = (bounds[1] + bounds[3]) / 2
  const dLon = spacing / (111320 * Math.cos(midLat * Math.PI / 180)), dLat = spacing / 111320
  const cols = Math.max(2, Math.floor((bounds[2] - bounds[0]) / dLon) + 1), rows = Math.max(2, Math.floor((bounds[3] - bounds[1]) / dLat) + 1)
  const values = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const z = sampler(bounds[0] + c * dLon, bounds[3] - r * dLat)
    if (z === null) return null
    values[r * cols + c] = z
  }
  return { west: bounds[0], north: bounds[3], dLon, dLat, cols, rows, values }
}

// Marching-squares edge table: for each corner mask, pairs of cell edges (0 top, 1 right, 2 bottom, 3 left).
const CASES = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[3, 0]], 8: [[3, 0]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]] }

/** Segments of one contour level through a grid, in grid coordinates [column, row]. */
export function contourSegments(grid, level) {
  const { cols, rows, values } = grid, segments = []
  const at = (c, r) => values[r * cols + c]
  const lerp = (a, b) => (level - a) / (b - a)
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const tl = at(c, r), tr = at(c + 1, r), br = at(c + 1, r + 1), bl = at(c, r + 1)
    const mask = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0)
    const pairs = CASES[mask]
    if (!pairs) continue
    const edge = e => e === 0 ? [c + lerp(tl, tr), r] : e === 1 ? [c + 1, r + lerp(tr, br)] : e === 2 ? [c + lerp(bl, br), r + 1] : [c, r + lerp(tl, bl)]
    for (const [a, b] of pairs) segments.push([edge(a), edge(b)])
  }
  return segments
}

/** Join touching segments into polylines so lines render smoothly and can carry labels. */
export function stitchSegments(segments) {
  const key = p => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`
  const ends = new Map(), used = new Uint8Array(segments.length)
  segments.forEach((s, i) => { for (const p of s) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i) } })
  const next = (point, from) => (ends.get(key(point)) || []).find(i => i !== from && !used[i])
  const lines = []
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const line = [...segments[i]]
    for (const forward of [true, false]) {
      let last = i
      for (;;) {
        const tip = forward ? line.at(-1) : line[0], j = next(tip, last)
        if (j === undefined) break
        used[j] = 1; last = j
        const [a, b] = segments[j], other = key(a) === key(tip) ? b : a
        if (forward) line.push(other); else line.unshift(other)
      }
    }
    lines.push(line)
  }
  return lines
}

/** Contour lines as GeoJSON features with `elevation` (m) and `index` (every `indexEvery` m). */
export function contourFeatures(grid, { interval = 5, indexEvery = 25 } = {}) {
  if (!grid) return []
  let min = Infinity, max = -Infinity
  for (const v of grid.values) { if (v < min) min = v; if (v > max) max = v }
  const features = []
  for (let level = Math.ceil(min / interval) * interval; level <= max; level += interval) {
    for (const line of stitchSegments(contourSegments(grid, level))) {
      if (line.length < 2) continue
      features.push({ type: 'Feature', properties: { elevation: level, index: level % indexEvery === 0, label: `${level} m` },
        geometry: { type: 'LineString', coordinates: line.map(([c, r]) => [grid.west + c * grid.dLon, grid.north - r * grid.dLat]) } })
    }
  }
  return features
}

/** Bounds no wider or taller than `maxMetres`, centred on the original, so tile requests stay small. */
export function clampBounds(bounds, maxMetres = 1500) {
  if (!bounds) return null
  const lat = (bounds[1] + bounds[3]) / 2, lon = (bounds[0] + bounds[2]) / 2
  const halfLon = maxMetres / 2 / (111320 * Math.cos(lat * Math.PI / 180)), halfLat = maxMetres / 2 / 111320
  return [Math.max(bounds[0], lon - halfLon), Math.max(bounds[1], lat - halfLat), Math.min(bounds[2], lon + halfLon), Math.min(bounds[3], lat + halfLat)]
}

export function formatElevation(metres) {
  return Number.isFinite(metres) ? `${Math.round(metres)} m (${Math.round(metres * FEET_PER_METRE).toLocaleString('en-US')} ft)` : '—'
}
