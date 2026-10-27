import { codeLink, districtStandards } from './titleNineRules.js'
import { DISPOSITION } from './siteCautions.js'
import { lotDimensions } from './lotFit.js'

const M_TO_FT = 1 / 0.3048
export const PATHWAY_LINKS = {
  uraProperties: 'https://www.ura.org/pages/available-properties',
  uraDisposition: 'https://www.ura.org/pages/property-disposition',
  cityRealEstate: 'https://www.pittsburghpa.gov/City-Government/Finance-Budget/Real-Estate',
  cityInventory: 'https://public-pgh.epropertyplus.com/',
  landBank: 'https://pghlandbank.org/',
  citySaleProcess: 'https://www.pittsburghpa.gov/files/assets/city/v/1/finance/documents/standard-sale-process-rev.-9.30.25.pdf',
  countyRealEstate: 'https://realestate.alleghenycounty.us/search',
  oneStop: 'https://onestoppgh.pittsburghpa.gov/',
  zoningReview: 'https://www.pittsburghpa.gov/Business-Development/City-Planning/Zoning/Planning-Applications-and-Processes',
  zbaGuide: 'https://www.pittsburghpa.gov/files/assets/city/v/1/dcp/documents/process-guides-and-handouts/process-guide-handout-zba-2024.pdf',
}
const CITY_STATUS = { available: 'Available', sale_pending: 'Sale pending', acquisition_pending: 'Acquisition pending', hold_for_study: 'Hold for study' }
const PUBLIC_OWNER = /BOARD OF EDUCATION|COLLEGE|UNIV|METRO HOUSING|FEDERAL GOVERNMENT|STATE GOVERNMENT|COUNTY GOVERNMENT|TOWNSHIP GOVERNMENT|MUNICIPAL/

/**
 * Acquisition route from public ownership fields only. Private parcels never expose owner names
 * or tax-delinquency records; neither field is read here.
 */
export function acquisitionPathway(props = {}) {
  const use = String(props.land_use || '').toUpperCase()
  if (/URBAN RENEWAL/.test(use)) return { id: 'ura', label: 'URA Disposition Process', owner: 'Urban Redevelopment Authority of Pittsburgh (public record)',
    steps: ['Find the parcel in the URA Available Properties database.', 'Create an account and submit a Property Purchase/Transfer Application; URA staff then run due diligence.', 'Applicants must be current on taxes, water and sewer for any property they own. Sales need URA Board approval.'],
    links: [['URA available properties', PATHWAY_LINKS.uraProperties], ['URA disposition process', PATHWAY_LINKS.uraDisposition]] }
  if (props.city_owned === true && DISPOSITION.has(props.city_status)) return { id: 'city', label: 'City Dept. of Finance Request to Purchase / Pittsburgh Land Bank', owner: `City of Pittsburgh inventory · ${CITY_STATUS[props.city_status]}`,
    steps: ['Confirm the parcel in the City’s available-property database.', 'Submit a Request to Purchase through the online portal ($25 per parcel); buyers must be current on City taxes and codes.', 'Price is set after buyer approval. Sales need City Council approval and can go to court auction on objection; the City says this can take 12–18 months or longer. Some inventory may transfer through the Pittsburgh Land Bank.'],
    links: [['City real estate sales', PATHWAY_LINKS.cityRealEstate], ['City sale procedure', PATHWAY_LINKS.citySaleProcess], ['City property database', PATHWAY_LINKS.cityInventory], ['Pittsburgh Land Bank', PATHWAY_LINKS.landBank]] }
  if (props.city_owned === true) return { id: 'city_unavailable', label: 'City-owned land not offered for sale', owner: 'City of Pittsburgh (public record)',
    steps: ['This City parcel has no disposition status in this release, so it is not offered.', 'Ask the Department of Finance Real Estate Division whether it could be released.'], links: [['City real estate sales', PATHWAY_LINKS.cityRealEstate]] }
  if (props.land_use_class === 'GOVERNMENT' || PUBLIC_OWNER.test(use)) return { id: 'public_other', label: 'Public or institutional owner', owner: 'Public agency (County land-use record)',
    steps: ['No standard disposition channel is screened for this owner.', 'Contact the owning agency directly.'], links: [] }
  return { id: 'private', label: 'Private Market Acquisition', owner: 'Private owner', privacy: true,
    steps: ['Negotiate with the owner of record or list through a broker. Look up the owner yourself in the County real estate portal.', 'Order title, survey and environmental review before signing a contract.', 'An occupied home means relocation obligations and tenant notice; plan for them before acquisition.'],
    links: [['Allegheny County real estate', PATHWAY_LINKS.countyRealEstate]],
    note: 'Playhouse never shows private owner names or private tax-delinquency records.' }
}

