import { localFrame, openRing, outerRing, pointInRing, rayToRing, toPolygon, mixColor } from './localFrame.js'
import { USE_LEGEND } from './buildingUses.js'

/**
 * Display-only architectural massing. Every part stays inside the checked footprint and at or below the modelled
 * height, so the zoning, fit and overlap screens still describe exactly what is drawn.
 */
export const FLOOR_BAND_M = 0.35
export const ROOF_CAP_M = 0.45
const BAND_INSET_M = 0.18
const MASONRY = '#9b5a43', SLATE = '#353b44', STONE = '#8e8578', TRIM = '#f4f1ea', SOLAR = '#23466f', GLASS = '#5d7488'

/** Rectangle frame of a drafted footprint: centre, width axis `u`, depth axis `v`, in local metres. */
export function footprintBox(geometry) {
  const ring = geometry?.type === 'Polygon' ? openRing(geometry.coordinates[0] || []) : []
  if (ring.length !== 4) return null
  const origin = [ring.reduce((n, p) => n + p[0], 0) / 4, ring.reduce((n, p) => n + p[1], 0) / 4]
  const frame = localFrame(origin), [p0, p1, , p3] = ring.map(frame.project)
  const width = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), depth = Math.hypot(p3[0] - p0[0], p3[1] - p0[1])
  if (!(width > .5 && depth > .5)) return null
  const u = [(p1[0] - p0[0]) / width, (p1[1] - p0[1]) / width], v = [(p3[0] - p0[0]) / depth, (p3[1] - p0[1]) / depth]
  if (Math.abs(u[0] * v[0] + u[1] * v[1]) > .02) return null
  return { frame, width, depth, u, v, front: -1 }
}

const OPEN_GAP_M = 40, STREET_GAP_M = 8

/**
 * Which width edge is the front. A display guess: Playhouse does not know legal street frontage. With nearby
 * parcels, the front faces the wider open gap beyond the lot line: a street right-of-way rather than an alley
 * or a back-to-back neighbour. Otherwise it is the edge nearer a lot line.
 */
export function withFront(box, parcelGeometry, neighbors = []) {
  if (!box) return null
  const ring = parcelGeometry ? outerRing(box.frame, parcelGeometry) : null
  if (!ring) return box
  const direction = side => [box.v[0] * side, box.v[1] * side]
  const reach = side => {
    const d = direction(side)
    return rayToRing([d[0] * box.depth / 2, d[1] * box.depth / 2], d, ring)
  }
  const others = neighbors.map(n => outerRing(box.frame, n)).filter(Boolean)
  const gap = (side, lot) => {
    if (lot === null || !others.length) return null
    const d = direction(side), start = [d[0] * (box.depth / 2 + lot - .05), d[1] * (box.depth / 2 + lot - .05)]
    let best = OPEN_GAP_M
    for (const other of others) {
      if (pointInRing(start, other)) return 0
      const t = rayToRing(start, d, other)
      if (t !== null && t < best) best = t
    }
    return best
  }
  const back = reach(-1), ahead = reach(1), backGap = gap(-1, back), aheadGap = gap(1, ahead)
  const wide = Math.max(backGap ?? 0, aheadGap ?? 0)
  const front = backGap !== null && aheadGap !== null && wide >= STREET_GAP_M && Math.abs(aheadGap - backGap) >= 3
    ? (aheadGap > backGap ? 1 : -1)
    : ahead !== null && (back === null || ahead < back) ? 1 : -1
  return { ...box, front, frontReach: front === 1 ? ahead : back }
}

/** Compass bearing for a camera standing out front and looking at the guessed front facade, or null. */
export function facadeBearing(geometry, parcelGeometry, neighbors = []) {
  const box = withFront(footprintBox(geometry), parcelGeometry, neighbors)
  if (!box?.frontReach) return null
  return Math.atan2(-box.v[0] * box.front, -box.v[1] * box.front) * 180 / Math.PI
}

/** Local point from lateral offset `s` (across the width) and distance `f` back from the front edge. */
export function boxPoint(box, s, f) {
  const t = box.front * (box.depth / 2 - f)
  return [box.u[0] * s + box.v[0] * t, box.u[1] * s + box.v[1] * t]
}

/** Rectangle between lateral offsets s0..s1 and front distances f0..f1 (f may be negative: in front of the building). */
export function slab(box, s0, s1, f0, f1) {
  return [boxPoint(box, s0, f0), boxPoint(box, s1, f0), boxPoint(box, s1, f1), boxPoint(box, s0, f1)]
}

