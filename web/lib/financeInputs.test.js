import test from 'node:test'
import assert from 'node:assert/strict'
import { financeInputs, validFinanceInputs, operatingStatement, developmentBudget, constructionRates } from './financeInputs.js'
import { breakEvenRent } from './proForma.js'
import { validatePlan } from './planPersistence.js'
import { initialStudioScenario } from './plannerState.js'
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-6)

test('annual operations separately subtract vacancy and expenses; break-even inverts the same formula', () => {
  const inputs = financeInputs({ vacancyShare: .05, operatingShare: .35, capRate: .075 })
  const o = operatingStatement(1500, 3, inputs)
  assert.equal(o.scheduledRent, 54000); assert.equal(o.vacancyLoss, 2700)
  assert.equal(o.effectiveIncome, 51300); assert.equal(o.expenses, 17955); assert.equal(o.noi, 33345)
  close(o.capitalized, 444600)
  const rents = breakEvenRent([1e6, 1.5e6], 3, inputs)
  rents.forEach((rent,i) => close(operatingStatement(rent,3,inputs).capitalized, [1e6,1.5e6][i]))
})
test('budget includes each cost exactly once and exposes financing assumptions', () => {
  const budget = developmentBudget({ construction:[1e6,1e6], demolition:[0,0], acquisition:[100000,100000], units:10, assumptions:financeInputs() })
  assert.deepEqual(budget.siteWork,[100000,100000]); assert.deepEqual(budget.hard,[1100000,1100000])
  close(budget.soft[0],132000); close(budget.contingency[0],55000); close(budget.developerFee[0],128700)
  assert.deepEqual(budget.reserves,[30000,30000])
  const beforeInterest = 1100000+132000+55000+128700+30000+100000
  close(budget.interest[0], beforeInterest*.65*.5*.075*1.5)
  close(budget.development[0], beforeInterest+budget.interest[0])
  close(budget.beforeLand[0], budget.development[0]-100000)
})
test('cost bands differentiate low-rise construction without giving an eight-story building walk-up prices', () => {
  assert.deepEqual(constructionRates({typeId:'triplex',floors:3}),[215,285])
  assert.deepEqual(constructionRates({typeId:'small_apartment',floors:2}),[185,230])
  assert.deepEqual(constructionRates({typeId:'large_apartment',floors:8}),[340,485])
})
test('invalid finance and reversed cost ranges cannot enter an imported plan', () => {
  const scenario = initialStudioScenario('0056F00338000000')
  for (const proForma of [{capRate:0},{vacancyShare:1},{constructionMonths:1.5},{constructionByType:{triplex:[300,200]}},{unknown:1}]) {
    assert.equal(validFinanceInputs(proForma),false)
    assert.match(validatePlan({...scenario,proForma}),/pro forma/)
  }
  assert.equal(validatePlan({...scenario,proForma:{capRate:.08,constructionByType:{triplex:[200,300]}}}),null)
})