const ZONING_STEPS = {
  'by-right': ['Apply for Zoning & Development Review in OneStopPGH (Basic Zoning Review or Site Plan Review).', 'With zoning approval, apply to PLI for the building permit; inspections lead to a certificate of occupancy.'],
  administrator: ['File the Zoning & Development Review application in OneStopPGH; the Zoning Administrator decides the Administrator Exception (§ 922.08) after posted notice.', 'Then building permit from PLI.'],
  special: ['File in OneStopPGH; staff schedule a Zoning Board of Adjustment hearing for the Special Exception (§ 922.07).', 'Post notice at least 21 days before the hearing; the Board decides within 45 days. Then building permit from PLI.'],
  conditional: ['File in OneStopPGH for a Conditional Use (§ 922.06): Planning Commission recommendation, then a City Council hearing and vote.', 'Then building permit from PLI.'],
  variance: ['File a Building and Development Application in OneStopPGH; staff refer it to the Zoning Board of Adjustment (§ 922.09).', 'Pay the $400 ZBA fee plus zoning review fees; post the notice at least 21 days before the hearing. A Registered Community Organization meeting may be required at least 30 days before.', 'At the hearing, prove all five § 922.09.E criteria with evidence (see the worksheet). The Board decides within 45 days.', 'With approval, finish Zoning Review and apply to PLI for the building permit.'],
  review: ['Ask City Planning’s Zoning & Development Review staff (zoning@pittsburghpa.gov) which review applies before applying.', 'Then file the Zoning & Development Review application in OneStopPGH.'],
}
const EXCEPTION_KIND = { A: 'administrator', S: 'special', C: 'conditional' }
const EXCEPTION_LABEL = { administrator: 'Administrator Exception', special: 'Special Exception', conditional: 'Conditional Use' }

