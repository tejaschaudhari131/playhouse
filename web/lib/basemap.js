import sourceStyle from './basemapStyle.json' with { type: 'json' }

export const BASEMAP_PROVIDER = {
  name: 'OpenFreeMap',
  url: 'https://openfreemap.org/',
  style: 'https://tiles.openfreemap.org/styles/positron',
  attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
}

/** Keep hosted roads/labels as context, never as an alternative building inventory.
 * The local style avoids a style-discovery request; tiles/fonts remain hosted by
 * OpenFreeMap. Every map gets its own object because MapLibre may normalize it.
 */
export function basemapStyle() {
  const style = structuredClone(sourceStyle)
  style.layers = style.layers.filter(layer => layer['source-layer'] !== 'building' && layer.type !== 'fill-extrusion')
  style.sources.openmaptiles.attribution = BASEMAP_PROVIDER.attribution
  return style
}
