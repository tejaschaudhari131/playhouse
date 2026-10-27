"use client"

import Select from './Select.js'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { BUILDINGS, BUILDING_IDS } from '../lib/buildings.js'
import { buildingHeightCoverage } from '../lib/buildingHeights.js'
import { geometryBounds, placementAt, geometriesOverlap, rectangleAt, fitMassing } from '../lib/plannerGeometry.js'
import { hasMapDetail, mergeNeighborhoods, spatialIndex, containsBounds } from '../lib/studioData.js'
import NeighborhoodPicker from './NeighborhoodPicker.js'
import { locateNeighborhood } from '../lib/neighborhoodLoader.js'
import useNeighborhoodData, { fetchNeighborhood } from './useNeighborhoodData.js'
import { nearestNode, validateConnection, validatePark, connectionGeometry, prepareNetwork } from '../lib/networkModel.js'
import { snapToEdge, routeBetween } from '../lib/networkRouting.js'
import InfrastructurePanel from './InfrastructurePanel.js'
import RecommendationAudit from './RecommendationAudit.js'
import StudioPriorities from './StudioPriorities.js'
import StudioSites from './StudioSites.js'
import { studioSites, FACTOR_LABELS, zoningBadge, planImpact } from '../lib/studioPresentation.js'
import HousingComparison from './HousingComparison.js'
import TitleNineChecks, { ZoningInputs } from './TitleNine.js'
import SiteZoning from './SiteZoning.js'
import { evaluateTitleNine, housingSpec } from '../lib/titleNine.js'
import StudioWorkspace from './StudioWorkspace.js'
import MapLegend from './MapLegend.js'
import EmptySitesControl from './EmptySitesControl.js'
import useEmptySites from './useEmptySites.js'
import StudioTour from './StudioTour.js'
import { TOUR_PIN, tourScenario, tourEvidence } from '../lib/studioTour.js'
import { draftPreview } from '../lib/draftPreview.js'
import { retainedBuildings, footprintRef, footprintKey, demolitionKey, demolitionSite, siteFootprints, blockingFootprints, isDemolished } from '../lib/redevelopment.js'
import BuildingInspector from './BuildingInspector.js'
import TypologyCards from './TypologyCards.js'
import RedevelopmentImpact, { TaxLedger } from './RedevelopmentImpact.js'
import { homesReplaced, netHomes, combinedHomes, recordedHomes, homesText, redevelopmentImpact, planTaxLedger, demolitionRecords } from '../lib/redevelopmentImpact.js'
import { priceBenchmarks, planAmiBand } from '../lib/proForma.js'
import incomeLimits from '../lib/hudIncomeLimits.json'
import { typologyCards, resizeDraft, rotatePlacement, draftKey, previewPaused } from '../lib/buildControls.js'
import { nearbyStops, preferredStop, round } from '../lib/plannerModel.js'
import { createPlannerEvaluator, sameEvaluationContext } from '../lib/plannerEvaluation.js'
import { EXAMPLES, PLANNER_FACTORS, MASSING_DEFAULTS, optionFor, initialStudioScenario, historyFor, scenarioReducer, scenarioExport, defaultComparisonTypes } from '../lib/plannerState.js'
import { readSavedPlan, savePlan, restorePlanContext, shouldSavePlan } from '../lib/planPersistence.js'
import { draftStatus } from '../lib/plannerStatus.js'
import { housingCostInputs, housingCostConfirmed } from '../lib/housingCosts.js'
import HudIncomeReference from './HudIncomeReference.js'
import { CostSwitch, AmiChips } from './HousingCostControls.js'
import PolicyContext from './PolicyContext.js'
import PolicyReformSimulator from './PolicyReformSimulator.js'
import { reformSummary } from '../lib/policyReform.js'
import useAddressSearch from './useAddressSearch.js'
import { isParcelSearch } from '../lib/addressSearch.js'
import { parcelHref } from '../lib/links.js'
import { fitDiagnosis, fitToLot, fitSummary } from '../lib/lotFit.js'
import { districtStandards } from '../lib/titleNineRules.js'

const PlannerMap = dynamic(() => import('./PlannerMap.js'), { ssr: false, loading: () => <div className="planner-loading">Preparing the map…</div> })
const fmt = (value, suffix = '') => typeof value === 'number' && Number.isFinite(value) ? `${round(value).toLocaleString()}${suffix}` : 'Unknown'
const cash = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

const browserPlanStorage = { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) }

function usePlanAutosave(plan, initial, sourceFor) {
  const [status, setStatus] = useState({ kind: initial.issue ? 'error' : initial.restored ? 'saved' : 'idle', message: initial.issue })
  const session = useRef({ initial: plan, latest: plan, dirty: false, blocked: !!initial.issue && !!initial.raw, raw: initial.raw, lastSaved: initial.restored ? JSON.stringify(plan) : null })
  const [retry, setRetry] = useState(0)
  session.current.latest = plan
  function persist() {
    const state = session.current
    if (!state.dirty || state.blocked) return
    const result = savePlan(browserPlanStorage, state.latest, sourceFor(state.latest))
    if (result.ok) { state.lastSaved = JSON.stringify(state.latest); state.raw = result.raw; state.dirty = false; setStatus({ kind: 'saved', message: null }) }
    else setStatus({ kind: 'error', message: result.issue })
  }
  const persistRef = useRef(persist)
  persistRef.current = persist
  useEffect(() => {
    const state = session.current
    if (!shouldSavePlan(state, plan)) {
      if (state.started) { state.dirty = false; setStatus({ kind: 'saved', message: null }) }
      return
    }
    state.dirty = true
    if (state.blocked) return
    setStatus({ kind: 'pending', message: null })
    const timer = setTimeout(() => persistRef.current(), 400)
    return () => clearTimeout(timer)
  }, [plan, retry])
  useEffect(() => {
    const flush = () => persistRef.current()
    const hidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden) }
  }, [])
  return { ...status, raw: session.current.raw, blocked: session.current.blocked,
    retry: () => { session.current.blocked = false; session.current.dirty = true; setRetry(n => n + 1) } }
}

function Icon({ name, size = 20 }) {
  const paths = {
    building: <><path d="M4 21V8l8-5 8 5v13M2 21h20M9 21v-6h6v6"/><path d="M8 9h1m6 0h1M8 12h1m6 0h1"/></>,
    bus: <><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1"/></>,
    chart: <><path d="M4 3v17h17M8 15V9m5 6V5m5 10v-4"/></>,
    network: <><path d="M4 20 9 4m6 0 5 16M12 5v3m0 4v3m0 4v2"/></>,
    layers: <><path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/></>,
    undo: <><path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    pin: <><path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.building}</svg>
}

function Numeric({ label, value, onChange, min = 0, max = 100000, step = 1, hint, nullable = false }) {
  const [draft, setDraft] = useState(value ?? '')
  const dirty = useRef(false)
  useEffect(() => { setDraft(value ?? ''); dirty.current = false }, [value])
  function commit() {
    if (!dirty.current) return
    dirty.current = false
    if (draft === '' && nullable) { onChange(null); return }
    const n = Number(draft)
    if (draft !== '' && Number.isFinite(n)) { const next = Math.min(max, Math.max(min, n)); setDraft(next); onChange(next) }
    else setDraft(value ?? '')
  }
  return <label className="planner-field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={draft} onChange={e => { dirty.current = true; setDraft(e.target.value) }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} placeholder={nullable ? 'Unknown' : undefined} />{hint && <small>{hint}</small>}</label>
}

function useEvaluation(input, network) {
  const worker = useRef(null), latest = useRef(0), current = useRef(input)
  const networkRef = useRef(network), fallback = useRef(null), editRequests = useRef(new Map()), editId = useRef(0)
  const sent = useRef(null), submitted = useRef(null), fallbackEvaluator = useRef(null)
  networkRef.current = network
  function compute(input) {
    if (fallback.current?.source !== networkRef.current) fallback.current = { source: networkRef.current, prepared: networkRef.current ? prepareNetwork(networkRef.current) : null }
    fallbackEvaluator.current ||= createPlannerEvaluator()
    return fallbackEvaluator.current.evaluate({ ...input, networkContext: fallback.current.prepared })
  }
  const [state, setState] = useState({ result: null, pending: true, error: null })
  current.current = input
  useEffect(() => {
    let w
    try {
      w = new Worker(new URL('../workers/planner.worker.js', import.meta.url), { type: 'module' })
      worker.current = w
      sent.current = null
      w.onmessage = ({ data }) => {
        if (data.type === 'edit') { const pending = editRequests.current.get(data.id); editRequests.current.delete(data.id); if (data.error) pending?.reject(new Error(data.error)); else pending?.resolve(data.result); return }
        const request = submitted.current
        if (data.revision !== latest.current || request?.revision !== data.revision || request.input !== current.current || request.network !== networkRef.current) return
        setState({ result: data.result || null, pending: false, error: data.error || null, pin: data.pin, input: request.input, network: request.network })
      }
      w.onerror = () => {
        w.terminate(); worker.current = null
        for (const pending of editRequests.current.values()) pending.reject(new Error('Routing worker stopped; try again.'))
        editRequests.current.clear()
        try { setState({ result: compute(current.current), pending: false, error: null, pin: current.current.feature.properties.pin, input: current.current, network: networkRef.current }) }
        catch (error) { setState({ result: null, pending: false, error: error.message, pin: current.current.feature.properties.pin, input: current.current, network: networkRef.current }) }
      }
    } catch { worker.current = null }
    return () => { w?.terminate(); worker.current = null; for (const pending of editRequests.current.values()) pending.reject(new Error('Routing cancelled')); editRequests.current.clear() }
  }, [])
  useEffect(() => { worker.current?.postMessage({ type: 'network', network }) }, [network])
  useEffect(() => {
    const revision = ++latest.current
    setState(old => ({ ...old, pending: true, error: null }))
    const timer = setTimeout(() => {
      if (worker.current) {
        const { scenario, ...context } = input
        submitted.current = { revision, input, network }
        worker.current.postMessage({ revision, scenario, ...(!sameEvaluationContext(sent.current, context) ? { context } : {}) })
        sent.current = context
      }
      else {
        try { setState({ result: compute(input), pending: false, error: null, pin: input.feature.properties.pin, input, network }) }
        catch (error) { setState({ result: null, pending: false, error: error.message, pin: input.feature.properties.pin, input, network }) }
      }
    }, 60)
    return () => clearTimeout(timer)
  }, [input, network])
  function networkEdit(action, ...args) {
    if (worker.current) return new Promise((resolve, reject) => { const id = ++editId.current; editRequests.current.set(id, { resolve, reject }); worker.current.postMessage({ type: 'edit', id, action, args }) })
    if (fallback.current?.source !== networkRef.current) fallback.current = { source: networkRef.current, prepared: networkRef.current ? prepareNetwork(networkRef.current) : null }
    return Promise.resolve(action === 'snap' ? snapToEdge(networkRef.current, ...args) : routeBetween(fallback.current.prepared, ...args))
  }
  return { ...state, pending: state.pending || state.input !== input || state.network !== network, networkEdit }
}