/** Approval route for one proposal, from Title Nine checks when available or the §911.02 permission alone. */
export function zoningPathway({ checks = null, permission = null } = {}) {
  const conflicts = (checks || []).filter(c => c.status === 'conflict')
  const useConflict = conflicts.some(c => c.id === 'use') || (!checks && permission?.category === 'not_permitted')
  const unresolved = (checks || []).filter(c => c.status === 'unknown' || c.status === 'conditional').length
  const base = { conflicts: conflicts.length, unresolved, url: PATHWAY_LINKS.oneStop, links: [['OneStopPGH', PATHWAY_LINKS.oneStop], ['City zoning applications', PATHWAY_LINKS.zoningReview]] }
  if (conflicts.length || useConflict) return { ...base, id: 'variance', label: 'ZBA Variance', section: '922.09', codeUrl: codeLink('review'),
    detail: `${useConflict ? 'Use variance' : 'Dimensional variance'}${conflicts.length > 1 || (useConflict && conflicts.some(c => c.id !== 'use')) ? ' plus other relief' : ''} from the Zoning Board of Adjustment.`,
    steps: ZONING_STEPS.variance, links: [...base.links, ['ZBA process guide', PATHWAY_LINKS.zbaGuide]] }
  if (permission?.category === 'partial') return { ...base, id: 'review', label: 'Zoning review needed', section: '911.02', codeUrl: codeLink('use'),
    detail: `${permission.label || 'Permitted for some unit counts'}. Check the §911.02 row for this unit count: by right, an exception or a variance.`, steps: ZONING_STEPS.review }
  if (permission?.category === 'special') {
    const kind = EXCEPTION_KIND[String(permission.letter || '').trim().toUpperCase()]
    return { ...base, id: 'exception', kind: kind || 'special', label: kind ? EXCEPTION_LABEL[kind] : 'Administrator Exception / Special Exception',
      section: kind === 'administrator' ? '922.08' : kind === 'conditional' ? '922.06' : '922.07', codeUrl: codeLink('review'),
      detail: `§911.02 lists this use as ${permission.letter ? `"${permission.letter}"` : 'needing approval'}: approval, not a variance.`, steps: ZONING_STEPS[kind || 'special'] }
  }
  if (permission?.category === 'permitted') return { ...base, id: 'by-right', label: 'By-Right Zoning & Building Permit (PLI / OneStopPGH)', section: '922', codeUrl: codeLink('review'),
    detail: unresolved ? `No screened conflict. Confirm ${unresolved} unscreened ${unresolved === 1 ? 'check' : 'checks'} in Zoning Review.` : 'No screened conflict.', steps: ZONING_STEPS['by-right'] }
  return { ...base, id: 'review', label: 'Zoning review needed', section: '922', codeUrl: codeLink('review'), detail: permission?.label || 'Use permission not reviewed.', steps: ZONING_STEPS.review }
}

const UNITS = { height: ' ft', lot: ' sq ft', coverage: '%', 'parking-min': ' spaces', 'parking-max': ' spaces', bikes: ' spaces', 'protected-bikes': ' spaces', 'iz-units': ' homes' }
const fmt = (n, id) => `${Math.round(n * 10) / 10 === Math.round(n) ? Math.round(n).toLocaleString() : (Math.round(n * 10) / 10).toLocaleString()}${UNITS[id] || ''}`

/** Exact relief one failed standard needs. */
export function reliefFor(check, { district = null, useLabel = null } = {}) {
  const base = { id: check.id, label: check.label, section: check.section, url: check.url }
  if (check.id === 'use') return { ...base, required: `§911.02 use row permits it in ${district || 'this district'}`, proposed: useLabel || check.label.replace(/^Proposed use: /, ''), relief: `Use variance to allow ${useLabel || 'this use'} in ${district || 'this district'}` }
  if (Number.isFinite(check.actual) && Number.isFinite(check.limit)) {
    const over = check.mode === 'max', gap = Math.abs(check.actual - check.limit), share = check.limit ? gap / check.limit * 100 : null
    return { ...base, required: `${over ? '≤' : '≥'} ${fmt(check.limit, check.id)}`, proposed: fmt(check.actual, check.id),
      relief: `${fmt(gap, check.id)} ${over ? 'over the maximum' : 'below the minimum'}${share !== null ? ` (${Math.round(share)}%)` : ''}` }
  }
  if (check.id === 'setbacks') return { ...base, required: 'Footprint inside the lot with base yards', proposed: 'Does not fit the outline', relief: 'Redesign the footprint first; a variance cannot fix a building that does not fit the lot' }
  return { ...base, required: 'See section', proposed: check.detail, relief: 'Relief as stated in the section' }
}

export const VARIANCE_CRITERIA = [
  { id: 'unique', label: 'Unique physical conditions', text: 'Irregularity, narrowness or shallowness of the lot, or exceptional topography peculiar to this property, cause the hardship, not conditions shared across the district.' },
  { id: 'reasonable-use', label: 'Necessary for reasonable use', text: 'Because of those conditions, the property cannot be developed in strict conformity, so a variance is necessary to enable its reasonable use.' },
  { id: 'not-self-created', label: 'Hardship not self-created', text: 'The applicant did not create the unnecessary hardship.' },
  { id: 'no-adverse-impact', label: 'No adverse neighborhood impact', text: 'The variance will not alter the essential character of the neighborhood, impair the use of adjacent property, or harm public welfare.' },
  { id: 'minimum', label: 'Minimum variance that affords relief', text: 'The variance is the least modification of the regulation that will afford relief.' },
]

