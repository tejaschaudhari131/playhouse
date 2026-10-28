import { fitMassing, geometriesOverlap } from './plannerGeometry.js'
import { resolveZoning, unitPermission } from './zoning.js'
import { PLANNER_FACTORS } from './plannerState.js'
import { networkAccess, infrastructureReservations, validateConnection, validatePark } from './networkModel.js'
import { rankedWinner, recommendationAudit } from './plannerRecommendation.js'
import { shortlistTemplates, comparisonTemplates, summarizeShortlist } from './plannerShortlist.js'
import { evaluateTitleNine, housingSpec } from './titleNine.js'
import { retainedBuildings } from './redevelopment.js'
import { housingCostBurden, housingCostValidation, housingCostEvidence } from './housingCosts.js'
import { preferenceFactor, LIVE_MODEL_ID, ARCHIVED_MODEL_ID } from './scoringPolicy.js'
import { displacementScreen } from './displacementModel.js'
import { transitCapacityCheck, combineChecks } from './capacityCheck.js'
import { marketFitEvidence } from './marketFitEvidence.js'
import { carbonEvidence } from './carbonEvidence.js'

const clamp = value => Math.max(0, Math.min(100, value))
const numeric = value => typeof value === 'number' && Number.isFinite(value)
export const round = value => numeric(value) ? Math.round(value * 10) / 10 : null

export { nearbyTransitStops as nearbyStops, choosePreferredStop as preferredStop } from './transitStops.js'

/** GTFS is service evidence, not occupancy. Manual totals override the explicit scenario assumption. */
export function transitReserve(stop, state) {
  if (!stop || !numeric(stop.weekday_trips) || stop.weekday_trips <= 0) return { boardings: null, method: 'unavailable' }
  if (numeric(state.spareBoardings) && (!state.capacityStopId || String(stop.stop_id) === state.capacityStopId)) {
    return { boardings: state.spareBoardings > 0 ? state.spareBoardings : null, method: state.spareBoardings > 0 ? 'manual' : 'unavailable', reason: state.spareBoardings > 0 ? null : 'Zero reserve is unassessed, not observed zero capacity.' }
  }
  if (state.capacityMode === 'schedule' && numeric(state.baselinePlacesPerDeparture) && state.baselinePlacesPerDeparture > 0) {
    return { boardings: stop.weekday_trips * state.baselinePlacesPerDeparture, method: 'schedule_assumption' }
  }
  return { boardings: null, method: 'unavailable' }
}

/** One existing stop only: never sum the same trip at multiple stops. No route or timetable claim. */
export function serviceMetrics(stop, scenario, proposed, networkMetric = undefined) {
  if (!stop || !numeric(stop.weekday_trips) || stop.weekday_trips <= 0) return null
  if (networkMetric !== undefined && !numeric(networkMetric.walkMinutes)) return null
  const added = proposed && (!scenario.serviceStopId || String(stop.stop_id) === scenario.serviceStopId) ? Math.max(0, scenario.additionalDepartures) : 0
  const departures = stop.weekday_trips + added
  const headway = scenario.serviceHours * 60 / departures
  const walk = networkMetric === undefined ? stop.distance / 80 : networkMetric.walkMinutes
  const wait = headway / 2
  return { departures, added, headway, walk, wait, minutes: walk + wait, score: clamp(100 * (1 - (walk + wait) / 30)), method: networkMetric === undefined ? 'straight_line' : 'network' }
}

