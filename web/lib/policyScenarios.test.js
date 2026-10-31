import test from 'node:test'
import assert from 'node:assert/strict'
import { POLICY_SCENARIOS, scenarioById, amiReach, feasibilityClass, buildingMetrics, zoningOutcome, stairOutcome, lvtOutcome } from './policyScenarios.js'
import { REFORM_PRESETS } from './policyReform.js'
import { CORE_MINIMUMS } from './singleStair.js'
import { CITY_MILLAGE, splitRates } from './lvtShift.js'
import { evaluatePlanner } from './plannerModel.js'
import { initialStudioScenario, defaultComparisonTypes } from './plannerState.js'
import { rectangleAt } from './plannerGeometry.js'
import limits from './hudIncomeLimits.json' with { type: 'json' }

const scores = Object.fromEntries(['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'].map(id => [id, { demand: 60, displacement_risk: 30, carbon_index: 20 }]))
const permitted = { 'Single-Unit Detached': 'P', 'Single-Unit Attached': 'P', 'Two-Unit': 'P', 'Three-Unit': 'P', 'Multi-Unit': 'P' }
const houseOnly = { 'Single-Unit Detached': 'P', 'Single-Unit Attached': '', 'Two-Unit': '', 'Three-Unit': '', 'Multi-Unit': '' }
const zoning = { districts: Object.fromEntries([['R1D-L', houseOnly], ['RM-M', permitted], ['LNC', permitted]].map(([code, use_rows]) => [code, { use_table_read: true, code_section: 'Fixture', use_rows }])) }

function evaluate({ code, lot, draft = {}, inputs }) {
  const feature = { type: 'Feature', properties: { pin: 'site', zoning_code: code, lot_sqft: lot, scores }, geometry: rectangleAt([-79.94, 40.41], 60, 60) }
  const base = initialStudioScenario('site', feature.properties)
  const typed = { ...base.draft, typeId: 'single_family', width: 8, depth: 12, height: 8, floors: 2, ...draft }
  const scenario = { ...base, draft: typed, comparisonTypes: defaultComparisonTypes(typed.typeId), zoningInputsByPin: inputs ? { site: inputs } : {} }
  return evaluatePlanner({ feature, zoning, scenario, stop: null, existingBuildings: [] }).proposal
}

test('four named scenarios, each with what it enables, how to evaluate it and a one-click example', () => {
  assert.deepEqual(POLICY_SCENARIOS.map(s => s.label), ['Land value tax shift', 'Single-stair buildings', 'Missing-middle lot reform', 'Bill 2025-1545 height bonus'])
  for (const s of POLICY_SCENARIOS) {
    assert.ok(s.enables.length > 60, s.id)
    assert.equal(s.evaluate.length, 4, s.id)
    for (const metric of ['Net homes', 'Affordability', 'Tax change', 'Feasibility']) assert.ok(s.evaluate.some(line => line.startsWith(metric)), `${s.id} explains ${metric}`)
    assert.match(s.example.pin, /^[0-9A-Z]{16}$/)
    assert.ok(s.example.label && s.example.settings)
    if (s.preset) assert.ok(REFORM_PRESETS.some(p => p.id === s.preset))
  }
  assert.equal(scenarioById('single-stair').example.settings.egress, 'single-stair')
  assert.equal(scenarioById('nope').id, 'lvt')
  assert.equal(scenarioById('bill-2025-1545').status, 'pending')
})

test('AMI reach: lowest HUD band that pays the monthly cost at 30% of income', () => {
  const fifty = limits.incomeLimits[50][0] * .3 / 12
  assert.equal(amiReach(fifty, 1, limits).band, 50)
  assert.equal(amiReach(fifty + 1, 1, limits).band, 60)
  assert.equal(amiReach(limits.incomeLimits[80][0] * .3 / 12 + 1, 1, limits).band, null, 'above 80% AMI')
  assert.equal(amiReach(500, 1, limits).band, 30)
  const four = amiReach(fifty + 1, 4, limits)
  assert.equal(four.householdSize, 4)
  assert.equal(four.band, 50, 'a larger household has higher limits, so the same cost reaches a lower band')
  assert.deepEqual(four.bands.map(b => b.band), [30, 50, 60, 80])
  assert.equal(amiReach(NaN, 1, limits), null)
  assert.equal(amiReach(1000, 1, null), null)
})

