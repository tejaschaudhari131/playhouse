import test from 'node:test'
import assert from 'node:assert/strict'
import { APARTMENT_FOOTPRINT, CORE_MINIMUMS, EGRESS_RULES, coreArea, egressCheck, egressMassing, egressMinimum, stairComparison, stairsRequired } from './singleStair.js'
import { optionFor } from './plannerState.js'
import { TYPE_MINIMUMS, fitToLot } from './lotFit.js'
import { buildProposedBuilding } from './threeBuildingMeshes.js'
import { architecturalMassing } from './architecture3d.js'
import { validatePlan } from './planPersistence.js'
import { initialStudioScenario } from './plannerState.js'
import { typologyCards } from './buildControls.js'

const smallApt = { typeId: 'small_apartment', floors: 4, units: 12 }

test('IBC baseline: one stair only up to 3 stories and 4 homes per story; reform allows 6 stories', () => {
  assert.equal(EGRESS_RULES['two-stair'].maxSingleStairStories, 3)
  assert.equal(EGRESS_RULES['single-stair'].maxSingleStairStories, 6)
  assert.equal(stairsRequired({ typeId: 'triplex', floors: 3, units: 3 }), 1)
  assert.equal(stairsRequired(smallApt), 2, '4 stories needs two stairs under the 2024 IBC')
  assert.equal(stairsRequired(smallApt, 'single-stair'), 1)
  assert.equal(stairsRequired({ ...smallApt, floors: 6, units: 18 }, 'single-stair'), 1, '6 stories × 3 homes')
  assert.equal(stairsRequired({ ...smallApt, floors: 7, units: 21 }, 'single-stair'), 2, '7 stories exceeds the reform')
  assert.equal(stairsRequired({ ...smallApt, floors: 4, units: 20 }, 'single-stair'), 2, '5 homes per story exceeds 4')
  assert.equal(stairsRequired({ typeId: 'large_apartment', floors: 8, units: 40 }, 'single-stair'), 2)
  assert.equal(stairsRequired({ ...smallApt, width: 40, depth: 80 }, 'single-stair'), 2, 'over 125 ft travel')
  assert.equal(stairsRequired({ typeId: 'single_family', floors: 3, units: 1 }), 1)
})

test('single-stair core fits a narrower footprint and leaves more of each floor for homes', () => {
  const one = coreArea(APARTMENT_FOOTPRINT['single-stair'], 1), two = coreArea(APARTMENT_FOOTPRINT['two-stair'], 2)
  assert.ok(one.efficiency > two.efficiency)
  assert.ok(CORE_MINIMUMS[1].width < CORE_MINIMUMS[2].width)
  const narrow = { ...smallApt, width: 11, depth: 18 }
  assert.equal(egressCheck(narrow, 'two-stair').fits, false)
  assert.equal(egressCheck(narrow, 'two-stair').stairs, 2)
  assert.equal(egressCheck(narrow, 'single-stair').fits, true)
  assert.match(egressCheck(narrow, 'single-stair').text, /One stair/)
  assert.equal(egressCheck({ typeId: 'townhouse_duplex', width: 9, depth: 14, floors: 3, units: 2 }), null)
})

test('fit minimums and default massing follow the stair rule', () => {
  assert.deepEqual(egressMinimum(smallApt, TYPE_MINIMUMS.small_apartment, 'two-stair'), CORE_MINIMUMS[2])
  assert.deepEqual(egressMinimum(smallApt, TYPE_MINIMUMS.small_apartment, 'single-stair'), { width: 9, depth: 15 })
  assert.deepEqual(egressMinimum({ typeId: 'single_family' }, TYPE_MINIMUMS.single_family, 'two-stair'), TYPE_MINIMUMS.single_family)
  assert.deepEqual(egressMassing('small_apartment', 'single-stair', { width: 14, depth: 20 }), APARTMENT_FOOTPRINT['single-stair'])
  assert.deepEqual(egressMassing('triplex', 'single-stair', { width: 10, depth: 16 }), { width: 10, depth: 16 })
  const option = optionFor('small_apartment', 1000, 'single-stair')
  assert.equal(option.width, 11)
  assert.equal(optionFor('small_apartment', 1000).width, 14)
})

test('a 12 m-wide lot fits the small apartment only with a single stair', () => {
  const k = 111320 * Math.cos(40.41 * Math.PI / 180), w = 12.5, d = 36
  const ring = [[0, 0], [w, 0], [w, d], [0, d], [0, 0]].map(([x, y]) => [-79.94 + x / k, 40.41 + y / 111320])
  const geometry = { type: 'Polygon', coordinates: [ring] }
  const fit = (option, rule) => fitToLot({ option, geometry, minimum: egressMinimum(option, TYPE_MINIMUMS[option.typeId], rule) })
  const [before, after] = stairComparison({ ...optionFor('small_apartment', 1000), units: 12 }, fit)
  assert.equal(before.rule, 'two-stair'); assert.equal(before.stairs, 2)
  assert.equal(after.rule, 'single-stair'); assert.equal(after.stairs, 1)
  assert.equal(after.fits, true)
  const twoStairOnLot = fitToLot({ option: { ...optionFor('small_apartment', 1000), units: 12 }, geometry, minimum: CORE_MINIMUMS[2] })
  assert.ok(!twoStairOnLot || twoStairOnLot.width >= 12)
})

test('3D: two-stair apartments get two roof stair bulkheads, single-stair one', () => {
  const ring = [[-6, -9], [6, -9], [6, 9], [-6, 9]]
  const one = buildProposedBuilding({ ring, typeId: 'small_apartment', height: 15, floors: 4, stairs: 1 })
  const two = buildProposedBuilding({ ring, typeId: 'small_apartment', height: 15, floors: 4, stairs: 2 })
  assert.equal(one.stairs, 1); assert.equal(two.stairs, 2)
  assert.equal(two.geometries.get('door').position.length, 2 * one.geometries.get('door').position.length, 'one rooftop door per stair')
  const k = 111320 * Math.cos(40.41 * Math.PI / 180)
  const geometry = { type: 'Polygon', coordinates: [[[0, 0], [12, 0], [12, 18], [0, 18], [0, 0]].map(([x, y]) => [-79.94 + x / k, 40.41 + y / 111320])] }
  const heads = stairs => architecturalMassing({ geometry, typeId: 'small_apartment', height: 15, floors: 4, color: '#c2410c', stairs }).filter(p => p.part === 'penthouse').length
  assert.equal(heads(1), 1); assert.equal(heads(2), 2)
})

test('the stair rule saves with the plan and labels the typology card', () => {
  const scenario = initialStudioScenario('0056F00338000000')
  assert.equal(validatePlan({ ...scenario, egress: 'single-stair' }), null)
  assert.match(validatePlan({ ...scenario, egress: 'three-stair' }) || '', /stair/)
  const cards = typologyCards({ draft: scenario.draft, options: {}, code: null, zoning: null, egress: 'single-stair' })
  const apt = cards.find(c => c.typeId === 'small_apartment')
  assert.equal(apt.shortLabel, 'Single-stair apartment')
  assert.equal(apt.stairs.count, 1)
  assert.equal(apt.width, 11)
  const current = typologyCards({ draft: scenario.draft, options: {}, code: null, zoning: null }).find(c => c.typeId === 'small_apartment')
  assert.equal(current.stairs.count, 2)
  assert.equal(cards.find(c => c.typeId === 'single_family').stairs, null)
})