function evaluateOption(option, feature, zoning, state, stop, proposed, massing, access) {
  const spec = housingSpec(option)
  if (!spec) throw new Error('Unknown building type')
  const props = feature.properties, raw = props.scores?.[spec.scoreType] || {}
  const permission = unitPermission(spec.scoreType, spec.useRow, resolveZoning(props.zoning_code, zoning), spec.units)
  const service = serviceMetrics(stop, state, proposed, access)
  const parkShare = access ? Math.max(0, Math.min(100, state.parkAccessShare || 0)) / 100 : 0
  const transitScore = service?.score ?? null, parkScore = access?.parkScore ?? null
  const accessScore = (parkShare < 1 && transitScore === null) || (parkShare > 0 && parkScore === null) ? null : (1 - parkShare) * (transitScore || 0) + parkShare * (parkScore || 0)
  const costs = housingCostBurden(state, option)
  const displacement = displacementScreen(props, raw.displacement_risk)
  const carbon = carbonEvidence(props, spec.scoreType, raw.carbon_index)
  const marketEvidence = marketFitEvidence(props, spec.scoreType)
  const { monthly, burden } = costs
  const demandBoardings = spec.units * state.boardingsPerHome
  const reserve = transitReserve(stop, state), spare = reserve.boardings
  // Additional places are a user assumption about available boarding capacity, not vehicle occupancy data.
  const addedPlaces = service ? service.added * state.availablePlacesPerDeparture : 0
  const supply = spare === null ? null : spare + addedPlaces
  const groupBoardings = ((state.committedUnitsByStop?.[String(stop?.stop_id)] || 0) + spec.units) * state.boardingsPerHome
  const scores = {
    demand: numeric(raw.demand) ? raw.demand : null,
    physical: !massing.fits || massing.collisions > 0 ? 0 : massing.collisions === null ? null : 100,
    affordability: costs.score,
    displacement: numeric(displacement.risk) ? 100 - displacement.risk : null,
    capacity: supply === null || !service ? null : groupBoardings > 0 ? clamp(100 * supply / groupBoardings) : 100,
    access: accessScore,
    carbon: numeric(carbon.index) ? 100 - carbon.index : null,
  }
  const physicalEligible = massing.fits && massing.collisions === 0
  const checks = {
    physical: { status: !massing.fits || massing.collisions > 0 ? 'fail' : massing.collisions === null ? 'unknown' : 'pass', label: physicalEligible ? 'Footprint fits; no overlap' : !massing.fits ? 'Footprint does not fit' : massing.collisions === null ? 'Building overlap unassessed' : 'Building or infrastructure overlap', detail: physicalEligible ? 'The proposed rectangle fits within the mapped parcel and clears retained buildings and infrastructure; legal setbacks and dimensional rules are screened separately.' : !massing.fits ? 'The proposed rectangle crosses the parcel boundary.' : massing.collisions === null ? 'Retained-building evidence is unavailable.' : 'The proposed rectangle overlaps a retained building or reserved infrastructure.', blocking: true },
    capacity: transitCapacityCheck({ supply, groupBoardings, service, reserve, addedPlaces, boardingsPerHome: state.boardingsPerHome }),
  }
  return { ...option, checks, displacement, marketEvidence, carbonEvidence: carbon, modelId: LIVE_MODEL_ID, sourceModelId: ARCHIVED_MODEL_ID, costEvidence: housingCostEvidence(state, option), costValidation: housingCostValidation(state, option), pin: props.pin, label: spec.label, units: spec.units, floors: option.floors ?? spec.floors, permission, massing, scores, eligible: physicalEligible, physicalEligible, service, access, monthly, burden, costAssumptionsConfirmed: costs.confirmed, demandBoardings, groupBoardings, addedPlaces, supply, reserve, raw,
    gate: !massing.fits ? 'Footprint does not fit' : massing.collisions > 0 ? 'Building or infrastructure overlap' : massing.collisions === null ? 'Building overlap check unavailable' : 'No supported conflict found',
  }
}

function screenZoningPortfolio(members, context) {
  const { zoningSites, scenario, zoning } = context
  const legalMembers = members.map(member => ({ option: member, massing: member.massing, feature: zoningSites.get(member.pin).feature, izStatus: scenario.zoningInputsByPin?.[member.pin]?.izStatus }))
  return members.map(member => {
    const site = zoningSites.get(member.pin)
    const titleNine = evaluateTitleNine({ ...site, option: member, massing: member.massing, zoning, members: legalMembers,
      siteInputs: scenario.zoningInputsByPin?.[member.pin], projectInputs: scenario.projectInputs })
    const conflict = titleNine.checks.find(c => c.status === 'conflict')
    // By-right reform simulation lifts only the §911.02 use-row conflict; every other gate stays.
    const useOnly = titleNine.checks.every(c => c.status !== 'conflict' || c.id === 'use')
    return { ...member, titleNine, zoningReview: { incomplete: titleNine.excluded.length > 0, notAssessed: titleNine.excluded.length, assessed: titleNine.assessed.length, label: titleNine.excluded.length ? `Zoning review incomplete: ${titleNine.excluded.length} checks not assessed` : 'All supported zoning checks assessed' }, permission: titleNine.permission, eligible: member.physicalEligible && !titleNine.conflict, reformEligible: member.physicalEligible && useOnly,
      gate: !member.physicalEligible ? member.gate : conflict ? `Zoning conflict: ${conflict.label}` : `${titleNine.assessed.length} checks assessed · ${titleNine.excluded.length} not assessed` }
  })
}