test('feasibility classes a value-minus-cost range', () => {
  assert.equal(feasibilityClass([10, 500]).id, 'pencils')
  assert.equal(feasibilityClass([-500, -10]).id, 'gap')
  assert.equal(feasibilityClass([-10, 500]).id, 'marginal')
  assert.equal(feasibilityClass([500, -10]).id, 'marginal', 'order-insensitive')
  assert.equal(feasibilityClass(null), null)
})

test('building metrics read net homes, tax, break-even rent, AMI reach and feasibility from an impact', () => {
  const impact = { replacement: { label: 'Triplex (3 units)', units: 3, netUnits: 3 }, tax: { net: [4000, 6000] }, value: { breakEvenRent: [1300, 1900], gap: [-90000, 20000] } }
  const metrics = buildingMetrics(impact, { utilities: 150, householdSize: 1, limits })
  assert.deepEqual([metrics.homes, metrics.net, metrics.tax], [3, 3, [4000, 6000]])
  assert.equal(metrics.reach.monthly, 1450, 'low end of break-even rent plus utilities')
  assert.equal(metrics.reach.band, 80)
  assert.equal(metrics.feasibility.id, 'marginal')
  assert.equal(buildingMetrics(null), null)
})

test('missing-middle scenario: 0 homes by right on a 2,000 sq ft R1D-L lot, a triplex after', () => {
  const outcome = zoningOutcome('missing-middle', Object.values(evaluate({ code: 'R1D-L', lot: 2000 })), 'R1D-L')
  assert.equal(outcome.before, null)
  assert.deepEqual([outcome.after.typeId, outcome.homesBefore, outcome.homesAfter], ['triplex', 0, 3])
  assert.ok(outcome.addedTypes.includes('Triplex (3 units)'))
  assert.deepEqual(outcome.rules.map(r => r.section).sort(), ['903.03.B', '911.02'])
  assert.equal(outcome.height.bonusFt, 0, 'missing-middle does not change height')
  assert.equal(outcome.height.afterFt, outcome.height.beforeFt)
})

test('Bill 2025-1545 scenario: RM-M height 55 → 85 ft and 4 → 6 stories for 4+ homes; a 5-story apartment becomes by right', () => {
  const options = evaluate({ code: 'RM-M', lot: 40000, draft: { typeId: 'small_apartment', width: 18, depth: 20, height: 20, floors: 5 }, inputs: { parkingRegime: 'base', parkingSpaces: 0 } })
  const outcome = zoningOutcome('bill-2025-1545', Object.values(options), 'RM-M')
  assert.deepEqual(outcome.height, { beforeFt: 55, afterFt: 85, bonusFt: 30, beforeStories: 4, afterStories: 6 })
  assert.ok(outcome.addedTypes.includes('Small apartment (12 units)'))
  assert.equal(outcome.after.typeId, 'small_apartment')
  assert.equal(outcome.homesAfter, 12)
  assert.ok(outcome.homesBefore < 12)
  const r1d = zoningOutcome('bill-2025-1545', Object.values(evaluate({ code: 'R1D-L', lot: 4000 })), 'R1D-L')
  assert.equal(r1d.height.bonusFt, 0, 'no bonus outside RM and neighbourhood mixed-use districts')
})

const fitWithin = lotWidth => (candidate, rule) => {
  const min = CORE_MINIMUMS[rule === 'single-stair' ? 1 : 2]
  const width = Math.min(candidate.width, lotWidth - .5)
  return width >= min.width ? { width, depth: candidate.depth } : null
}

