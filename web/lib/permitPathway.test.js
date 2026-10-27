import test from 'node:test'
import assert from 'node:assert/strict'
import { acquisitionPathway, zoningPathway, reliefFor, varianceWorksheet, permitPathway, VARIANCE_CRITERIA, PATHWAY_LINKS } from './permitPathway.js'
import { evaluatePlanner } from './plannerModel.js'
import { initialStudioScenario, defaultComparisonTypes } from './plannerState.js'
import { rectangleAt } from './plannerGeometry.js'

const scores = Object.fromEntries(['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'].map(id => [id, { demand: 60, displacement_risk: 30, carbon_index: 20 }]))
const rows = { R1D: { 'Single-Unit Detached': 'P', 'Single-Unit Attached': '', 'Two-Unit': '', 'Three-Unit': '', 'Multi-Unit': '' }, RM: { 'Single-Unit Detached': 'P', 'Single-Unit Attached': 'P', 'Two-Unit': 'P', 'Three-Unit': 'P', 'Multi-Unit': 'P' } }
const zoning = { districts: Object.fromEntries([['R1D-L', rows.R1D], ['RM-M', rows.RM]].map(([code, use_rows]) => [code, { use_table_read: true, code_section: 'Fixture', use_rows }])) }

function evaluate({ code, lot, draft = {}, props = {} }) {
  const feature = { type: 'Feature', properties: { pin: 'site', zoning_code: code, lot_sqft: lot, scores, ...props }, geometry: rectangleAt([-79.94, 40.41], 12, 30) }
  const base = initialStudioScenario('site', feature.properties)
  const typed = { ...base.draft, typeId: 'single_family', width: 8, depth: 12, height: 8, floors: 2, ...draft }
  const scenario = { ...base, draft: typed, comparisonTypes: defaultComparisonTypes(typed.typeId), zoningInputsByPin: {} }
  return { feature, result: evaluatePlanner({ feature, zoning, scenario, stop: null, existingBuildings: [] }) }
}
const conflictIds = option => option.titleNine.checks.filter(c => c.status === 'conflict').map(c => c.id).sort()

test('acquisition routes URA, City inventory, unavailable City land, other public owners and private sale', () => {
  assert.equal(acquisitionPathway({ land_use: 'URBAN RENEWAL AUTHORITY' }).label, 'URA Disposition Process')
  assert.ok(acquisitionPathway({ land_use: 'URBAN RENEWAL AUTHORITY' }).links.some(([, url]) => url === PATHWAY_LINKS.uraProperties))
  const city = acquisitionPathway({ city_owned: true, city_status: 'sale_pending' })
  assert.equal(city.id, 'city')
  assert.match(city.label, /Request to Purchase.*Land Bank/)
  assert.match(city.owner, /Sale pending/)
  assert.ok(city.links.some(([, url]) => url === PATHWAY_LINKS.landBank))
  assert.equal(acquisitionPathway({ city_owned: true, city_status: null }).id, 'city_unavailable')
  assert.equal(acquisitionPathway({ land_use_class: 'GOVERNMENT', land_use: 'COUNTY GOVERNMENT' }).id, 'public_other')
  assert.equal(acquisitionPathway({ land_use: 'BOARD OF EDUCATION' }).id, 'public_other')
  const priv = acquisitionPathway({ land_use: 'SINGLE FAMILY', land_use_class: 'RESIDENTIAL' })
  assert.deepEqual([priv.id, priv.label, priv.privacy], ['private', 'Private Market Acquisition', true])
  assert.match(priv.note, /never shows private owner names or private tax-delinquency/)
})

test('private acquisition never echoes owner names or tax-delinquency, even when present in the record', () => {
  const props = { land_use: 'SINGLE FAMILY', owner_name: 'JANE Q PRIVATE', owner: 'JANE Q PRIVATE', tax_delinquent: true, delinquent_amount: 4321, delinquency_years: 3 }
  const out = JSON.stringify(permitPathway({ props, permission: { category: 'not_permitted' }, label: 'Triplex' }))
  assert.doesNotMatch(out, /JANE|4321|delinquent_amount|tax_delinquent|delinquency_years/)
  assert.doesNotMatch(out, /is delinquent|owes taxes|tax lien/i)
})

