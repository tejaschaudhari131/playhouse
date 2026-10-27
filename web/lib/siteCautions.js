/** Record-level reasons a ranked lot is unlikely to be a housing site. Each reads a County or City record; none is a legal finding. */

const RIGHTS_ONLY = /^(RIGHT OF WAY\b|AIR RIGHTS\b|COAL RIGHTS\b)/
const ASSISTED = /^HUD PROJ\b/
const PUBLIC_OWNER = [
  [/BOARD OF EDUCATION/, 'School district owner'],
  [/COLLEGE|UNIV/, 'College or university owner'],
  [/METRO HOUSING/, 'Housing authority owner'],
  [/URBAN RENEWAL/, 'Urban renewal owner'],
  [/FEDERAL GOVERNMENT/, 'Federal owner'],
  [/STATE GOVERNMENT/, 'State owner'],
  [/COUNTY GOVERNMENT/, 'County owner'],
  [/TOWNSHIP GOVERNMENT/, 'Township owner'],
  [/MUNICIPAL/, 'City owner'],
]
// City inventory statuses with a published disposition route stay listed.
export const DISPOSITION = new Set(['available', 'sale_pending', 'acquisition_pending', 'hold_for_study'])

export const CAUTION_FILTER_TEXT = 'right-of-way, institutional public land, HUD-assisted housing and zoning-prohibited parcels left out'

export function recordCautions(props) {
  const use = String(props?.land_use || '').toUpperCase()
  const cautions = []
  if (RIGHTS_ONLY.test(use)) cautions.push({ id: 'right_of_way', label: 'Right-of-way', hides: true,
    detail: `County land use "${props.land_use}": a street, easement or rights-only parcel, not a building lot.` })
  if (ASSISTED.test(use)) cautions.push({ id: 'assisted', label: 'HUD-assisted housing', hides: true,
    detail: `County land use "${props.land_use}": existing assisted homes. Redeveloping them would displace residents.` })
  const owner = PUBLIC_OWNER.find(([pattern]) => pattern.test(use))?.[1] || (props?.land_use_class === 'GOVERNMENT' ? 'Public owner' : null)
  if (owner === 'Urban renewal owner') cautions.push({ id: 'government', label: owner, hides: false,
    detail: `County land use "${props.land_use}": urban renewal land can be offered for development. Check with the URA.` })
  else if (owner) {
    const disposition = props.city_owned === true && DISPOSITION.has(props.city_status)
    cautions.push({ id: 'government', label: disposition ? 'Public land' : owner, hides: !disposition,
      detail: disposition ? 'Public land in the City inventory with a disposition status. Availability still needs confirming with the City, URA or Land Bank.'
        : `County land use "${props.land_use}": public or institutional land with no City disposition status in this release.` })
  }
  return cautions
}

export function hiddenByRecord(props) {
  return recordCautions(props).some(caution => caution.hides)
}

/** Record cautions plus the zoning reading used for the ranked type. */
export function siteCautions(props, permission) {
  const cautions = recordCautions(props)
  if (permission === 'not_allowed') cautions.push({ id: 'zoning', label: 'Zoning prohibits this type', hides: true,
    detail: 'The §911.02 use table does not permit the ranked housing type in this district. Building it needs a variance or a zoning change.' })
  else if (permission === 'unknown') cautions.push({ id: 'zoning_unknown', label: 'Zoning not reviewed', hides: false,
    detail: 'This district is outside the use table read here. Check with the City.' })
  return cautions
}