test('single-stair scenario: a 10.4 m lot fits a 12-home apartment only with one stair', () => {
  const options = evaluate({ code: 'RM-M', lot: 3000 })
  const outcome = stairOutcome(options, fitWithin(10.4))
  assert.deepEqual(outcome.rows.map(r => [r.rule, r.stairs, r.maxStories, r.fits]), [['two-stair', 2, 3, false], ['single-stair', 1, 6, true]])
  assert.equal(outcome.rows[1].fit.width, 9.9)
  assert.ok(outcome.rows[1].efficiency > .8)
  assert.equal(outcome.enabled, true)
  assert.equal(outcome.homesAfter, 12)
  assert.ok(outcome.homesBefore < 12)
  const wide = stairOutcome(options, fitWithin(20))
  assert.deepEqual(wide.rows.map(r => r.fits), [true, true])
  assert.equal(wide.enabled, false, 'a wide lot already fits two stairs')
  const narrow = stairOutcome(options, fitWithin(7))
  assert.deepEqual(narrow.rows.map(r => r.fits), [false, false], 'below the 7.5 m single-stair core')
})

test('single-stair scenario re-fits an apartment whose default two-stair footprint misses the lot', () => {
  const options = evaluate({ code: 'RM-M', lot: 3000 })
  const missed = { ...options.small_apartment, massing: { ...options.small_apartment.massing, fits: false }, titleNine: { ...options.small_apartment.titleNine, checks: [...options.small_apartment.titleNine.checks, { id: 'setbacks', status: 'conflict' }] } }
  const outcome = stairOutcome({ ...options, small_apartment: missed }, fitWithin(10.4))
  assert.equal(outcome.allowed, true, 'the setback conflict from a missed fit is not a zoning bar')
  assert.equal(outcome.homesAfter, 12)
  const capped = { ...missed, titleNine: { ...missed.titleNine, checks: [...missed.titleNine.checks, { id: 'stories', status: 'conflict' }] } }
  assert.equal(stairOutcome({ ...options, small_apartment: capped }, fitWithin(10.4)).allowed, false, 'other conflicts still count')
})

test('single-stair scenario respects zoning: no apartment homes where multi-unit is not permitted', () => {
  const outcome = stairOutcome(evaluate({ code: 'R1D-L', lot: 4000 }), fitWithin(10.4))
  assert.equal(outcome.allowed, false)
  assert.equal(outcome.rows[1].fits, true)
  assert.ok(outcome.homesAfter < 12)
  assert.equal(outcome.homesAfter, outcome.homesBefore)
})

test('LVT scenario: land pays more, a new building pays less, revenue rates are the revenue-neutral split', () => {
  const rates = splitRates({ land: 1, building: 3 }, 4)
  assert.ok(Math.abs(rates.buildingMills - CITY_MILLAGE * 4 / 7) < 1e-9)
  const lot = { tax_status: 'taxable', assessed_land: 100000, assessed_building: 0 }
  const outcome = lvtOutcome(lot, rates, [900000, 1100000])
  assert.ok(outcome.own.change > 0, 'a vacant lot pays more')
  assert.ok(Math.abs(outcome.holding.current - 967) < 1e-9)
  assert.ok(Math.abs(outcome.holding.proposed - 100000 * rates.landMills / 1000) < 1e-9)
  assert.equal(outcome.built.length, 2)
  assert.ok(Math.abs(outcome.built[0].current - 1000000 * CITY_MILLAGE / 1000) < 1e-9, 'land plus building at today’s rate')
  assert.ok(Math.abs(outcome.built[0].proposed - (100000 * rates.landMills + 900000 * rates.buildingMills) / 1000) < 1e-9)
  for (const b of outcome.built) assert.ok(b.change < 0, 'mostly-building value pays less')
  assert.ok(outcome.built[1].change < outcome.built[0].change)
  assert.equal(lvtOutcome({ tax_status: 'exempt' }, rates, [1, 2]).own, null)
  assert.equal(lvtOutcome(lot, null), null)
})
