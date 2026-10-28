const finite = value => typeof value === 'number' && Number.isFinite(value)

/** Daily schedule sensitivity only. These bounds are scenario assumptions, not occupancy observations. */
export const CAPACITY_ASSUMPTIONS = {
  boardingsPerHome: { value: 4, low: 2, high: 6, label: 'Daily transit boardings per proposed home', explanation: 'Four is an editable household travel assumption (for example two people making a round trip). Test 2–6; no local household ridership is inferred.' },
  baselinePlacesPerDeparture: { value: 1, low: .5, high: 2, label: 'Spare places per existing departure', explanation: 'Illustrative 0.5–2 available boarding places per scheduled departure. Scheduled trips do not establish occupancy, peak loads or operational capacity.' },
  availablePlacesPerDeparture: { value: 10, low: 5, high: 20, label: 'Usable places per added departure', explanation: 'Illustrative 5–20 places after other riders. This is not the vehicle capacity and assumes the proposed service is funded and operated.' },
}

export function transitCapacityCheck({ supply, groupBoardings, service, reserve, addedPlaces = 0, boardingsPerHome }) {
  const valid = finite(supply) && supply > 0 && finite(groupBoardings) && groupBoardings > 0 && finite(boardingsPerHome) && boardingsPerHome > 0 && !!service
  const manual = reserve?.method === 'manual'
  const low = !valid ? null : manual ? supply : Math.max(0, (supply - addedPlaces) * .5 + addedPlaces * .5)
  const high = !valid ? null : manual ? supply : (supply - addedPlaces) * 2 + addedPlaces * 2
  const assumedHomes = valid ? groupBoardings / boardingsPerHome : null
  const demandRange = !valid ? null : { low: assumedHomes * CAPACITY_ASSUMPTIONS.boardingsPerHome.low, high: assumedHomes * CAPACITY_ASSUMPTIONS.boardingsPerHome.high }
  const status = !valid ? 'unknown' : supply >= groupBoardings ? 'pass' : 'fail'
  return {
    status, label: status === 'unknown' ? 'Transit capacity unknown' : status === 'pass' ? 'Assumed transit reserve covers demand' : 'Assumed transit reserve below demand',
    detail: !valid ? 'A positive reserve, usable stop and household boarding assumption are required. Zero spare places means unassessed; it does not erase housing scores.'
      : `${Math.round(supply)} assumed daily places for ${Math.round(groupBoardings)} assumed boardings. Daily totals cannot establish peak capacity.`,
    supply: valid ? supply : null, demand: valid ? groupBoardings : null,
    range: valid ? { low, high } : null, demandRange, assumed: true, blocking: false,
    sensitivity: !valid ? 'unknown' : low >= demandRange.high ? 'covers-range' : high < demandRange.low ? 'below-range' : 'depends-on-assumptions',
  }
}

export function combineChecks(checks) {
  if (!checks.length) return null
  const status = checks.some(check => check?.status === 'fail') ? 'fail' : checks.some(check => !check || check.status === 'unknown') ? 'unknown' : 'pass'
  return { ...(checks[0] || {}), status, label: checks.length === 1 ? checks[0]?.label || 'Check unavailable' : `${checks.length} building checks: ${status}`, members: checks }
}
