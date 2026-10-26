import { BUILDING_IDS } from './buildings.js'
import { optionFor } from './plannerState.js'
import { housingPermission, housingSpec } from './titleNine.js'

const PERMISSION_SHORT = {
  permitted: 'Permitted',
  partial: 'Some unit counts',
  special: 'Special approval',
  not_permitted: 'Needs zoning change',
  unknown: 'Zoning unknown',
}

/** One scannable card per housing type. Scores come only from the current evaluation; nothing is estimated here. */
export function typologyCards({ draft, options, code, zoning }) {
  return BUILDING_IDS.map(typeId => {
    const active = typeId === draft.typeId
    const option = active ? draft : optionFor(typeId, draft.rent)
    const spec = housingSpec(option), evaluated = options?.[typeId]
    const permission = housingPermission(option, code, zoning)
    const status = !evaluated ? 'unscored' : !evaluated.eligible ? 'review' : Number.isFinite(evaluated.total) ? 'scored' : 'noscore'
    return {
      typeId, active, label: spec.label, units: spec.units,
      width: option.width, depth: option.depth, floors: option.floors ?? spec.floors,
      permission: { category: permission.category, label: PERMISSION_SHORT[permission.category] || PERMISSION_SHORT.unknown, detail: permission.label },
      status, score: status === 'scored' ? evaluated.total : null,
      statusText: status === 'scored' ? `${Math.round(evaluated.total)} / 100` : status === 'review' ? 'Needs review' : status === 'noscore' ? 'No score' : 'Not scored yet',
    }
  })
}

const LIMITS = { width: [2, 100], depth: [2, 100], floors: [1, 60] }
const round1 = value => Math.round(value * 10) / 10

/** Quick-size step for the draft. Stories keep the draft's height per floor. Returns null at a limit. */
export function resizeDraft(option, key, delta) {
  const [min, max] = LIMITS[key] || []
  if (min === undefined || !Number.isFinite(delta)) return null
  const floors = option.floors ?? housingSpec(option).floors
  const current = key === 'floors' ? floors : option[key]
  const value = key === 'floors' ? Math.round(current + delta) : round1(current + delta)
  if (!Number.isFinite(value) || value < min || value > max || value === current) return null
  if (key !== 'floors') return { [key]: value }
  const height = round1(Math.min(100, Math.max(3, option.height / floors * value)))
  return { floors: value, height }
}

/** Rotation from the effective placement, so an automatic fit becomes an exact manual one. */
export function rotatePlacement(placement, degrees) {
  const base = placement || { east: 0, north: 0, bearing: 0 }
  return { ...base, bearing: round1(((base.bearing + degrees) % 360 + 360) % 360) }
}

/** The preview pauses right after an add until the draft, site or plan changes. */
export const draftKey = draft => JSON.stringify(draft)
export function previewPaused(added, scenario) {
  return !!added && added.pin === scenario.pin && scenario.buildings?.at(-1)?.id === added.id && added.draft === draftKey(scenario.draft)
}
