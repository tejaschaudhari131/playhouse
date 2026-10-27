export const EVIDENCE_LABEL = { observed: 'Observed Data', judgment: 'Value Judgment / Assumption' }
export const CONFIDENCE = ['High', 'Medium', 'Low']

const RECEIPTS = {
  demand: { evidence: 'observed', confidence: 'Medium', dataset: 'County assessment sales',
    source: 'Allegheny County property assessments: valid residential sales (price per sq ft, turnover per 100 parcels) by neighborhood, plus recorded lot area.',
    formula: '50% market heat (60% price per sq ft + 40% turnover, each on team-set anchors) + 50% lot fit for the type. A proxy for market strength, not household demand.' },
  physical: { evidence: 'observed', confidence: 'Medium', dataset: 'County parcel + roof outlines',
    source: 'County parcel outline and County roof outlines of retained buildings, against your proposed footprint.',
    formula: '100 if the footprint fits inside the parcel outline without touching a retained building or reserved infrastructure; otherwise 0. Map outlines, not a survey.' },
  affordability: { evidence: 'judgment', confidence: 'Low', dataset: 'Scenario rent, utilities, income',
    source: 'Your proposed rent and utilities and the target household income (scenario inputs, compared with HUD FY2026 income limits).',
    formula: 'Burden = (rent + utilities) × 12 ÷ income. Score = 100 × (50% − burden) ÷ 30%, clamped 0–100: 100 at 20% burden, 0 at 50%. The anchors are value judgments.' },
  displacement: { evidence: 'observed', confidence: 'Medium', dataset: 'ACS 2020–2024 + HUD CHAS 2018–2022',
    source: 'ACS 2020–2024 renter share and median gross rent (vs ACS 2015–2019 and the county), HUD CHAS 2018–2022 low-income renter cost burden, by tract.',
    formula: '100 − tract risk. Risk blends vulnerability (renter share and cost-burden share) with rent pressure, each on team-set anchors. Neighborhood context, not the project’s impact.' },
  capacity: { evidence: 'judgment', confidence: 'Low', dataset: 'PRT schedules + assumed spare places',
    source: 'PRT scheduled weekday departures at the selected stop × assumed spare places per departure (or your manual reserve), plus added departures × assumed places.',
    formula: '100 × available daily boardings ÷ (homes sharing the stop × assumed boardings per home), capped at 100. Not observed occupancy.' },
  access: { evidence: 'observed', confidence: 'Medium', dataset: 'OSM walking graph + PRT schedules',
    source: 'OpenStreetMap walking graph and mapped parks, PRT scheduled weekday departures at the selected stop, and the assumed service span.',
    formula: '100 × (1 − (walk + half the average headway) ÷ 30 min), clamped; blended with park access (15-min anchor) by your park share. The anchors are policy choices.' },
  carbon: { evidence: 'judgment', confidence: 'Low', dataset: 'EIA RECS 2020 + team embodied tier',
    source: 'EIA RECS 2020 Northeast site energy by housing type, a team-chosen embodied-carbon tier, and the transit score.',
    formula: '100 − relative carbon index per home (building operational + embodied tier, plus transport as 100 − transit score). Not tonnes of CO₂e.' },
}

const fmt = (n, digits = 1) => typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : '—'

function inputs(id, option) {
  if (!option) return null
  if (id === 'demand') return `Market/lot proxy ${fmt(option.raw?.demand)}`
  if (id === 'physical') return !option.massing ? null : !option.massing.fits ? 'Footprint does not fit the outline' : option.massing.collisions === null ? 'Building context unavailable' : option.massing.collisions ? 'Overlaps a retained building' : 'Fits; no overlap'
  if (id === 'affordability') return option.burden === null || option.burden === undefined ? 'Housing costs not confirmed' : `$${Math.round(option.monthly).toLocaleString()}/month = ${fmt(option.burden * 100, 0)}% of target income`
  if (id === 'displacement') return `Tract risk ${fmt(option.raw?.displacement_risk)}`
  if (id === 'capacity') return option.supply === null || option.supply === undefined ? 'No reserve assessed' : `${fmt(option.supply, 0)} available ÷ ${fmt(option.groupBoardings, 0)} assumed boardings (${option.reserve?.method === 'manual' ? 'manual reserve' : 'schedule × assumed places'})`
  if (id === 'access') return option.service ? `${fmt(option.service.walk)} min walk + ${fmt(option.service.wait)} min wait · ${option.service.departures} departures/day${option.service.method === 'straight_line' ? ' · straight-line walk' : ''}` : 'No stop within reach'
  if (id === 'carbon') return `Relative index ${fmt(option.raw?.carbon_index)} per home`
  return null
}

/** Source, formula, evidence type and confidence for one factor, plus the inputs behind this option's score. */
export function factorReceipt(id, option = null) {
  const base = RECEIPTS[id]
  if (!base) return null
  let confidence = base.confidence
  if (id === 'access' && option?.service?.method === 'straight_line') confidence = 'Low'
  if (id === 'affordability' && option?.costAssumptionsConfirmed === false) confidence = 'Low'
  return { id, ...base, confidence, badge: EVIDENCE_LABEL[base.evidence], score: option?.scores?.[id] ?? null, inputs: inputs(id, option) }
}