/** Material tones. A warning or pending state keeps its own hue on every part, so review states stay unmistakable. */
export function massingPalette(color, state = 'placed') {
  if (state !== 'placed') return {
    body: color, alt: mixColor(color, '#ffffff', .14), masonry: mixColor(color, '#000000', .22), band: mixColor(color, '#000000', .48),
    roof: mixColor(color, '#000000', .38), trim: mixColor(color, '#ffffff', .4), stone: mixColor(color, '#000000', .3),
    solar: mixColor(color, '#0b1d33', .55), mech: mixColor(color, '#ffffff', .25), glass: mixColor(color, '#000000', .55),
  }
  return {
    body: color, alt: mixColor(color, '#ffffff', .2), masonry: mixColor(color, MASONRY, .55), band: mixColor(color, SLATE, .72),
    roof: mixColor(color, SLATE, .78), trim: mixColor(color, TRIM, .7), stone: mixColor(color, STONE, .65),
    solar: SOLAR, mech: mixColor(color, '#b4bcc6', .7), glass: mixColor(color, GLASS, .75),
  }
}

function floorCount(floors, wallTop) {
  return Number.isInteger(floors) && floors > 0 ? floors : Math.max(1, Math.round(wallTop / 3))
}

/**
 * Architectural parts for one drafted or placed building: { geometry, base, top, color, part }.
 * `state`: 'placed' for material tones, or 'valid' / 'invalid' / 'pending' for preview tones.
 */
