/** Placement and weighted ranking are independent decisions. No new model calculations. */
export function draftStatus({ evaluated, proposal, weights, pending, error, infrastructureErrors = [] }) {
  if (pending) return { title: 'Checking…', detail: 'Calculating fit and tradeoffs', placement: 'Checking placement…', canPlace: false }
  if (error) return { title: 'Results unavailable', detail: error, placement: 'Calculation unavailable', canPlace: false }
  if (!evaluated || !proposal) return { title: 'Waiting for evidence', detail: 'Parcel and building evidence is still needed.', placement: 'Waiting for evidence', canPlace: false }
  const canPlace = proposal.physicalEligible && !proposal.titleNine?.conflict && infrastructureErrors.length === 0
  const unchecked = proposal.titleNine?.excluded?.length || 0
  const placement = canPlace ? unchecked ? `Can add · ${unchecked} zoning checks unassessed` : 'Can add · checked rules only' : proposal.gate || 'Placement needs review'
  if (!evaluated.eligible) return { title: 'Needs review', detail: evaluated.gate, placement, canPlace }
  if (!Number.isFinite(evaluated.total)) return { title: 'No score', detail: Object.values(weights).every(value => value === 0) ? 'All priorities are off. Turn on a priority to calculate a score; placement checks still apply.' : 'No weighted factor has shared evidence. Adjust priorities or inspect the missing evidence.', placement, canPlace }
  return { title: `${evaluated.total.toFixed(1)} / 100`, detail: unchecked ? `Under your priorities · ${unchecked} zoning checks not assessed` : 'Under your priorities · checked rules only', placement, canPlace }
}
