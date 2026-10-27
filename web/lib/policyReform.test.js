import test from 'node:test'
import assert from 'node:assert/strict'
import { REFORM_PRESETS, REFORM_STATUS_TEXT, presetById, simulateReform, reformSummary, AFFORDABLE_BONUS } from './policyReform.js'
import { evaluatePlanner } from './plannerModel.js'
import { initialStudioScenario, defaultComparisonTypes } from './plannerState.js'
import { rectangleAt } from './plannerGeometry.js'
import { comparisonScore } from './studioPresentation.js'

const scores = Object.fromEntries(['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'].map(id => [id, { demand: 60, displacement_risk: 30, carbon_index: 20 }]))
const rows = { R1D: { 'Single-Unit Detached': 'P', 'Single-Unit Attached': '', 'Two-Unit': '', 'Three-Unit': '', 'Multi-Unit': '' }, RM: { 'Single-Unit Detached': 'P', 'Single-Unit Attached': 'P', 'Two-Unit': 'P', 'Three-Unit': 'P', 'Multi-Unit': 'P' } }
const zoning = { districts: Object.fromEntries([['R1D-L', rows.R1D], ['RM-M', rows.RM]].map(([code, use_rows]) => [code, { use_table_read: true, code_section: 'Fixture', use_rows }])) }

function evaluate({ code, lot, draft = {}, inputs }) {
  const feature = { type: 'Feature', properties: { pin: 'site', zoning_code: code, lot_sqft: lot, scores }, geometry: rectangleAt([-79.94, 40.41], 60, 60) }
  const base = initialStudioScenario('site', feature.properties)
  const typed = { ...base.draft, typeId: 'single_family', width: 8, depth: 12, height: 8, floors: 2, ...draft }
  const scenario = { ...base, draft: typed, comparisonTypes: defaultComparisonTypes(typed.typeId), zoningInputsByPin: inputs ? { site: inputs } : {} }
  return { result: evaluatePlanner({ feature, zoning, scenario, stop: null, existingBuildings: [] }), code }
}
const options = ({ result }) => Object.values(result.proposal)

test('four named presets, labelled by legal status', () => {
  assert.deepEqual(REFORM_PRESETS.map(p => p.label), ['Current Code (Title Nine)', 'Council Bill 2025-1545 (Pending Reform)', 'Missing-Middle & Starter-Home Lot Reform', 'Full By-Right Upzoning'])
  assert.deepEqual(REFORM_PRESETS.map(p => REFORM_STATUS_TEXT[p.status]), ['Adopted law', 'Pending · not law', 'Hypothetical · not proposed legislation', 'Hypothetical · not proposed legislation'])
  assert.match(presetById('current').summary, /Bill 2025-1579/)
  assert.match(presetById('missing-middle').summary, /already gone/)
  assert.equal(presetById('nope').id, 'current')
  assert.match(presetById('bill-2025-1545').url, /legistar.*7147499/)
})

test('current code lifts nothing and matches the screen', () => {
  const run = evaluate({ code: 'R1D-L', lot: 2000 })
  const summary = reformSummary(options(run), 'current', run.code)
  assert.equal(summary.permittedAfter, summary.permittedBefore)
  assert.deepEqual([summary.rules, summary.addedTypes, summary.adu], [[], [], null])
  for (const r of summary.results) assert.equal(r.eligible, r.before)
})

test('missing-middle preset lifts §911.02 use (≤4 homes) and the -L starter lot, nothing else', () => {
  const run = evaluate({ code: 'R1D-L', lot: 2000 })
  const all = options(run), triplex = run.result.proposal.triplex, large = run.result.proposal.large_apartment
  assert.deepEqual(triplex.titleNine.checks.filter(c => c.status === 'conflict').map(c => c.id).sort(), ['lot', 'use'])
  const sim = simulateReform(triplex, 'missing-middle', run.code)
  assert.deepEqual(sim.lifted.map(l => [l.check.id, l.rule.section]).sort(), [['lot', '903.03.B'], ['use', '911.02']])
  assert.equal(sim.eligible, true)
  assert.equal(sim.newlyEligible, true)
  const big = simulateReform(large, 'missing-middle', run.code)
  assert.ok(big.remaining.some(c => c.id === 'use'), '40 homes are beyond 2–4 by right')
  assert.ok(big.remaining.some(c => c.id === 'height'), 'height is never lifted')
  const summary = reformSummary(all, 'missing-middle', run.code)
  assert.deepEqual(summary.rules.map(r => r.section).sort(), ['903.03.B', '911.02'])
  assert.ok(summary.addedTypes.includes('Triplex (3 units)'))
  assert.equal(summary.permittedBefore, 0, '2,000 sq ft is below the 3,000 sq ft -L minimum for every type')
  assert.deepEqual(summary.results.filter(r => r.eligible).map(r => r.typeId).sort(), ['single_family', 'townhouse_duplex', 'triplex'])
  assert.equal(summary.maxHomesBefore, 0)
  assert.equal(summary.maxHomesAfter, 3)
  const tiny = evaluate({ code: 'R1D-L', lot: 1500 })
  assert.ok(simulateReform(tiny.result.proposal.triplex, 'missing-middle', 'R1D-L').remaining.some(c => c.id === 'lot'), 'below 1,800 sq ft still conflicts')
})

