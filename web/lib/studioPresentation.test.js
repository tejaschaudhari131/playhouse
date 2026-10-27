import test from 'node:test'
import assert from 'node:assert/strict'
import { templateTradeoffs,studioSites,planImpact } from './studioPresentation.js'
import { PRIORITY_STANCES } from './priorityStances.js'
import { PLANNER_FACTORS } from './plannerState.js'
test('pros/cons follow weighted differences and omit shared, excluded and ineligible factors',()=>{
 const a={id:'a',proposal:{eligible:true,total:60,scores:{demand:60,access:90,carbon:20}}}
 const b={id:'b',proposal:{eligible:true,label:'Other',total:50,scores:{demand:40,access:90,carbon:80}}}
 const result=templateTradeoffs(a,[a,b], [{id:'demand',included:true,effectiveWeight:.5},{id:'access',included:true,effectiveWeight:.5},{id:'carbon',included:false}], 'proposal')
 assert.deepEqual(result.pros.map(x=>[x.id,x.points]),[['demand',10]])
 assert.equal(result.cons.length,0)
 a.proposal.eligible=false;assert.equal(templateTradeoffs(a,[a,b],[],'proposal').reference,null)
})
test('discovery filters records within the study area and never ranks by recommended type',()=>{
 const f=(pin,props)=>({properties:{pin,area:'Hazelwood',...props}})
 const parcels={features:[f('b',{address:'B',vacant_lot:true}),f('a',{address:'A',vacant_lot:true}),f('elsewhere',{area:'Lawrenceville',vacant_lot:true}),f('occupied',{vacant_lot:false})]}
 assert.deepEqual(studioSites(parcels,{},'Hazelwood',{vacant:true}).map(f=>f.properties.pin),['a','b'])
 assert.equal(studioSites(parcels,{},'Hazelwood',{flood:'none'}).length,0)
 assert.equal(studioSites(parcels,{},'Hazelwood',{typeId:'triplex'}).length,0)
 for(const p of PRIORITY_STANCES) for(const f of PLANNER_FACTORS) assert.ok(Number.isFinite(p.weights[f.id]))
})

test('compare always shows an underlying score with a zoning badge, and reform simulation lifts only the use-row conflict', async () => {
  const { evaluatePlanner } = await import('./plannerModel.js')
  const { initialStudioScenario } = await import('./plannerState.js')
  const { rectangleAt } = await import('./plannerGeometry.js')
  const { zoningBadge, comparisonScore } = await import('./studioPresentation.js')
  const scores = Object.fromEntries(['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'].map(id => [id, { demand: 60, displacement_risk: 30, carbon_index: 20 }]))
  const feature = { type: 'Feature', properties: { pin: 'site', zoning_code: 'R1D-M', lot_sqft: 40000, scores }, geometry: rectangleAt([-79.94, 40.41], 60, 60) }
  const zoning = { districts: { 'R1D-M': { use_table_read: true, code_section: 'Fixture', allowed: ['single_family'], use_rows: { 'Single-Unit Detached': 'P', 'Two-Unit': 'S', 'Three-Unit': '', 'Multi-Unit': '' } } } }
  const base = initialStudioScenario('site', feature.properties)
  const scenario = { ...base, draft: { ...base.draft, typeId: 'single_family', width: 8, depth: 12, height: 8, floors: 2 }, comparisonTypes: ['townhouse_duplex', 'triplex', 'large_apartment'] }
  const result = evaluatePlanner({ feature, zoning, scenario, stop: null, existingBuildings: [] })
  const { single_family: allowed, townhouse_duplex: special, triplex: blocked, large_apartment: tall } = result.proposal
  assert.deepEqual(zoningBadge(allowed), { tone: 'permitted', text: 'Permitted' })
  assert.equal(zoningBadge(special).tone, 'special')
  assert.deepEqual(zoningBadge(blocked), { tone: 'reform', text: 'Requires zoning variance / reform: Proposed use' })
  assert.equal(blocked.total, null)
  assert.ok(Number.isFinite(blocked.suitability))
  assert.equal(blocked.reformEligible, true)
  assert.equal(blocked.reformTotal, blocked.suitability)
  assert.deepEqual(comparisonScore(blocked), { value: blocked.suitability, kind: 'underlying' })
  assert.deepEqual(comparisonScore(blocked, true), { value: blocked.suitability, kind: 'reform' })
  assert.deepEqual(comparisonScore(allowed, true), { value: allowed.total, kind: 'score' })
  const heightConflict = evaluatePlanner({ feature, zoning, scenario: { ...scenario, draft: { ...scenario.draft, typeId: 'triplex', width: 10, depth: 16, floors: 3, height: 90 }, comparisonTypes: [] }, stop: null, existingBuildings: [] }).proposal.triplex
  assert.match(zoningBadge(heightConflict).text, /^Requires zoning variance \/ reform: Proposed use \+ \d+ other conflict/)
  assert.equal(heightConflict.reformEligible, false, 'reform never bypasses height or other standards')
  assert.equal(comparisonScore(heightConflict, true).kind, 'underlying')
  assert.equal(result.comparison.entries.find(e => e.id === 'triplex').proposal.reformTotal, blocked.reformTotal)
  assert.ok(!result.comparison.proposal.order.includes('triplex'), 'reform simulation is display-only and never ranks')
  assert.equal(zoningBadge({}).text, 'Proposed use not reviewed')
})

test('plan impact bar reports homes, net homes and the plan score without inventing a ranking', () => {
  assert.deepEqual(planImpact({ net: null }), { empty: true, text: 'No buildings added or removed yet.' })
  const net = { proposed: 3, replaced: 1, net: 2, uncertain: false }
  const bar = planImpact({ buildings: 1, demolitions: 1, net, placedPlan: { baseline: { total: 51.24 }, proposal: { total: 55 } } })
  assert.equal(bar.homes, 3)
  assert.equal(bar.net, '+2')
  assert.equal(bar.netDetail, '3 proposed − 1 replaced (estimate)')
  assert.equal(bar.score.text, '51.2 → 55.0')
  assert.equal(bar.score.detail, 'Current → changed infrastructure')
  const blocked = planImpact({ buildings: 1, net, placedPlan: { baseline: { total: null }, proposal: { total: null } } })
  assert.equal(blocked.score.text, 'Not ranked')
  assert.equal(planImpact({ buildings: 1, net, placedPlan: { baseline: { total: 40 }, proposal: { total: null } } }).score.text, '40.0 → —')
  assert.match(blocked.score.detail, /needs zoning or physical review/)
  assert.equal(planImpact({ buildings: 1, net, pending: true }).score.text, 'Updating…')
  assert.equal(planImpact({ demolitions: 1, net: { proposed: 0, replaced: 2, net: -2, uncertain: true } }).net, 'up to −2')
})
