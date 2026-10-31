"use client"

import { endpointCoordinates } from '../lib/networkRouting.js'
import { PITTSBURGH_BOUNDS } from '../lib/pittsburgh.js'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as GLMap, Marker, Popup, NavigationControl, ScaleControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { geometryBounds, geometryCenter, rectangleAt } from '../lib/plannerGeometry.js'
import { configureMapWorkers } from '../lib/maplibreSetup.js'
import { haversineMeters } from '../lib/geo.js'
import { placedBuildingColor } from '../lib/buildingUses.js'
import { buildingHeightDescription, buildingHeightSource } from '../lib/buildingHeights.js'
import { DETAIL_ZOOM, DETAIL_EXIT_ZOOM, hasMapDetail, renderViewport } from '../lib/studioData.js'
import { mapSourceDiff } from '../lib/mapSourceDiff.js'
import { networkDisplayIndex } from '../lib/networkDisplay.js'
import { siteBuildingLabels } from '../lib/siteBuildingLabels.js'
import { recordedBuildingRef, retainedBuildings, demolitionKey, demolitionSite, footprintKey } from '../lib/redevelopment.js'
import { playDemolitionEffect } from '../lib/demolitionEffect.js'
import { playConstructionEffect } from '../lib/constructionEffect.js'
import { basemapStyle } from '../lib/basemap.js'
import { facadeBearing, footprintBox, withFront, ROOF_CAP_M } from '../lib/architecture3d.js'
import { buildingMassing, existingBuildingColors } from '../lib/buildingRenderStyle.js'
import { neighborhoodSelection } from '../lib/threeBuildingMeshes.js'
import { yardPad, frontWalk, streetscapeTrees } from '../lib/streetscape3d.js'
import { buildingShadows, sunFor, sunLight } from '../lib/sunShadows.js'
import { envelopeFeatures } from '../lib/zoningEnvelope.js'
import { cleanRing, insetRing, localFrame, openRing, toPolygon } from '../lib/localFrame.js'
import { BUILDINGS } from '../lib/buildings.js'
import { stairsRequired } from '../lib/singleStair.js'
import { LVT_MAP_COLORS, parcelShift, shiftClass } from '../lib/lvtShift.js'
import { BUILDING_TYPE_CATEGORIES, allFilters, hiddenCategoryFilter, plannedCategoryColor, typologyCategory } from '../lib/buildingTypes.js'