test('full by-right upzoning clears use, lot and parking, never height', () => {
  const run = evaluate({ code: 'R1D-L', lot: 2000, inputs: { parkingRegime: 'base', parkingSpaces: 0 } })
  const summary = reformSummary(options(run), 'by-right', run.code)
  assert.deepEqual(summary.rules.map(r => r.section).sort(), ['903.03', '911.02', '914.02'])
  const large = summary.results.find(r => r.typeId === 'large_apartment')
  assert.equal(large.eligible, false)
  assert.ok(large.remaining.every(c => !['use', 'lot', 'parking-min'].includes(c.id)))
  assert.ok(summary.results.find(r => r.typeId === 'triplex').eligible)
})

test('Bill 2025-1545: no parking minimum, ADUs, and a height bonus only for 4+ homes in bonus districts', () => {
  const run = evaluate({ code: 'RM-M', lot: 40000, draft: { typeId: 'small_apartment', width: 18, depth: 20, height: 20, floors: 5 }, inputs: { parkingRegime: 'base', parkingSpaces: 0 } })
  const apartment = run.result.proposal.small_apartment
  assert.deepEqual(apartment.titleNine.checks.filter(c => c.status === 'conflict').map(c => c.id).sort(), ['height', 'parking-min', 'stories'])
  const sim = simulateReform(apartment, 'bill-2025-1545', run.code)
  assert.deepEqual(sim.lifted.map(l => l.rule.id).sort(), ['affordable-bonus', 'affordable-bonus', 'parking-min'])
  assert.equal(sim.eligible, true)
  assert.match(sim.lifted.find(l => l.rule.id === 'affordable-bonus').rule.condition, /50% AMI/)
  const tooTall = evaluate({ code: 'RM-M', lot: 40000, draft: { typeId: 'small_apartment', width: 18, depth: 20, height: 30, floors: 5 } })
  assert.ok(simulateReform(tooTall.result.proposal.small_apartment, 'bill-2025-1545', 'RM-M').remaining.some(c => c.id === 'height'), `98 ft exceeds 55 + ${AFFORDABLE_BONUS.points * AFFORDABLE_BONUS.feetPerPoint} ft`)
  const summary = reformSummary(options(run), 'bill-2025-1545', run.code)
  assert.deepEqual(summary.adu, { homes: 2, withSingleUnit: true, text: 'Up to two accessory dwelling units per residential lot', section: '912' })
  assert.equal(summary.maxHomesAfter, 12)
  const r1d = evaluate({ code: 'R1D-L', lot: 4000 })
  assert.equal(reformSummary(options(r1d), 'bill-2025-1545', 'R1D-L').maxHomesAfter, 3, 'single-family + two ADUs')
})

test('reform never bypasses physical fit or placed-building review, and scores stay display-only', () => {
  const run = evaluate({ code: 'R1D-L', lot: 2000 })
  const triplex = run.result.proposal.triplex
  assert.equal(simulateReform({ ...triplex, physicalEligible: false }, 'by-right', 'R1D-L').eligible, false)
  assert.equal(simulateReform({ ...triplex, area: { invalid: [{ id: 'x' }] } }, 'by-right', 'R1D-L').placedReview, 1)
  assert.equal(simulateReform({ ...triplex, area: { invalid: [{ id: 'x' }] } }, 'by-right', 'R1D-L').eligible, false)
  assert.deepEqual(comparisonScore(triplex, simulateReform(triplex, 'by-right', 'R1D-L')), { value: triplex.suitability, kind: 'reform' })
  assert.equal(comparisonScore(triplex, simulateReform(triplex, 'current', 'R1D-L')).kind, 'underlying')
  assert.ok(!run.result.comparison.proposal.order.includes('triplex'))
  assert.deepEqual(simulateReform(null, 'by-right'), { preset: 'by-right', lifted: [], remaining: [], placedReview: 0, eligible: false, newlyEligible: false })
})
