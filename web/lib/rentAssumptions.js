/**
 * Editable prototype scenarios, not estimated market rents for a parcel or type.
 * Owner listings anchor the scale of recent apartment asking rents only. No source
 * supports extrapolating a price difference between these five building types.
 */
export const RENT_REFERENCES = [
  { title: 'Glasshouse — one-bedroom floor plans', url: 'https://www.glasshouseapts.com/floor-plans/apartments?bed=one_bed&order=ASC&param=avail', checked: '2026-10-27', observation: 'Advertised one-bedroom base-rent examples about $2,180–$2,455/month. Availability and concessions change; not a representative sample.' },
  { title: 'Albion Lawrenceville — owner floor plans', url: 'https://albionlawrenceville.com/floorplans/', checked: '2026-10-27', observation: 'J2.2 one-bedroom: $2,002 base / $2,028 fixed monthly leasing price; A7.4: $2,370 base / $2,396 fixed monthly leasing price. Variable utilities excluded.' },
  { title: 'Albion Lawrenceville — developer project record', url: 'https://albionresidential.com/projects/albion-lawrenceville/', checked: '2026-10-27', observation: '267 apartments; construction began 2024 and delivery listed as Q4 2025.' },
]

export const RENT_ASSUMPTIONS = {
  single_family: { rent: 2200, low: 1700, high: 2800, rationale: 'Hypothetical detached-home premium. No verified new-construction detached one-bedroom rent sample.' },
  townhouse_duplex: { rent: 1800, low: 1450, high: 2300, rationale: 'Hypothetical modest infill unit below the sampled large-complex asking rents. The discount is a scenario choice, not an observed duplex estimate.' },
  triplex: { rent: 1750, low: 1450, high: 2300, rationale: 'Hypothetical modest infill unit. The $50 difference from duplex is a scenario sensitivity, not a measured triplex advantage.' },
  small_apartment: { rent: 2000, low: 1600, high: 2500, rationale: 'Neutral apartment prototype near the lower sampled large-complex asking rent. Applying it to a smaller building is hypothetical; no verified new-build small-apartment type sample.' },
  large_apartment: { rent: 2100, low: 1750, high: 2600, rationale: 'Illustrative one-bedroom scale close to two sampled recent apartment communities. The range is a sensitivity band, not a statistical market interval.' },
}
export const RENT_ASSUMPTION_NOTE = 'A comparable one-bedroom rental scenario per home; bedrooms, amenity level and household composition are not inferred from massing. These defaults do not establish construction feasibility, market demand, subsidies or tenant affordability. Utilities are entered separately; fixed fees should be included in the rent assumption when relevant.'

export function prototypeRentOption(typeId) {
  const assumption = RENT_ASSUMPTIONS[typeId]
  if (!assumption) throw new Error('Unknown housing type for rent assumption')
  return { rent: assumption.rent, rentSource: 'type-baseline', rentSourceDetail: assumption.rationale, rentRange: { low: assumption.low, high: assumption.high } }
}
