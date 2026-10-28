import { PLACEMENT_COLORS } from './buildingUses.js'

/** Hover geometry must replace the old fit gate in every placement control. */
export function previewAtPlacement(option, massing, titleNine) {
  if (!option || !massing) return option
  const physicalEligible = massing.fits && massing.collisions === 0
  const conflict = titleNine?.checks?.find(c => c.status === 'conflict')
  return { ...option, massing, titleNine, physicalEligible,
    eligible: physicalEligible && !titleNine?.conflict && !option.area?.invalid?.length,
    gate: !massing.fits ? 'Footprint does not fit' : massing.collisions === null ? 'Building overlap check unavailable' : massing.collisions > 0 ? 'Building or infrastructure overlap' : titleNine?.conflict ? `Zoning conflict: ${conflict?.label || 'review required'}` : 'No supported conflict found' }
}

/** A visible draft is not a committed building or a passing placement check. */
export function draftPreview(option, pending = false) {
  if (!option?.massing?.geometry) return null
  const valid = option.massing.fits && option.massing.collisions === 0 && (option.titleNine ? !option.titleNine.conflict : option.permission?.category === 'permitted')
  return { type: 'Feature', geometry: option.massing.geometry, properties: {
    height: option.height,
    color: pending ? '#94a3b8' : valid ? PLACEMENT_COLORS.valid : PLACEMENT_COLORS.invalid,
    status: pending ? 'Checking placement…' : option.titleNine?.conflict ? 'Zoning conflict · no housing score' : valid ? (option.titleNine?.excluded.length ? 'No supported conflict · some checks not assessed' : 'Placement screen passed') : 'Placement needs review',
  } }
}
