/** One service investment is retained when inspecting another stop. */
export function selectedDepartures(scenario) {
  return scenario.serviceStopId && scenario.serviceStopId !== scenario.stopId ? 0 : scenario.additionalDepartures
}
export function servicePatch(scenario, value) {
  // 'No change' at another stop must not silently erase the retained investment.
  if (value === 0 && scenario.serviceStopId && scenario.serviceStopId !== scenario.stopId) return {}
  return { additionalDepartures: value, serviceStopId: value > 0 ? scenario.stopId : '' }
}
export function transitComparisonLabel(scenario) {
  return scenario.connections?.length || scenario.parks?.length ? 'With infrastructure changes'
    : selectedDepartures(scenario) > 0 ? 'With added service' : 'Current service'
}
