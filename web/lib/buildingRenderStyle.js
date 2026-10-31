import { architecturalMassing, EXISTING_FACADE_COLOR, EXISTING_ROOF_COLOR } from './architecture3d.js'
import { categoryColorExpression } from './buildingTypes.js'

const USE_COLOR = ['coalesce', ['get', 'use_color'], '#cbd5e1']
const INSPECTED = ['boolean', ['feature-state', 'inspected'], false]

/** Both roof and walls retain the recorded-use hue in the type view, at every zoom. "Highlight building types" overrides either style. */
export function existingBuildingColors(buildingStyle = 'types', highlight = false) {
  const realistic = buildingStyle === 'realistic'
  if (highlight) {
    const category = categoryColorExpression()
    return { overview: ['case', INSPECTED, '#35b6bb', category], facade: ['case', INSPECTED, '#35b6bb', category], roof: ['case', INSPECTED, '#1f7f84', category] }
  }
  return {
    overview: ['case', INSPECTED, '#35b6bb', USE_COLOR],
    facade: ['case', INSPECTED, '#35b6bb', realistic ? EXISTING_FACADE_COLOR : USE_COLOR],
    roof: ['case', INSPECTED, '#1f7f84', realistic ? EXISTING_ROOF_COLOR : USE_COLOR],
  }
}

/** Display preference only: the checked footprint, modelled height and preview status colour stay intact. */
export function buildingMassing({ buildingStyle = 'types', ...building }) {
  if (buildingStyle === 'realistic') return architecturalMassing(building)
  const { geometry, height, color } = building
  return geometry && height > 0 ? [{ geometry, base: 0, top: height, color, part: 'body' }] : []
}
