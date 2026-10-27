import test from 'node:test'
import assert from 'node:assert/strict'
import { factorReceipt, EVIDENCE_LABEL, CONFIDENCE } from './factorReceipts.js'
import { PLANNER_FACTORS } from './plannerState.js'

test('every factor has a receipt with evidence type, source, formula and confidence', () => {
  for (const f of PLANNER_FACTORS) {
    const r = factorReceipt(f.id)
    assert.ok(['Observed Data', 'Value Judgment / Assumption'].includes(r.badge), f.id)
    assert.ok(r.source.length > 30 && r.formula.length > 30, f.id)
    assert.ok(CONFIDENCE.includes(r.confidence), f.id)
  }
  const kinds = Object.fromEntries(PLANNER_FACTORS.map(f => [f.id, factorReceipt(f.id).evidence]))
  assert.deepEqual(kinds, { demand: 'observed', physical: 'observed', affordability: 'judgment', displacement: 'observed', capacity: 'judgment', access: 'observed', carbon: 'judgment' })
  assert.equal(EVIDENCE_LABEL.judgment, 'Value Judgment / Assumption')
  assert.equal(factorReceipt('nope'), null)
  assert.match(factorReceipt('affordability').formula, /100 at 20% burden, 0 at 50%/)
  assert.match(factorReceipt('displacement').source, /ACS 2020–2024.*CHAS 2018–2022/)
  assert.match(factorReceipt('carbon').formula, /Not tonnes/)
})

test('receipts show the inputs behind one option and lower confidence for weaker evidence', () => {
  const option = { scores: { access: 61.2, affordability: 40, capacity: 80 }, raw: { demand: 55, displacement_risk: 42.4, carbon_index: 30 },
    massing: { fits: true, collisions: 0 }, monthly: 1350, burden: 0.324, costAssumptionsConfirmed: true, supply: 120, groupBoardings: 30, reserve: { method: 'schedule_assumption' },
    service: { walk: 4.25, wait: 7.5, departures: 60, method: 'network' } }
  assert.equal(factorReceipt('access', option).inputs, '4.3 min walk + 7.5 min wait · 60 departures/day')
  assert.equal(factorReceipt('access', option).score, 61.2)
  assert.equal(factorReceipt('access', option).confidence, 'Medium')
  assert.equal(factorReceipt('access', { ...option, service: { ...option.service, method: 'straight_line' } }).confidence, 'Low')
  assert.equal(factorReceipt('affordability', option).inputs, '$1,350/month = 32% of target income')
  assert.equal(factorReceipt('affordability', { ...option, burden: null }).inputs, 'Housing costs not confirmed')
  assert.equal(factorReceipt('capacity', option).inputs, '120 available ÷ 30 assumed boardings (schedule × assumed places)')
  assert.equal(factorReceipt('physical', option).inputs, 'Fits; no overlap')
  assert.equal(factorReceipt('physical', { ...option, massing: { fits: false } }).inputs, 'Footprint does not fit the outline')
  assert.equal(factorReceipt('displacement', option).inputs, 'Tract risk 42.4')
  assert.equal(factorReceipt('demand', option).inputs, 'Market/lot proxy 55.0')
  assert.equal(factorReceipt('carbon', option).inputs, 'Relative index 30.0 per home')
  assert.equal(factorReceipt('access', { scores: {} }).inputs, 'No stop within reach')
})