function portfolioZoningReview(members) {
  const notAssessed = members.reduce((sum, member) => sum + (member.zoningReview?.notAssessed || 0), 0)
  const assessed = members.reduce((sum, member) => sum + (member.zoningReview?.assessed || 0), 0)
  return { incomplete: notAssessed > 0, notAssessed, assessed, label: notAssessed ? `Zoning review incomplete: ${notAssessed} checks not assessed${members.length > 1 ? ` across ${members.length} buildings` : ''}` : 'All supported zoning checks assessed' }
}

function weighted(option, weights, included) {
  const denominator = included.reduce((sum, id) => sum + weights[id], 0)
  return denominator > 0 ? included.reduce((sum, id) => sum + option.scores[id] * weights[id], 0) / denominator : null
}

/** Priorities only change aggregation; retain source, geometry and legal evidence. */
function weightScreen({ baseline, proposal }, weights) {
  const values = [...Object.values(baseline), ...Object.values(proposal)]
  const included = PLANNER_FACTORS.map(f => f.id).filter(id => preferenceFactor(id) && numeric(weights[id]) && weights[id] > 0 && values.every(o => numeric(o.scores[id])))
  const excluded = PLANNER_FACTORS.map(f => f.id).filter(id => !included.includes(id))
  // suitability is the weighted factor score before eligibility gates; it is never a ranking.
  const reweight = options => Object.fromEntries(Object.entries(options).map(([id, option]) => {
    const suitability = weighted(option, weights, included)
    return [id, { ...option, suitability, total: option.eligible ? suitability : null, reformTotal: option.reformEligible ? suitability : null }]
  }))
  return { baseline: reweight(baseline), proposal: reweight(proposal), included, excluded }
}

function screenOptions(options, context) {
  const { feature, zoning, scenario, stop, existingBuildings, reservations, infrastructureErrors, accessBefore, accessAfter, committed = { baseline: [], proposal: [] } } = context
  const baseline = {}, proposal = {}
  const ids = Object.keys(options)
  for (const slot of ids) {
    const option = options[slot]
    const massing = fitMassing(feature.geometry, option.width, option.depth, option.placement, existingBuildings)
    const proposalMassing = reservations.length ? fitMassing(feature.geometry, option.width, option.depth, option.placement, existingBuildings === null ? null : [...existingBuildings, ...reservations]) : massing
    baseline[slot] = evaluateOption(option, feature, zoning, scenario, stop, false, massing, accessBefore)
    proposal[slot] = evaluateOption(option, feature, zoning, scenario, stop, true, proposalMassing, accessAfter)
    if (infrastructureErrors.length) {
      proposal[slot].eligible = false
      proposal[slot].physicalEligible = false
      proposal[slot].scores.physical = null
      proposal[slot].checks.physical = { status: 'unknown', label: 'Infrastructure geometry needs review', blocking: true }
      proposal[slot].gate = 'Infrastructure validation unavailable or failed — review required'
    }
  }
  for (const [state, values] of Object.entries({ baseline, proposal })) for (const slot of ids) {
      // The next building can change checks on already placed buildings (FAR, IZ, parking).
      const screened = screenZoningPortfolio([...committed[state], values[slot]], context)
      const candidate = screened.at(-1)
      values[slot] = candidate
      if (!committed[state].length) continue
      const members = screened.slice(0, -1).map(member => {
        const sameStop = member.stopId === String(stop?.stop_id)
        const groupUnits = (scenario.committedUnitsByStop?.[member.stopId] || 0) + (sameStop ? candidate.units : 0)
        const demand = groupUnits * scenario.boardingsPerHome
        const capacity = member.supply === null || !member.service ? null : demand > 0 ? clamp(100 * member.supply / demand) : 100
        return { ...member, scores: { ...member.scores, capacity }, checks: { ...member.checks, capacity: transitCapacityCheck({ supply: member.supply, groupBoardings: demand, service: member.service, reserve: member.reserve, addedPlaces: member.addedPlaces, boardingsPerHome: scenario.boardingsPerHome }) } }
      })
      const portfolio = [...members, candidate], units = portfolio.reduce((n, member) => n + member.units, 0)
      candidate.siteScores = candidate.scores
      candidate.checks = Object.fromEntries(['physical', 'capacity'].map(id => [id, combineChecks(portfolio.map(member => member.checks[id]))]))
      candidate.zoningReview = portfolioZoningReview(portfolio)
      candidate.siteEligible = candidate.eligible
      candidate.area = { units, buildings: portfolio.length, parcels: new Set([...members.map(m => m.pin), feature.properties.pin]).size,
        invalid: members.filter(m => !m.eligible).map(m => ({ id: m.id, pin: m.pin, gate: m.gate })) }
      candidate.scores = Object.fromEntries(PLANNER_FACTORS.map(f => [f.id, portfolio.every(m => numeric(m.scores[f.id])) ? portfolio.reduce((n, m) => n + m.scores[f.id] * m.units, 0) / units : null]))
      candidate.eligible = portfolio.every(m => m.eligible)
      candidate.reformEligible = portfolio.every(m => m.reformEligible)
      if (candidate.area.invalid.length) candidate.gate = `${candidate.area.invalid.length} placed building(s) need review`
    }
  // One evidence denominator across every candidate AND both infrastructure states.
  return weightScreen({ baseline, proposal }, scenario.weights)
}