export default function Planner() {
  const [data, setData] = useState(null), [error, setError] = useState(null), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const names = ['studio/manifest.json', 'neighborhoods.geojson', 'stops.geojson', 'zoning.json', 'summary.json', 'existing-buildings.sources.json']
    setError(null)
    Promise.all(names.map(async name => {
      const response = await fetch(`/data/${name}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`${name}: ${response.status}`)
      return response.json()
    })).then(async ([manifest, neighborhoods, stops, zoning, summary, buildingManifest]) => {
      const parameters = new URLSearchParams(window.location.search), hasLink = parameters.has('pin')
      const linked = parameters.get('pin')?.trim().toUpperCase()
      const record = readSavedPlan(browserPlanStorage), messages = []
      let restored = null
      if (record.saved) {
        try { restored = await restorePlanContext(record.saved, manifest, { locate: locateNeighborhood, load: fetchNeighborhood, signal: controller.signal }) }
        catch (error) { if (error.name === 'AbortError') throw error; record.issue = error.message }
      }
      const linkedDescriptor = hasLink ? await locateNeighborhood(manifest, linked, controller.signal) : null
      if (hasLink && !linkedDescriptor) messages.push('That parcel ID is not in this Pittsburgh release. Opened your saved plan or the Hazelwood example instead.')
      const descriptor = linkedDescriptor || restored?.descriptor || await locateNeighborhood(manifest, EXAMPLES[0].pin, controller.signal)
      const initialPin = linkedDescriptor ? linked : restored ? record.saved.scenario.pin : EXAMPLES[0].pin
      const chunks = restored?.chunks || new Map()
      if (!chunks.has(descriptor.id)) chunks.set(descriptor.id, await fetchNeighborhood(descriptor, controller.signal))
      const chunk = chunks.get(descriptor.id)
      if (!chunk.parcels.features.some(f => f.properties.pin === initialPin)) throw new Error('The selected parcel is missing from its neighborhood data.')
      const differentLink = restored && initialPin !== record.saved.scenario.pin
      if (differentLink) messages.push('Opened the linked parcel as a new plan. Undo returns to your saved plan; it stays saved until you edit this one.')
      if (restored && record.saved.sources.dataVersion !== summary.pulled_at) messages.push('Your saved inputs were restored and recalculated with the current public data.')
      if (!controller.signal.aborted) setData({ manifest, neighborhoods, stops, zoning, summary, buildingManifest, initialPin,
        initialChunk: { id: descriptor.id, data: chunk, chunks: [...chunks] }, savedScenario: restored ? record.saved.scenario : null,
        differentLink, autoTour: !hasLink && !record.raw && !record.issue,
        startupNotice: messages.join(' '), storage: { raw: record.raw, issue: record.issue, restored: !!restored && !differentLink } })
    })
      .catch(error => { if (error.name !== 'AbortError') setError(error.message) })
    return () => controller.abort()
  }, [attempt])
  if (!data) return <main className="planner-loading"><div className="planner-brandmark"><Icon name="building" size={30}/></div><h1>Playhouse</h1><p>{error ? `The neighborhood data could not load: ${error}` : 'Opening the Pittsburgh planning studio…'}</p>{error ? <button onClick={() => setAttempt(n => n + 1)}>Try again</button> : <span className="planner-loading-bar"/>}<small>90 Pittsburgh neighborhoods · local data on demand</small></main>
  return <Studio data={data}/>
}

function Studio({ data }) {
  const { manifest, neighborhoods, stops, zoning, summary, buildingManifest, initialChunk, initialPin } = data
  const knownPins = useRef(null)
  if (!knownPins.current) knownPins.current = new Map((initialChunk.chunks || [[initialChunk.id, initialChunk.data]]).flatMap(([id, chunk]) => chunk.parcels.features.map(f => [f.properties.pin, { id, properties: { pin:f.properties.pin, address:f.properties.address, neighborhood:f.properties.neighborhood, area:f.properties.area } }])))
  const catalogue = knownPins.current
  const [viewport, setViewport] = useState(null), [pendingPin, setPendingPin] = useState(null), [pendingHistory, setPendingHistory] = useState(null)
  const [requestViewport, setRequestViewport] = useState(null)
  const onViewport = useCallback((next, settled) => {
    setViewport(next)
    if (settled) setRequestViewport(next)
  }, [])
  const [showExisting, setShowExisting] = useState(true)
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [demolitionEffect, setDemolitionEffect] = useState(null)
  const [constructionEffect, setConstructionEffect] = useState(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const [highlightEmpty, setHighlightEmpty] = useState(false)
  const [networkData, setNetworkData] = useState(null), [networkError, setNetworkError] = useState(null), [networkAttempt, setNetworkAttempt] = useState(0)
  const [history, dispatch] = useReducer(scenarioReducer, null, () => {
    if (data.savedScenario && !data.differentLink) return historyFor(data.savedScenario)
    const feature = initialChunk.data.parcels.features.find(f => f.properties.pin === initialPin)
    const fresh = historyFor({ ...initialStudioScenario(initialPin, feature.properties, String(preferredStop(nearbyStops(feature, stops))?.stop_id || '')), accessMode: 'network' })
    return data.savedScenario ? { ...fresh, past: [data.savedScenario] } : fresh
  })
  const scenario = history.present
  const proposedHomeCount = scenario.buildings.reduce((n, b) => n + housingSpec(b.option).units, 0)
  const [tourStep, setTourStep] = useState(null), [tourApplied, setTourApplied] = useState(null)
  const tourReturn = useRef(null)
  const personalPlan = tourStep && tourReturn.current ? tourReturn.current.history.present : scenario
  const autosave = usePlanAutosave(personalPlan, data.storage, plan => ({ dataVersion: summary.pulled_at, networkFile: manifest.neighborhoods.find(n => n.id === catalogue.get(plan.pin)?.id)?.networkFile || '' }))
  const networkDescriptor = manifest.neighborhoods.find(n => n.id === catalogue.get(scenario.pin).id)
  const networkFile = networkDescriptor.networkFile
  const network = networkData?.file === networkFile ? networkData.network : null
  useEffect(() => {
    const controller = new AbortController(); setNetworkError(null)
    Promise.all([`studio/${networkFile}`, 'walking-network.sources.json'].map(async name => {
      const response = await fetch(`/data/${name}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`Network data: ${response.status}`)
      return response.json()
    })).then(([network, manifest]) => { if (!controller.signal.aborted) setNetworkData({ file: networkFile, network, manifest }) }).catch(error => { if (error.name !== 'AbortError') setNetworkError(error.message) })
    return () => controller.abort()
  }, [networkFile, networkAttempt])
  useEffect(() => {
    if (tourStep) return
    const url = new URL(window.location.href)
    url.searchParams.set('pin', scenario.pin)
    window.history.replaceState(null, '', url)
  }, [scenario.pin, tourStep])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [tool, setActiveTool] = useState('housing'), [proposed, setProposed] = useState(true), [view3d, setView3d] = useState(true)
  const scenarioPins = plan => [plan.pin, ...(plan.buildings || []).map(b => b.pin), ...(plan.demolitions || []).map(demolitionSite)]
  const scenarioNeighborhoods = plan => [...new Set([...scenarioPins(plan).map(pin => catalogue.get(pin).id), ...[...(plan.connections || []), ...(plan.parks || [])].flatMap(edit => edit.neighborhoodIds || [])])].sort()
  const requiredIds = scenarioNeighborhoods(scenario)
  const historyTarget = pendingHistory === 'undo' ? history.past.at(-1) : pendingHistory === 'redo' ? history.future[0] : null
  const historyIds = historyTarget ? scenarioNeighborhoods(historyTarget) : []
  // Retain the original plan's parcels while the temporary Hazelwood example runs.
  const savedScenario = tourReturn.current?.history.present
  const tourIds = tourStep ? ['hazelwood', ...scenarioNeighborhoods(savedScenario)] : []
  const extraIds = [...historyIds, ...tourIds, ...(pendingPin ? [catalogue.get(pendingPin).id] : []), ...(tool === 'sites' ? manifest.neighborhoods.filter(n => n.area === catalogue.get(scenario.pin).properties.area).map(n => n.id) : [])]
  const loaded = useNeighborhoodData(manifest, initialChunk, requiredIds, viewport, extraIds, networkDescriptor.id, neighborhoods, requestViewport)
  const emptySites = useEmptySites(highlightEmpty, loaded.chunks, loaded.visibleIds, viewport)
  const emptyCandidates = useMemo(() => {
    const placed = new Set((scenario.buildings || []).map(b => b.pin))
    return new Map(emptySites.matches.filter(site => !placed.has(site.pin)).map(site => [site.pin, site.typeId]))
  }, [emptySites.matches, scenario.buildings])
  const emptyPins = useMemo(() => [...emptyCandidates.keys()], [emptyCandidates])
  const { parcels } = loaded
  useMemo(() => {
    for (const [id, chunk] of loaded.chunks) for (const f of chunk.parcels.features) {
      catalogue.set(f.properties.pin, { id, properties: { pin:f.properties.pin, address:f.properties.address, neighborhood:f.properties.neighborhood, area:f.properties.area } })
    }
  }, [loaded.chunks, catalogue])
  const byPin = useMemo(() => new Map(parcels.features.map(f => [f.properties.pin, f])), [parcels])
  const selected = byPin.get(scenario.pin), props = selected.properties
  // Panning may load map context, but cannot change the plan's evidence or rerun its scores.
  const evidenceKey = requiredIds.map(id => `${id}:${loaded.chunks.has(id)}`).join('|')
  const context = useMemo(() => requiredIds.every(id => loaded.chunks.has(id)) ? { buildings: mergeNeighborhoods(requiredIds.map(id => loaded.chunks.get(id)), 'buildings'), manifest: buildingManifest } : null, [evidenceKey, buildingManifest])
  const planByPin = useMemo(() => new Map(mergeNeighborhoods(requiredIds.map(id => loaded.chunks.get(id)), 'parcels').features.map(f => [f.properties.pin, f])), [evidenceKey])
  const makeScenario = useCallback(pin => {
    const feature = byPin.get(pin)
    return { ...initialStudioScenario(pin, feature.properties, String(preferredStop(nearbyStops(feature, stops))?.stop_id || '')), accessMode: 'network' }
  }, [byPin, stops])
  useEffect(() => { if (pendingPin && byPin.has(pendingPin)) { select(pendingPin, selectedBuilding?.pin === pendingPin ? selectedBuilding : null); setPendingPin(null) } }, [pendingPin, byPin])
  useEffect(() => {
    if (pendingHistory && historyTarget && historyIds.every(id => loaded.chunks.has(id))) {
      dispatch({ type: pendingHistory }); setPendingHistory(null)
    }
  }, [pendingHistory, historyTarget, loaded.chunks])
  const returningCamera = useRef(null)
  function setTool(value) { setActiveTool(value); setSidebarOpen(true); setPlacing(false); if (value !== 'housing') setSelectedBuilding(null) }
  useEffect(() => {
    if (returningCamera.current !== null) { setView3d(returningCamera.current); returningCamera.current = null; return }
    if (tool === 'housing') setView3d(true)
    else if (tool === 'network' || tool === 'service') setView3d(false)
  }, [tool])
  const [placing, setPlacing] = useState(false)
  const [hoverPoint, setHoverPoint] = useState(null)
  const [justAdded, setJustAdded] = useState(null)
  const [reformPreset, setReformPreset] = useState('current')
  useEffect(() => { if (!placing) setHoverPoint(null) }, [placing])
  const [drawing, setDrawing] = useState(null), [draftNode, setDraftNode] = useState(null)
  const drawingRevision = useRef(0), drawingBusy = useRef(false)
  useEffect(() => { setPlacing(false) }, [tool, scenario.pin, scenario.draft.typeId])
  useEffect(() => { drawingRevision.current++; drawingBusy.current = false; setDrawing(null); setDraftNode(null) }, [tool, scenario.pin, networkFile])
  useEffect(() => { if (!placing) setHoverPoint(null) }, [scenario.pin, placing])
  const [query, setQuery] = useState(''), [notice, setNotification] = useState(data.startupNotice ? { text: data.startupNotice, tone: 'info' } : null), [inspectorTab, setInspectorTab] = useState('edit')
  function setNotice(text, tone = 'error') { setNotification(text ? { text, tone } : null) }
  useEffect(() => {
    if (notice?.tone !== 'transient') return
    const timer = setTimeout(() => setNotification(null), 5500)
    return () => clearTimeout(timer)
  }, [notice])
  const inspectorScroll = useRef(null), scrollPositions = useRef(new Map())
  const scrollKey = `${scenario.pin}:${tool}:${inspectorTab}:${selectedBuilding?.id || ''}`
  useLayoutEffect(() => {
    const node = inspectorScroll.current
    if (!node) return
    node.scrollTop = scrollPositions.current.get(scrollKey) || 0
    return () => { scrollPositions.current.set(scrollKey, node.scrollTop) }
  }, [scrollKey])
  function focusInspector() {
    setSidebarOpen(true)
    requestAnimationFrame(() => document.getElementById('planner-inspector')?.focus({ preventScroll: true }))
  }
  const [tourRequest, setTourRequest] = useState(0)
  const tourButton = useRef(null), tourView = useRef(null)
  tourView.current = { tool, inspectorTab, sidebarOpen, view3d, proposed, history, query, selectedBuilding }
  const showTourStep = useCallback(step => {
    tourReturn.current ||= { ...tourView.current }
    selectionRevision.current++; setPendingPin(null); setPendingHistory(null)
    setSelectedBuilding(null)
    setTourStep(step)
  }, [])
  useEffect(() => {
    if (!tourStep || tourApplied === tourStep.id || !byPin.has(TOUR_PIN)) return
    const feature = byPin.get(TOUR_PIN), stop = preferredStop(nearbyStops(feature, stops))
    dispatch({ type: 'restoreHistory', history: historyFor(tourScenario(tourStep.id, feature, stop)) })
    setTourApplied(tourStep.id)
    setSidebarOpen(true); setActiveTool(tourStep.tool); setInspectorTab(tourStep.tab); setView3d(tourStep.tool !== 'service'); setProposed(true); setQuery('')
  }, [tourStep, tourApplied, byPin, stops])
  const finishTour = useCallback(() => {
    const previous = tourReturn.current
    if (!previous) return
    if (tourView.current.tool !== previous.tool) returningCamera.current = previous.view3d
    dispatch({ type: 'restoreHistory', history: previous.history })
    setTourStep(null); setTourApplied(null)
    setActiveTool(previous.tool); setInspectorTab(previous.inspectorTab); setSidebarOpen(previous.sidebarOpen); setView3d(previous.view3d); setProposed(previous.proposed); setQuery(previous.query)
    setSelectedBuilding(previous.selectedBuilding)
    tourReturn.current = null
  }, [])
  const [siteFilters, setSiteFilters] = useState({})
  const sitesLoading = manifest.neighborhoods.some(n => n.area === props.area && !loaded.chunks.has(n.id))
  const sites = useMemo(() => tool === 'sites' ? studioSites(parcels, zoning, props.area, highlightEmpty ? siteFilters : { ...siteFilters, emptyOnly: false }, emptyCandidates) : [], [tool, parcels, zoning, props.area, siteFilters, highlightEmpty, emptyCandidates])
  const discoveryPins = useMemo(() => tool === 'sites' ? sites.map(f => f.properties.pin) : [], [tool, sites])
  const nearby = useMemo(() => nearbyStops(selected, stops), [selected, stops])
  const stop = nearby.find(s => String(s.stop_id) === scenario.stopId) || null
  const buildingIndex = useMemo(() => context ? spatialIndex(context.buildings.features) : null, [context])
  const loadedBuildingIndex = useMemo(() => tool === 'network' ? spatialIndex(mergeNeighborhoods([...loaded.chunks.values()], 'buildings').features) : null, [loaded.chunks, tool])
  const nearbyBuildings = useMemo(() => {
    if (!buildingIndex) return null
    const bounds = geometryBounds(selected.geometry)
    return buildingIndex.query(bounds)
  }, [buildingIndex, selected])
  const retainedNearbyBuildings = useMemo(() => retainedBuildings(nearbyBuildings, scenario.demolitions), [nearbyBuildings, scenario.demolitions])
  const siteBuildings = useMemo(() => siteFootprints(nearbyBuildings, selected), [nearbyBuildings, selected])
  const inspectedExisting = selectedBuilding?.kind === 'existing' ? siteBuildings.find(b => footprintKey(b) === demolitionKey(selectedBuilding)) || null : null
  const parcelProps = useCallback(pin => (planByPin.get(pin) || byPin.get(pin))?.properties || null, [planByPin, byPin])
  const demolishedByKey = useMemo(() => {
    const keys = new Set((scenario.demolitions || []).map(demolitionKey)), found = new Map()
    for (const feature of context?.buildings.features || []) { const key = footprintKey(feature); if (keys.has(key)) found.set(key, feature) }
    return found
  }, [context, scenario.demolitions])
  const planNet = useMemo(() => netHomes(proposedHomeCount, homesReplaced(scenario.demolitions || [], { parcel: parcelProps, footprint: entry => demolishedByKey.get(demolitionKey(entry)) })), [proposedHomeCount, scenario.demolitions, parcelProps, demolishedByKey])
  const siteDemolished = useMemo(() => siteBuildings.filter(f => isDemolished(f, scenario.demolitions)), [siteBuildings, scenario.demolitions])
  const benchmarksFor = useMemo(() => {
    const all = parcels.features.map(f => f.properties), cache = new Map()
    return neighborhood => {
      if (!cache.has(neighborhood)) cache.set(neighborhood, priceBenchmarks(all, { neighborhood }))
      return cache.get(neighborhood)
    }
  }, [parcels])
  function siteImpact(features) {
    const refs = features.map(f => footprintRef(f, scenario.pin)).filter(Boolean)
    const existingHomes = combinedHomes(homesReplaced(refs, { parcel: parcelProps, footprint: ref => features.find(f => footprintKey(f) === demolitionKey(ref)) }))
    return redevelopmentImpact({ parcel: props, demolished: features, draft: scenario.draft, targetIncome: scenario.targetIncome, householdSize: scenario.householdSize, limits: incomeLimits,
      existingHomes, parcelFor: parcelProps, benchmarks: benchmarksFor(props.neighborhood ?? null) })
  }
  const planTax = useMemo(() => scenario.buildings.length || scenario.demolitions?.length ? planTaxLedger({ buildings: scenario.buildings,
    demolished: demolitionRecords(scenario.demolitions, entry => demolishedByKey.get(demolitionKey(entry))), parcelFor: parcelProps, benchmarksFor,
    band: planAmiBand(scenario.buildings, incomeLimits) }) : null, [scenario.buildings, scenario.demolitions, demolishedByKey, parcelProps, benchmarksFor])
  const inspectedPlaced = selectedBuilding?.kind === 'placed' ? scenario.buildings.find(b => b.id === selectedBuilding.id && b.pin === scenario.pin) : null
  const areaSites = useMemo(() => (scenario.buildings || []).map(building => {
    const feature = planByPin.get(building.pin), bounds = geometryBounds(feature.geometry)
    const areaStop = stops.features.find(s => String(s.properties.stop_id) === building.stopId)
    return { ...building, feature, existingBuildings: buildingIndex ? buildingIndex.query(bounds) : null,
      stop: areaStop ? { ...areaStop.properties, coordinates: areaStop.geometry.coordinates, distance: nearbyStops(feature, stops).find(s => String(s.stop_id) === building.stopId)?.distance ?? 0 } : null }
  }), [scenario.buildings, planByPin, buildingIndex, stops])
  const input = useMemo(() => ({ feature: selected, zoning, scenario, stop, existingBuildings: nearbyBuildings, infrastructureBuildings: scenario.connections.length || scenario.parks.length ? context?.buildings.features ?? null : undefined, areaSites }), [selected, zoning, scenario, stop, nearbyBuildings, context, areaSites])
  const evaluation = useEvaluation(input, network)
  const result = evaluation.pin === scenario.pin ? evaluation.result : null
  const renderedBuildings = useMemo(() => {
    const ids = new Set(scenario.buildings.map(b => b.id))
    return (result?.committed?.[proposed ? 'proposal' : 'baseline'] || []).filter(b => ids.has(b.id))
  }, [result?.committed, proposed, scenario.buildings])
  const options = result ? (proposed ? result.proposal : result.baseline) : null
  const option = scenario.draft, evaluated = options?.[option.typeId]
  const draftState = draftStatus({ evaluated, proposal: result?.proposal?.[option.typeId], weights: scenario.weights, pending: evaluation.pending, error: evaluation.error, infrastructureErrors: result?.infrastructureErrors, hasPlacedBuildings: scenario.buildings.length > 0 })
  const paused = previewPaused(justAdded, scenario) && !placing
  const costsIncluded = housingCostConfirmed(scenario, option)
  const placedCostsExcluded = scenario.buildings.filter(b => !housingCostConfirmed(b, b.option)).length
  function setHousingCosts(include) {
    dispatch({ type: 'housingCosts', include })
    setNotice(include ? 'Housing costs now count in scores as scenario assumptions, for the draft and every placed building. Edits keep them included.' : 'Housing costs excluded from every score. Turn the switch back on to include them.', 'transient')
  }
  const costSwitch = compact => <CostSwitch compact={compact} included={costsIncluded} rent={option.rent} utilities={option.utilities} targetIncome={scenario.targetIncome} placedExcluded={placedCostsExcluded} onChange={setHousingCosts}/>
  const cards = useMemo(() => typologyCards({ draft: option, options, code: props.zoning_code, zoning }), [option, options, props.zoning_code, zoning])
  const zoningInputs = scenario.zoningInputsByPin?.[scenario.pin] || {}
  function setZoningInput(key, value) { set('zoningInputsByPin', { ...scenario.zoningInputsByPin, [scenario.pin]: { ...zoningInputs, [key]: value } }) }
  const addressSearch = useAddressSearch(manifest, query)
  const matches = addressSearch.matches
  const selectionRevision = useRef(0)

  async function select(pin, building = null) {
    const revision = ++selectionRevision.current
    setSelectedBuilding(building)
    setPlacing(false); setJustAdded(null)
    setPendingPin(null)
    if (!catalogue.has(pin)) {
      try {
        const descriptor = await locateNeighborhood(manifest, pin)
        if (revision !== selectionRevision.current) return
        if (!descriptor) { setNotice('Parcel is not in this city release.'); return }
        catalogue.set(pin, { id: descriptor.id, properties: { pin, neighborhood: descriptor.name, area: descriptor.area } })
      } catch (error) { if (revision === selectionRevision.current) setNotice(`Neighborhood could not load: ${error.message}`); return }
    }
    setPendingHistory(null)
    if (!byPin.has(pin)) { setPendingPin(pin); setNotice('Loading the selected neighborhood…', 'info'); return }
    setPendingPin(null)
    if (pin === scenario.pin) { if (!building && emptyCandidates.has(pin)) changeType(emptyCandidates.get(pin)); setTool('housing'); setInspectorTab('edit'); setQuery(''); return }
    const sameArea = byPin.get(pin).properties.area === props.area
    const next = makeScenario(pin)
    if (!building && emptyCandidates.has(pin)) Object.assign(next, { draft: optionFor(emptyCandidates.get(pin), next.draft.rent), comparisonTypes: defaultComparisonTypes(emptyCandidates.get(pin)) })
    if (sameArea) Object.assign(next, { zoningInputsByPin: scenario.zoningInputsByPin, projectInputs: scenario.projectInputs, connections: scenario.connections, routes: scenario.routes, parks: scenario.parks, parkAccessShare: scenario.parkAccessShare, weights: scenario.weights, comparisonTypes: scenario.comparisonTypes, buildings: scenario.buildings || [], demolitions: scenario.demolitions || [], additionalDepartures: scenario.additionalDepartures, serviceHours: scenario.serviceHours, serviceStopId: scenario.serviceStopId || scenario.stopId, capacityStopId: scenario.capacityStopId || scenario.stopId, spareBoardings: scenario.spareBoardings, capacityMode: scenario.capacityMode, baselinePlacesPerDeparture: scenario.baselinePlacesPerDeparture, availablePlacesPerDeparture: scenario.availablePlacesPerDeparture, boardingsPerHome: scenario.boardingsPerHome })
    if (sameArea && typeof scenario.affordabilityAuto === 'boolean') next.affordabilityAuto = scenario.affordabilityAuto
    if (sameArea && nearbyStops(byPin.get(pin), stops).some(s => String(s.stop_id) === next.serviceStopId)) next.stopId = next.serviceStopId
    dispatch({ type: 'reset', scenario: next }); setQuery(''); setTool('housing'); setInspectorTab('edit')
    setNotice(sameArea ? 'Site selected. Your plan is retained.' : 'New area, new plan. Undo returns to your previous plan.', 'transient')
  }
  function selectStop(id) {
    if (nearby.some(s => String(s.stop_id) === id)) { dispatch({ type: 'set', key: 'stopId', value: id }); setNotice('Selected stop updated. The same stop is used for baseline and proposal.', 'transient') }
    else setNotice('Choose a scheduled stop within 1,200 m of this parcel.')
  }
  function restoreHistory(direction) { setSelectedBuilding(null); setPendingPin(null); setPendingHistory(direction) }
  function inspectOnSite(feature) {
    setSelectedBuilding({ ...footprintRef(feature, scenario.pin), kind: 'existing' }); setPlacing(false); setTool('housing'); setInspectorTab('edit')
  }
  function selectBuilding(building) {
    if (building.kind === 'existing') {
      const key = demolitionKey(building), onSite = siteBuildings.find(b => footprintKey(b) === key)
      // Outlines crossing from a neighbor stay on this parcel only when they block the draft or have no parcel of their own.
      if (onSite && (onSite.properties.pin === scenario.pin || building.unmatched || blockingBuildings.includes(onSite))) { inspectOnSite(onSite); return }
      if (building.unmatched) { setNotice('This outline has no matched parcel record. Select the parcel it sits on, then demolish it from that parcel’s building list.'); return }
    }
    select(building.pin, building); setTool('housing'); setInspectorTab('edit')
  }
  function inspectDemolition(entry) {
    const site = demolitionSite(entry)
    if (site === scenario.pin) { setSelectedBuilding({ ...entry, kind: 'existing' }); setTool('housing'); setInspectorTab('edit') }
    else select(site, { ...entry, kind: 'existing' })
  }
  /** mode: 'replace' re-fits the draft on the cleared parcel, 'clear' keeps the draft where it is, 'only' just removes. */
  function demolishFootprints(features, mode = 'clear') {
    if (!context || evaluation.pending) return
    const items = features.filter(feature => !isDemolished(feature, scenario.demolitions)).map(feature => ({ building: footprintRef(feature, scenario.pin), feature })).filter(item => item.building)
    if (!items.length) { setNotice('These outlines have no source ID, so they cannot be removed in a scenario. Move or resize the draft instead.'); return }
    if ((scenario.demolitions || []).length + items.length > 100) { setNotice('This plan supports 100 simulated demolitions. Restore one to remove another.'); return }
    setDemolitionEffect({ id: crypto.randomUUID(), items })
    dispatch({ type: 'demolishBuildings', buildings: items.map(item => item.building), resetDraft: mode === 'replace' })
    setSelectedBuilding(null); setTool('housing'); setInspectorTab('edit')
    if (mode !== 'clear') setPlacing(false)
    const count = items.length === 1 ? 'Building' : `${items.length} buildings`, back = `Undo or Restore brings ${items.length === 1 ? 'it' : 'them'} back.`
    setNotice({
      replace: `${count} removed in this scenario. The draft is re-fitted on the cleared parcel; zoning and fit checks still apply. ${back}`,
      clear: `${count} removed in this scenario so the draft can go here. Zoning and fit checks still apply. ${back}`,
      only: `${count} demolished in this scenario. Restore from Your plan or use Undo.`,
    }[mode], 'transient')
  }
  function restoreExisting(building) {
    dispatch({ type: 'restoreBuilding', building }); setSelectedBuilding(null)
    setNotice('Original building restored. Any overlapping proposal will need review.', 'transient')
  }
  function editPlaced(replace = false) {
    if (!inspectedPlaced) return
    const building = inspectedPlaced
    dispatch({ type: 'patch', value: { buildings: scenario.buildings.filter(b => b.id !== building.id), ...(replace ? { draft: { ...building.option }, targetIncome: building.targetIncome, affordabilityConfirmation: building.affordabilityConfirmation || null, householdSize: building.householdSize || 1, stopId: building.stopId } : {}) } })
    setSelectedBuilding(null); setPlacing(false); setTool('housing'); setInspectorTab('edit')
    setNotice(replace ? 'Planned building moved back to the draft. Change its type or size, then add the replacement.' : 'Planned building removed. Undo restores it.', 'transient')
  }
  function changeType(typeId) { setSelectedBuilding(null); dispatch({ type: 'draft', value: { typeId, ...MASSING_DEFAULTS[typeId], height: BUILDINGS[typeId].heightM, floors: BUILDINGS[typeId].floors, residentialForm: 'duplex', placement: null } }) }
  function previewTemplate(template) {
    if (evaluation.pending) return
    dispatch({ type: 'draft', value: template }); setTool('housing'); setInspectorTab('edit'); setPlacing(false)
    focusInspector()
    setNotice(`${BUILDINGS[template.typeId].label} selected as the current draft. Undo restores the previous draft.`, 'transient')
  }
  function set(key, value) {
    dispatch({ type: 'patch', value: { [key]: value, ...(key === 'additionalDepartures' ? { serviceStopId: scenario.stopId } : {}), ...(key === 'spareBoardings' ? { capacityStopId: scenario.stopId } : {}) } })
  }
  function setOption(key, value) { dispatch({ type: 'draft', value: { [key]: value } }) }
  const placement = option.placement || evaluated?.massing.placement || { east: 0, north: 0, bearing: 0 }
  function moveProposal(changes) { setOption('placement', { ...placement, ...changes }) }
  const canAdjust = !evaluation.pending && !!evaluated
  function rotate(degrees) { if (canAdjust) setOption('placement', rotatePlacement(placement, degrees)) }
  function resize(key, delta) { const patch = resizeDraft(option, key, delta); if (patch) dispatch({ type: 'draft', value: patch }) }
  const rotateShortcut = useRef(rotate)
  rotateShortcut.current = rotate
  const proposalObstacles = useMemo(() => retainedNearbyBuildings === null ? null : [...retainedNearbyBuildings, ...(result?.committed?.proposal || []).filter(b => b.massing.geometry).map(b => ({ geometry: b.massing.geometry })), ...(result?.reservations || [])], [retainedNearbyBuildings, result])
  const hoverMassing = useMemo(() => hoverPoint ? fitMassing(selected.geometry, option.width, option.depth, placementAt(selected.geometry, hoverPoint, placement.bearing), proposalObstacles) : null, [hoverPoint, selected, option.width, option.depth, placement.bearing, proposalObstacles])
  function screenPlacement(massing) {
    return evaluateTitleNine({ option, feature: selected, zoning, massing, existingBuildings: retainedNearbyBuildings, siteInputs: zoningInputs, projectInputs: scenario.projectInputs,
      members: [...areaSites.map(site => ({ option: site.option, feature: site.feature, izStatus: scenario.zoningInputsByPin?.[site.feature.properties.pin]?.izStatus })), { option, feature: selected, izStatus: zoningInputs.izStatus }] })
  }
  const draftMassing = hoverMassing || result?.proposal?.[option.typeId]?.massing
  const blockingBuildings = useMemo(() => paused || evaluation.pending || !draftMassing?.geometry || !draftMassing.collisions ? [] : blockingFootprints(retainedNearbyBuildings, draftMassing.geometry), [paused, evaluation.pending, draftMassing, retainedNearbyBuildings])
  const otherCollision = !paused && !evaluation.pending && draftMassing?.collisions > 0 && !blockingBuildings.length
  const fitIssue = !paused && !evaluation.pending && evaluated && !hoverMassing ? fitDiagnosis(option, selected.geometry, evaluated.massing) : null
  const dimensionConflicts = !paused && !evaluation.pending && evaluated ? (evaluated.titleNine?.checks || []).filter(c => c.status === 'conflict' && ['coverage', 'far', 'height', 'stories', 'lot'].includes(c.id)) : []
  function fitDraftToLot() {
    if (evaluation.pending) return
    const district = districtStandards(props.zoning_code), lotM2 = Number.isFinite(props.lot_sqft) ? props.lot_sqft / 10.7639 : null
    const fit = fitToLot({ option, geometry: selected.geometry, obstacles: proposalObstacles, maxFootprintM2: district?.coverage && lotM2 ? lotM2 * district.coverage / 100 : null })
    if (!fit) { setNotice(fitSummary(null, option)); return }
    setJustAdded(null); setPlacing(false)
    dispatch({ type: 'draft', value: { width: fit.width, depth: fit.depth, placement: null } })
    setNotice(`Fitted to the lot: ${fitSummary(fit, option)} Undo restores the previous size.`, 'transient')
  }
  const previewOption = hoverMassing && evaluated ? { ...evaluated, massing: hoverMassing, titleNine: screenPlacement(hoverMassing) } : evaluated
  const buildingPreview = useMemo(() => draftPreview(previewOption, evaluation.pending), [previewOption, evaluation.pending])
  function addBuilding(massing = result?.proposal?.[option.typeId]?.massing) {
    if (!evaluation.pending && massing?.fits && massing.collisions > 0 && blockingFootprints(retainedNearbyBuildings, massing.geometry).length) { setNotice('An existing building is in the way. Use “Demolish & replace existing building” to clear it in this plan, or choose another spot.'); return }
    if (evaluation.pending || result?.infrastructureErrors?.length || !massing?.fits || massing.collisions !== 0 || screenPlacement(massing).conflict) { setNotice('Cannot add: physical fit or a supported zoning check conflicts. Check the red preview and zoning details.'); return }
    if ((scenario.buildings || []).length >= 40) { setNotice('This local plan supports 40 buildings.'); return }
    const id = crypto.randomUUID()
    setConstructionEffect({ id, pin: scenario.pin, geometry: massing.geometry, height: option.height, typeId: option.typeId })
    dispatch({ type: 'addBuilding', building: { id, pin: scenario.pin, option: { ...option, placement: massing.placement }, targetIncome: scenario.targetIncome, affordabilityConfirmation: scenario.affordabilityConfirmation || null, householdSize: scenario.householdSize || 1, stopId: scenario.stopId } })
    setJustAdded({ id, pin: scenario.pin, label: housingSpec(option).label, draft: draftKey({ ...option, placement: null }) })
    setProposed(true); setPlacing(false); setNotice('Building added to your plan. Undo is available.', 'transient')
  }
  function placeProposal(coordinates) {
    addBuilding(fitMassing(selected.geometry, option.width, option.depth, placementAt(selected.geometry, coordinates, placement.bearing), proposalObstacles))
  }
  function beginDrawing(kind) { drawingRevision.current++; drawingBusy.current = false; setPlacing(false); setDrawing(kind); setDraftNode(null); setNotice('') }
  function cancelDrawing() { drawingRevision.current++; drawingBusy.current = false; setDrawing(null); setDraftNode(null) }
  useEffect(() => {
    if (inspectorTab !== 'edit') { cancelDrawing(); setPlacing(false) }
  }, [inspectorTab])
  useEffect(() => {
    function cancelInteraction(event) {
      if (placing && (event.key === 'r' || event.key === 'R') && !event.metaKey && !event.ctrlKey && !event.altKey && !event.defaultPrevented && !event.target.closest('input, textarea, select, [role=combobox], [role=listbox]')) {
        event.preventDefault(); rotateShortcut.current(event.shiftKey ? -15 : 15); return
      }
      if (event.key !== 'Escape' || event.defaultPrevented || tourStep || event.target.closest('input, textarea, select, [role=combobox], [role=listbox], .canvas-legend')) return
      if (drawing) { cancelDrawing(); setNotice('Drawing cancelled.', 'transient') }
      else if (placing) { setPlacing(false); setNotice('Placement cancelled.', 'transient') }
      else if (selectedBuilding) setSelectedBuilding(null)
    }
    document.addEventListener('keydown', cancelInteraction)
    return () => document.removeEventListener('keydown', cancelInteraction)
  }, [drawing, placing, selectedBuilding, tourStep])
  async function drawInfrastructure(coordinates) {
    if (!network || !drawing || !context) { setNotice('Wait for network and building context to load before drawing.'); return }
    if (drawingBusy.current) return
    const revision = drawingRevision.current
    drawingBusy.current = true
    try {
    const snapped = drawing === 'park' ? nearestNode(network, coordinates, 50) : await evaluation.networkEdit('snap', coordinates)
    if (revision !== drawingRevision.current) return
    if (!snapped) { setNotice('Click within 35 m of a blue road or path (50 m for a park entrance). Bridges and tunnels cannot be new junctions.'); return }
    if (drawing !== 'park' && draftNode === null) { setDraftNode(snapped); setNotice('Start snapped to the network. Choose the destination.', 'info'); return }
    const id = crypto.randomUUID()
    if (drawing === 'route') {
      const route = await evaluation.networkEdit('route', draftNode.endpoint, snapped.endpoint)
      if (revision !== drawingRevision.current) return
      if (!route || route.meters < 2) { setNotice('No connected walking route between these points. Choose another destination; no straight-line substitute is drawn.'); return }
      if ((scenario.routes || []).length >= 12) { setNotice('This plan supports 12 saved routes. Remove one to add another.'); return }
      set('routes', [...(scenario.routes || []), { id, ...route }]); cancelDrawing()
      setNotice(`Mapped route saved: ${Math.round(route.meters)} m, ${route.minutes.toFixed(1)} min walking. Existing routes do not add infrastructure or change housing scores.`, 'transient')
      return
    }
    const operation = drawing === 'park' ? { id, name: `Proposed park ${scenario.parks.length + 1}`, coordinates, node: snapped.node, width: 20, depth: 20 } : { id, kind: drawing, from: draftNode.endpoint, to: snapped.endpoint, width: drawing === 'path' ? 3 : 12 }
    const error = drawing === 'park' ? validatePark(network, operation) : validateConnection(network, operation)
    if (error) { setNotice(error); return }
    const geometry = drawing === 'park' ? rectangleAt(coordinates, 20, 20) : connectionGeometry(network, operation)
    const bounds = geometryBounds(geometry)
    // Each chunk includes the source footprints intersecting its entire bounds.
    // A containing loaded chunk is sufficient; unrelated overlapping boxes may
    // belong to neighborhoods outside the map's permitted neighbor scope.
    const evidenceNeighborhood = manifest.neighborhoods.find(n => loaded.chunks.has(n.id) && containsBounds(n.bounds, bounds))
    if (!evidenceNeighborhood) { setNotice('Pan closer to a study neighborhood to load its building evidence before drawing here.'); return }
    operation.neighborhoodIds = [evidenceNeighborhood.id]
    if (retainedBuildings(loadedBuildingIndex.query(bounds), scenario.demolitions).some(b => geometriesOverlap(geometry, b.geometry))) { setNotice('This reservation overlaps a retained building. Choose a clear location or explicitly demolish that building in the scenario first.'); return }
    const key = drawing === 'park' ? 'parks' : 'connections'
    if (scenario[key].length >= 12) { setNotice('This local scenario supports up to 12 edits of each kind.'); return }
    set(key, [...scenario[key], operation]); setProposed(true); cancelDrawing(); setNotice('New connection joined to the mapped network. Access and reserved land are recalculated; buildability remains unverified.', 'transient')
    } catch (error) { if (revision === drawingRevision.current) setNotice(`Route could not be prepared: ${error.message}`) }
    finally { if (revision === drawingRevision.current) drawingBusy.current = false }
  }
  function download() {
    const payload = { ...scenarioExport(scenario, summary), results: result, proForma: { site: siteImpact(siteDemolished), planTax }, policyReform: options ? reformSummary(Object.values(options), reformPreset, props.zoning_code ?? null) : null, networkContext: networkData?.manifest.sha256 || null, buildingContext: context ? { sha256: context.manifest.sha256, retrievedAt: context.manifest.retrieved_at } : null, sources: { parcels: networkDescriptor.parcelFiles, dataManifest: '/data/studio/manifest.json', zoning: '/data/zoning.json', stops: '/data/stops.geojson', buildings: '/data/existing-buildings.sources.json', network: '/data/walking-network.sources.json' } }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `housing-scenario-${scenario.pin}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Scenario exported with model version, assumptions and comparison results.', 'transient')
  }
  function downloadRaw(raw, filename) {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function newPlan() {
    selectionRevision.current++; setPendingPin(null); setPendingHistory(null)
    cancelDrawing(); setSelectedBuilding(null); setConstructionEffect(null); setDemolitionEffect(null)
    dispatch({ type: 'reset', scenario: makeScenario(scenario.pin) })
    setTool('housing'); setInspectorTab('edit'); setProposed(true)
    setNotice('Started a new plan on this parcel. Undo restores your previous plan.', 'transient')
  }

  const bar = planImpact({ buildings: scenario.buildings.length, demolitions: scenario.demolitions?.length || 0, net: planNet, placedPlan: result?.placedPlan, pending: evaluation.pending })
  return <main className="studio">
    <a className="skip-link" href="#planner-inspector" onClick={event => { event.preventDefault(); focusInspector() }}>Skip to planning controls</a>
    <header className="studio-header">
      <div className="studio-brand"><span className="planner-brandmark"><Icon name="building"/></span><div><strong>Playhouse</strong><small>Test housing and infrastructure ideas in Pittsburgh</small></div></div>
      <NeighborhoodPicker neighborhoods={manifest.neighborhoods} value={catalogue.get(scenario.pin).id} onChange={id => select(manifest.neighborhoods.find(n => n.id === id).examplePin)}/>

      <div className="studio-header-actions"><a href={parcelHref('/explore', scenario.pin)} title="Open this parcel in the Explorer">Explore this lot →</a><button ref={tourButton} className="studio-tour-trigger" onClick={() => setTourRequest(n => n + 1)}>Tour</button><button className="sidebar-toggle" aria-expanded={sidebarOpen} aria-controls="planner-inspector" onClick={() => { setSidebarOpen(!sidebarOpen) }}>{sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}</button><button className="find-sites-button" onClick={() => { setTool('sites'); setInspectorTab('edit') }}>Find sites</button><button data-tour="export" className="studio-export" onClick={download} disabled={!result || evaluation.pending}>Export scenario <span aria-hidden="true">↓</span></button></div>
    </header>
    <StudioWorkspace sidebarOpen={sidebarOpen} expanded={inspectorTab === 'rankings'} map={
      <section className="studio-canvas" aria-label="Planning map">
        <PlannerMap parcelIndex={loaded.parcelIndex} buildingIndex={loaded.buildingIndex} neighborhoods={neighborhoods} stops={stops} showExisting={showExisting} selected={selected} buildingPreview={selectedBuilding || paused ? null : buildingPreview} demolitions={scenario.demolitions} demolitionEffect={demolitionEffect} constructionEffect={scenario.buildings.some(b => b.id === constructionEffect?.id) ? constructionEffect : null} selectedBuilding={selectedBuilding} onBuildingSelect={selectBuilding} stop={stop} proposed={proposed} additionalDepartures={scenario.additionalDepartures} view3d={view3d} onSelect={select} onStop={selectStop} tool={tool} placing={placing} onPlace={placeProposal} onHover={setHoverPoint} placedBuildings={renderedBuildings} network={network} visibleNeighborhoodIds={loaded.visibleIds} networkResult={evaluated?.access} reservations={result?.reservations} connections={scenario.connections} routes={scenario.routes || []} drawing={drawing} draftNode={draftNode} onDraw={drawInfrastructure} discoveryPins={discoveryPins} emptyPins={emptyPins} onViewport={onViewport} focusRequest={focusRequest}/>
        <div className="map-detail-status" role="status">{loaded.error ? <button onClick={loaded.retry}>Neighborhood data unavailable · Retry</button> : pendingPin || pendingHistory || loaded.pending ? 'Loading neighborhood…' : viewport && !hasMapDetail(viewport) ? 'Zoom in for buildings and parcels' : null}</div>
        {placing && <div className="placement-banner" role="status"><span>Click to add {housingSpec(option).label}. Green: passes placement screen · red: needs review. <kbd>R</kbd> / <kbd>Shift</kbd>+<kbd>R</kbd> rotates.</span><span><button aria-label="Rotate draft −15°" disabled={!canAdjust} onClick={() => rotate(-15)}>⟲ 15°</button><button aria-label="Rotate draft +15°" disabled={!canAdjust} onClick={() => rotate(15)}>⟳ 15°</button>{!!blockingBuildings.length && <button onClick={() => demolishFootprints(blockingBuildings)} disabled={evaluation.pending || !context}>Demolish {blockingBuildings.length === 1 ? 'building' : `${blockingBuildings.length} buildings`} under preview</button>}<button onClick={() => setPlacing(false)}>Cancel placement</button></span></div>}
        <nav data-tour="tools" className="studio-tools" aria-label="Planning tools">{[['housing', 'building', 'Build'], ['service', 'bus', 'Transit'], ['network', 'network', 'Streets']].map(([id, icon, label]) => <button key={id} className={tool === id || id === 'housing' && tool === 'compare' ? 'active' : ''} aria-pressed={tool === id || id === 'housing' && tool === 'compare'} onClick={() => { setTool(id); setInspectorTab('edit') }}><Icon name={icon}/><span>{label}</span></button>)}</nav>
        <div className="map-view-toggle"><button onClick={() => setFocusRequest(n => n + 1)} aria-label="Center selected site" title="Center selected site"><Icon name="pin" size={18}/></button><button onClick={() => setView3d(!view3d)} aria-pressed={view3d} aria-label="3D view">{view3d ? '3D' : '2D'}</button></div>
        <div className="canvas-heading"><span className="eyebrow">PITTSBURGH / {props.area?.toUpperCase()}</span></div>
        <div className="canvas-mode">{(tool === 'service' || tool === 'network' || inspectorTab === 'rankings' || scenario.additionalDepartures > 0 || scenario.connections.length > 0 || scenario.parks.length > 0) && <div className="segmented" aria-label="Infrastructure view"><button className={!proposed ? 'active' : ''} aria-pressed={!proposed} onClick={() => setProposed(false)}>Current infrastructure</button><button className={proposed ? 'active' : ''} aria-pressed={proposed} onClick={() => setProposed(true)}>With changes</button></div>}<div className="history-controls"><button aria-label="Undo scenario edit" title="Undo" disabled={!history.past.length || !!pendingHistory} onClick={() => restoreHistory('undo')}>↶</button><button aria-label="Redo scenario edit" title="Redo" disabled={!history.future.length || !!pendingHistory} onClick={() => restoreHistory('redo')}>↷</button></div></div>
        <div className="map-overlays">
          {(tool === 'housing' || tool === 'compare') && !selectedBuilding && paused && <div className="draft-dock"><div><span className="eyebrow">ADDED TO PLAN</span><strong>{justAdded.label}</strong></div><span>Preview paused so it does not cover the new building.</span><button className="dock-action next" onClick={() => setJustAdded(null)}>Preview another building</button></div>}
          {(tool === 'housing' || tool === 'compare') && !selectedBuilding && !paused && <div className="draft-dock"><div><span className="eyebrow">PREVIEW</span><strong>{housingSpec(option).label}</strong></div><div className="draft-preview-status" role="status"><i style={{ background: buildingPreview?.properties.color || '#94a3b8' }}/>{draftState.placement}</div>{!!blockingBuildings.length && <button className="dock-action" disabled={evaluation.pending || !context} onClick={() => demolishFootprints(blockingBuildings)}>Demolish & replace existing</button>}</div>}
        </div>
        <MapLegend showExisting={showExisting} onShowExisting={setShowExisting} error={loaded.error} onRetry={loaded.retry}/>
      </section>
    }>
      <aside data-tour="inspector" id="planner-inspector" className="studio-inspector" tabIndex={-1}>
        <div className="inspector-top"><div className="inspector-status"><span className="live-dot"/>{evaluation.pending ? 'Recalculating…' : 'Scenario ready'}<span>{autosave.kind === 'saved' ? 'Saved on this device' : autosave.kind === 'pending' ? 'Saving…' : autosave.kind === 'error' ? 'Not saved' : 'Local plan'}</span></div><label data-tour="site" className="site-search"><Icon name="pin" size={16}/><input aria-label="Search address or parcel ID" placeholder="Search Pittsburgh address or parcel ID…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={event => { if (event.key === 'Escape') setQuery(''); if (event.key === 'Enter') { event.preventDefault(); const pin = query.trim().toUpperCase(); if (isParcelSearch(pin)) select(pin); else if (matches.length === 1) select(matches[0].properties.pin); else setNotice('Choose an address suggestion, or enter an exact Pittsburgh parcel ID.') } }}/></label>{query.length > 1 && <div className="search-results" aria-label="Citywide address results" aria-busy={addressSearch.pending}>{matches.length ? <><p>{addressSearch.total} citywide matches{addressSearch.total > matches.length ? ' · showing six; refine the address' : ''}</p>{matches.map(f => <button key={f.properties.pin} onClick={() => select(f.properties.pin)}>{f.properties.address || f.properties.pin}<small>{f.properties.neighborhood}</small></button>)}</> : <p role="status">{addressSearch.pending ? 'Searching Pittsburgh addresses…' : addressSearch.error || (addressSearch.status === 'pin' ? 'Press Enter to open this parcel ID.' : addressSearch.status === 'short' ? 'Enter at least three letters of a street name, or an exact parcel ID.' : 'No matching address in the city index. Parcels without searchable addresses can still be opened by parcel ID.')}</p>}{addressSearch.error && <button onClick={addressSearch.retry}>Retry address search</button>}</div>}</div>
        <nav className="inspector-tabs" aria-label="Inspector sections">{[['edit', tool === 'sites' ? 'Sites' : tool === 'service' ? 'Transit' : tool === 'network' ? 'Streets' : 'Build'], ['rankings','Compare'], ['priorities','Priorities'], ['assumptions','Advanced']].map(([id,label]) => <button key={id} aria-pressed={inspectorTab === id} onClick={() => { setInspectorTab(id); setPlacing(false); if (id === 'rankings') { setSelectedBuilding(null); if (tool === 'sites' || tool === 'compare') setActiveTool('housing') } }}>{label}</button>)}</nav>
        <section className={`plan-impact-bar${bar.empty ? ' empty' : ''}`} aria-label="Your plan">
          <div className="plan-impact-head"><strong>Your plan</strong>{bar.empty ? <span>{bar.text}</span> : !(inspectorTab === 'edit' && tool === 'housing') && <button onClick={() => { setTool('housing'); setInspectorTab('edit'); setPlacing(false) }}>Review</button>}</div>
          {!bar.empty && <>
            <dl className="plan-impact-stats">
              <div><dt>Proposed homes</dt><dd>{bar.homes}</dd></div>
              <div title={planNet.note}><dt>Net homes</dt><dd>{bar.net}</dd></div>
              <div><dt>Plan score</dt><dd>{bar.score.text}</dd></div>
            </dl>
            <small className="plan-impact-note">{bar.netDetail}{bar.score.detail ? ` · ${bar.score.detail}` : ''}</small>
          </>}
        </section>
        <div className="inspector-scroll" ref={inspectorScroll} key={inspectorTab}>
          {inspectorTab === 'edit' && tool === 'sites' && <><div className="drawer-heading"><h2>Find a site</h2><p>Choose a parcel to start building.</p></div><EmptySitesControl enabled={highlightEmpty} onChange={setHighlightEmpty} count={emptyPins.length} pending={emptySites.pending} loading={loaded.pending} error={emptySites.error || loaded.error} zoomedOut={!!viewport && !hasMapDetail(viewport)}/><StudioSites filters={siteFilters} setFilters={setSiteFilters} sites={sites} selectedPin={scenario.pin} onSelect={select} loading={sitesLoading} emptyAvailable={highlightEmpty}/></>}
          {inspectorTab === 'priorities' && <StudioPriorities pending={evaluation.pending} weights={scenario.weights} included={result?.comparison?.included} onChange={weights => set('weights', weights)}/>}
          {inspectorTab !== 'priorities' && !(inspectorTab === 'edit' && tool === 'sites') && <div className="site-heading" data-tour="site-facts"><span className="eyebrow">SELECTED SITE</span><h2>{props.address || 'Unnamed parcel'}</h2><p>{props.neighborhood} · {fmt(props.lot_sqft)} sq ft</p><details className="site-details"><summary>{props.land_use || 'Unknown use'} · {props.zoning_code || 'Unknown zoning'}<span>Site facts & zoning</span></summary><SiteZoning properties={props} zoning={zoning} option={option} showHousing={inspectorTab === 'rankings' || tool === 'housing' || tool === 'compare'}/></details></div>}
          {inspectorTab === 'edit' && tool === 'housing' && <BuildingInspector existing={inspectedExisting} placed={inspectedPlaced} sitePin={scenario.pin} siteBuildings={siteBuildings} demolitions={scenario.demolitions} onSelect={ref => { const feature = siteBuildings.find(b => footprintKey(b) === demolitionKey(ref)); if (feature) inspectOnSite(feature) }} onDemolish={(feature, replace) => demolishFootprints([feature], replace ? 'replace' : 'only')} onRestore={restoreExisting} onEditPlaced={editPlaced} onClose={() => setSelectedBuilding(null)} pending={evaluation.pending || !context}
            existingHomes={inspectedExisting && (inspectedExisting.properties.pin ? homesText(recordedHomes(parcelProps(inspectedExisting.properties.pin) || {})) : 'Unknown (no matched parcel record)')} planNet={scenario.buildings.length || scenario.demolitions?.length ? planNet : null}>
            {inspectedExisting && <RedevelopmentImpact impact={siteImpact(isDemolished(inspectedExisting, scenario.demolitions) ? siteDemolished : [...siteDemolished, inspectedExisting])} hypothetical={!isDemolished(inspectedExisting, scenario.demolitions)}/>}
          </BuildingInspector>}
          {evaluation.error && <p role="alert" className="planner-warning">Calculation failed: {evaluation.error}</p>}
          {(inspectorTab === 'edit' || inspectorTab === 'rankings') && (!!scenario.buildings?.length || !!scenario.demolitions?.length) && <details className="plan-summary"><summary><strong>Your plan</strong><span>{scenario.buildings.length} added · {scenario.demolitions?.length || 0} removed</span></summary><div className="area-plan">
            <p className="net-homes"><strong>{planNet.text}</strong><small>{planNet.note}</small></p>
            {result?.placedPlan && !evaluation.pending && <p className="placed-plan-score"><span>Plan score · current → changed infrastructure</span><strong>{fmt(result.placedPlan.baseline.total)} → {fmt(result.placedPlan.proposal.total)}</strong></p>}
            <ul>{scenario.buildings.map((b, i) => <li key={b.id}><button aria-label={`Inspect planned building ${i + 1}`} onClick={() => selectBuilding({ kind: 'placed', id: b.id, pin: b.pin })}><strong>{housingSpec(b.option).label}</strong><small>{byPin.get(b.pin)?.properties.address || b.pin} · planned</small></button><button aria-label={`Remove placed building ${i + 1}`} onClick={() => { dispatch({ type: 'removeBuilding', id: b.id }); if (selectedBuilding?.id === b.id) setSelectedBuilding(null) }}>Remove</button></li>)}</ul>
            <ul>{(scenario.demolitions || []).map(b => <li key={demolitionKey(b)}><button onClick={() => inspectDemolition(b)}><strong>{byPin.get(demolitionSite(b))?.properties.address || demolitionSite(b)}</strong><small>Outline {b.id} · demolished{b.site || b.unmatched ? ' · crossed the parcel boundary' : ''}</small></button><button onClick={() => restoreExisting(b)} aria-label={`Restore building ${b.id}`}>Restore</button></li>)}</ul>
            {planTax && <TaxLedger tax={planTax} title="Whole-plan Annual Property Tax Ledger"/>}
          </div></details>}
          {inspectorTab === 'rankings' && <HousingComparison comparison={result?.comparison} draft={option} selectedTypes={scenario.comparisonTypes} onSelection={types => set('comparisonTypes', types)} proposed={proposed} pending={evaluation.pending} expanded onExpand={() => setInspectorTab('rankings')} onBack={() => setInspectorTab('edit')} area={!!scenario.buildings?.length} onUse={previewTemplate} onAssumptions={() => setInspectorTab('assumptions')} reform={reformPreset} onReform={setReformPreset} zoningCode={props.zoning_code ?? null} costControl={costSwitch(true)}/>}
          {inspectorTab === 'edit' && (tool === 'housing' || tool === 'compare') && !selectedBuilding && <section data-tour="housing" className="housing-editor">
            <div className="drawer-heading"><h3>New building</h3><p>Preview a housing type, then add it to your plan.</p></div>
            <TypologyCards cards={cards} pending={evaluation.pending} onChoose={typeId => { if (typeId !== option.typeId) changeType(typeId); else setJustAdded(null) }} onScoreAll={() => set('comparisonTypes', BUILDING_IDS.filter(id => id !== option.typeId))}/>
            {paused ? <div className="added-callout" role="status"><p><strong>✓ {justAdded.label} added to your plan.</strong> The preview is paused so it does not sit on top of the new building.</p><div className="placement-actions"><button className="primary-build" onClick={() => setJustAdded(null)}>Preview another building</button><button onClick={() => selectBuilding({ kind: 'placed', id: justAdded.id, pin: justAdded.pin })}>Inspect the new building</button></div></div> : <>
            <fieldset className="quick-controls" aria-label="Size and orientation">
              <div className="quick-steppers">{[['width', 'Width', `${option.width} m`, 1], ['depth', 'Depth', `${option.depth} m`, 1], ['floors', 'Stories', option.floors ?? housingSpec(option).floors, 1]].map(([key, label, value, step]) => <div key={key} className="stepper"><span>{label}</span><button aria-label={`Decrease ${label.toLowerCase()}`} disabled={!resizeDraft(option, key, -step)} onClick={() => resize(key, -step)}>−</button><output aria-live="polite" aria-label={label}>{value}</output><button aria-label={`Increase ${label.toLowerCase()}`} disabled={!resizeDraft(option, key, step)} onClick={() => resize(key, step)}>+</button></div>)}</div>
              <div className="quick-rotate"><button aria-label="Rotate draft −15°" disabled={!canAdjust} onClick={() => rotate(-15)}>⟲ −15°</button><button aria-label="Rotate draft +15°" disabled={!canAdjust} onClick={() => rotate(15)}>⟳ +15°</button><button disabled={!option.placement} onClick={() => { setOption('placement', null); setPlacing(false) }}>Reset alignment</button></div>
              <small>{option.height} m high · {option.placement ? `manual position, bearing ${round(placement.bearing)}°` : 'automatic parcel alignment'} · <button className="assumptions-link" onClick={() => setInspectorTab('assumptions')}>Exact values in Advanced</button></small>
            </fieldset>
            <div className="draft-result" aria-busy={evaluation.pending}><div><span>Current draft</span><strong>{draftState.title}</strong><small>{draftState.detail}</small>{!evaluation.pending && evaluated && <span className={`zoning-badge ${zoningBadge(evaluated).tone}`}>{zoningBadge(evaluated).text}</span>}{!evaluation.pending && evaluated && !evaluated.eligible && Number.isFinite(evaluated.suitability) && <small>Underlying score {evaluated.suitability.toFixed(1)} / 100 before eligibility gates; not a ranking.</small>}</div><button onClick={() => setInspectorTab('rankings')}>Compare types →</button></div>
            {(fitIssue || dimensionConflicts.length > 0) && <div className="fit-callout" role="group" aria-label="Why this draft does not fit">
              <p><strong>{fitIssue ? 'This footprint does not fit the parcel outline.' : 'The footprint fits, but zoning dimensions conflict.'}</strong></p>
              <ul>{fitIssue?.reasons.map(r => <li key={r.id}>{r.text}</li>)}{dimensionConflicts.map(c => <li key={c.id}>{c.label} (§{c.section}): {c.detail}</li>)}</ul>
              {fitIssue && <div className="placement-actions"><button className="primary-build" disabled={evaluation.pending} onClick={fitDraftToLot}>Fit dimensions to lot</button></div>}
              <small>{fitIssue ? `Finds the largest ${housingSpec(option).label.toLowerCase()} footprint, down to the type minimum, that fits at a position aligned to a parcel edge${districtStandards(props.zoning_code)?.coverage ? ' and within the district’s lot coverage' : ''}. Stories stay the same. Lot size is measured from the map outline, not legal frontage.` : 'Fit to lot changes only width and depth. Height, stories and lot-area limits need a smaller type, a variance or a reform scenario.'}</small>
            </div>}
            {!evaluation.pending && evaluated?.titleNine?.conflict && options && <PolicyReformSimulator compact presetId={reformPreset} onPreset={setReformPreset} options={Object.values(options)} code={props.zoning_code ?? null} focusTypeId={option.typeId}/>}
            {!!blockingBuildings.length && <div className="redevelop-callout" role="group" aria-label="Existing buildings under this draft">
              <p><strong>{blockingBuildings.length === 1 ? 'An existing building sits' : `${blockingBuildings.length} existing buildings sit`} under this draft.</strong> Demolish {blockingBuildings.length === 1 ? 'it' : 'them'} in the plan to test a replacement here, or move the draft.</p>
              <div className="placement-actions"><button className="primary-build" disabled={evaluation.pending || !context} onClick={() => demolishFootprints(blockingBuildings)}>Demolish & replace existing building{blockingBuildings.length === 1 ? '' : 's'}</button><button onClick={() => inspectOnSite(blockingBuildings[0])}>Inspect first</button></div>
              <small>Scenario only · Undo or Restore brings {blockingBuildings.length === 1 ? 'it' : 'them'} back. Zoning checks still apply after clearing.</small>
            </div>}
            {otherCollision && <p className="planner-warning">This draft overlaps a planned building or reserved infrastructure. Move or rotate it, or choose a smaller type.</p>}
            <div className="build-costs"><AmiChips householdSize={scenario.householdSize} targetIncome={scenario.targetIncome} onIncome={value => set('targetIncome', value)} onSize={value => set('householdSize', value)}/>{costSwitch(true)}</div>
            {!proposed && <p className="compact-help">Viewing current infrastructure. Adding a building returns to the changed-infrastructure view.</p>}
            <div className="build-actions"><button className="primary-build" disabled={!draftState.canPlace} onClick={() => addBuilding(placing && hoverMassing ? hoverMassing : undefined)}>{placing ? 'Add at preview' : 'Add to plan'}</button><button disabled={evaluation.pending || !context} aria-pressed={placing} onClick={() => { setProposed(true); setJustAdded(null); setPlacing(!placing) }}>{placing ? 'Cancel placement' : 'Position on map'}</button></div>
            {!evaluation.pending && evaluated && <TitleNineChecks result={evaluated.titleNine}/>}
            </>}
            <RedevelopmentImpact impact={siteImpact(siteDemolished)}/>
            <button className="assumptions-link" onClick={() => setInspectorTab('assumptions')}>Advanced · income, costs & evidence →</button>
          </section>}
          {inspectorTab === 'edit' && tool === 'service' && <>
            <div className="section-heading"><h3>Improve scheduled service</h3><span className="data-badge observed">PRT baseline</span></div><p className="section-help">Test extra departures at an existing stop.</p>
            <label className="planner-field"><span>Existing stop within 1,200 m</span><Select aria-label="Existing stop within 1,200 m" value={scenario.stopId} onChange={e => selectStop(e.target.value)}>{!nearby.length && <option value="">No scheduled stop nearby</option>}{nearby.map(s => <option key={s.stop_id} value={String(s.stop_id)}>{s.name} · {Math.round(s.distance)} m</option>)}</Select></label>
            {stop && <div className="service-baseline"><Icon name="bus"/><div><strong>{stop.weekday_trips} scheduled stop departures</strong><small>Baseline weekday · route labels {(stop.routes || []).join(', ') || 'unavailable'}</small></div></div>}
            <label className="service-slider"><span>Additional departures / weekday <strong>+{scenario.additionalDepartures}</strong></span><input type="range" min="0" max="120" step="5" value={scenario.additionalDepartures} disabled={!stop} onChange={e => set('additionalDepartures', Number(e.target.value))}/><small>0 <span>120 new departures</span></small></label>
            <div className="service-presets">{[0, 30, 60].map(n => <button key={n} aria-pressed={scenario.additionalDepartures === n} className={scenario.additionalDepartures === n ? 'active' : ''} onClick={() => { set('additionalDepartures', n); setProposed(true) }} disabled={!stop}>{n ? `+${n} / day` : 'No change'}</button>)}</div>
            {evaluation.pending ? <p className="section-help" role="status">Updating walking and waiting times…</p> : result?.baseline[option.typeId]?.service && <div className="before-after"><div><span>Baseline walk + wait</span><strong>{fmt(result.baseline[option.typeId].service.minutes, ' min')}</strong></div><Icon name="arrow"/><div><span>With added service</span><strong>{fmt(result.proposal[option.typeId].service?.minutes, ' min')}</strong></div></div>}
            {scenario.serviceStopId && scenario.serviceStopId !== scenario.stopId && <p className="planner-warning">The current service investment is at stop {scenario.serviceStopId}. Changing departures here moves it to this stop.</p>}
            <button className="assumptions-link" onClick={() => setInspectorTab('assumptions')}>Service & capacity assumptions →</button>
            <button className="next-tool" onClick={() => { setInspectorTab('rankings') }}>Compare the housing outcomes <Icon name="arrow" size={18}/></button>
          </>}
          {inspectorTab === 'edit' && tool === 'network' && <InfrastructurePanel network={network} manifest={networkData?.manifest} error={networkError} retry={() => setNetworkAttempt(n => n + 1)} scenario={scenario} set={set} result={result} drawing={drawing} begin={beginDrawing} cancel={cancelDrawing} draftNode={draftNode} remove={(key, id) => set(key, scenario[key].filter(edit => edit.id !== id))} numeric={Numeric} onPoint={drawInfrastructure} onAssumptions={() => setInspectorTab('assumptions')}/>}
          {inspectorTab === 'assumptions' && <>
            <div className="section-heading"><h3>Advanced options</h3></div>
            <p className="compact-help">Proposed values are editable. Sources, model choices and limits are below.</p>
            <PolicyContext properties={props} snapshot={summary.pulled_at}/>
            <details className="planner-details advanced-options" open><summary>Building & household inputs</summary>
            <p className="compact-help">Editing the current draft. Enter exact values; changes recalculate on Enter or leaving the field.</p>
            <div className="field-grid three"><Numeric label="Width (m)" value={option.width} min={2} max={100} onChange={v => setOption('width', v)}/><Numeric label="Depth (m)" value={option.depth} min={2} max={100} onChange={v => setOption('depth', v)}/><Numeric label="Zoning height above grade (m)" value={option.height} min={3} max={100} onChange={v => setOption('height', v)}/></div>
            <Numeric label="Stories" value={option.floors ?? housingSpec(option).floors} min={1} max={60} step={1} hint="Whole floors used for zoning and the gross floor-area estimate." onChange={v => setOption('floors', v)}/>
            {option.typeId === 'townhouse_duplex' && <label className="planner-field"><span>Legal residential form</span><Select aria-label="Legal residential form" value={option.residentialForm || 'duplex'} onChange={e => setOption('residentialForm', e.target.value)}><option value="duplex">Duplex · two units on one lot</option><option value="attached">Attached house · one unit on its own lot</option></Select><small>Attached houses need a shared wall; this map does not establish that configuration.</small></label>}
            <ZoningInputs inputs={zoningInputs} project={scenario.projectInputs || {}} onChange={setZoningInput} onProjectChange={v => set('projectInputs', v)} numeric={Numeric} typeId={option.typeId} code={props.zoning_code}/>
            <details className="planner-details placement-controls">
              <summary>Position & orientation <span>{option.placement ? 'Manual placement' : 'Automatic parcel alignment'}</span></summary>
              <p>Automatic placement follows parcel edges; street frontage is not identified. Manual moves preserve your chosen size and position.</p>
              <fieldset disabled={evaluation.pending || !evaluated}>
              <div className="field-grid three"><Numeric label="Bearing (°)" value={round(placement.bearing)} min={0} max={359.9} step={5} onChange={v => moveProposal({ bearing: v })}/><Numeric label="East offset (m)" value={round(placement.east)} min={-2000} max={2000} step={1} onChange={v => moveProposal({ east: v })}/><Numeric label="North offset (m)" value={round(placement.north)} min={-2000} max={2000} step={1} onChange={v => moveProposal({ north: v })}/></div>
              <small>Bearing: depth axis clockwise from north. Offsets: from parcel bounding-box centre.</small>
              <div className="placement-actions"><button onClick={() => moveProposal({ bearing: (placement.bearing + 345) % 360 })}>Rotate −15°</button><button onClick={() => moveProposal({ bearing: (placement.bearing + 15) % 360 })}>Rotate +15°</button><button onClick={() => { setOption('placement', null); setPlacing(false) }}>Reset alignment</button></div>
              </fieldset>
            </details>
            <div className="section-heading"><h3>Household costs</h3><span className="data-badge">Editable</span></div><p className="section-help">Starting income and gross rent describe the existing Census geography (observed). They are not new-construction rents. With Housing costs in score on, whatever you enter here counts as a scenario assumption; each compared type shares these costs.</p>
            <Numeric label="Target household income / year ($)" value={scenario.targetIncome} min={1000} max={500000} step={1000} onChange={v => set('targetIncome', v)}/>
            <div className="field-grid"><Numeric label="Rent / month ($)" value={option.rent} max={10000} step={50} onChange={v => setOption('rent', v)}/><Numeric label="Utilities / month ($)" value={option.utilities} max={2000} step={25} onChange={v => setOption('utilities', v)}/></div>
            {costSwitch(false)}
            {placedCostsExcluded > 0 && <p className="compact-help">{placedCostsExcluded} placed building(s) have housing costs excluded. Turning the switch on includes each one with the rent, utilities and income recorded when it was placed.</p>}
            <HudIncomeReference householdSize={scenario.householdSize} targetIncome={scenario.targetIncome} monthly={option.rent + option.utilities} onSize={value => set('householdSize', value)} onIncome={value => set('targetIncome', value)}/>
            {!evaluation.pending && evaluated && <div className="metric-highlight"><span>Housing cost / target income</span><strong>{fmt(evaluated.burden === null ? null : evaluated.burden * 100, '%')}</strong><small>30% is a screening benchmark. Financing and subsidies are not evaluated.</small></div>}
            <p className="section-help">Routed walking at 80 m/min (stairs: assumed 40 m/min), plus assumed last-metre connectors and half the average departure interval. Assumes evenly spaced, usable departures in the service span. Route destinations, transfers, hills and actual arrival times are not modeled.</p>
            <Numeric label="Assumed service span (hours/day)" value={scenario.serviceHours} min={1} max={24} onChange={v => set('serviceHours', v)}/>
            <details className="planner-details"><summary>Capacity assumptions <span>Scheduled service + assumed reserve</span></summary><p>PRT schedules measure departures, not empty seats. The starting scenario allows one spare boarding per existing departure; this is adjustable, not measured occupancy.</p><label className="planner-field"><span>Baseline capacity method</span><Select aria-label="Baseline capacity method" value={scenario.capacityMode || 'manual'} onChange={e => set('capacityMode', e.target.value)}><option value="schedule">Schedule × assumed spare places</option><option value="manual">Manual reserve only (blank = not assessed)</option></Select></label>{scenario.capacityMode === 'schedule' && <Numeric label="Assumed spare places / existing departure" value={scenario.baselinePlacesPerDeparture} min={0} max={100} step={.5} onChange={v => set('baselinePlacesPerDeparture', v)}/>}<Numeric label="Override: baseline spare boardings / day at this stop" value={scenario.capacityStopId && scenario.capacityStopId !== scenario.stopId ? null : scenario.spareBoardings} nullable max={100000} onChange={v => set('spareBoardings', v)}/><Numeric label="Available boarding places / added departure" value={scenario.availablePlacesPerDeparture} min={0} max={100} onChange={v => set('availablePlacesPerDeparture', v)}/><Numeric label="Added daily boardings / proposed home" value={scenario.boardingsPerHome} min={0} max={20} step={.5} onChange={v => set('boardingsPerHome', v)}/>{!evaluation.pending && evaluated?.service && <p>{stop?.weekday_trips} scheduled departures at this stop. Baseline reserve: {fmt(evaluated.reserve?.boardings)} boardings/day ({evaluated.reserve?.method === 'manual' ? 'manual total' : 'scenario assumption'}).</p>}<p>Homes using the same stop share its reserve. Stops on the same route can share vehicles; these local screens cannot establish a citywide capacity total. Peak load, occupancy, funding, engineering and water/sewer capacity are not assessed.</p></details>

            </details>
            {result?.scope === 'area' && <p className="compact-help">Area rankings include all placed buildings plus the next alternative. Factor scores are averages per proposed home, not neighborhood forecasts. Each building retains the rent, income and stop recorded at placement. Transit reserve is shared by all proposed homes using that stop.</p>}
            {!evaluation.pending && evaluated && <TitleNineChecks result={evaluated.titleNine}/>}
            {!evaluation.pending && evaluated && <details className="planner-details"><summary>Factor calculations · current draft</summary><div className="factor-list">{PLANNER_FACTORS.map(factor => <Factor key={factor.id} factor={factor} option={evaluated} result={result} scenario={scenario} onPriorities={() => setInspectorTab('priorities')}/>)}</div></details>}
            {!evaluation.pending && result && <><details className="planner-details"><summary>Why this result? Full audit</summary><p>{result.explanation}</p><RecommendationAudit result={result} proposed={proposed} options={options}/></details><details className="planner-details"><summary>Comparison assumptions & exclusions</summary><p>Selected types share the current draft’s rent, utilities and target income. The current draft keeps your exact dimensions and position; other types use standard dimensions and automatic placement. Unit counts are fixed assumptions. Triplex and 12-home apartment share the source small-apartment demand/carbon proxy.</p>{result.comparison.factors.map(f => <p key={f.id}><strong>{f.short}:</strong> {f.included ? `${(100*f.effectiveWeight).toFixed(1)}% effective weight.` : f.exclusion} {f.source}.</p>)}<p>Every selected type uses the same evidence coverage and relative priorities. Adding a type with missing evidence can change that shared coverage.</p></details></>}
          </>}
          {inspectorTab === 'assumptions' && <details className="evidence-panel"><summary>Public sources & limits</summary><p><strong>Infrastructure:</strong> Paths reserve 3 m, streets 12 m, parks 20 × 20 m. Only endpoints form junctions. River crossings, grades, safe access, land rights and engineering are unreviewed. Park access uses mapped paths and an assumed connector; wheelchair suitability is unknown. Transit preference uses a 30-minute anchor and parks a 15-minute anchor. Park priority is a value judgment, not an estimate of cooling or price change.</p><p><strong>Observed:</strong> OSM walking graph and mapped parks; County parcels/assessments, ACS 2020–2024, CHAS 2018–2022, PRT stop aggregates, mapped hazards. Snapshot {summary.pulled_at}.</p><p><strong>Existing buildings:</strong> County roof outlines in their recorded positions. {context ? buildingHeightCoverage(context.manifest.height_methods) : 'Building evidence is loading or unavailable.'} Click a building to inspect its height method. Colours show matched parcel assessment use, not recommended housing or verified occupancy. Neutral footprints have unknown use. Heights retain their separate evidence methods. These display estimates do not affect recommendations. No independently verified heights or terrain model; source dates and coverage vary. Nonresidential buildings are included.</p><p><strong>Proposed:</strong> dimensions, rents, utilities, target income, additional departures, service span and optional capacity. No LiDAR-derived heights have been added.</p><p><strong>Calculated:</strong> sampled outline fit, cost burden, aggregate walk/wait, conditional boarding capacity and weighted comparison.</p><p><strong>Not evaluated:</strong> zoning rules marked not assessed, contextual exceptions, utility capacity, negotiated acquisition prices (the pro forma uses sales or neighborhood ranges), engineering, travel destinations, displacement caused by development, or marginal tonnes of CO₂.</p><p>Hazard context: {props.flood_zones?.length ? props.flood_zones.join(', ') : 'no mapped flood overlap recorded'}; steep slope {fmt(typeof props.steep_slope_overlap === 'number' ? props.steep_slope_overlap * 100 : null, '%')}; mine overlap {fmt(typeof props.undermined_overlap === 'number' ? props.undermined_overlap * 100 : null, '%')}. Missing data is not a clean site finding.</p><a href="/data/walking-network.sources.json" target="_blank" rel="noreferrer">Walking network & park assumptions ↗</a><a href="/data/existing-buildings.sources.json" target="_blank" rel="noreferrer">Building evidence & height assumptions ↗</a><a href="/data/sources.json" target="_blank" rel="noreferrer">Source manifest ↗</a><a href="/data/score_model.json" target="_blank" rel="noreferrer">Baseline model assumptions ↗</a><a href="https://ecode360.com/45476524#45476524" target="_blank" rel="noreferrer">Zoning use table ↗</a></details>}
        </div>
        <footer className="inspector-footer"><div role="status">{autosave.kind === 'saved' ? 'Saved on this device' : autosave.kind === 'pending' ? 'Saving on this device…' : autosave.kind === 'error' ? autosave.message : 'Your edits will save on this device.'}</div><div className="plan-storage-actions">{autosave.kind === 'error' && <><button onClick={autosave.retry}>{autosave.blocked ? 'Save this plan instead' : 'Retry saving'}</button>{autosave.raw && <button onClick={() => downloadRaw(autosave.raw, 'playhouse-saved-recovery.json')}>Download saved copy</button>}</>}<button onClick={newPlan}>New plan</button></div></footer>
      </aside>
    </StudioWorkspace>
    <StudioTour startRequest={tourRequest} autoStart={data.autoTour} onStep={showTourStep} onFinish={finishTour} triggerRef={tourButton}
      ready={!!tourStep && tourApplied === tourStep.id && scenario.pin === TOUR_PIN && !evaluation.pending && !!network}
      error={tourStep ? loaded.error || networkError || evaluation.error : null}
      evidence={tourStep && scenario.pin === TOUR_PIN ? tourEvidence(tourStep.id, selected, result, stop) : ''}
      onRetry={() => { loaded.retry(); setNetworkAttempt(n => n + 1) }}/>
    <div className={notice ? 'network-notice' : 'planner-announcement'} role={notice?.tone === 'error' ? 'alert' : 'status'} aria-live={notice?.tone === 'error' ? 'assertive' : 'polite'}>{notice?.text}{notice && <button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button>}</div>
  </main>
}

function Factor({ factor, option, result, scenario, onPriorities }) {
  const a = option
  const details = {
    demand: 'Existing neighborhood sales activity and team-chosen lot-fit curve. Not a forecast of household or typology demand. Infrastructure edits leave it unchanged.',
    physical: '100 if the fixed-size footprint fits inside the parcel without touching retained buildings; otherwise 0. Explicit scenario demolitions free only the selected footprint. Missing building context excludes this factor and withholds ranking. Supported Title Nine conflicts separately remove the housing total. Rules without sufficient evidence are excluded. Street frontage, occupancy, demolition feasibility and engineering remain unreviewed.',
    affordability: 'Monthly proposed rent + utilities divided by target monthly household income. Excluded until the exact inputs are confirmed as scenario assumptions. Score falls linearly from 100 at 20% burden to 0 at 50%; these anchors are value judgments.',
    displacement: '100 minus the existing tract displacement screen. Shared by housing types at this site. New service does not predict or rewrite displacement.',
    capacity: 'Available daily boardings divided by assumed new housing boardings, capped at 100. PRT departures × assumed spare places (or a manual reserve), plus added departures × available places. Not observed occupancy. Missing service/reserve excludes the factor. Utilities not assessed.',
    access: 'Routed transit access: 100 × (1 − walk plus average wait / 30 minutes). Park access: 100 × (1 − walk to mapped/proposed park / 15 minutes). Both are clamped and blended by your park-share preference (default 0%). The anchors are policy choices. No jobs, actual timetables or safe crossings are evaluated.',
    carbon: '100 minus the existing relative carbon proxy per home. Not incremental tonnes. Unchanged by this service edit because travel mode shifts and infrastructure emissions are not modeled.',
  }
  function metric(o) {
    if (o.area) return `${o.area.units} proposed homes across ${o.area.buildings} buildings · average per home`
    if (factor.id === 'affordability') return `${fmt(o.burden === null ? null : o.burden * 100, '%')} cost burden`
    if (factor.id === 'capacity') return `${fmt(o.supply)} available / ${fmt(o.groupBoardings)} assumed boardings`
    if (factor.id === 'access') return `${fmt(o.service?.minutes, ' min')} walk + wait`
    if (factor.id === 'physical') return !o.massing.fits ? 'Outline does not fit' : o.massing.collisions === null ? 'Building context unavailable' : o.massing.collisions ? 'Recorded building overlap' : 'Outline + overlap pass'
    if (factor.id === 'carbon') return `${fmt(o.raw.carbon_index)} relative index / home`
    if (factor.id === 'displacement') return `${fmt(o.raw.displacement_risk)} tract risk`
    return `${fmt(o.raw.demand)} market/lot proxy`
  }
  return <details className="factor-item"><summary><div><strong>{FACTOR_LABELS[factor.id] || factor.label}</strong><small>{factor.kind}</small></div><span className="factor-score a">{fmt(a.scores[factor.id])}</span></summary><div className="factor-content"><div className="factor-values"><span>{metric(a)}</span></div><p>{details[factor.id]}</p><small>Source: {factor.source}</small><button className="assumptions-link" onClick={onPriorities}>Adjust relative priorities →</button>{result.excluded.includes(factor.id) && <p className="planner-warning">Excluded: missing evidence or zero weight. The same coverage is used for all selected types and both infrastructure states.</p>}</div></details>
}
