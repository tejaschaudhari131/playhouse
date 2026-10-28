import test from 'node:test'
import assert from 'node:assert/strict'
import { displacementScreen } from './displacementModel.js'
import { carbonEvidence } from './carbonEvidence.js'
import { transitCapacityCheck, CAPACITY_ASSUMPTIONS } from './capacityCheck.js'
import { housingCostValidation, housingCostBurden, housingCostEvidence } from './housingCosts.js'
import { prototypeRentOption, RENT_ASSUMPTIONS, RENT_REFERENCES } from './rentAssumptions.js'
import { marketFitEvidence } from './marketFitEvidence.js'
import { evaluatePlanner } from './plannerModel.js'
import { initialStudioScenario } from './plannerState.js'
import { rectangleAt } from './plannerGeometry.js'
import { comparisonTemplates, rankTemplates } from './plannerShortlist.js'
import { rankedWinner } from './plannerRecommendation.js'
import { factorReceipt } from './factorReceipts.js'

function fixture() {
  const scores = Object.fromEntries(['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'].map((id, i) => [id, { demand: 40 + i * 12, displacement_risk: 50, carbon_index: 65 - i * 10 }]))
  const feature = { type: 'Feature', geometry: rectangleAt([-79.94, 40.41], 120, 120), properties: { pin: 'test', zoning_code: 'RM-VH', lot_sqft: 150000, renter_share: .75, chas_rent_burden_share: .80, rent_change_vs_county: 0, scores } }
  const zoning = { districts: { 'RM-VH': { use_table_read: true, use_rows: { 'Single-Unit Detached': 'P', 'Two-Unit': 'P', 'Three-Unit': 'P', 'Multi-Unit': 'P' } } } }
  const scenario = initialStudioScenario('test', feature.properties)
  return { feature, zoning, scenario, stop: { stop_id: 'one', weekday_trips: 20, distance: 100 }, existingBuildings: [] }
}

test('flat or falling relative rents never halve vulnerability; missing is distinct from zero', () => {
  for (const pressure of [0, -.1]) {
    const screen = displacementScreen({ renter_share: .75, chas_rent_burden_share: .80, rent_change_vs_county: pressure }, 50)
    assert.equal(screen.risk, 100)
    assert.equal(screen.pressure, 0)
    assert.equal(screen.method, 'vulnerability_floor')
  }
  assert.equal(displacementScreen({ renter_share: .5, chas_rent_burden_share: .55, rent_change_vs_county: .15 }).risk, 75)
  assert.equal(displacementScreen({ renter_share: null, chas_rent_burden_share: null, rent_change_vs_county: null }, 50).risk, null)
  assert.equal(displacementScreen({ renter_share: .5 }).risk, 50)
  assert.equal(displacementScreen({ renter_share: .5 }).confidence, 'Low')
  assert.equal(displacementScreen({}, 50).method, 'archived_screen')
  assert.equal(displacementScreen({}, 50).confidence, 'Low')
})

test('five preferences are invariant to unused check weights and zero reserve cannot zero housing scores', () => {
  const input = fixture()
  input.scenario.weights = { demand: 1, affordability: 1, displacement: 1, access: 1, carbon: 1, physical: 1, capacity: 1 }
  input.scenario.spareBoardings = 0
  const result = evaluatePlanner(input)
  assert.deepEqual(result.included, ['demand', 'affordability', 'displacement', 'access', 'carbon'])
  assert.equal(result.proposal.townhouse_duplex.checks.capacity.status, 'unknown')
  assert.equal(result.proposal.townhouse_duplex.scores.displacement, 0)
  assert.ok(result.proposal.townhouse_duplex.total > 0)
  input.scenario.weights.physical = 1000000
  input.scenario.weights.capacity = 1000000
  assert.equal(evaluatePlanner(input).proposal.townhouse_duplex.total, result.proposal.townhouse_duplex.total)
  assert.equal(result.proposal.townhouse_duplex.checks.physical.status, 'pass')
  assert.ok(result.proposal.townhouse_duplex.zoningReview.notAssessed > 0)
})

test('a transit check reports assumptions and ranges without becoming a legal gate', () => {
  const check = transitCapacityCheck({ supply: 40, groupBoardings: 48, service: {}, reserve: { method: 'schedule_assumption' }, boardingsPerHome: 4 })
  assert.equal(check.status, 'fail')
  assert.equal(check.blocking, false)
  assert.deepEqual(check.range, { low: 20, high: 80 })
  assert.deepEqual(check.demandRange, { low: 24, high: 72 })
  assert.equal(check.sensitivity, 'depends-on-assumptions')
  assert.equal(CAPACITY_ASSUMPTIONS.boardingsPerHome.value, 4)
  assert.equal(transitCapacityCheck({ supply: 0, groupBoardings: 4, service: {}, boardingsPerHome: 4 }).status, 'unknown')
})

