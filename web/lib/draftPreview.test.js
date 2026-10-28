import test from 'node:test'
import assert from 'node:assert/strict'
import { draftPreview } from './draftPreview.js'
import { fitMassing, rectangleAt } from './plannerGeometry.js'
import { PLACEMENT_COLORS } from './buildingUses.js'

test('oversized and overlapping drafts stay visible at their actual dimensions without committing', () => {
  const parcel = rectangleAt([-79.94, 40.41], 20, 20)
  for (const massing of [fitMassing(parcel, 40, 50, null, []), fitMassing(parcel, 8, 12, null, [{ geometry: parcel }])]) {
    const option = { height: 24, massing, permission: { category: 'permitted' } }
    const before = structuredClone(option)
    const preview = draftPreview(option)
    assert.deepEqual(preview.geometry, massing.geometry)
    assert.equal(preview.properties.height, 24)
    assert.equal(preview.properties.color, PLACEMENT_COLORS.invalid)
    assert.deepEqual(option, before)
  }
})

test('preview distinguishes passed checks, unknown context, nonpermitted use, and pending checks', () => {
  const massing = fitMassing(rectangleAt([-79.94, 40.41], 40, 40), 8, 12, null, [])
  const option = { height: 8, massing, permission: { category: 'permitted' } }
  assert.equal(draftPreview(option).properties.color, PLACEMENT_COLORS.valid)
  assert.equal(draftPreview({ ...option, massing: { ...massing, collisions: null } }).properties.color, PLACEMENT_COLORS.invalid)
  assert.equal(draftPreview({ ...option, permission: { category: 'not_permitted' } }).properties.color, PLACEMENT_COLORS.invalid)
  assert.equal(draftPreview(option, true).properties.status, 'Checking placement…')
  assert.equal(draftPreview(null), null)
  assert.equal(draftPreview({ massing: { geometry: null } }), null)
})

test('supported zoning conflicts turn a fitting draft red; excluded rules do not', () => {
  const massing = fitMassing(rectangleAt([-79.94, 40.41], 40, 40), 8, 12, null, [])
  const option = { height: 20, massing, permission: { category: 'permitted' }, titleNine: { conflict: true, excluded: ['overlays'] } }
  const blocked = draftPreview(option)
  assert.equal(blocked.properties.color, PLACEMENT_COLORS.invalid)
  assert.match(blocked.properties.status, /Zoning conflict/)
  const partial = draftPreview({ ...option, titleNine: { conflict: false, excluded: ['overlays'] } })
  assert.equal(partial.properties.color, PLACEMENT_COLORS.valid)
  assert.match(partial.properties.status, /not assessed/)
  assert.equal(draftPreview(option, true).properties.status, 'Checking placement…')
})

test('hovered overlap and zoning replace the stale passing placement gate', async () => {
  const { previewAtPlacement } = await import('./draftPreview.js')
  const { draftStatus } = await import('./plannerStatus.js')
  const base = { physicalEligible: true, eligible: true, total: 70 }
  const zoning = { conflict: false, excluded: [], checks: [] }
  for (const massing of [{ fits: false, collisions: 0 }, { fits: true, collisions: 1 }, { fits: true, collisions: null }]) {
    const preview = previewAtPlacement(base, massing, zoning)
    assert.equal(draftStatus({ evaluated: preview, proposal: preview, weights: {} }).canPlace, false)
    assert.equal(preview.eligible, false)
  }
  const blocked = previewAtPlacement(base, { fits: true, collisions: 0 }, { ...zoning, conflict: true, checks: [{ status: 'conflict', label: 'Height' }] })
  assert.equal(draftStatus({ evaluated: blocked, proposal: blocked, weights: {} }).canPlace, false)
  assert.match(blocked.gate, /Height/)
  const cleared = previewAtPlacement({ ...base, eligible: false }, { fits: true, collisions: 0 }, zoning)
  assert.equal(draftStatus({ evaluated: cleared, proposal: cleared, weights: {} }).canPlace, true)
})