/**
 * § 922.09.E worksheet. Each failed standard carries its exact relief; each criterion is pre-filled with
 * public-record evidence where it exists and marked for the applicant where it does not. Not legal advice.
 */
export function varianceWorksheet({ props = {}, checks = null, permission = null, option = null, label = null, geometry = null, options = null }) {
  const district = props.zoning_code || null
  const conflicts = checks ? checks.filter(c => c.status === 'conflict') : permission?.category === 'not_permitted'
    ? [{ id: 'use', label: `Proposed use: ${label || 'this use'}`, section: '911.02', url: codeLink('use'), status: 'conflict' }] : []
  if (!conflicts.length) return null
  const failed = conflicts.map(c => reliefFor(c, { district, useLabel: label }))
  const standards = districtStandards(district)
  const dims = geometry ? lotDimensions(geometry) : null
  const physical = [
    dims && `Lot about ${Math.round(dims.width * M_TO_FT)} ft wide × ${Math.round(dims.depth * M_TO_FT)} ft deep (map outline, not a survey).`,
    Number.isFinite(props.lot_sqft) && `${props.lot_sqft.toLocaleString()} sq ft recorded lot area${standards?.minLot ? ` vs the ${standards.minLot.toLocaleString()} sq ft district minimum` : ''}.`,
    props.steep_slope_overlap > 0 && `${Math.round(props.steep_slope_overlap * 100)}% of the lot overlaps the steep-slope proxy.`,
    props.undermined_overlap > 0 && `${Math.round(props.undermined_overlap * 100)}% overlaps mapped undermining.`,
    props.sfha_overlap > 0 && 'Overlaps the FEMA special flood hazard area.',
  ].filter(Boolean)
  const passing = options ? options.filter(o => o.eligible).map(o => o.label) : null
  const proposal = option ? [`Proposed ${label || option.label || 'building'}: ${option.width} × ${option.depth} m footprint, ${Math.round(option.height * M_TO_FT)} ft, ${option.floors ?? '?'} stories.`] : []
  const criteria = VARIANCE_CRITERIA.map(c => {
    const evidence = {
      unique: physical,
      'reasonable-use': passing === null ? [] : passing.length ? [`${passing.length} of ${options.length} screened types pass every assessed check here (${passing.join(', ')}). The Board may find reasonable use is possible without this variance.`] : [`None of ${options.length} screened types passes every assessed check on this lot.`],
      'not-self-created': [props.year_built ? `Existing building recorded as built ${props.year_built}.` : null].filter(Boolean),
      'no-adverse-impact': proposal,
      minimum: failed.map(f => `${f.label} (§ ${f.section}): ${f.relief}.`),
    }[c.id]
    const prompt = {
      unique: 'Show the condition is peculiar to this lot, with a survey and photos.',
      'reasonable-use': 'Explain why a conforming building is not a reasonable use of this lot.',
      'not-self-created': 'Confirm the applicant did not create the condition, for example by subdividing the lot.',
      'no-adverse-impact': 'Bring elevations, photos of the block, and notes from neighbor and RCO outreach.',
      minimum: 'Request only this relief; first test a smaller footprint (Fit dimensions to lot) or a type that conforms.',
    }[c.id]
    return { ...c, evidence, prompt, status: evidence.length ? 'evidence' : 'applicant' }
  })
  return { section: '922.09.E', url: codeLink('review'), failed, criteria }
}

/** Acquisition route, zoning route and, when needed, the variance worksheet for one proposal. */
export function permitPathway({ props = {}, checks = null, permission = null, option = null, label = null, geometry = null, options = null }) {
  return { acquisition: acquisitionPathway(props), zoning: zoningPathway({ checks, permission }), worksheet: varianceWorksheet({ props, checks, permission, option, label, geometry, options }) }
}
