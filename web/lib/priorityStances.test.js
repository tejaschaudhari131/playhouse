import test from 'node:test'
import assert from 'node:assert/strict'
import { PRIORITY_STANCES, CLOSE_CALL_POINTS, stanceFor, rescore, closeCall } from './priorityStances.js'
import { PLANNER_FACTORS, INITIAL_WEIGHTS, initialStudioScenario, defaultComparisonTypes } from './plannerState.js'
import { evaluatePlanner } from './plannerModel.js'
import { rectangleAt } from './plannerGeometry.js'
import { tourScenario, TOUR_PIN } from './studioTour.js'

const option = (label, scores, eligible = true) => ({ label, eligible, scores })
const states = proposal => ({ baseline: proposal, proposal })

test('five named stances, each a full set of weights with balanced as the default', () => {
  assert.deepEqual(PRIORITY_STANCES.map(s => s.label), ['Balanced', 'Anti-Displacement & Affordability', 'Transit-Oriented Density', 'Climate & Low-Carbon', 'Fast Market Infill'])
  for (const s of PRIORITY_STANCES) {
    for (const f of PLANNER_FACTORS) assert.ok(['physical', 'capacity'].includes(f.id) ? s.weights[f.id] === 0 : s.weights[f.id] > 0, `${s.id}.${f.id}`)
    assert.ok(s.description.length > 40)
  }
  assert.deepEqual(PRIORITY_STANCES[0].weights, INITIAL_WEIGHTS)
  const top = id => Object.entries(PRIORITY_STANCES.find(s => s.id === id).weights).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k).sort()
  assert.deepEqual(top('anti-displacement'), ['affordability', 'displacement'])
  assert.equal(top('transit')[0], 'access')
  assert.deepEqual(top('climate'), ['access', 'carbon'])
  assert.deepEqual(top('market'), ['affordability', 'demand'])
  assert.equal(stanceFor(Object.fromEntries(Object.entries(INITIAL_WEIGHTS).map(([k, v]) => [k, v * 3]))).id, 'balanced', 'ratios, not magnitudes')
  assert.equal(stanceFor({ ...INITIAL_WEIGHTS, demand: 99 }), null)
})

test('rescore reproduces the planner totals for a real parcel', () => {
  const feature = { type: 'Feature', properties: { pin: 'site', zoning_code: 'RM-M', lot_sqft: 6000, median_gross_rent: 1100, median_income: 52000,
    scores: Object.fromEntries(['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'].map((id, i) => [id, { demand: 40 + i * 9, displacement_risk: 35, carbon_index: 60 - i * 8 }])) }, geometry: rectangleAt([-79.94, 40.41], 30, 40) }
  const zoning = { districts: { 'RM-M': { use_table_read: true, code_section: 'Fixture', use_rows: { 'Single-Unit Detached': 'P', 'Single-Unit Attached': 'P', 'Two-Unit': 'P', 'Three-Unit': 'P', 'Multi-Unit': 'P' } } } }
  const base = initialStudioScenario('site', feature.properties)
  const scenario = { ...base, draft: { ...base.draft, typeId: 'single_family', width: 8, depth: 12, height: 8, floors: 2 }, comparisonTypes: defaultComparisonTypes('single_family') }
  const result = evaluatePlanner({ feature, zoning, scenario, stop: null, existingBuildings: [] })
  for (const stance of PRIORITY_STANCES) {
    const weighted = evaluatePlanner({ feature, zoning, scenario: { ...scenario, weights: stance.weights }, stop: null, existingBuildings: [] })
    const mine = rescore({ baseline: result.baseline, proposal: result.proposal }, stance.weights)
    assert.deepEqual(mine.included, weighted.included)
    assert.ok(mine.included.length >= 3 && Object.values(weighted.proposal).filter(o => o.total !== null).length >= 2, 'scored, not vacuous')
    for (const [id, o] of Object.entries(weighted.proposal)) {
      if (o.total === null) assert.equal(mine.proposal[id], null)
      else assert.ok(Math.abs(mine.proposal[id] - o.total) < 1e-9, `${stance.id} ${id}`)
    }
  }
})

