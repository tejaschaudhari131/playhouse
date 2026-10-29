import { cleanRing, insetRing, localFrame, outerRing, polygons, toPolygon } from './localFrame.js'
import { districtStandards } from './titleNineRules.js'
import { AFFORDABLE_BONUS, BONUS_DISTRICTS, REFORM_STATUS_TEXT, presetById } from './policyReform.js'
import { BUILDINGS } from './buildings.js'
import { YARD_TOP_M } from './streetscape3d.js'

const FT = .3048
const ENVELOPE = '#2f6fb0', GHOST = '#8a96a6', PAD = '#eef2e4', PAD_RIM = '#5a86b8'

/**
 * Height limit drawn on the selected lot for the draft type under a reform preset. Only the Affordable Housing
 * Bonus in Bill 2025-1545 changes height; the other presets lift use and lot rules, so their envelope is unchanged.
 */
export function envelopeHeight(code, presetId = 'current', typeId = null) {
  const district = districtStandards(code)
  if (!district?.height) return null
  const preset = presetById(presetId), units = BUILDINGS[typeId]?.units ?? 0
  const bonusFt = preset.rules.includes('affordable-bonus') && BONUS_DISTRICTS.test(code || '') && units >= AFFORDABLE_BONUS.minUnits
    ? AFFORDABLE_BONUS.points * AFFORDABLE_BONUS.feetPerPoint : 0
  const heightFt = district.height + bonusFt
  return {
    preset: preset.id, presetLabel: preset.label, status: preset.status, section: district.section,
    baseFt: district.height, bonusFt, heightFt, baseM: district.height * FT, heightM: heightFt * FT,
    text: bonusFt
      ? `Height limit ${heightFt} ft: ${district.height} ft (§ ${district.section}) + ${bonusFt} ft Affordable Housing Bonus (§ 915.07) if 10% of homes rent at or below 50% AMI for 20 years · ${preset.label}, ${REFORM_STATUS_TEXT[preset.status].toLowerCase()}`
      : `Height limit ${heightFt} ft (§ ${district.section}) · ${preset.id === 'current' ? 'Current Code' : `unchanged by ${preset.label}`}`,
  }
}

/** Long-axis direction of a lot ring: the long side of its minimum-area oriented rectangle. */
function longAxis(ring) {
  let best = null
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length < .1) continue
    const c = (b[0] - a[0]) / length, s = (b[1] - a[1]) / length
    const along = ring.map(([x, y]) => x * c + y * s), across = ring.map(([x, y]) => -x * s + y * c)
    const l = Math.max(...along) - Math.min(...along), w = Math.max(...across) - Math.min(...across)
    if (!best || l * w < best.area) best = { area: l * w, dir: l >= w ? [c, s] : [-s, c] }
  }
  return best?.dir || [1, 0]
}

/**
 * Estimated buildable pad: the lot's two narrow ends are inset by the larger of the front and rear yards, its long
 * sides by the interior side yard. Legal frontage, corner (exterior) yards and contextual setbacks are not classified.
 */
export function setbackPad(parcelGeometry, yards) {
  const parts = polygons(parcelGeometry)
  if (!parts.length || !Array.isArray(yards) || yards.length < 4) return null
  const frame = localFrame(parts[0][0][0]), lot = outerRing(frame, parcelGeometry)
  if (!lot) return null
  const ring = cleanRing(lot), axis = longAxis(ring)
  const endFt = Math.max(yards[0], yards[1]), sideFt = yards[3]
  const pad = insetRing(ring, (i, a, b) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), alignment = Math.abs(((b[0] - a[0]) * axis[0] + (b[1] - a[1]) * axis[1]) / length)
    return (alignment >= Math.SQRT1_2 ? sideFt : endFt) * FT + 1e-3
  })
  return { frame, lot: ring, pad, endFt, sideFt }
}

const feature = (geometry, base, top, color, part) => ({ type: 'Feature', properties: { base, top, color, part }, geometry })

function postRing([x, y], size = .32) {
  const h = size / 2
  return [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]]
}

function frameRing(frame, ring, base, top, color, part) {
  const inner = insetRing(ring, () => .3)
  return inner ? [feature(toPolygon(frame, ring, inner.reverse()), base, top, color, part)] : []
}

/**
 * Ground pad (for the site-ground layer) plus corner posts and a top frame at the height limit (for the translucent
 * envelope layer). A lower grey frame marks Current Code when a preset raises the limit.
 */
export function envelopeFeatures({ parcel, yards, heightM, ghostHeightM = null }) {
  const result = setbackPad(parcel, yards)
  if (!result || !(heightM > 0)) return { ground: [], envelope: [], pad: false }
  const { frame, lot, pad } = result, outline = pad || lot
  const ground = pad ? [feature(toPolygon(frame, pad), YARD_TOP_M - .01, YARD_TOP_M + .05, PAD, 'pad'), ...frameRing(frame, pad, YARD_TOP_M, YARD_TOP_M + .1, PAD_RIM, 'pad-rim')] : []
  const step = Math.max(1, Math.ceil(outline.length / 12))
  const envelope = [
    ...outline.filter((_, i) => i % step === 0).map(p => feature(toPolygon(frame, postRing(p)), 0, heightM, ENVELOPE, 'post')),
    ...frameRing(frame, outline, heightM - .25, heightM, ENVELOPE, 'frame'),
    ...(ghostHeightM > 0 && ghostHeightM < heightM - .1 ? frameRing(frame, outline, ghostHeightM - .2, ghostHeightM, GHOST, 'current-code') : []),
  ]
  return { ground, envelope, pad: !!pad, endFt: result.endFt, sideFt: result.sideFt }
}
