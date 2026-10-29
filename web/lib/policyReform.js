import { districtStandards, codeLink } from './titleNineRules.js'

const FT = 1 / 0.3048
const LEGISTAR_1545 = 'https://pittsburgh.legistar.com/LegislationDetail.aspx?ID=7147499&GUID=C15553FF-85B6-480E-ACFF-53F40EF99EA9'
export const BONUS_DISTRICTS = /^(RM-(VL|L|M|H|VH)|NDO|LNC|NDI|UNC|UI)$/
/** Affordable Housing Bonus, June 2026 draft: base 2 points for 10% of rental homes at or below 50% AMI; 1 point = 15 ft. */
export const AFFORDABLE_BONUS = { points: 2, feetPerPoint: 15, storiesPerPoint: 1, minUnits: 4 }
export const STARTER_LOT_SQFT = 1800

/** One rule a preset can lift. `lifts` sees a conflicting Title Nine check and the option's context. */
const RULES = {
  'parking-min': { section: '914.02', source: 'parking', text: 'No minimum off-street parking (maximums stay)',
    lifts: check => check.id === 'parking-min' },
  'affordable-bonus': { section: '915.07', source: 'environment', condition: 'if 10% of homes rent at or below 50% AMI for 20 years',
    text: `Affordable Housing Bonus: ${AFFORDABLE_BONUS.points} performance points × ${AFFORDABLE_BONUS.feetPerPoint} ft of height in districts allowing 4+ homes`,
    lifts: (check, ctx) => {
      if (!BONUS_DISTRICTS.test(ctx.code || '') || ctx.units < AFFORDABLE_BONUS.minUnits || !ctx.district) return false
      if (check.id === 'height') return ctx.heightFt <= ctx.district.height + AFFORDABLE_BONUS.points * AFFORDABLE_BONUS.feetPerPoint + 1e-7
      if (check.id === 'stories') return ctx.district.stories && ctx.floors <= ctx.district.stories + AFFORDABLE_BONUS.points * AFFORDABLE_BONUS.storiesPerPoint
      return false
    } },
  adu: { section: '912', source: 'use', text: 'Up to two accessory dwelling units per residential lot', lifts: () => false },
  'missing-middle-use': { section: '911.02', source: 'use', text: '2–4 homes by right in R1D, R1A and R2',
    lifts: (check, ctx) => check.id === 'use' && /^(R1D|R1A|R2)-/.test(ctx.code || '') && ctx.units <= 4 },
  'starter-lot': { section: '903.03.B', source: 'residential', text: `-L minimum lot size 3,000 → ${STARTER_LOT_SQFT.toLocaleString()} sq ft`,
    lifts: (check, ctx) => check.id === 'lot' && /-L$/.test(ctx.code || '') && ctx.lotSqft >= STARTER_LOT_SQFT },
  'use-all': { section: '911.02', source: 'use', text: 'Every housing type permitted by right', lifts: check => check.id === 'use' },
  'lot-all': { section: '903.03', source: 'residential', text: 'No minimum lot size', lifts: check => check.id === 'lot' },
}

