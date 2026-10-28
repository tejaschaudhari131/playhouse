import { BUILDING_IDS } from './buildings.js'
import { optionFor } from './plannerState.js'
import { housingPermission, housingSpec } from './titleNine.js'
import { zoningBadge, zoningReviewLabel, proposalStatus, proposalChecks } from './studioPresentation.js'

const PERMISSION_SHORT = {
  permitted: 'Use permitted',
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
    const badge = evaluated ? zoningBadge(evaluated) : null
    const status = !evaluated ? 'unscored' : !evaluated.eligible ? 'review' : Number.isFinite(evaluated.total) ? 'scored' : 'noscore'
    const conflicts = (evaluated?.titleNine?.checks || []).filter(check => check.status === 'conflict')
    const physical = evaluated ? proposalChecks(evaluated).find(check => check.id === 'physical') : null
    const shortPermission = PERMISSION_SHORT[permission.category] || PERMISSION_SHORT.unknown
    const blockedBy = conflicts.length || evaluated?.titleNine?.conflict
      ? physical?.status === 'fail' ? 'Fit + zoning conflict' : 'Zoning conflict'
      : evaluated?.area?.invalid?.length ? 'Plan needs review'
      : physical?.status === 'fail' ? 'Doesn’t fit'
      : physical?.status === 'unknown' ? 'Fit unassessed' : 'Needs review'
    const notAssessed = !evaluated ? null : Number.isInteger(evaluated.zoningReview?.notAssessed) ? evaluated.zoningReview.notAssessed
      : evaluated.titleNine ? (evaluated.titleNine.excluded || (evaluated.titleNine.checks || []).filter(check => ['unknown', 'conditional'].includes(check.status))).length : null
    const reviewText = notAssessed === null ? 'Checks unassessed' : notAssessed ? `${notAssessed} ${notAssessed === 1 ? 'check' : 'checks'} unassessed` : 'Supported checks assessed'
    const details = conflicts.map(check => ({ text: `${check.label}: ${check.detail}`, url: check.url, section: check.section }))
    if (physical && physical.status !== 'pass') details.push({ text: `Physical fit: ${physical.detail}` })
    for (const member of evaluated?.area?.invalid || []) details.push({ text: `Planned building on ${member.pin}: ${member.gate}` })
    return {
      typeId, active, label: spec.label, shortLabel: spec.label.replace(/ \(.*\)$/, ''), units: spec.units,
      width: option.width, depth: option.depth, floors: option.floors ?? spec.floors,
      permission: { category: badge?.tone || permission.category, label: badge?.text || PERMISSION_SHORT[permission.category] || PERMISSION_SHORT.unknown, detail: permission.label },
      review: evaluated ? zoningReviewLabel(evaluated) : 'This type has not been evaluated.',
      reviewText, notAssessed, planScope: (evaluated?.area?.buildings || 0) > 1,
      compactStatus: status === 'review' ? blockedBy : shortPermission,
      details,
      statusDetail: evaluated ? proposalStatus(evaluated) : null,
      status, score: status === 'scored' ? evaluated.total : null,
      statusText: status === 'scored' ? `${Math.round(evaluated.total)} / 100` : status === 'review' ? 'Not ranked · needs review' : status === 'noscore' ? 'No score' : 'Not scored yet',
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

/** Cardinal moves use map metres, independent of the camera bearing. */
export function nudgePlacement(placement, key, step = 1) {
  const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[key]
  if (!delta) return null
  return { ...placement, east: round1(Math.max(-2000, Math.min(2000, placement.east + delta[0]))), north: round1(Math.max(-2000, Math.min(2000, placement.north + delta[1]))) }
}

/** The preview pauses right after an add until the draft, site or plan changes. */
export const draftKey = draft => JSON.stringify(draft)
export function previewPaused(added, scenario) {
  return !!added && added.pin === scenario.pin && scenario.buildings?.some(b => b.id === added.id) && added.draft === draftKey(scenario.draft)
}