export function architecturalMassing({ geometry, typeId, height, floors, color, state = 'placed', parcel = null, neighbors = [], stairs = 1 }) {
  const box = withFront(footprintBox(geometry), parcel, neighbors)
  if (!box || !(height > 0)) return geometry && height > 0 ? [{ geometry, base: 0, top: height, color, part: 'body' }] : []
  const p = massingPalette(color, state), parts = []
  const W = box.width, D = box.depth, hw = W / 2
  const add = (part, ring, base, top, tone, holes = []) => {
    if (top - base > .01) parts.push({ geometry: toPolygon(box.frame, ring, ...holes), base: +base.toFixed(3), top: +Math.min(top, height).toFixed(3), color: tone, part })
  }
  const inset = (amount, size) => Math.min(amount, size * .1)
  /** Story plates with recessed spandrel bands between them; the top story carries no band (the roof caps it). */
  const tiers = (s0, s1, f0, f1, base, top, count, tone, startFloor = 0) => {
    const step = (top - base) / count, band = step > 1.2 ? FLOOR_BAND_M : 0
    for (let i = 0; i < count; i++) {
      const b = base + i * step, t = b + step, last = i === count - 1
      add(`floor-${startFloor + i + 1}`, slab(box, s0, s1, f0, f1), b, last || !band ? t : t - band, tone)
      if (!last && band) {
        const k = inset(BAND_INSET_M, Math.min(s1 - s0, f1 - f0))
        add('band', slab(box, s0 + k, s1 - k, f0 + k, f1 - k), t - band, t, p.band)
      }
    }
  }
  const type = typeId === 'adu' ? 'single_family' : typeId === 'apartment' ? 'small_apartment' : typeId

  if (type === 'single_family') {
    const rise = Math.min(2.4, height * .3), wallTop = height - rise
    const porch = D >= 7 ? Math.min(2.2, Math.max(1.8, D * .18)) : D * .2
    const porchTop = Math.min(3, wallTop * .9)
    tiers(-hw, hw, porch, D, 0, wallTop, floorCount(floors, wallTop), p.body)
    add('porch-deck', slab(box, -hw * .86, hw * .86, 0, porch), 0, .45, p.masonry)
    const post = Math.min(.24, W * .04)
    for (const s of [-hw * .86, hw * .86 - post]) add('porch-post', slab(box, s, s + post, .05, .05 + post), .45, porchTop - .3, p.trim)
    add('porch-roof', slab(box, -hw * .9, hw * .9, 0, porch), porchTop - .3, porchTop, p.roof)
    // Stepped tiers read as a front-gabled pitched roof without sloped geometry.
    for (let i = 0; i < 3; i++) {
      const half = hw * (1 - i / 3)
      add('roof', slab(box, -half, half, porch, D), wallTop + rise * i / 3, wallTop + rise * (i + 1) / 3, i % 2 ? mixColor(p.roof, '#000000', .12) : p.roof)
    }
  } else if (type === 'townhouse_duplex') {
    const cap = Math.min(.6, height * .08), wallTop = height - cap, stoop = Math.min(1.4, D * .12)
    const k = inset(.2, W), count = floorCount(floors, wallTop), wall = Math.min(.3, W * .05)
    tiers(-hw + k, -wall / 2, stoop + k, D - k, 0, wallTop, count, p.body)
    tiers(wall / 2, hw - k, stoop + k, D - k, 0, wallTop, count, p.alt)
    add('party-wall', slab(box, -wall / 2, wall / 2, stoop, D), 0, wallTop, p.trim)
    add('cornice', slab(box, -hw, hw, stoop, D), wallTop, height, p.roof)
    for (const centre of [-hw / 2, hw / 2]) {
      const half = Math.min(.8, W * .09)
      add('stoop', slab(box, centre - half, centre + half, 0, stoop + k), 0, .35, p.stone)
      add('stoop', slab(box, centre - half, centre + half, stoop * .5, stoop + k), .35, .7, p.stone)
    }
  } else if (type === 'triplex') {
    const cap = Math.min(.6, height * .06), wallTop = height - cap, count = floorCount(floors, wallTop), step = wallTop / count
    const recess = Math.min(1.2, D * .08), k = inset(.15, W)
    add('base', slab(box, -hw, hw, 0, D), 0, step - (count > 1 ? FLOOR_BAND_M : 0), p.masonry)
    if (count > 1) {
      add('band', slab(box, -hw + k, hw - k, k, D - k), step - FLOOR_BAND_M, step, p.band)
      tiers(-hw + k, hw - k, recess, D - k, step, wallTop, count - 1, p.body, 1)
      for (let i = 1; i < count; i++) {
        const level = i * step
        add('balcony', slab(box, -hw * .7, hw * .7, 0, recess), level, level + .22, p.trim)
        add('railing', slab(box, -hw * .7, hw * .7, 0, .1), level + .22, level + 1.05, p.glass)
      }
    }
    add('roof-cap', slab(box, -hw, hw, 0, D), wallTop, height, p.roof)
  } else if (type === 'small_apartment' || type === 'large_apartment') {
    const podium = Math.min(3.8, height * .35), penthouse = height >= 9 ? 2.2 : 0
    const deck = height - (penthouse || .9), k = inset(.45, Math.min(W, D)), count = floorCount(floors, deck)
    add('podium', slab(box, -hw, hw, 0, D), 0, podium - FLOOR_BAND_M, p.stone)
    add('band', slab(box, -hw + k / 2, hw - k / 2, k / 2, D - k / 2), podium - FLOOR_BAND_M, podium, p.band)
    if (count > 1 && deck > podium + 1) tiers(-hw + k, hw - k, k, D - k, podium, deck, count - 1, p.body, 1)
    const t = Math.min(.25, W * .03)
    add('parapet', slab(box, -hw + k, hw - k, k, D - k), deck, deck + .9, p.trim, [slab(box, -hw + k + t, hw - k - t, k + t, D - k - t).reverse()])
    if (penthouse) {
      const ph = Math.min(2.5, W * .15), pd = Math.min(4.5, D * .22)
      add('penthouse', slab(box, -ph, ph, D - k - .8 - pd, D - k - .8), deck, height, p.mech)
      if (stairs >= 2) add('penthouse', slab(box, -ph, ph, k + .8, k + .8 + pd), deck, height, p.mech)
      const start = stairs >= 2 ? k + 1.6 + pd : k + 1.2
      const cols = Math.max(1, Math.min(6, Math.floor((W - 2 * k - 2.4) / 1.4))), rows = Math.max(stairs >= 2 ? 0 : 1, Math.min(4, Math.floor((D / 2 - start) / 2.2)))
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const s = -((cols - 1) * 1.4) / 2 + c * 1.4, f = start + r * 2.2
        add('solar', slab(box, s - .5, s + .5, f, f + 1.7), deck + .25, deck + .5, p.solar)
      }
    }
  } else {
    const cap = Math.min(.5, height * .06)
    tiers(-hw, hw, 0, D, 0, height - cap, floorCount(floors, height - cap), p.body)
    add('roof-cap', slab(box, -hw, hw, 0, D), height - cap, height, p.roof)
  }
  // Ground-level footprint rim in the state colour; ground lines are hidden beneath raised yards.
  if (state !== 'placed') add('state-rim', slab(box, -hw, hw, 0, D), 0, .5, color, [slab(box, -hw + .25, hw - .25, .25, D - .25).reverse()])
  return parts
}

/** Recorded-use facade tint (warm masonry) and charcoal roof cap for existing County outlines. Legend hues stay recognisable. */
export const EXISTING_TONES = Object.fromEntries(USE_LEGEND.map(use => [use.id, { facade: mixColor(use.color, '#d9c8ad', .2), roof: mixColor(use.color, '#2f343b', .62) }]))
const tonesExpression = key => ['match', ['coalesce', ['get', 'use_color'], ''], ...USE_LEGEND.flatMap(use => [use.color, EXISTING_TONES[use.id][key]]), EXISTING_TONES.unknown[key]]
export const EXISTING_FACADE_COLOR = tonesExpression('facade')
export const EXISTING_ROOF_COLOR = tonesExpression('roof')