export const REFORM_PRESETS = [
  { id: 'current', label: 'Current Code (Title Nine)', status: 'adopted', rules: [],
    summary: 'Title Nine as screened here, including the minimum lot sizes adopted in Bill 2025-1579 (May 2025), which also removed minimum lot area per unit.' },
  { id: 'bill-2025-1545', label: 'Council Bill 2025-1545 (Pending Reform)', status: 'pending', url: LEGISTAR_1545, rules: ['adu', 'parking-min', 'affordable-bonus'],
    summary: 'Held in Council. Allows up to two ADUs per residential lot, removes minimum off-street parking (§ 914), and adds an Affordable Housing Bonus of 15 ft per performance point (§ 915.07).' },
  { id: 'missing-middle', label: 'Missing-Middle & Starter-Home Lot Reform', status: 'hypothetical', rules: ['missing-middle-use', 'starter-lot'],
    summary: `Hypothetical: 2–4 homes by right in R1D, R1A and R2 (§ 911.02) and a ${STARTER_LOT_SQFT.toLocaleString()} sq ft minimum lot in -L subdistricts (§ 903.03.B). Minimum lot area per unit is already gone (Bill 2025-1579).` },
  { id: 'by-right', label: 'Full By-Right Upzoning', status: 'hypothetical', rules: ['use-all', 'lot-all', 'parking-min'],
    summary: 'Hypothetical: every housing type permitted by right, no minimum lot size and no parking minimum. Height, floor area, coverage, setbacks and fit still apply.' },
]
export const REFORM_STATUS_TEXT = { adopted: 'Adopted law', pending: 'Pending · not law', hypothetical: 'Hypothetical · not proposed legislation' }
export const presetById = id => REFORM_PRESETS.find(p => p.id === id) || REFORM_PRESETS[0]

function context(option, code) {
  return { code, district: districtStandards(code), units: option.units ?? 0, floors: option.floors ?? null,
    heightFt: Number.isFinite(option.height) ? option.height * FT : Infinity, lotSqft: option.titleNine?.totals?.lotSqft ?? null }
}

/**
 * One option under one preset. Only conflicts a preset rule names are lifted; physical fit,
 * every other Title Nine conflict and placed-building reviews still apply. Never a ranking.
 */
export function simulateReform(option, presetId, code = option?.titleNine?.district ?? null) {
  const preset = presetById(presetId), ctx = context(option || {}, code)
  const conflicts = (option?.titleNine?.checks || []).filter(c => c.status === 'conflict')
  const lifted = [], remaining = []
  for (const check of conflicts) {
    const ruleId = preset.rules.find(id => RULES[id].lifts(check, ctx))
    if (ruleId) lifted.push({ check, rule: { id: ruleId, ...RULES[ruleId] } })
    else remaining.push(check)
  }
  const placedReview = option?.area?.invalid?.length || 0
  const eligible = !!option?.physicalEligible && !remaining.length && !placedReview
  return { preset: preset.id, lifted, remaining, placedReview, eligible, newlyEligible: eligible && !option?.eligible }
}

/** Parcel-level summary: which Title Nine rules a preset unlocks here, and how many more types and homes pass every assessed check. */
export function reformSummary(options = [], presetId, code) {
  const preset = presetById(presetId)
  const results = options.map(option => ({ typeId: option.typeId, label: option.label, units: option.units, before: !!option.eligible, ...simulateReform(option, presetId, code) }))
  const rules = new Map()
  for (const r of results) for (const { rule, check } of r.lifted) {
    if (!rules.has(rule.id)) rules.set(rule.id, { id: rule.id, section: rule.section, text: rule.text, condition: rule.condition || null, url: codeLink(rule.source), checks: new Set(), types: [] })
    const entry = rules.get(rule.id)
    entry.checks.add(check.label)
    if (!entry.types.includes(r.label)) entry.types.push(r.label)
  }
  const residential = /^(R1D|R1A|R2|R3|RM)-/.test(code || '')
  const aduLot = preset.rules.includes('adu') && residential
  const singleUnit = results.some(r => r.eligible && r.units === 1)
  const maxUnits = list => list.reduce((n, r) => Math.max(n, r.units ?? 0), 0)
  const before = results.filter(r => r.before), after = results.filter(r => r.eligible)
  return {
    preset, results,
    rules: [...rules.values()].map(r => ({ ...r, checks: [...r.checks] })),
    adu: aduLot ? { homes: 2, withSingleUnit: singleUnit, text: RULES.adu.text, section: RULES.adu.section } : null,
    permittedBefore: before.length, permittedAfter: after.length,
    addedTypes: results.filter(r => r.newlyEligible).map(r => r.label),
    maxHomesBefore: maxUnits(before), maxHomesAfter: Math.max(maxUnits(after), aduLot && singleUnit ? 3 : 0),
  }
}