test('invalid income and zero rent are rejected with a reason; unusually low valid inputs are disclosed', () => {
  for (const [state, option, field] of [[{ targetIncome: 1000 }, { rent: 1600, utilities: 150 }, 'targetIncome'], [{ targetIncome: 46380 }, { rent: 0, utilities: 150 }, 'rent']]) {
    assert.equal(housingCostValidation(state, option).valid, false)
    assert.equal(housingCostValidation(state, option).issues[0].field, field)
    assert.equal(housingCostBurden({ ...state, affordabilityAuto: true }, option).score, null)
  }
  assert.ok(housingCostValidation({ targetIncome: 12000 }, { rent: 300, utilities: 0 }).warnings.length)
  assert.equal(housingCostEvidence({ incomeSource: 'fallback' }, { rentSource: 'fallback' }).rent.kind, 'fallback')
})

test('prototype rent differences are explicit assumptions and disappear when a shared custom rent is used', () => {
  const input = fixture(), state = { ...input.scenario, targetIncome: 46380, rentMode: 'prototype' }
  state.draft = { ...state.draft, ...prototypeRentOption(state.draft.typeId) }
  const templates = comparisonTemplates(state)
  for (const [id, option] of Object.entries(templates)) {
    assert.equal(option.rent, RENT_ASSUMPTIONS[id].rent)
    assert.ok(housingCostBurden(state, option).score < 100)
    assert.equal(housingCostEvidence(state, option).rent.kind, 'assumed')
    assert.ok(option.rentRange.low < option.rent && option.rentRange.high > option.rent)
  }
  assert.ok(new Set(Object.values(templates).map(option => housingCostBurden(state, option).score)).size >= 2)
  assert.ok(new Set(Object.values(templates).map(option => housingCostBurden({ ...state, targetIncome: 61850 }, option).score)).size > 2)
  assert.ok(Object.values(templates).every(option => housingCostBurden({ ...state, targetIncome: 23200 }, option).score === 0), 'unmet low-income targets remain honestly zero; no forced differentiation')
  const custom = comparisonTemplates({ ...state, rentMode: 'custom', draft: { ...state.draft, rent: 1500, rentSource: 'custom' } })
  assert.ok(Object.values(custom).every(option => option.rent === 1500))
  assert.ok(RENT_REFERENCES.every(source => source.url.startsWith('https://') && source.checked && source.observation))
})

test('close results have contenders and numerical ordering but no declared winner', () => {
  const options = { single_family: { eligible: true, total: 70 }, townhouse_duplex: { eligible: true, total: 67 }, large_apartment: { eligible: false, total: 100 } }
  assert.equal(rankedWinner(options), 'tie')
  assert.equal(rankTemplates(options).noClearWinner, true)
  assert.deepEqual(rankTemplates(options).leaders, [])
  options.single_family.total = 70.01
  assert.equal(rankedWinner(options), 'single_family')
})

test('market receipts disclose both observed inputs and the assumed curve that can favor detached homes', () => {
  const market = marketFitEvidence({ lot_sqft: 12000, factors: { market_heat: .6, lot_fit: { townhouse_duplex: .35 }, valid_sales: 20, price_per_sqft: 200, turnover_per_100: 15 } }, 'townhouse_duplex')
  assert.equal(market.marketHeat, 60)
  assert.equal(market.lotFit, 35)
  assert.match(market.curve, /above 10,000: 35/)
  assert.match(market.limitation, /single-family house above a duplex/)
  assert.equal(factorReceipt('demand', { marketEvidence: market }).badge, 'Measured + assumed')
  assert.equal(marketFitEvidence({}, 'single_family').confidence, 'Low')
})

test('carbon source proxy uses corrected unique trips rather than stale archived totals', () => {
  const props = { trips_within_400m: 20, nearest_stop_m: 200, transit_available: true, transit_count_method: 'unique_trip_ids' }
  const corrected = carbonEvidence(props, 'small_apartment', 10)
  const duplicated = carbonEvidence({ ...props, trips_within_400m: 160 }, 'small_apartment', 10)
  assert.equal(corrected.method, 'recomputed_source_proxy')
  assert.ok(corrected.index > duplicated.index)
  assert.equal(corrected.countMethod, 'unique_trip_ids')
  assert.equal(carbonEvidence({}, 'small_apartment', 10).method, 'archived_proxy')
  assert.equal(carbonEvidence({ ...props, transit_available: false }, 'small_apartment').transit, null)
})