test('zoning routes: variance on conflict, exception by use letter, by-right, review', () => {
  const conflict = [{ id: 'height', status: 'conflict' }, { id: 'use', status: 'pass' }]
  const v = zoningPathway({ checks: conflict, permission: { category: 'permitted' } })
  assert.deepEqual([v.id, v.label, v.section], ['variance', 'ZBA Variance', '922.09'])
  assert.match(v.detail, /^Dimensional variance/)
  assert.ok(v.links.some(([, url]) => url === PATHWAY_LINKS.zbaGuide))
  assert.ok(v.steps.some(s => /five § 922\.09\.E criteria/.test(s)))
  const both = zoningPathway({ checks: [{ id: 'use', status: 'conflict' }, { id: 'lot', status: 'conflict' }] })
  assert.match(both.detail, /^Use variance plus other relief/)
  assert.equal(zoningPathway({ permission: { category: 'not_permitted' } }).id, 'variance', 'Explorer: permission alone')

  const ae = zoningPathway({ checks: [{ id: 'use', status: 'conditional' }], permission: { category: 'special', letter: 'A' } })
  assert.deepEqual([ae.id, ae.kind, ae.label, ae.section], ['exception', 'administrator', 'Administrator Exception', '922.08'])
  const se = zoningPathway({ permission: { category: 'special', letter: 'S' } })
  assert.deepEqual([se.kind, se.label, se.section], ['special', 'Special Exception', '922.07'])
  const cu = zoningPathway({ permission: { category: 'special', letter: 'C' } })
  assert.deepEqual([cu.kind, cu.label, cu.section], ['conditional', 'Conditional Use', '922.06'])
  assert.equal(zoningPathway({ permission: { category: 'special', letter: null } }).label, 'Administrator Exception / Special Exception')
  const partial = zoningPathway({ permission: { category: 'partial', label: 'Permitted for some unit counts' } })
  assert.deepEqual([partial.id, partial.section], ['review', '911.02'])
  assert.match(partial.detail, /row for this unit count/)

  const br = zoningPathway({ checks: [{ id: 'use', status: 'pass' }, { id: 'far', status: 'unknown' }], permission: { category: 'permitted' } })
  assert.deepEqual([br.id, br.label, br.unresolved], ['by-right', 'By-Right Zoning & Building Permit (PLI / OneStopPGH)', 1])
  assert.match(br.detail, /Confirm 1 unscreened check/)
  assert.ok(br.steps.some(s => /PLI/.test(s)))
  assert.equal(zoningPathway({ permission: { category: 'permitted' } }).detail, 'No screened conflict.')
  assert.equal(zoningPathway({ permission: { category: 'unknown', label: 'Not in use table' } }).id, 'review')
})

test('relief states the exact numeric gap for maximums and minimums, plus use and setbacks', () => {
  const height = reliefFor({ id: 'height', label: 'Height', section: '903.03', actual: 52, limit: 40, mode: 'max' })
  assert.deepEqual([height.required, height.proposed, height.relief], ['≤ 40 ft', '52 ft', '12 ft over the maximum (30%)'])
  const lot = reliefFor({ id: 'lot', label: 'Minimum lot', section: '903.03', actual: 2000, limit: 3000, mode: 'min' })
  assert.deepEqual([lot.required, lot.proposed, lot.relief], ['≥ 3,000 sq ft', '2,000 sq ft', '1,000 sq ft below the minimum (33%)'])
  assert.equal(reliefFor({ id: 'far', label: 'FAR', section: '903.03', actual: 1.25, limit: 1, mode: 'max' }).relief, '0.3 over the maximum (25%)')
  const use = reliefFor({ id: 'use', label: 'Proposed use: Triplex (3 units)', section: '911.02' }, { district: 'R1D-L' })
  assert.equal(use.proposed, 'Triplex (3 units)')
  assert.equal(use.relief, 'Use variance to allow this use in R1D-L')
  assert.match(reliefFor({ id: 'setbacks', label: 'Setbacks' }).relief, /cannot fix a building that does not fit/)
  assert.equal(reliefFor({ id: 'other', label: 'Other', detail: 'Fails.' }).proposed, 'Fails.')
})