const empty = () => ({ type: 'FeatureCollection', features: [] })
const fc = features => ({ type: 'FeatureCollection', features })
const AERIAL_PITCH = 55, STREET_PITCH = 72, STREET_ZOOM = 19.9, SITE_ZOOM = 17.6
const extrusion = { 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-vertical-gradient': true }
const parts = (items, properties = {}) => items.map(({ geometry, base, top, color, part }) => ({ type: 'Feature', geometry, properties: { ...properties, base, top, color, part } }))
/** Ground-level highlight ring; flat outlines are hidden beneath raised yards. */
function rimFeature(geometry, color, width = .35) {
  const ring = geometry?.type === 'Polygon' ? openRing(geometry.coordinates[0] || []) : null
  if (!ring || ring.length < 3) return null
  const frame = localFrame(ring[0]), local = cleanRing(ring.map(frame.project)), inner = insetRing(local, () => width)
  return inner ? { type: 'Feature', properties: { base: 0, top: .6, color, part: 'rim' }, geometry: toPolygon(frame, local, inner.reverse()) } : null
}
// Official neighborhood union extent: navigation bounds, not a polygon mask.


export default function PlannerMap({ buildingRows = [], showBuildingLabels = false, buildingFocusRequest = null, onSiteBuildingSelect, parcelIndex, buildingIndex, neighborhoods, stops, showExisting, selected, buildingPreview, stop, proposed, additionalDepartures, view3d, onSelect, onStop, tool, placing, onPlace, onHover, placedBuildings = [], demolitions = [], demolitionEffect = null, constructionEffect = null, selectedBuilding = null, onBuildingSelect, focusRequest = 0, network, visibleNeighborhoodIds = [], networkResult, reservations, connections, routes = [], drawing, draftNode, onDraw, discoveryPins = [], emptyPins = [], onViewport, streetView = false, sunTime = 'noon', zoningEnvelope = null, buildingStyle = 'types', typeHighlight = null, egress = 'two-stair', lvt = null, shadedParcels = null }) {
  const container = useRef(null), mapRef = useRef(null), callbacks = useRef({ onSelect, onStop, tool, placing, onPlace })
  const [ready, setReady] = useState(false), [error, setError] = useState(null)
  const [viewport, setViewport] = useState(null)
  const detail = hasMapDetail(viewport), renderBounds = viewport?.bounds
  const visibleParcels = useMemo(() => detail ? parcelIndex.query(renderBounds) : [], [detail, renderBounds, parcelIndex])
  const parcelByPin = useMemo(() => {
    const byPin = new Map(visibleParcels.map(f => [f.properties.pin, f]))
    if (selected) byPin.set(selected.properties.pin, selected)
    return byPin
  }, [visibleParcels, selected])
  // The lot under a building plus parcels within ~50 m, so facades can face the street gap rather than an alley.
  const lotContext = useCallback((pin, geometry) => {
    const bounds = geometry && geometryBounds(geometry)
    const nearby = bounds ? parcelIndex.query([bounds[0] - .0006, bounds[1] - .00045, bounds[2] + .0006, bounds[3] + .00045]) : []
    const parcel = selected?.properties.pin === pin ? selected.geometry : nearby.find(f => f.properties.pin === pin)?.geometry ?? null
    return { parcel, neighbors: nearby.filter(f => f.properties.pin !== pin).map(f => f.geometry) }
  }, [parcelIndex, selected])
  const visibleBuildings = useMemo(() => detail && showExisting ? retainedBuildings(buildingIndex.query(renderBounds), demolitions) : [], [detail, renderBounds, buildingIndex, showExisting, demolitions])
  const lastPin = useRef(null), lastStreet = useRef(null), streetBearing = useRef(null), placedBearings = useRef(new Map())
  const marker = useRef(null)
  const siteLabels = useMemo(() => showBuildingLabels && showExisting && !placing && !drawing
    ? siteBuildingLabels(buildingRows, selectedBuilding, demolitions) : [],
  [showBuildingLabels, showExisting, placing, drawing, buildingRows, selectedBuilding, demolitions])
  const popup = useRef(null)
  const loadedMap = useRef(null)
  const uploaded = useRef(new Map())
  const inspectedSourceId = useRef(null), consumedBuildingFocus = useRef(null)
  const consumedDemolition = useRef(null)
  const constructionRun = useRef(null), constructionRequest = useRef(null), consumedConstruction = useRef(null)
  // Real-world Three.js buildings: loaded on first 3D detail view, one controller per map instance.
  const three = useRef(null), threeLoad = useRef(null)
  const [threeStatus, setThreeStatus] = useState('idle'), [meshFocus, setMeshFocus] = useState(null), [constructing, setConstructing] = useState(null)
  const threeWanted = buildingStyle === 'realistic' && !!view3d && detail && viewport.zoom >= 16, threeActive = threeWanted && threeStatus === 'ready'
  const threeController = threeActive ? three.current?.controller ?? null : null
  const highlightOn = !!typeHighlight, hiddenKey = (typeHighlight?.hidden || []).join('|')
  const hiddenTypes = useMemo(() => hiddenKey ? hiddenKey.split('|') : [], [hiddenKey])
  const meshHighlight = useMemo(() => highlightOn ? { colors: Object.fromEntries(BUILDING_TYPE_CATEGORIES.map(c => [c.id, c.color])), hidden: hiddenTypes } : null, [highlightOn, hiddenTypes])
  const plannedColor = useCallback((typeId, fallback) => highlightOn ? plannedCategoryColor(typologyCategory(typeId)) : fallback, [highlightOn])
  const stairsFor = useCallback((typeId, floors) => stairsRequired({ typeId, floors, units: BUILDINGS[typeId]?.units }, egress), [egress])
  const demolishedKeys = useMemo(() => new Set(demolitions.map(demolitionKey).filter(Boolean)), [demolitions])
  const meshCandidates = useMemo(() => threeActive && showExisting && meshFocus ? neighborhoodSelection(visibleBuildings, meshFocus, { exclude: demolishedKeys }) : [], [threeActive, showExisting, meshFocus, visibleBuildings, demolishedKeys])
  const meshKey = meshCandidates.map(f => String(f.properties.id ?? f.id)).join('|')
  const meshedIds = useMemo(() => meshKey ? meshKey.split('|') : [], [meshKey])
  const inspectedKey = selectedBuilding?.kind === 'existing' ? demolitionKey(selectedBuilding) : null
  const roadIndex = useMemo(() => tool === 'network' && network ? networkDisplayIndex(network, neighborhoods) : null, [tool, network, neighborhoods])
  const visibleKey = visibleNeighborhoodIds.join('|')
  const visibleRoads = useMemo(() => detail && roadIndex ? roadIndex.query(renderBounds, visibleKey.split('|').filter(Boolean)) : [], [roadIndex, detail, renderBounds, visibleKey])
  // React can retain ready=true for one effect pass while HMR or changed map
  // inputs create a replacement instance. Only its own load event unlocks writes.
  function readyMap() {
    const map = mapRef.current
    return ready && map && loadedMap.current === map ? map : null
  }
  function updateFeatures(id, features) {
    const map = readyMap(), source = map?.getSource(id)
    if (!source) return
    const idProperty = ['existing-buildings', 'walking-network'].includes(id) ? 'id' : 'pin'
    const { next, diff } = mapSourceDiff(uploaded.current.get(id), features, idProperty)
    if (!diff) return
    uploaded.current.set(id, next)
    source.updateData(diff).catch(() => {
      if (mapRef.current !== map) return
      uploaded.current.delete(id)
      setError('Map detail could not update. Reload to restore the map; your scenario controls remain available.')
    })
  }
  callbacks.current = { onSelect, onStop, tool, placing, onPlace, onHover, drawing, onDraw, onViewport, onBuildingSelect, onSiteBuildingSelect, hideSiteMarker: siteLabels.length > 0, sunTime }

  useEffect(() => {
    let map, disposeBenchmark, hoverFrame = null
    setReady(false)
    setViewport(null)
    loadedMap.current = null
    lastPin.current = null
    lastStreet.current = null
    inspectedSourceId.current = null
    three.current = null; threeLoad.current = null
    setThreeStatus('idle')
    const benchmark = process.env.NEXT_PUBLIC_MAP_BENCHMARK === '1' && new URLSearchParams(window.location.search).has('renderBenchmark')
    try {
      configureMapWorkers()
      map = new GLMap({ container: container.current, center: geometryCenter(selected.geometry), zoom: SITE_ZOOM, pitch: AERIAL_PITCH, bearing: -25, attributionControl: true,
        maxBounds: PITTSBURGH_BOUNDS, renderWorldCopies: false, maxPitch: 76,
        // Native MSAA smooths silhouettes without changing coordinates, heights or pixel ratio.
        canvasContextAttributes: { antialias: !benchmark || new URLSearchParams(window.location.search).get('antialias') !== 'off' },
        style: basemapStyle(),
      })
    } catch { setError('3D rendering is unavailable on this device. The scenario controls and comparison still work.'); return }
    mapRef.current = map
    if (benchmark) import('../scripts/map-render-benchmark.js').then(({ attachMapBenchmark }) => {
      if (mapRef.current === map) disposeBenchmark = attachMapBenchmark(map)
    })
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.on('error', event => {
      if (/WebGL|Worker failed/.test(event.error?.message || '')) setError('Map rendering is unavailable. Reload to restore the map; the scenario controls and comparison remain available.')
    })
    map.on('load', () => {
      if (mapRef.current !== map) return
      map.addSource('parcels', { type: 'geojson', data: empty(), promoteId: 'pin' })
      map.addSource('districts', { type: 'geojson', data: neighborhoods })
      map.addSource('stops', { type: 'geojson', data: stops || empty() })
      map.addSource('existing-buildings', { type: 'geojson', data: empty(), promoteId: 'id', attribution: '<a href="https://mapservices.pasda.psu.edu/server/rest/services/pasda/AlleghenyCounty/MapServer/11">Allegheny County / PASDA buildings</a> · Heights: County / <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors, ODbL</a>' })
      for (const id of ['empty-sites', 'discovery', 'placed-buildings', 'building', 'selected', 'selected-building', 'site-building-labels', 'service', 'network-nodes', 'parks', 'reservations', 'connections', 'saved-routes', 'draft-node', 'building-massing', 'placed-massing', 'site-ground', 'trees', 'shadows', 'zoning-envelope', 'selected-building-rim', 'vacant-lots', 'lvt-shift', 'shaded-parcels']) map.addSource(id, { type: 'geojson', data: empty(), ...(['empty-sites', 'discovery'].includes(id) ? { promoteId: 'pin' } : {}) })
      map.addSource('walking-network', { type: 'geojson', data: empty(), promoteId: 'id', attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors · ODbL</a>' })
      map.addLayer({ id: 'district-line', type: 'line', source: 'districts', paint: { 'line-color': '#78978c', 'line-width': 2, 'line-dasharray': [3, 3] } })
      map.addLayer({ id: 'district-fill', type: 'fill', source: 'districts', maxzoom: DETAIL_ZOOM, paint: { 'fill-color': '#78978c', 'fill-opacity': .12 } }, 'district-line')
      map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcels', minzoom: DETAIL_EXIT_ZOOM, paint: { 'fill-color': ['case', ['get', 'vacant'], '#81b99c', '#e6e9e3'], 'fill-opacity': .28 } })
      map.addLayer({ id: 'parcel-line', type: 'line', source: 'parcels', minzoom: DETAIL_EXIT_ZOOM, paint: { 'line-color': '#788f84', 'line-width': .6, 'line-opacity': .55 } })
      map.addLayer({ id: 'vacant-lot-fill', type: 'fill', source: 'vacant-lots', minzoom: DETAIL_EXIT_ZOOM, paint: { 'fill-color': BUILDING_TYPE_CATEGORIES.find(c => c.id === 'vacant').color, 'fill-opacity': .55 } })
      map.addLayer({ id: 'empty-site-fill', type: 'fill', source: 'empty-sites', minzoom: DETAIL_EXIT_ZOOM, paint: { 'fill-color': '#fbbf24', 'fill-opacity': .45 } })
      map.addLayer({ id: 'empty-site-outline', type: 'line', source: 'empty-sites', minzoom: DETAIL_EXIT_ZOOM, paint: { 'line-color': '#a16207', 'line-width': 2 } })
      map.addLayer({ id: 'discovery-outline', type: 'line', source: 'discovery', paint: { 'line-color': '#0891b2', 'line-width': 2 } })
      map.addLayer({ id: 'selected-fill', type: 'fill', source: 'selected', paint: { 'fill-color': '#2b8061', 'fill-opacity': .12 } })
      map.addLayer({ id: 'selected-line', type: 'line', source: 'selected', paint: { 'line-color': '#23694f', 'line-width': 2.5 } })
      map.addLayer({ id: 'park-fill', type: 'fill', source: 'parks', paint: { 'fill-color': '#87af67', 'fill-opacity': .35 } })
      map.addLayer({ id: 'network-line', type: 'line', source: 'walking-network', minzoom: DETAIL_EXIT_ZOOM, layout: { visibility: 'none' }, paint: { 'line-color': '#598daf', 'line-width': 2, 'line-opacity': .7 } })
      map.addLayer({ id: 'network-nodes', type: 'circle', source: 'network-nodes', minzoom: 16, paint: { 'circle-color': '#fff', 'circle-radius': 3, 'circle-stroke-color': '#467a9c', 'circle-stroke-width': 1.5 } })
      map.addLayer({ id: 'reservation-fill', type: 'fill', source: 'reservations', paint: { 'fill-color': ['case', ['==', ['get', 'kind'], 'park'], '#70aa53', '#bd8d55'], 'fill-opacity': .6 } })
      map.addLayer({ id: 'connection-line', type: 'line', source: 'connections', paint: { 'line-color': '#a16736', 'line-width': 4 } })
      map.addLayer({ id: 'saved-route-line', type: 'line', source: 'saved-routes', paint: { 'line-color': '#137bd1', 'line-width': 5 } })
      map.addLayer({ id: 'shadows', type: 'fill', source: 'shadows', paint: { 'fill-color': '#1d2733', 'fill-opacity': ['case', ['==', ['get', 'kind'], 'existing'], .14, .22], 'fill-antialias': false } }, 'connection-line')
      // Neighbours in project shadow: warmer and more opaque with more hours, labelled with the estimate.
      map.addLayer({ id: 'shade-fill', type: 'fill', source: 'shaded-parcels', minzoom: DETAIL_EXIT_ZOOM, paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'hours'], 0, '#f6d58b', 3, '#e08a3c', 6, '#a8432a'], 'fill-opacity': ['interpolate', ['linear'], ['get', 'hours'], 0, .35, 6, .7] } }, 'shadows')
      map.addLayer({ id: 'shade-line', type: 'line', source: 'shaded-parcels', minzoom: DETAIL_EXIT_ZOOM, paint: { 'line-color': '#8a3b1d', 'line-width': 1.4 } }, 'shadows')
      map.addLayer({ id: 'draft-point', type: 'circle', source: 'draft-node', paint: { 'circle-color': '#f3b45b', 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      map.addLayer({ id: 'site-ground', type: 'fill-extrusion', source: 'site-ground', paint: { ...extrusion, 'fill-extrusion-vertical-gradient': false, 'fill-extrusion-opacity': 1 } })
      const colors = existingBuildingColors(buildingStyle, !!typeHighlight)
      map.addLayer({ id: 'existing-buildings-overview', type: 'fill', source: 'existing-buildings', minzoom: DETAIL_EXIT_ZOOM, maxzoom: 16, paint: { 'fill-color': colors.overview, 'fill-opacity': .8 } })
      // Realistic fallback uses a warm facade and charcoal roof; the type view keeps both in the legend hue.
      map.addLayer({ id: 'existing-buildings-fill', type: 'fill-extrusion', source: 'existing-buildings', minzoom: 16, paint: { 'fill-extrusion-height': ['max', 0, ['-', ['get', 'height_m'], ROOF_CAP_M]], 'fill-extrusion-color': colors.facade, 'fill-extrusion-opacity': .9, 'fill-extrusion-vertical-gradient': true } })
      map.addLayer({ id: 'existing-buildings-roof', type: 'fill-extrusion', source: 'existing-buildings', minzoom: 16, paint: { 'fill-extrusion-base': ['max', 0, ['-', ['get', 'height_m'], ROOF_CAP_M]], 'fill-extrusion-height': ['get', 'height_m'], 'fill-extrusion-color': colors.roof, 'fill-extrusion-opacity': .9, 'fill-extrusion-vertical-gradient': true } })
      // Buildings drawn by the Three.js layer stay clickable through this invisible copy (opacity 0 skips drawing, not queries).
      map.addLayer({ id: 'existing-buildings-hit', type: 'fill-extrusion', source: 'existing-buildings', minzoom: 16, filter: ['in', ['to-string', ['get', 'id']], ['literal', []]], paint: { 'fill-extrusion-height': ['get', 'height_m'], 'fill-extrusion-color': '#000000', 'fill-extrusion-opacity': 0 } })
      // Tax shift choropleth: flat over buildings in 2D, a thin ground slab under them in 3D.
      const lvtColor = ['match', ['get', 'lvt_class'], ...Object.entries(LVT_MAP_COLORS).flat(), '#c9ccd1']
      map.addLayer({ id: 'lvt-ground', type: 'fill-extrusion', source: 'lvt-shift', minzoom: DETAIL_EXIT_ZOOM, layout: { visibility: 'none' }, paint: { 'fill-extrusion-height': .35, 'fill-extrusion-color': lvtColor, 'fill-extrusion-opacity': .9, 'fill-extrusion-vertical-gradient': false } }, 'existing-buildings-overview')
      map.addLayer({ id: 'lvt-fill', type: 'fill', source: 'lvt-shift', minzoom: DETAIL_EXIT_ZOOM, layout: { visibility: 'none' }, paint: { 'fill-color': lvtColor, 'fill-opacity': .82 } })
      map.addLayer({ id: 'lvt-line', type: 'line', source: 'lvt-shift', minzoom: DETAIL_EXIT_ZOOM, layout: { visibility: 'none' }, paint: { 'line-color': '#ffffff', 'line-width': .5, 'line-opacity': .8 } })
      map.addLayer({ id: 'service-link', type: 'line', source: 'service', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#386da3', 'line-width': 3 } })
      map.addLayer({ id: 'stops-points', type: 'circle', source: 'stops', minzoom: DETAIL_EXIT_ZOOM, paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#587693', 'circle-stroke-width': 1.5 } })
      map.addLayer({ id: 'service-zone', type: 'fill-extrusion', source: 'service', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-extrusion-height': 1.5, 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-opacity': .95 } })
      map.addLayer({ id: 'placed-buildings-fill', type: 'fill-extrusion', source: 'placed-massing', paint: { ...extrusion, 'fill-extrusion-opacity': .97 } })
      map.addLayer({ id: 'placed-buildings-outline', type: 'line', source: 'placed-buildings', paint: { 'line-color': ['case', ['get', 'valid'], '#fff', '#dc2626'], 'line-width': 2, 'line-dasharray': [2, 1] } })
      map.addLayer({ id: 'building-fill', type: 'fill-extrusion', source: 'building-massing', paint: { ...extrusion, 'fill-extrusion-opacity': .8 } })
      map.addLayer({ id: 'building-outline', type: 'line', source: 'building', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 1] } })
      map.addLayer({ id: 'trees', type: 'fill-extrusion', source: 'trees', minzoom: 16, paint: { ...extrusion, 'fill-extrusion-opacity': 1 } })
      map.addLayer({ id: 'zoning-envelope', type: 'fill-extrusion', source: 'zoning-envelope', paint: { ...extrusion, 'fill-extrusion-vertical-gradient': false, 'fill-extrusion-opacity': .55 } })
      map.addLayer({ id: 'selected-building-outline', type: 'line', source: 'selected-building', paint: { 'line-color': '#22d3ee', 'line-width': 4 }, layout: { 'line-join': 'round' } })
      map.addLayer({ id: 'selected-building-rim', type: 'fill-extrusion', source: 'selected-building-rim', paint: { ...extrusion, 'fill-extrusion-opacity': 1 } })
      for (const id of ['discovery-outline', 'selected-fill', 'selected-line', 'park-fill', 'reservation-fill', 'connection-line', 'saved-route-line', 'draft-point', 'service-link', 'service-zone', 'placed-buildings-fill', 'placed-buildings-outline', 'building-fill', 'building-outline', 'selected-building-outline', 'selected-building-rim', 'site-ground', 'shadows', 'zoning-envelope']) map.setLayerZoomRange(id, DETAIL_EXIT_ZOOM, 24)
      map.setLight(sunLight(sunFor(callbacks.current.sunTime)))
      // One small symbol layer for this parcel, with badges lifted to the rendered roof.
      // Reuse the basemap's Noto glyphs; badge artwork is a tiny local canvas.
      for (const [id, fill, stroke] of [['building-number', '#ffffff', '#315b46'], ['building-number-selected', '#176353', '#ffffff']]) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 52
        const ctx = canvas.getContext('2d')
        ctx.beginPath(); ctx.arc(26, 26, 24, 0, Math.PI * 2)
        ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke()
        map.addImage(id, ctx.getImageData(0, 0, 52, 52), { pixelRatio: 2 })
      }
      map.addLayer({ id: 'site-building-labels', type: 'symbol', source: 'site-building-labels', minzoom: DETAIL_EXIT_ZOOM,
        layout: {
          'symbol-height-offset': ['step', ['zoom'], 0, 16, ['+', ['get', 'height_m'], 1]],
          'symbol-sort-key': ['case', ['get', 'selected'], -1, 0],
          'text-field': ['to-string', ['get', 'number']], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
          'text-pitch-alignment': 'viewport', 'text-rotation-alignment': 'viewport', 'text-allow-overlap': false, 'text-ignore-placement': false, 'text-padding': 0,
          'icon-image': ['case', ['get', 'selected'], 'building-number-selected', 'building-number'],
          'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport', 'icon-allow-overlap': false, 'icon-ignore-placement': false, 'icon-padding': 0,
        }, paint: { 'text-color': ['case', ['get', 'selected'], '#ffffff', '#214b3a'] } })
      map.addLayer({ id: 'shade-label', type: 'symbol', source: 'shaded-parcels', minzoom: 16, layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-pitch-alignment': 'viewport' }, paint: { 'text-color': '#5c2410', 'text-halo-color': '#fffaf0', 'text-halo-width': 1.6 } })
      map.on('mousemove', event => {
        if (!callbacks.current.placing || hoverFrame) return
        hoverFrame = requestAnimationFrame(() => { hoverFrame = null; callbacks.current.onHover?.([event.lngLat.lng, event.lngLat.lat]) })
      })
      map.on('click', event => {
        if (!hasMapDetail(currentViewport)) return
        if (callbacks.current.drawing) { callbacks.current.onDraw([event.lngLat.lng, event.lngLat.lat]); return }
        if (callbacks.current.placing) { callbacks.current.onPlace([event.lngLat.lng, event.lngLat.lat]); return }
        const labelHit = map.queryRenderedFeatures(event.point, { layers: ['site-building-labels'] })[0]
        if (labelHit && callbacks.current.onSiteBuildingSelect) {
          popup.current?.remove(); callbacks.current.onSiteBuildingSelect(labelHit.properties.key); return
        }
        const stopHit = map.queryRenderedFeatures(event.point, { layers: ['stops-points'] })[0]
        if (stopHit && callbacks.current.tool === 'service') { callbacks.current.onStop(String(stopHit.properties.stop_id)); return }
        const placedHit = map.queryRenderedFeatures(event.point, { layers: ['placed-buildings-fill', 'placed-buildings-outline'] })[0]
        if (placedHit) {
          const p = placedHit.properties
          popup.current?.remove()
          if (callbacks.current.onBuildingSelect) callbacks.current.onBuildingSelect({ kind: 'placed', id: String(p.id), pin: String(p.pin) })
          else if (p.pin) callbacks.current.onSelect(p.pin)
          return
        }
        const buildingHit = map.queryRenderedFeatures(event.point, { layers: ['existing-buildings-fill', 'existing-buildings-roof', 'existing-buildings-hit', 'existing-buildings-overview'] })[0]
        if (buildingHit) {
          const ref = recordedBuildingRef(buildingHit)
          const outlineId = buildingHit.properties?.id ?? buildingHit.id
          // The unplaced preview must not prevent inspecting or replacing a
          // mapped building beneath it. The context drawer owns mapped evidence.
          if (callbacks.current.onBuildingSelect && (ref || outlineId !== undefined && outlineId !== null && outlineId !== '')) {
            popup.current?.remove()
            callbacks.current.onBuildingSelect(ref ? { kind: 'existing', ...ref } : { kind: 'existing', id: String(outlineId), pin: '', unmatched: true })
            return
          }
          const p = buildingHit.properties
          const content = document.createElement('div')
          content.className = 'building-popup'
          const title = document.createElement('strong'); title.textContent = p.use_label || 'Use unknown'
          const detail = document.createElement('p'); detail.textContent = buildingHeightDescription(p)
          const note = document.createElement('small'); note.textContent = `${p.recorded_land_use || 'Unknown use'} · ${p.use_evidence || 'Occupancy unverified.'}`
          content.append(title, detail, note)
          const source = buildingHeightSource(p)
          if (source) {
            const link = document.createElement('a'); link.href = source; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'View mapped height source ↗'
            content.append(document.createElement('br'), link)
          }
          popup.current?.remove()
          popup.current = new Popup({ maxWidth: '260px' }).setLngLat(event.lngLat).setDOMContent(content).addTo(map)
          if (p.pin) callbacks.current.onSelect(p.pin)
          return
        }
        const hit = map.queryRenderedFeatures(event.point, { layers: ['parcel-fill'] })[0]
        if (hit) { popup.current?.remove(); callbacks.current.onSelect(hit.properties.pin) }
      })
      map.on('mouseenter', 'parcel-fill', () => { map.getCanvas().style.cursor = callbacks.current.placing || callbacks.current.drawing ? 'crosshair' : 'pointer' })
      map.on('mouseleave', 'parcel-fill', () => { map.getCanvas().style.cursor = callbacks.current.placing || callbacks.current.drawing ? 'crosshair' : '' })
      loadedMap.current = map
      publishViewport(true)
      setReady(true)
    })
    let viewportTimer = null, currentViewport = null
    const publishViewport = (loadNeighborhoods = false) => {
      clearTimeout(viewportTimer); viewportTimer = null
      const bounds = map.getBounds()
      const next = renderViewport(currentViewport, { zoom: map.getZoom(), bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()] })
      currentViewport = next
      setViewport(next)
      callbacks.current.onViewport?.(next, loadNeighborhoods)
      if (marker.current) marker.current.getElement().hidden = !next.detail || callbacks.current.hideSiteMarker
      if (!next.detail) popup.current?.remove()
    }
    // Cull existing detail while moving, but request new neighborhoods only after
    // the camera settles. Zooming out cannot start a burst of intermediate loads.
    map.on('move', () => { viewportTimer ??= setTimeout(() => publishViewport(false), 150) })
    map.on('moveend', () => publishViewport(true))
    map.on('resize', () => publishViewport(true))
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container.current)
    return () => {
      disposeBenchmark?.(); clearTimeout(viewportTimer); cancelAnimationFrame(hoverFrame)
      if (three.current?.map === map) three.current.controller.dispose()
      three.current = null
      observer.disconnect(); marker.current?.remove(); marker.current = null; popup.current?.remove()
      loadedMap.current = null; mapRef.current = null; uploaded.current.clear()
      map.remove()
    }
  }, [neighborhoods, stops])

  useEffect(() => {
    if (!ready || !viewport) return
    const pins = new Set(discoveryPins)
    updateFeatures('parcels', visibleParcels)
    updateFeatures('discovery', visibleParcels.filter(f => pins.has(f.properties.pin)))
    updateFeatures('existing-buildings', visibleBuildings)
  }, [ready, visibleParcels, visibleBuildings, discoveryPins])
  useEffect(() => {
    // Only an explicit action emits an effect. Zoom, chunks, history and the tour
    // can remove rendered footprints too, and must never look like demolition.
    if (!demolitionEffect || consumedDemolition.current === demolitionEffect.id) return
    consumedDemolition.current = demolitionEffect.id
    const map = readyMap()
    if (!map || !detail || !showExisting) return
    const keys = new Set(demolitions.map(demolitionKey))
    const stops = demolitionEffect.items.filter(({ building }) => selected?.properties.pin === demolitionSite(building) && keys.has(demolitionKey(building)))
      .slice(0, 6).map(({ feature }) => playDemolitionEffect(map, feature)).filter(Boolean)
    return stops.length ? () => stops.forEach(stop => stop()) : undefined
  }, [ready, demolitionEffect, demolitions, showExisting, detail, selected?.properties.pin])
  useEffect(() => {
    if (!ready) return
    const pins = new Set(emptyPins)
    updateFeatures('empty-sites', visibleParcels.filter(f => pins.has(f.properties.pin)))
  }, [ready, visibleParcels, emptyPins])
  useEffect(() => {
    const map = readyMap()
    if (!map) return
    map.setLayoutProperty('existing-buildings-fill', 'visibility', showExisting ? 'visible' : 'none')
    map.setLayoutProperty('existing-buildings-roof', 'visibility', showExisting ? 'visible' : 'none')
    map.setLayoutProperty('existing-buildings-overview', 'visibility', showExisting ? 'visible' : 'none')
    map.setLayoutProperty('existing-buildings-hit', 'visibility', showExisting ? 'visible' : 'none')
    if (!showExisting) popup.current?.remove()
  }, [ready, showExisting])
  useEffect(() => {
    const map = readyMap()
    if (!map) return
    const colors = existingBuildingColors(buildingStyle, !!typeHighlight)
    map.setPaintProperty('existing-buildings-overview', 'fill-color', colors.overview)
    map.setPaintProperty('existing-buildings-fill', 'fill-extrusion-color', colors.facade)
    map.setPaintProperty('existing-buildings-roof', 'fill-extrusion-color', colors.roof)
  }, [ready, buildingStyle, highlightOn])
  const lvtRates = lvt?.rates || null
  useEffect(() => {
    const map = readyMap()
    if (!map) return
    map.getSource('lvt-shift').setData(fc(lvtRates ? visibleParcels.map(f => {
      const shift = parcelShift(f.properties, lvtRates)
      return { type: 'Feature', geometry: f.geometry, properties: { pin: f.properties.pin, lvt_class: shift ? shiftClass(shift.percent) : 'none' } }
    }) : []))
    map.setLayoutProperty('lvt-fill', 'visibility', lvtRates && !view3d ? 'visible' : 'none')
    map.setLayoutProperty('lvt-line', 'visibility', lvtRates && !view3d ? 'visible' : 'none')
    map.setLayoutProperty('lvt-ground', 'visibility', lvtRates && view3d ? 'visible' : 'none')
    if (lvtRates && !view3d) map.moveLayer('selected-line', 'service-link')
    else map.moveLayer('selected-line', 'park-fill')
  }, [ready, visibleParcels, lvtRates, view3d])
  useEffect(() => {
    if (!ready) return
    const showVacant = highlightOn && !hiddenTypes.includes('vacant')
    updateFeatures('vacant-lots', showVacant ? visibleParcels.filter(f => f.properties.type_category === 'vacant') : [])
  }, [ready, visibleParcels, highlightOn, hiddenKey])
  useEffect(() => {
    const map = readyMap()
    if (map) map.getCanvas().style.cursor = placing || drawing ? 'crosshair' : ''
  }, [ready, placing, drawing])

  useEffect(() => {
    const map = readyMap()
    if (!map) return
    const visible = tool === 'network', point = selected && geometryCenter(selected.geometry)
    map.setLayoutProperty('network-line', 'visibility', visible ? 'visible' : 'none')
    map.getSource('network-nodes').setData(visible && network && point ? fc(network.nodes.flatMap((coordinates, id) => network.ground[id] && haversineMeters(...point, ...coordinates) < 600 ? [{ type: 'Feature', properties: { node: id }, geometry: { type: 'Point', coordinates } }] : [])) : empty())
    map.getSource('parks').setData(visible && network ? fc(network.parks.map(p => ({ type: 'Feature', properties: { name: p.name }, geometry: p.geometry }))) : empty())
  }, [ready, tool, network, selected])
  useEffect(() => { if (ready) updateFeatures('walking-network', visibleRoads) }, [ready, visibleRoads])

  useEffect(() => {
    const map = readyMap()
    if (!map) return
    map.getSource('reservations').setData(proposed ? fc(reservations || []) : empty())
    map.getSource('connections').setData(proposed && network ? fc((connections || []).filter(c => endpointCoordinates(network,c.from) && endpointCoordinates(network,c.to)).map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [endpointCoordinates(network,c.from), endpointCoordinates(network,c.to)] } }))) : empty())
    map.getSource('saved-routes').setData(fc(routes.map(r => ({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:r.coordinates}}))))
  }, [ready, proposed, reservations, connections, routes, network])
  useEffect(() => {
    const map = readyMap()
    if (map) map.getSource('draft-node').setData(drawing && network && draftNode !== null ? fc([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: draftNode.coordinates } }]) : empty())
  }, [ready, drawing, network, draftNode])

  useEffect(() => {
    const map = readyMap()
    if (!map || !selected) return
    map.getSource('selected').setData(fc([{ ...selected, properties: { pin: selected.properties.pin } }]))
    const point = geometryCenter(selected.geometry)
    if (point) {
      marker.current?.remove()
      const element = document.createElement('div')
      element.className = 'planner-site-marker'
      element.hidden = !detail || callbacks.current.hideSiteMarker
      element.textContent = `${selected.properties.address || selected.properties.pin} · ${selected.properties.zoning_code || '?'}`
      marker.current = new Marker({ element, anchor: 'bottom', offset: [0, -35] }).setLngLat(point).addTo(map)
    }
  }, [ready, selected])

  useEffect(() => {
    const map = readyMap()
    if (!map) return
    const building = ['housing', 'compare'].includes(tool) && buildingPreview ? [buildingPreview] : []
    map.getSource('building').setData(fc(building))
    const lot = selected ? lotContext(selected.properties.pin, selected.geometry) : {}
    streetBearing.current = building[0] ? facadeBearing(building[0].geometry, lot.parcel, lot.neighbors) : null
    // Highlighting colours the body by typology; the status colour moves to a ground rim so fit and zoning still read.
    const rims = highlightOn ? building.map(b => rimFeature(b.geometry, b.properties.color, .45)).filter(Boolean) : []
    map.getSource('building-massing').setData(fc([...building.flatMap(b => parts(buildingMassing({ buildingStyle, geometry: b.geometry, typeId: b.properties.typeId, height: b.properties.height, floors: b.properties.floors, stairs: stairsFor(b.properties.typeId, b.properties.floors), color: plannedColor(b.properties.typeId, b.properties.color), state: highlightOn ? 'placed' : b.properties.state || 'valid', ...lot }))), ...rims]))
  }, [ready, buildingStyle, buildingPreview, tool, selected, lotContext, highlightOn, plannedColor, stairsFor])

  useEffect(() => {
    const map = readyMap()
    if (!map) return
    const drawn = placedBuildings.filter(b => b.massing.geometry)
    map.getSource('placed-buildings').setData(fc(drawn.map(b => ({ type: 'Feature', geometry: b.massing.geometry, properties: { id: b.id, pin: b.pin, height: b.height, color: plannedColor(b.typeId, placedBuildingColor(b.typeId)), valid: b.eligible } }))))
    const rims = drawn.filter(b => !b.eligible).flatMap(b => {
      const rim = rimFeature(b.massing.geometry, '#dc2626')
      return rim ? [{ ...rim, properties: { ...rim.properties, id: b.id, pin: b.pin } }] : []
    })
    placedBearings.current = new Map()
    const massing = drawn.flatMap(b => {
      const lot = lotContext(b.pin, b.massing.geometry), bearing = facadeBearing(b.massing.geometry, lot.parcel, lot.neighbors)
      if (bearing !== null) placedBearings.current.set(b.pin, bearing)
      return parts(buildingMassing({ buildingStyle, geometry: b.massing.geometry, typeId: b.typeId, height: b.height, floors: b.floors ?? BUILDINGS[b.typeId]?.floors, stairs: stairsFor(b.typeId, b.floors ?? BUILDINGS[b.typeId]?.floors), color: plannedColor(b.typeId, placedBuildingColor(b.typeId)), ...lot }), { id: b.id, pin: b.pin })
    })
    map.getSource('placed-massing').setData(fc([...massing, ...rims]))
  }, [ready, buildingStyle, placedBuildings, lotContext, plannedColor, stairsFor])

  const showDraft = ['housing', 'compare'].includes(tool)
  const envelope = useMemo(() => showDraft && selected && zoningEnvelope
    ? envelopeFeatures({ parcel: selected.geometry, yards: zoningEnvelope.yards, heightM: zoningEnvelope.heightM, ghostHeightM: zoningEnvelope.ghostHeightM })
    : { ground: [], envelope: [] }, [showDraft, selected, zoningEnvelope])
  const lots = useMemo(() => {
    const pins = [...new Set([selected?.properties.pin, ...placedBuildings.map(b => b.pin)].filter(Boolean))]
    return pins.map(pin => parcelByPin.get(pin)).filter(Boolean)
  }, [selected, placedBuildings, parcelByPin])
  useEffect(() => {
    const map = readyMap()
    if (!map) return
    const walk = (geometry, { parcel, neighbors }) => frontWalk(geometry, parcel, 1.2, neighbors)
    const preview = showDraft && buildingPreview && selected ? walk(buildingPreview.geometry, lotContext(selected.properties.pin, selected.geometry)) : null
    const walks = placedBuildings.filter(b => b.massing.geometry).map(b => walk(b.massing.geometry, lotContext(b.pin, b.massing.geometry))).filter(Boolean)
    map.getSource('site-ground').setData(fc([...lots.flatMap(lot => yardPad(lot.geometry)), ...envelope.ground, ...walks, ...(preview ? [preview] : [])]))
    map.getSource('zoning-envelope').setData(fc(envelope.envelope))
  }, [ready, lots, envelope, placedBuildings, buildingPreview, showDraft, selected, lotContext])
  useEffect(() => {
    const map = readyMap()
    if (!map) return
    const parks = proposed ? (reservations || []).filter(r => r.properties?.kind === 'park').map(r => r.geometry) : []
    const paths = proposed && network ? (connections || []).map(c => [endpointCoordinates(network, c.from), endpointCoordinates(network, c.to)]).filter(line => line.every(Boolean)) : []
    const planted = [...new Set(placedBuildings.map(b => b.pin))].map(pin => parcelByPin.get(pin)).filter(Boolean).map(parcel => ({
      parcel: parcel.geometry,
      footprints: [...placedBuildings.filter(b => b.pin === parcel.properties.pin && b.massing.geometry).map(b => b.massing.geometry), ...visibleBuildings.filter(f => f.properties.pin === parcel.properties.pin).map(f => f.geometry)],
    }))
    map.getSource('trees').setData(fc(streetscapeTrees({ parks, paths, lots: planted })))
  }, [ready, proposed, reservations, connections, network, placedBuildings, visibleBuildings, parcelByPin])
  const sun = useMemo(() => sunFor(sunTime, selected ? geometryCenter(selected.geometry)?.[1] : undefined), [sunTime, selected])
  useEffect(() => {
    const map = readyMap()
    if (map) map.setLight(sunLight(sun))
  }, [ready, sun])
  useEffect(() => {
    const map = readyMap()
    if (!map) return
    const threeD = detail && viewport.zoom >= 16
    const existing = threeD ? visibleBuildings.map(f => ({ geometry: f.geometry, height: Number(f.properties.height_m) || 0 })) : []
    const placed = placedBuildings.filter(b => b.massing.geometry).map(b => ({ geometry: b.massing.geometry, height: b.height, kind: 'proposed' }))
    const draft = showDraft && buildingPreview ? [{ geometry: buildingPreview.geometry, height: buildingPreview.properties.height, kind: 'proposed' }] : []
    map.getSource('shadows').setData(fc(detail ? buildingShadows([...existing, ...placed, ...draft], sun) : []))
  }, [ready, sun, detail, viewport?.zoom, visibleBuildings, placedBuildings, buildingPreview, showDraft])
  useEffect(() => {
    const map = readyMap()
    if (map) map.getSource('shaded-parcels').setData(fc(shadedParcels || []))
  }, [ready, shadedParcels])

  useEffect(() => {
    // A request removed before evaluation finishes is consumed too: Undo/Redo
    // must not replay construction, even if the building never reached the map.
    if (constructionRequest.current && constructionRequest.current !== constructionEffect?.id) consumedConstruction.current = constructionRequest.current
    constructionRequest.current = constructionEffect?.id || null
    const map = readyMap(), active = constructionRun.current
    const valid = map && detail && constructionEffect && selected?.properties.pin === constructionEffect.pin
    if (active && (!valid || active.id !== constructionEffect.id || active.map !== map)) {
      active.stop()
      if (constructionRun.current === active) constructionRun.current = null
    }
    if (!valid) { if (constructionEffect) consumedConstruction.current = constructionEffect.id; return }
    if (constructionRun.current?.id === constructionEffect.id || consumedConstruction.current === constructionEffect.id) return
    // Keep the accepted preview until the completed building is available for
    // the handoff. Score/chunk updates may replace this array during animation.
    if (!placedBuildings.some(b => b.id === constructionEffect.id && b.pin === constructionEffect.pin)) return
    consumedConstruction.current = constructionEffect.id
    const run = { id: constructionEffect.id, map, stop: () => {} }, key = `${constructionEffect.id}:${constructionEffect.pin}`
    constructionRun.current = run
    setConstructing(key)
    const done = () => {
      if (constructionRun.current === run) constructionRun.current = null
      setConstructing(current => current === key ? null : current)
    }
    const stop = playConstructionEffect(map, constructionEffect, done)
    if (stop) run.stop = stop
    else done()
  }, [ready, constructionEffect, placedBuildings, detail, selected?.properties.pin])
  useEffect(() => () => { constructionRun.current?.stop(); constructionRun.current = null }, [])

  useEffect(() => {
    const map = readyMap()
    if (!map || !threeWanted || three.current?.map === map || threeLoad.current === map) return
    threeLoad.current = map
    import('../lib/threeBuildingsLayer.js').then(({ createThreeBuildingsLayer }) => {
      if (mapRef.current !== map || loadedMap.current !== map) return
      // Loading may finish after the user switches styles. Only the activation effect may enable rendering.
      const controller = createThreeBuildingsLayer({ enabled: false, onStatus: status => { if (three.current?.controller === controller) setThreeStatus(status) } })
      three.current = { map, controller }
      map.addLayer(controller.layer, 'trees')
      setThreeStatus(controller.status)
    }).catch(() => { if (mapRef.current === map) setThreeStatus('unavailable') })
  }, [ready, threeWanted])
  useEffect(() => {
    // One building, one renderer: while the mesh layer draws, the duplicate extrusions go transparent (still
    // queryable) and meshed footprints move from the coloured extrusion to the invisible hit layer.
    const map = readyMap()
    if (!map) return
    const active = threeActive && three.current?.map === map
    if (three.current?.map === map) three.current.controller.setEnabled(active)
    if (map.getLayer('three-buildings')) map.setLayoutProperty('three-buildings', 'visibility', active ? 'visible' : 'none')
    map.setPaintProperty('placed-buildings-fill', 'fill-extrusion-opacity', active ? 0 : .97)
    map.setPaintProperty('building-fill', 'fill-extrusion-opacity', active ? 0 : .8)
    const ids = active ? meshedIds : [], meshed = ['in', ['to-string', ['get', 'id']], ['literal', ids]]
    const hidden = highlightOn ? hiddenCategoryFilter(hiddenTypes) : null
    map.setFilter('existing-buildings-fill', allFilters(ids.length ? ['!', meshed] : null, hidden))
    map.setFilter('existing-buildings-roof', allFilters(ids.length ? ['!', meshed] : null, hidden))
    map.setFilter('existing-buildings-overview', hidden)
    map.setFilter('existing-buildings-hit', allFilters(meshed, hidden))
  }, [ready, threeActive, threeStatus, meshedIds, highlightOn, hiddenTypes])
  useEffect(() => {
    const map = readyMap()
    if (!map || !threeWanted) return
    const { lng, lat } = map.getCenter()
    setMeshFocus(focus => focus && haversineMeters(focus[0], focus[1], lng, lat) < 120 ? focus : [lng, lat])
  }, [ready, viewport, threeWanted])
  useEffect(() => { threeController?.setSun(sun) }, [threeController, sun])
  useEffect(() => {
    if (!threeController) return
    const origin = meshFocus ?? (selected ? geometryCenter(selected.geometry) : null)
    if (origin) threeController.setOrigin(origin)
    threeController.setNeighborhood(meshCandidates, { inspectedKey, highlight: meshHighlight })
  }, [threeController, meshKey, meshFocus, inspectedKey, selected, meshHighlight])
  useEffect(() => {
    if (!threeController) return
    const item = (key, geometry, pin, props) => {
      const lot = lotContext(pin, geometry), box = withFront(footprintBox(geometry), lot.parcel, lot.neighbors)
      return { key, geometry, front: box ? [box.v[0] * box.front, box.v[1] * box.front] : null, ...props }
    }
    const items = []
    if (showDraft && buildingPreview && selected) {
      const p = buildingPreview.properties
      items.push(item('preview', buildingPreview.geometry, selected.properties.pin, { typeId: p.typeId, height: p.height, floors: p.floors, state: p.state || 'valid', hidden: !!constructing, tint: highlightOn ? plannedColor(p.typeId) : null, stairs: stairsFor(p.typeId, p.floors) }))
    }
    for (const b of placedBuildings) if (b.massing.geometry) {
      const key = `${b.id}:${b.pin}`
      items.push(item(key, b.massing.geometry, b.pin, { typeId: b.typeId, height: b.height, floors: b.floors ?? BUILDINGS[b.typeId]?.floors, state: 'placed', flagged: !b.eligible, hidden: constructing === key, tint: highlightOn ? plannedColor(b.typeId) : null, stairs: stairsFor(b.typeId, b.floors ?? BUILDINGS[b.typeId]?.floors) }))
    }
    threeController.setProposed(items)
  }, [threeController, buildingPreview, placedBuildings, showDraft, selected, lotContext, constructing, highlightOn, plannedColor, stairsFor])

  useEffect(() => {
    const map = readyMap()
    if (!map) return
    map.getSource('site-building-labels').setData(fc(detail ? siteLabels : []))
    // The address is already in the sidebar; its floating marker otherwise covers the roof badges.
    if (marker.current) marker.current.getElement().hidden = !detail || siteLabels.length > 0
  }, [ready, detail, siteLabels, selected])


  useEffect(() => {
    const map = readyMap()
    if (!map) return
    let geometry = null, sourceId = null
    if (selectedBuilding?.kind === 'existing' && showExisting) {
      const key = demolitionKey(selectedBuilding)
      const feature = key && (visibleBuildings.find(feature => footprintKey(feature) === key) || buildingRows.find(row => row.key === key)?.building)
      geometry = feature?.geometry
      sourceId = feature?.properties.id ?? feature?.id ?? null
    } else if (selectedBuilding?.kind === 'placed') {
      geometry = placedBuildings.find(building => String(building.id) === String(selectedBuilding.id) && String(building.pin) === String(selectedBuilding.pin))?.massing.geometry
    }
    if (inspectedSourceId.current !== null && inspectedSourceId.current !== sourceId) map.setFeatureState({ source: 'existing-buildings', id: inspectedSourceId.current }, { inspected: false })
    if (sourceId !== null) map.setFeatureState({ source: 'existing-buildings', id: sourceId }, { inspected: true })
    inspectedSourceId.current = sourceId
    map.getSource('selected-building').setData(geometry ? fc([{ type: 'Feature', properties: {}, geometry }]) : empty())
    const rim = geometry ? rimFeature(geometry, '#22d3ee', .45) : null
    map.getSource('selected-building-rim').setData(fc(rim ? [rim] : []))
  }, [ready, selectedBuilding, visibleBuildings, placedBuildings, buildingRows, showExisting])

  useEffect(() => {
    const map = readyMap()
    if (!map) return
    const point = selected ? geometryCenter(selected.geometry) : null
    map.getSource('service').setData(stop && point ? fc([
      { type: 'Feature', properties: { color: proposed && additionalDepartures > 0 ? '#2d86c2' : '#587693' }, geometry: rectangleAt(stop.coordinates, 12, 4) },
      ...(networkResult?.route ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: networkResult.route } }] : []),
    ]) : empty())
  }, [ready, stop, selected, proposed, additionalDepartures, networkResult])

  useEffect(() => {
    const map = readyMap()
    if (!map) return
    const point = selected && geometryCenter(selected.geometry)
    const newSite = point && lastPin.current !== selected.properties.pin
    const street = view3d && streetView, streetChanged = lastStreet.current !== street
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // A second easeTo cancels the first: apply the complete camera destination
    // together, including on direct parcel links and rapid tool/site switches.
    map.easeTo({
      ...(point ? { center: point } : {}),
      ...(street && (newSite || streetChanged) ? { zoom: STREET_ZOOM } : newSite || streetChanged && lastStreet.current !== null ? { zoom: SITE_ZOOM } : {}),
      pitch: street ? STREET_PITCH : view3d ? AERIAL_PITCH : 0,
      bearing: street && (newSite || streetChanged) ? streetBearing.current ?? placedBearings.current.get(selected?.properties.pin) ?? -25 : street ? map.getBearing() : view3d ? -25 : 0,
      duration: reduceMotion ? 0 : newSite || streetChanged ? 650 : 350,
      animate: !reduceMotion,
    })
    lastStreet.current = street
    if (point) lastPin.current = selected.properties.pin
  }, [ready, selected, view3d, streetView, focusRequest])

  useEffect(() => {
    const map = readyMap()
    if (!map || !buildingFocusRequest || consumedBuildingFocus.current === buildingFocusRequest || buildingFocusRequest.sitePin !== selected?.properties.pin) return
    const row = buildingRows.find(row => row.key === buildingFocusRequest.key)
    if (!row?.center) return
    const focus = () => {
      consumedBuildingFocus.current = buildingFocusRequest
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      map.easeTo({ center: row.center, zoom: Math.max(18, map.getZoom()), duration: reduced ? 0 : 350, animate: !reduced })
    }
    // An early list click must not compete with the initial parcel camera transition.
    if (map.isMoving()) { map.once('moveend', focus); return () => map.off('moveend', focus) }
    focus()
  }, [ready, buildingFocusRequest, buildingRows, selected?.properties.pin])

  return <><div ref={container} className="planner-map" data-building-style={buildingStyle} data-type-highlight={highlightOn ? hiddenKey || 'all' : 'off'} data-lvt-ratio={lvtRates ? lvtRates.ratio : 'off'} data-detail-level={!detail ? 'overview' : viewport.zoom < 16 ? 'footprints' : '3d'} data-visible-neighborhoods={visibleKey} data-visible-parcels={visibleParcels.length} data-visible-buildings={visibleBuildings.length} data-visible-roads={visibleRoads.length} data-three-buildings={threeStatus} data-three-active={threeActive} data-three-meshed={threeActive ? meshedIds.length : 0} aria-label="3D parcel planning map. Select a parcel on the map or use the address search." />{error && <div className="planner-map-error" role="alert">{error}</div>}</>
}
