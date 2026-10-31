import { geometryCenter } from './plannerGeometry.js'

/** Pointer travel (CSS px) before a press becomes a drag; MapLibre's own click tolerance is 3 px. */
export const DRAG_THRESHOLD_PX = 4
/** Dropped positions snap to half a metre so saved plans and undo steps stay readable. */
export const DRAG_SNAP_M = .5
const METRES = 111320

const metresPerDegree = latitude => [METRES * Math.cos(latitude * Math.PI / 180), METRES]

/**
 * A press on a draggable building: what is being moved, where the pointer grabbed it and the placement it had.
 * `placement` is the building's `{ east, north, bearing }` offset (m) from its parcel's centre.
 */
export function startDrag({ kind, id = null, pin, pointer, px, placement, parcel }) {
  const origin = geometryCenter(parcel)
  if (!origin || !placement || ![placement.east, placement.north].every(Number.isFinite) || !pointer || !px) return null
  return { kind, id, pin, pointer, px, placement: { bearing: 0, ...placement }, origin, moved: false }
}

/** Has the pointer travelled far enough to count as a drag rather than a click? Once true, it stays true. */
export function dragMoved(state, px, threshold = DRAG_THRESHOLD_PX) {
  return !!state && (state.moved || Math.hypot(px[0] - state.px[0], px[1] - state.px[1]) >= threshold)
}

/** Placement under the pointer, keeping the grab offset so the building does not jump to centre on the cursor. */
export function dragPlacement(state, pointer, snap = 0) {
  const [x, y] = metresPerDegree(state.origin[1])
  const round = value => snap > 0 ? Math.round(value / snap) * snap : value
  return {
    east: round(state.placement.east + (pointer[0] - state.pointer[0]) * x),
    north: round(state.placement.north + (pointer[1] - state.pointer[1]) * y),
    bearing: state.placement.bearing,
  }
}

/** Lon/lat of a placement's centre on its parcel: the inverse of `placementAt`. */
export function placementCenter(parcel, placement) {
  const origin = geometryCenter(parcel)
  if (!origin || !placement) return null
  const [x, y] = metresPerDegree(origin[1])
  return [origin[0] + placement.east / x, origin[1] + placement.north / y]
}

/**
 * Accept a drop only where the footprint fits the parcel and touches no other building or reservation. The draft may
 * land on existing buildings (`allowCollisions`) so the demolish-and-replace prompt can follow; placed buildings may not.
 */
export function dropVerdict(fit, { allowCollisions = false } = {}) {
  if (!fit?.geometry) return { ok: false, reason: 'The building could not be placed there.' }
  if (!fit.fits) return { ok: false, reason: 'That spot crosses the parcel boundary. The building stays where it was.' }
  if (!allowCollisions && fit.collisions > 0) return { ok: false, reason: 'That spot overlaps another building or reserved area. The building stays where it was.' }
  return { ok: true, reason: null }
}

/** Obstacles for moving one placed building: everything except the building itself. */
export function obstaclesExcept(obstacles, id) {
  return obstacles === null ? null : obstacles.filter(o => o.id !== id)
}