/** The placed plan alone, separate from the next-building alternatives. */
export function summarizePlacedPlan(committed, weights) {
  if (!committed.baseline.length) return null
  const members = [...committed.baseline, ...committed.proposal]
  const included = PLANNER_FACTORS.map(f => f.id).filter(id => preferenceFactor(id) && weights[id] > 0 && members.every(m => numeric(m.scores[id])))
  const summaries = Object.fromEntries(['baseline', 'proposal'].map(state => {
    const options = committed[state], units = options.reduce((n, o) => n + o.units, 0)
    const scores = Object.fromEntries(PLANNER_FACTORS.map(f => [f.id, options.every(o => numeric(o.scores[f.id])) ? options.reduce((n, o) => n + o.scores[f.id] * o.units, 0) / units : null]))
    const eligible = options.every(o => o.eligible)
    return [state, { scores, units, checks: Object.fromEntries(['physical', 'capacity'].map(id => [id, combineChecks(options.map(option => option.checks[id]))])), zoningReview: portfolioZoningReview(options), buildings: options.length, parcels: new Set(options.map(o => o.pin)).size, eligible, total: eligible ? weighted({ scores }, weights, included) : null }]
  }))
  return { ...summaries, included }
}

export function evaluatePlanner({ feature, zoning, scenario, stop, existingBuildings = null, infrastructureBuildings, networkContext = null, shortlistSlot = 'B', areaSites = [] }) {
  // Both states compare infrastructure for the same housing/redevelopment plan.
  // Filter only recorded evidence, before mixing in proposed-building obstacles.
  existingBuildings = retainedBuildings(existingBuildings, scenario.demolitions)
  areaSites = areaSites.map(site => {
    const retained = retainedBuildings(site.existingBuildings, scenario.demolitions)
    return retained === site.existingBuildings ? site : { ...site, existingBuildings: retained }
  })
  const routed = scenario.accessMode === 'network'
  const infrastructureErrors = [...(scenario.connections || []).map(c => validateConnection(networkContext?.network, c)), ...(scenario.parks || []).map(p => validatePark(networkContext?.network, p))].filter(Boolean)
  const reservations = infrastructureReservations(networkContext?.network, scenario)
  // A restore can put a source footprint back under an existing reservation.
  // Legacy callers supply local evidence; Studio supplies reservation-wide data.
  const infrastructureEvidence = infrastructureBuildings === undefined
    ? existingBuildings === null || areaSites.some(site => site.existingBuildings === null) ? null : [...existingBuildings, ...areaSites.flatMap(site => site.existingBuildings)]
    : retainedBuildings(infrastructureBuildings, scenario.demolitions)
  if (reservations.length && infrastructureEvidence === null) infrastructureErrors.push('Recorded building evidence is unavailable for proposed infrastructure.')
  else for (const reservation of reservations) {
    if (infrastructureEvidence.some(building => geometriesOverlap(reservation.geometry, building.geometry))) {
      infrastructureErrors.push(`Proposed ${reservation.properties.kind} overlaps a retained recorded building. Remove or redraw the infrastructure, or explicitly simulate removing that building.`)
    }
  }
  // Route each infrastructure state once; A/B and all five templates reuse it.
  const accessBefore = routed ? networkAccess(networkContext, feature, stop, scenario, false) : undefined
  const accessAfter = routed ? networkAccess(infrastructureErrors.length ? null : networkContext, feature, stop, scenario, true) : undefined
  // Explicit, fixed placements survive changes in infrastructure. All proposed buildings
  // share the same per-stop boarding pool; reserve is not multiplied by building count.
  const committedUnitsByStop = {}
  for (const site of areaSites) committedUnitsByStop[String(site.stop?.stop_id)] = (committedUnitsByStop[String(site.stop?.stop_id)] || 0) + housingSpec(site.option).units
  const areaScenario = { ...scenario, committedUnitsByStop }
  const geometries = areaSites.map(site => ({ type: 'Feature', properties: { id: site.id }, geometry: fitMassing(site.feature.geometry, site.option.width, site.option.depth, site.option.placement, []).geometry })).filter(f => f.geometry)
  const committed = { baseline: [], proposal: [] }, routeCache = new Map()
  for (const site of areaSites) {
    const otherBuildings = site.existingBuildings === null ? null : [...site.existingBuildings, ...geometries.filter(f => f.properties.id !== site.id)]
    const stopId = String(site.stop?.stop_id)
    const ownUnits = housingSpec(site.option).units
    const siteScenario = { ...areaScenario, targetIncome: site.targetIncome, affordabilityAuto: false, affordabilityConfirmation: site.affordabilityConfirmation, committedUnitsByStop: { ...committedUnitsByStop, [stopId]: committedUnitsByStop[stopId] - ownUnits } }
    for (const state of ['baseline', 'proposal']) {
      const isProposal = state === 'proposal'
      const key = `${site.feature.properties.pin}:${stopId}:${state}`
      if (!routeCache.has(key)) routeCache.set(key, routed ? networkAccess(isProposal && infrastructureErrors.length ? null : networkContext, site.feature, site.stop, scenario, isProposal) : undefined)
      const obstacles = otherBuildings === null ? null : [...otherBuildings, ...(isProposal ? reservations : [])]
      const massing = fitMassing(site.feature.geometry, site.option.width, site.option.depth, site.option.placement, obstacles)
      const member = evaluateOption(site.option, site.feature, zoning, siteScenario, site.stop, isProposal, massing, routeCache.get(key))
      Object.assign(member, { id: site.id, pin: site.feature.properties.pin, stopId })
      if (isProposal && infrastructureErrors.length) { member.eligible = false; member.physicalEligible = false; member.scores.physical = null; member.gate = 'Infrastructure validation unavailable or failed' }
      committed[state].push(member)
    }
  }
  const allBuildings = existingBuildings === null ? null : [...existingBuildings, ...geometries]
  const zoningSites = new Map(areaSites.map(site => [site.feature.properties.pin, site]))
  zoningSites.set(feature.properties.pin, { feature, existingBuildings })
  const context = { feature, zoning, scenario: areaScenario, stop, existingBuildings: allBuildings, zoningSites, reservations, infrastructureErrors, accessBefore, accessAfter, committed }
  for (const state of ['baseline', 'proposal']) committed[state] = screenZoningPortfolio(committed[state], context)
  const { baseline, proposal, included, excluded } = screenOptions(scenario.draft ? comparisonTemplates(scenario) : scenario.options, context)
  const sourceSlot = shortlistSlot === 'A' ? 'A' : 'B'
  const templates = scenario.draft ? comparisonTemplates(scenario) : shortlistTemplates(scenario, sourceSlot)
  const shortlist = summarizeShortlist(scenario.draft ? { baseline, proposal, included, excluded } : screenOptions(templates, context), templates, scenario, sourceSlot)
  const before = rankedWinner(baseline), after = rankedWinner(proposal)
  const changed = before !== after
  const activeId = scenario.draft?.typeId || 'A'
  const accessDelta = baseline[activeId].service && proposal[activeId].service ? baseline[activeId].service.minutes - proposal[activeId].service.minutes : null
  const result = { baseline, proposal, included, excluded, before, after, changed, accessDelta, reservations, infrastructureErrors, committed, placedPlan: summarizePlacedPlan(committed, scenario.weights), scope: areaSites.length ? 'area' : 'parcel' }
  return { ...result, explanation: plannerExplanation(result, scenario, stop), audit: recommendationAudit(result, scenario, feature.properties), ...(scenario.draft ? { comparison: shortlist } : { shortlist }) }
}