test('worksheet pre-fills each failed standard from a real Title Nine run', () => {
  const { feature, result } = evaluate({ code: 'R1D-L', lot: 2000, draft: { typeId: 'triplex' }, props: { year_built: 1910, steep_slope_overlap: 0.25 } })
  const triplex = result.proposal.triplex
  assert.deepEqual(conflictIds(triplex), ['lot', 'use'])
  const lotCheck = triplex.titleNine.checks.find(c => c.id === 'lot')
  assert.deepEqual([lotCheck.actual, lotCheck.limit, lotCheck.mode], [2000, 3000, 'min'])
  const sheet = varianceWorksheet({ props: feature.properties, checks: triplex.titleNine.checks, permission: triplex.permission, option: triplex, label: 'Triplex (3 units)', geometry: feature.geometry, options: Object.values(result.proposal) })
  assert.equal(sheet.section, '922.09.E')
  assert.deepEqual(sheet.failed.map(f => f.id).sort(), ['lot', 'use'])
  const lot = sheet.failed.find(f => f.id === 'lot')
  assert.deepEqual([lot.required, lot.proposed], ['≥ 3,000 sq ft', '2,000 sq ft'])
  assert.match(sheet.failed.find(f => f.id === 'use').relief, /Use variance to allow Triplex \(3 units\) in R1D-L/)
  assert.deepEqual(sheet.criteria.map(c => c.id), VARIANCE_CRITERIA.map(c => c.id))
  const by = Object.fromEntries(sheet.criteria.map(c => [c.id, c]))
  assert.ok(by.unique.evidence.some(e => /ft wide × \d+ ft deep/.test(e)))
  assert.ok(by.unique.evidence.some(e => /2,000 sq ft recorded lot area vs the 3,000 sq ft district minimum/.test(e)))
  assert.ok(by.unique.evidence.some(e => /25% of the lot overlaps the steep-slope/.test(e)))
  assert.match(by['reasonable-use'].evidence[0], /None of \d+ screened types passes/)
  assert.match(by['not-self-created'].evidence[0], /built 1910/)
  assert.match(by['no-adverse-impact'].evidence[0], /Proposed Triplex \(3 units\): 8 × 12 m footprint/)
  assert.equal(by.minimum.evidence.length, 2)
  for (const c of sheet.criteria) { assert.ok(c.prompt); assert.equal(c.status, 'evidence') }
})

test('worksheet notes conforming alternatives and marks missing evidence for the applicant', () => {
  const { feature, result } = evaluate({ code: 'RM-M', lot: 5000, draft: { typeId: 'single_family', height: 30, floors: 8 } })
  const option = result.proposal.single_family
  assert.ok(conflictIds(option).includes('height'))
  const sheet = varianceWorksheet({ props: feature.properties, checks: option.titleNine.checks, permission: option.permission, option, label: 'House', options: Object.values(result.proposal) })
  const by = Object.fromEntries(sheet.criteria.map(c => [c.id, c]))
  const height = sheet.failed.find(f => f.id === 'height')
  assert.match(height.relief, /ft over the maximum/)
  assert.equal(by['not-self-created'].status, 'applicant', 'no recorded year built')
  assert.match(by['reasonable-use'].evidence[0], /pass every assessed check here.*may find reasonable use is possible/)
})

test('no worksheet without a conflict; Explorer mode builds a use-only worksheet', () => {
  const { feature, result } = evaluate({ code: 'RM-M', lot: 5000 })
  const house = result.proposal.single_family
  assert.deepEqual(conflictIds(house), [])
  const clean = permitPathway({ props: feature.properties, checks: house.titleNine.checks, permission: house.permission, option: house })
  assert.equal(clean.worksheet, null)
  assert.equal(clean.zoning.id, 'by-right')
  assert.equal(clean.acquisition.id, 'private')

  const explorer = permitPathway({ props: { zoning_code: 'R1D-L', city_owned: true, city_status: 'available' }, permission: { category: 'not_permitted' }, label: 'Small apartment' })
  assert.equal(explorer.acquisition.id, 'city')
  assert.equal(explorer.zoning.id, 'variance')
  assert.deepEqual(explorer.worksheet.failed.map(f => [f.id, f.section]), [['use', '911.02']])
  assert.match(explorer.worksheet.failed[0].relief, /Small apartment in R1D-L/)
  assert.equal(permitPathway({ props: {}, permission: { category: 'permitted' } }).worksheet, null)
})
