import { housingCostConfirmed } from './housingCosts.js'

/** Optional older-export metadata must never introduce undefined into saved JSON. */
export function sharedHouseholdInputs(scenario) {
  return { targetIncome: scenario.targetIncome, householdSize: scenario.householdSize || 1,
    incomeSource: scenario.incomeSource || 'legacy', incomeBand: scenario.incomeBand ?? null,
    rentMode: scenario.rentMode || 'custom', affordabilityAuto: housingCostConfirmed(scenario, scenario.draft || scenario.option) }
}
export function customRentInputs(option) {
  return { rent: option.rent, rentSource: option.rentSource || 'legacy',
    rentSourceDetail: option.rentSourceDetail || 'Preserved scenario rent; original provenance was not recorded.', rentRange: option.rentRange ?? null }
}
export function restoredBuildingInputs(building) {
  return { ...sharedHouseholdInputs(building), draft: { ...building.option },
    rentMode: building.rentMode || (building.option.rentSource === 'type-baseline' ? 'prototype' : 'custom'),
    affordabilityAuto: housingCostConfirmed(building, building.option),
    affordabilityConfirmation: building.affordabilityConfirmation || null, stopId: building.stopId }
}

/** Older imports without schedule-reserve fields keep their manual/unknown baseline. */
export function sharedCapacityInputs(scenario) {
  return { capacityMode: scenario.capacityMode || 'manual', baselinePlacesPerDeparture: scenario.baselinePlacesPerDeparture ?? 0,
    serviceStopId: scenario.serviceStopId || scenario.stopId || '', capacityStopId: scenario.capacityStopId || scenario.stopId || '',
    accessMode: scenario.accessMode || 'network' }
}