export function reweightPlanner(previous, { scenario, feature, stop, shortlistSlot = 'B' }) {
  const screen = weightScreen(previous, scenario.weights)
  const before = rankedWinner(screen.baseline), after = rankedWinner(screen.proposal)
  const sourceSlot = shortlistSlot === 'A' ? 'A' : 'B'
  const templates = scenario.draft ? comparisonTemplates(scenario) : shortlistTemplates(scenario, sourceSlot)
  const legacyScreen = scenario.draft ? null : Object.fromEntries(['baseline', 'proposal'].map(state => [state, Object.fromEntries(previous.shortlist.entries.map(e => [e.id, e[state]]))]))
  const shortlist = summarizeShortlist(scenario.draft ? screen : weightScreen(legacyScreen, scenario.weights), templates, scenario, sourceSlot)
  const result = { ...previous, ...screen, before, after, changed: before !== after, placedPlan: summarizePlacedPlan(previous.committed, scenario.weights) }
  return { ...result, explanation: plannerExplanation(result, scenario, stop), audit: recommendationAudit(result, scenario, feature.properties), ...(scenario.draft ? { comparison: shortlist } : { shortlist }) }
}

function plannerExplanation(result, scenario, stop) {
  const { infrastructureErrors, accessDelta, changed, baseline } = result
  const activeId = scenario.draft?.typeId || 'A', routed = scenario.accessMode === 'network'
  const infrastructureEdited = (scenario.connections?.length || 0) + (scenario.parks?.length || 0) > 0
  return infrastructureErrors.length ? `Proposal ranking is withheld: ${[...new Set(infrastructureErrors)].join(' ')}`
      : infrastructureEdited ? `${scenario.connections?.length || 0} connection(s) and ${scenario.parks?.length || 0} park(s) are proposed. ${accessDelta === null ? 'Stop access could not be compared on this network.' : `Modeled walk + wait changes by ${round(-accessDelta)} minutes.`} ${changed ? 'The preferred option changes under these assumptions.' : 'The housing preference stays the same.'} Access benefits are shared; reserved land can change housing fit. Park access has a ${scenario.parkAccessShare || 0}% share of the access factor. Demand, rents, displacement and carbon are held unchanged.`
      : !stop ? 'No scheduled stop is available. Transit access and capacity are excluded.'
      : routed && !baseline[activeId].service ? 'The selected stop cannot be reached in the loaded walking graph. Transit access and capacity are unknown; no straight-line fallback is used.'
      : scenario.additionalDepartures === 0 ? 'No infrastructure change yet. Add departures to compare the selected housing options before and after service changes.'
      : `${scenario.additionalDepartures} proposed departures reduce modeled average walk + wait by ${round(accessDelta)} minutes. ${changed ? 'The preferred option changes under the current assumptions.' : 'The preferred housing option stays the same.'} Access gains are shared by selected types. ${baseline[activeId].supply === null ? 'Spare capacity is unknown and excluded from ranking.' : 'Capacity uses scheduled service and explicit spare-boardings and per-home demand assumptions, not observed occupancy.'} Demand, affordability, displacement and carbon stay unchanged.`
}