test('close call within 3.0 pts, naming the runner-up', () => {
  const call = closeCall(states({ a: option('Duplex', { demand: 62, affordability: 50 }), b: option('Triplex', { demand: 60, affordability: 50 }) }), { demand: 1, affordability: 1, physical: 0, displacement: 0, capacity: 0, access: 0, carbon: 0 }, 'proposal', [])
  assert.equal(call.close, true)
  assert.equal(call.withinMargin, true)
  assert.ok(Math.abs(call.margin - 1) < 1e-9)
  assert.equal(call.badge, 'No clear winner')
  assert.equal(call.winner, null)
  assert.match(call.text, /No clear winner\. Duplex and Triplex are 1\.0 pts apart, within the 3\.0-pt close-call band\. No stance selects a clear alternative\./)
  assert.equal(CLOSE_CALL_POINTS, 3)
  const edge = closeCall(states({ a: option('A', { demand: 63 }), b: option('B', { demand: 60 }) }), { demand: 1 }, 'proposal', [])
  assert.equal(edge.close, true, 'exactly 3.0 is a close call')
})

test('a stance that flips the winner makes it a close call even with a wide margin', () => {
  const opts = { house: option('House', { demand: 90, affordability: 20 }), triplex: option('Triplex', { demand: 40, affordability: 80 }) }
  const marketHeavy = { demand: 9, affordability: 1 }
  const stances = [{ id: 'market', label: 'Market', weights: marketHeavy }, { id: 'costs', label: 'Costs first', weights: { demand: 1, affordability: 9 } }]
  const call = closeCall(states(opts), marketHeavy, 'proposal', stances)
  assert.equal(call.winnerLabel, 'House')
  assert.ok(call.margin > 3)
  assert.equal(call.withinMargin, false)
  assert.equal(call.close, true)
  assert.deepEqual(call.flips.map(f => [f.label, f.winnerLabel]), [['Costs first', 'Triplex']])
  assert.match(call.text, /Costs first flips it to Triplex/)
  assert.deepEqual(call.stances.map(s => s.active), [true, false])
  const clear = closeCall(states(opts), marketHeavy, 'proposal', [stances[0]])
  assert.equal(clear.close, false)
  assert.equal(clear.badge, null)
  assert.match(clear.text, /leads under every stance/)
})

test('a wide lead does not imply agreement from tied or unscored stances', () => {
  const opts = states({ house: option('House', { demand: 90, affordability: 50 }), triplex: option('Triplex', { demand: 40, affordability: 50 }) })
  const weights = { demand: 1 }
  const stances = [
    { id: 'market', label: 'Market', weights },
    { id: 'costs', label: 'Costs', weights: { affordability: 1 } },
    { id: 'none', label: 'No weights', weights: { demand: 0 } },
  ]
  const call = closeCall(opts, weights, 'proposal', stances)
  assert.equal(call.close, false)
  assert.equal(call.winnerLabel, 'House')
  assert.deepEqual(call.stances.map(stance => stance.winner), ['house', null, null])
  assert.equal(call.text, 'House leads Triplex by 50.0 pts. No stance selects a clear alternative.')
  assert.equal(closeCall(opts, weights, 'proposal', []).text, 'House leads Triplex by 50.0 pts. No alternative stances were compared.')
})

test('ineligible types never win and fewer than two eligible types give no call', () => {
  const opts = { a: option('A', { demand: 99 }, false), b: option('B', { demand: 50 }), c: option('C', { demand: 49 }) }
  const call = closeCall(states(opts), { demand: 1 }, 'proposal', [])
  assert.deepEqual([call.numericalLeaderLabel, call.runnerUpLabel], ['B', 'C'])
  assert.equal(closeCall(states({ a: option('A', { demand: 99 }), b: option('B', { demand: 50 }, false) }), { demand: 1 }), null)
  assert.equal(rescore(states(opts), { demand: 0 }).proposal.b, null, 'no weight, no total')
})

test('the tour switches to the Anti-Displacement & Affordability stance', () => {
  const feature = { type: 'Feature', properties: { pin: TOUR_PIN, median_gross_rent: 900 }, geometry: rectangleAt([-79.94, 40.41], 20, 30) }
  assert.equal(stanceFor(tourScenario('priorities', feature, null).weights).id, 'anti-displacement')
})
