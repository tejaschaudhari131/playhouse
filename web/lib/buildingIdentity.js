import { buildingHeightDescription, buildingHeightSource } from './buildingHeights.js'
import { geometryArea, geometryCenter } from './plannerGeometry.js'
import { footprintKey } from './redevelopment.js'

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0
const roundedHeight = value => String(Math.round(value * 10) / 10)
const geometryPolygons = geometry => geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : []
const validCenter = geometry => {
  const center = geometryCenter(geometry)
  return center?.every(Number.isFinite) ? center : null
}

/** Put the marker inside a roof outline, even for a courtyard or multipart footprint. */
function interiorCenter(geometry) {
  const parts = geometryPolygons(geometry).map(coordinates => ({ type: 'Polygon', coordinates }))
    .filter(part => validCenter(part))
    .sort((a, b) => geometryArea(b) - geometryArea(a) || compareText(JSON.stringify(a.coordinates), JSON.stringify(b.coordinates)))
  for (const part of parts) {
    const center = validCenter(part), ys = [...new Set(part.coordinates.flat().map(point => point[1]))].sort((a, b) => a - b)
    // The middle scanline normally suffices. Vertex-band midpoints cover unusual concave outlines.
    const scanlines = [center[1], ...ys.slice(1).map((y, i) => (y + ys[i]) / 2)]
    for (const y of scanlines) {
      const xs = []
      for (const ring of part.coordinates) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length]
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
      }
      xs.sort((a, b) => a - b)
      let widest = null
      // Even/odd intervals account for all interior rings as well as the outer ring.
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const width = xs[i + 1] - xs[i]
        if (width > 0 && (!widest || width > widest.width)) widest = { width, x: (xs[i] + xs[i + 1]) / 2 }
      }
      if (widest) return [widest.x, y]
    }
  }
  return null
}

function heightEvidence(properties) {
  const displayHeightM = positive(properties.height_m) ? properties.height_m : null
  const method = properties.height_method
  const source = buildingHeightSource(properties)
  if (!displayHeightM) return { heightM: null, displayHeightM, heightLabel: 'Height unknown', heightDescription: 'Height evidence is unavailable.', heightSource: source }
  const value = roundedHeight(displayHeightM)
  if (method === 'placeholder') return {
    heightM: null, displayHeightM, heightLabel: `${value} m placeholder`,
    heightDescription: `Height unknown. ${value} m is a display placeholder; insufficient evidence to differentiate this building’s height.`, heightSource: null,
  }
  const labels = { osm_height: 'mapped', osm_levels: 'estimated', stories_estimate: 'estimated', typology_estimate: 'inferred' }
  if (!labels[method]) return { heightM: null, displayHeightM, heightLabel: 'Height unknown', heightDescription: 'Height evidence is unavailable; displayed massing is illustrative.', heightSource: null }
  const storiesKnown = positive(properties.stories)
  const heightDescription = (method === 'osm_levels' || method === 'stories_estimate') && !storiesKnown
    ? `About ${value} m recorded as an estimate; the supporting story count is unavailable.`
    : buildingHeightDescription({ ...properties, height_m: value })
  return { heightM: displayHeightM, displayHeightM, heightLabel: `${method === 'osm_height' ? '' : '~'}${value} m ${labels[method]}`, heightDescription, heightSource: source }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

/** Number the complete site evidence, including footprints demolished in the scenario.
 * North-to-south, then west-to-east, then recorded identity; never use source/chunk order.
 * Callers must not filter removals before numbering: demolition changes status, not identity.
 */
export function buildingIdentityRows(buildings, sitePin) {
  const unique = new Map()
  for (const building of Array.isArray(buildings) ? buildings : []) {
    const key = footprintKey(building)
    if (!key) continue
    const position = validCenter(building.geometry)
    const area = position ? geometryArea(building.geometry) : 0
    const candidate = { key, building, position, areaM2: positive(area) ? area : null }
    const previous = unique.get(key)
    // Repeated neighborhood chunks sometimes carry the same outline. Prefer a complete
    // geometry, with a deterministic tie-break if duplicate source records disagree.
    if (!previous || (candidate.areaM2 || 0) > (previous.areaM2 || 0) ||
      candidate.areaM2 === previous.areaM2 && compareText(canonical(building), canonical(previous.building)) < 0) unique.set(key, candidate)
  }
  return [...unique.values()].sort((a, b) => {
    if (!a.position || !b.position) return Number(!!b.position) - Number(!!a.position) || compareText(a.key, b.key)
    return b.position[1] - a.position[1] || a.position[0] - b.position[0] || compareText(a.key, b.key)
  }).map(({ key, building, areaM2 }, index) => {
    const properties = building.properties || {}, pin = String(properties.pin ?? '').trim()
    return {
      key, number: index + 1, label: `Building #${index + 1}`, building, center: interiorCenter(building.geometry), areaM2,
      areaLabel: areaM2 ? `${areaM2 < 1 ? '<1' : `~${Math.round(areaM2).toLocaleString('en-US')}`} m² footprint` : 'Footprint area unknown',
      relation: !pin ? 'unmatched' : pin === String(sitePin ?? '').trim() ? 'matched' : 'crossing',
      ...heightEvidence(properties),
    }
  })
}
