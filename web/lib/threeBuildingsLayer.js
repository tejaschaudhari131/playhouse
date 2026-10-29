import { BufferAttribute, BufferGeometry, Camera, Color, DirectionalLight, Group, HemisphereLight, Matrix4, Mesh, Scene, Vector3, WebGLRenderer } from 'three'
import { buildNeighborhoodBuilding, buildProposedBuilding, buildingCacheKey, mercator, meterInMercator, metresProjector, seedOf } from './threeBuildingMeshes.js'
import { createBuildingMaterials } from './threeMaterials.js'
import { footprintKey } from './redevelopment.js'

const SUN_COLOURS = { morning: '#ffe1bd', noon: '#fff5e6', afternoon: '#ffd7ad' }

function geometryFrom({ position, normal, uv, color }) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(position, 3))
  g.setAttribute('normal', new BufferAttribute(normal, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setAttribute('color', new BufferAttribute(color, 3))
  return g
}

/** Concatenate per-material arrays of several buildings, shifting each by its anchor offset (metres). */
export function mergeBuildings(parts) {
  const out = new Map()
  for (const [key, list] of parts) {
    const size = list.reduce((n, { arrays }) => n + arrays.position.length, 0)
    const position = new Float32Array(size), normal = new Float32Array(size), color = new Float32Array(size), uv = new Float32Array(size / 3 * 2)
    let at = 0
    for (const { arrays, offset } of list) {
      const p = arrays.position
      for (let i = 0; i < p.length; i += 3) { position[at + i] = p[i] + offset[0]; position[at + i + 1] = p[i + 1] + offset[1]; position[at + i + 2] = p[i + 2] }
      normal.set(arrays.normal, at); color.set(arrays.color, at); uv.set(arrays.uv, at / 3 * 2)
      at += p.length
    }
    out.set(key, { position, normal, uv, color })
  }
  return out
}

/**
 * Three.js scene of real-world buildings in metres around an origin: merged neighbourhood meshes (one draw per
 * material) plus one group per proposed building. Geometry is cached per building and disposed when replaced.
 */
export class BuildingScene {
  constructor({ materials, cacheLimit = 800 }) {
    this.materials = materials; this.cacheLimit = cacheLimit
    this.scene = new Scene()
    this.sun = new DirectionalLight('#fff5e6', 2.4)
    this.sky = new HemisphereLight('#e2ecf6', '#7a6e60', 1.45)
    this.sky.position.set(0, 0, 1)
    this.neighborhood = new Group(); this.proposed = new Group()
    this.scene.add(this.sun, this.sun.target, this.sky, this.neighborhood, this.proposed)
    this.cache = new Map(); this.proposedItems = new Map()
    this.origin = null; this.features = []; this.inspectedKey = null; this.selectionKey = ''
    this.meshed = 0
    this.setSun({ azimuth: 180, altitude: 50, id: 'noon' })
  }
  setOrigin(lngLat) {
    if (!lngLat || this.origin && this.origin[0] === lngLat[0] && this.origin[1] === lngLat[1]) return false
    this.origin = [lngLat[0], lngLat[1]]
    const [x, y] = mercator(this.origin), s = meterInMercator(this.origin[1])
    this.originMercator = [x, y]; this.scale = s
    this.originMatrix = new Matrix4().makeTranslation(x, y, 0).scale(new Vector3(s, -s, s))
    this.rebuildNeighborhood()
    for (const entry of this.proposedItems.values()) this.place(entry)
    return true
  }
  offset(anchor) {
    const [x, y] = mercator(anchor)
    return [(x - this.originMercator[0]) / this.scale, -(y - this.originMercator[1]) / this.scale]
  }
  /** Sun from `sunFor`: azimuth degrees clockwise from north, altitude degrees. */
  setSun(sun) {
    if (!sun) return
    const az = sun.azimuth * Math.PI / 180, alt = Math.max(5, sun.altitude) * Math.PI / 180
    this.sun.position.set(Math.sin(az) * Math.cos(alt) * 1000, Math.cos(az) * Math.cos(alt) * 1000, Math.sin(alt) * 1000)
    this.sun.color = new Color(SUN_COLOURS[sun.id] || SUN_COLOURS.noon)
    this.sun.intensity = 1.7 + Math.sin(alt) * 1.1
    this.sky.intensity = 1.25 + Math.sin(alt) * .35
    this.sunDirection = this.sun.position.clone().normalize()
  }
  setNeighborhood(features = [], { inspectedKey = null } = {}) {
    const key = features.map(buildingCacheKey).join('\n')
    if (key === this.selectionKey && inspectedKey === this.inspectedKey) return false
    this.features = features; this.selectionKey = key; this.inspectedKey = inspectedKey
    this.rebuildNeighborhood()
    return true
  }
  built(feature) {
    const key = buildingCacheKey(feature)
    if (this.cache.has(key)) { const hit = this.cache.get(key); this.cache.delete(key); this.cache.set(key, hit); return hit }
    let built = null
    try { built = buildNeighborhoodBuilding(feature) } catch { built = null }
    this.cache.set(key, built)
    while (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value)
    return built
  }
  clearGroup(group) {
    for (const child of [...group.children]) { child.geometry?.dispose(); group.remove(child) }
  }
  rebuildNeighborhood() {
    this.clearGroup(this.neighborhood)
    this.meshed = 0
    if (!this.origin) return
    const plain = new Map(), highlighted = new Map()
    for (const feature of this.features) {
      const built = this.built(feature)
      if (!built) continue
      this.meshed++
      const target = this.inspectedKey && footprintKey(feature) === this.inspectedKey ? highlighted : plain, offset = this.offset(built.anchor)
      for (const [key, arrays] of built.geometries) {
        if (!target.has(key)) target.set(key, [])
        target.get(key).push({ arrays, offset })
      }
    }
    for (const [parts, highlight] of [[plain, false], [highlighted, true]]) for (const [key, arrays] of mergeBuildings(parts)) {
      const mesh = new Mesh(geometryFrom(arrays), highlight ? this.materials.highlight(key) : this.materials.get(key))
      mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.userData.material = key
      this.neighborhood.add(mesh)
    }
  }
  place(entry) {
    if (!this.origin) return
    const [x, y] = this.offset(entry.anchor)
    entry.group.position.set(x, y, 0)
    entry.group.updateMatrix()
  }
  /** Proposed items: { key, geometry (lng/lat polygon), front (east/north unit), typeId, height, floors, state, flagged, hidden }. */
  setProposed(items = []) {
    const next = new Map()
    for (const item of items) {
      const ring = item.geometry?.type === 'Polygon' ? item.geometry.coordinates[0] : null
      if (!ring) continue
      const signature = JSON.stringify([item.key, ring, item.front, item.typeId, item.height, item.floors, item.state, !!item.flagged])
      let entry = this.proposedItems.get(signature) || next.get(signature)
      if (!entry) {
        const corners = ring.slice(0, -1), anchor = [corners.reduce((n, p) => n + p[0], 0) / corners.length, corners.reduce((n, p) => n + p[1], 0) / corners.length]
        const project = metresProjector(anchor)
        let built = null
        try {
          built = buildProposedBuilding({ ring: corners.map(project), front: item.front, typeId: item.typeId, height: item.height, floors: item.floors, state: item.state, flagged: item.flagged, seed: seedOf(item.key) })
        } catch { built = null }
        const group = new Group()
        group.matrixAutoUpdate = false
        if (built) for (const [key, arrays] of built.geometries) {
          const mesh = new Mesh(geometryFrom(arrays), this.materials.get(key))
          mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.userData.material = key
          group.add(mesh)
        }
        group.userData = { key: item.key, type: built?.type ?? null, triangles: built?.triangles ?? 0 }
        entry = { anchor, group }
        this.proposed.add(group)
        this.place(entry)
      }
      entry.group.visible = !item.hidden
      next.set(signature, entry)
    }
    for (const [signature, entry] of this.proposedItems) if (!next.has(signature)) { this.clearGroup(entry.group); this.proposed.remove(entry.group) }
    this.proposedItems = next
  }
  get proposedCount() { return [...this.proposedItems.values()].filter(e => e.group.visible).length }
  dispose() {
    this.clearGroup(this.neighborhood)
    for (const entry of this.proposedItems.values()) { this.clearGroup(entry.group); this.proposed.remove(entry.group) }
    this.proposedItems.clear(); this.cache.clear()
    this.materials.dispose()
  }
}

const isWebGL2 = gl => typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
const createRenderer = ({ canvas, context }) => new WebGLRenderer({ canvas, context, antialias: true })

/**
 * MapLibre `CustomLayerInterface` that draws `BuildingScene` into the map's own WebGL2 context, sharing its depth
 * buffer (`renderingMode: '3d'`) so meshes and fill-extrusions occlude each other. The camera is MapLibre's
 * mercator matrix composed with the scene origin, scaled by `meterInMercatorCoordinateUnits`.
 * Inputs set before `onAdd` or while disabled are replayed on activation. Explicit activation suspends both
 * scene updates and drawing, independently of map layout visibility. Without WebGL2 render is a no-op.
 */
export function createThreeBuildingsLayer({ id = 'three-buildings', enabled: initiallyEnabled = true, onStatus = () => {}, renderer: makeRenderer = createRenderer, materials: makeMaterials = createBuildingMaterials, supports = isWebGL2 } = {}) {
  let map = null, renderer = null, scene = null, status = 'idle', enabled = initiallyEnabled
  const camera = new Camera(), pending = {}
  const setStatus = next => { if (status !== next) { status = next; onStatus(next) } }
  const repaint = () => { if (scene && map) map.triggerRepaint() }
  const apply = () => {
    if (!scene || !enabled) return
    if (pending.origin) scene.setOrigin(pending.origin)
    if (pending.sun) scene.setSun(pending.sun)
    if (pending.neighborhood) scene.setNeighborhood(...pending.neighborhood)
    if (pending.proposed) scene.setProposed(pending.proposed)
  }
  const cleanup = () => {
    scene?.dispose(); scene = null
    renderer?.dispose(); renderer = null
    map = null
  }
  const layer = {
    id, type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      map = m
      try {
        if (!supports(gl)) throw new Error('WebGL2 is required for real-world buildings')
        renderer = makeRenderer({ canvas: m.getCanvas(), context: gl })
        renderer.autoClear = false
        scene = new BuildingScene({ materials: makeMaterials({ anisotropy: Math.min(8, renderer.capabilities?.getMaxAnisotropy?.() ?? 1) }) })
        apply()
        setStatus('ready')
      } catch {
        cleanup()
        setStatus('unavailable')
      }
    },
    render(gl, options) {
      if (!enabled || !scene || !renderer || !scene.origin) return
      const matrix = options?.defaultProjectionData?.mainMatrix ?? options
      camera.projectionMatrix.fromArray(matrix).multiply(scene.originMatrix)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
      renderer.resetState()
      renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      renderer.render(scene.scene, camera)
    },
    onRemove() { cleanup(); setStatus('idle') },
  }
  const set = (name, value, run) => { pending[name] = value; if (scene && enabled) { run(); repaint() } }
  return {
    layer,
    setEnabled(next) {
      next = !!next
      if (enabled === next) return
      enabled = next
      if (enabled) apply()
      // Repaint once on either transition, including clearing the last mesh frame when disabled.
      repaint()
    },
    setOrigin: origin => set('origin', origin, () => scene.setOrigin(origin)),
    setSun: sun => set('sun', sun, () => scene.setSun(sun)),
    setNeighborhood: (features, options) => set('neighborhood', [features, options], () => scene.setNeighborhood(features, options)),
    setProposed: items => set('proposed', items, () => scene.setProposed(items)),
    get status() { return status },
    get enabled() { return enabled },
    get meshed() { return scene?.meshed ?? 0 },
    get scene() { return scene },
    dispose: cleanup,
  }
}
