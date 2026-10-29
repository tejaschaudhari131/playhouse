import { CanvasTexture, Color, DoubleSide, MeshLambertMaterial, RepeatWrapping, SRGBColorSpace } from 'three'

/**
 * Procedural canvas textures and Lambert materials for the building layer. Painted once per map in the
 * browser, with no image downloads. Texture scale lives in `MATERIAL_SPECS` (UVs are metres per repeat), so
 * every texture here repeats once per tile. Vertex colours carry per-building tints (siding, roof, door).
 */
export const MATERIAL_LOOKS = {
  siding: { texture: 'siding' },
  brick: { texture: 'brick' },
  brickBuff: { texture: 'brickBuff' },
  stone: { texture: 'stone' },
  rustic: { texture: 'rustic' },
  limestone: { texture: 'limestone' },
  concrete: { texture: 'concrete' },
  panel: { texture: 'panel' },
  shingle: { texture: 'shingle', color: '#b3aca5' },
  ridgeCap: { color: '#57524e' },
  roofFlat: { texture: 'roofFlat' },
  metalRoof: { texture: 'metalRoof', color: '#6d7780' },
  trim: { color: '#f3f0e8' },
  wood: { texture: 'wood' },
  metal: { color: '#2e3338' },
  bronze: { color: '#4a3b2c' },
  awning: { texture: 'awning' },
  lamp: { color: '#fff2c4', emissive: '#ffcf73', emissiveIntensity: 1.4 },
  rim: { color: '#ffffff', emissive: '#ffffff', emissiveIntensity: .25 },
  glass: { texture: 'glass', offset: 2 },
  glassWarm: { texture: 'glassWarm', emissive: '#ffb660', emissiveIntensity: .75, emissiveTexture: 'glassWarmGlow', offset: 2 },
  storefront: { texture: 'storefront', emissive: '#ffcf8a', emissiveIntensity: .45, emissiveTexture: 'storefrontGlow', offset: 2 },
  door: { texture: 'door', offset: 2 },
  solar: { texture: 'solar' },
  vent: { texture: 'vent', offset: 2 },
  shutter: { texture: 'shutter' },
  balusterWood: { texture: 'balusterWood', alphaTest: .5 },
  balusterMetal: { texture: 'balusterMetal', alphaTest: .5 },
  nbBrick: { texture: 'nbBrick' },
  nbSiding: { texture: 'nbSiding' },
  nbCommercial: { texture: 'nbCommercial' },
  nbStorefront: { texture: 'nbStorefront' },
  nbOffice: { texture: 'nbOffice' },
  nbApartment: { texture: 'nbApartment' },
  aptFacade: { texture: 'aptFacade' },
}

const HIGHLIGHT = '#35b6bb'

function random(seed) {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
const shade = (hex, amount) => {
  const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c + amount * 255)))
  return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`
}
function noise(ctx, w, h, rnd, alpha = .06, count = w * h / 6) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rnd() < .5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2)
  }
}

function paintBrick(ctx, w, h, rnd, { base, mortar, courses, perRow }) {
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, w, h)
  const ch = h / courses, bw = w / perRow
  for (let r = 0; r < courses; r++) for (let c = -1; c < perRow; c++) {
    const x = c * bw + (r % 2 ? bw / 2 : 0)
    ctx.fillStyle = shade(base, (rnd() - .5) * .16)
    ctx.fillRect(x + 1, r * ch + 1, bw - 2, ch - 2)
  }
  noise(ctx, w, h, rnd, .07)
}
function paintSiding(ctx, w, h, boards) {
  const bh = h / boards
  for (let i = 0; i < boards; i++) {
    const g = ctx.createLinearGradient(0, i * bh, 0, (i + 1) * bh)
    g.addColorStop(0, '#fbfbf9'); g.addColorStop(.85, '#e3e3df'); g.addColorStop(1, '#9e9e98')
    ctx.fillStyle = g; ctx.fillRect(0, i * bh, w, bh)
  }
}
function paintShingle(ctx, w, h, rnd, courses = 5, tabs = 6) {
  ctx.fillStyle = '#c9c9c9'; ctx.fillRect(0, 0, w, h)
  const ch = h / courses, tw = w / tabs
  for (let r = 0; r < courses; r++) for (let c = -1; c <= tabs; c++) {
    const x = c * tw + (r % 2 ? tw / 2 : 0) + (rnd() - .5) * 3
    ctx.fillStyle = shade('#c4c4c4', (rnd() - .5) * .22)
    ctx.fillRect(x + 1, r * ch, tw - 2, ch)
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + tw - 2, r * ch, 2, ch)
  }
  for (let r = 0; r < courses; r++) { ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, (r + 1) * ch - 3, w, 3) }
  noise(ctx, w, h, rnd, .12, w * h / 3)
}
function paintStone(ctx, w, h, rnd, { base, mortar, rows }) {
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, w, h)
  const rh = h / rows
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 40
    while (x < w) {
      const bw = 26 + rnd() * 46
      ctx.fillStyle = shade(base, (rnd() - .5) * .22)
      ctx.fillRect(x + 2, r * rh + 2, bw - 4, rh - 4)
      x += bw
    }
  }
  noise(ctx, w, h, rnd, .1)
}
function paintGlass(ctx, w, h, rnd, { warm = false, panes = [2, 2], frame = '#f3f0e8', mullion = 4 }) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  if (warm) { g.addColorStop(0, '#f6c77a'); g.addColorStop(.55, '#d98c3e'); g.addColorStop(1, '#7a4a22') }
  else { g.addColorStop(0, '#c6d8e6'); g.addColorStop(.45, '#7d97ad'); g.addColorStop(1, '#3b4d5e') }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  if (!warm) {
    ctx.fillStyle = 'rgba(255,255,255,.22)'
    ctx.beginPath(); ctx.moveTo(w * .15, h); ctx.lineTo(w * .55, 0); ctx.lineTo(w * .72, 0); ctx.lineTo(w * .32, h); ctx.fill()
  } else {
    ctx.fillStyle = 'rgba(90,40,20,.35)'; ctx.fillRect(0, 0, w * .16, h); ctx.fillRect(w * .84, 0, w * .16, h)
  }
  ctx.fillStyle = frame
  for (let i = 1; i < panes[0]; i++) ctx.fillRect(i * w / panes[0] - mullion / 2, 0, mullion, h)
  for (let i = 1; i < panes[1]; i++) ctx.fillRect(0, i * h / panes[1] - mullion / 2, w, mullion)
  ctx.strokeStyle = frame; ctx.lineWidth = mullion; ctx.strokeRect(0, 0, w, h)
}
/** Facade bay tile: one window bay by one storey over a wall pattern. */
function bayTile(ctx, w, h, rnd, { wall, window: win = [.44, .52, .32], count = 1, glass = '#41576a', trim = '#e9e3d6', shutters = null, lintel = '#d8cfbd', storefront = false }) {
  wall(ctx, w, h)
  if (storefront) {
    ctx.fillStyle = '#3b2f24'; ctx.fillRect(0, 0, w, h * .2)
    const g = ctx.createLinearGradient(0, h * .22, 0, h)
    g.addColorStop(0, '#d7a764'); g.addColorStop(1, '#5a4636')
    ctx.fillStyle = g; ctx.fillRect(w * .06, h * .24, w * .88, h * .66)
    ctx.fillStyle = '#2d241b'; ctx.fillRect(w * .49, h * .24, w * .02, h * .66); ctx.fillRect(w * .06, h * .9, w * .88, h * .1)
    return
  }
  const [ww, wh, sill] = win
  for (let i = 0; i < count; i++) {
    const cx = w * (i + .5) / count, x = cx - w * ww / count / 2, y = h * (1 - sill - wh), width = w * ww / count, height = h * wh
    if (shutters) { ctx.fillStyle = shutters; ctx.fillRect(x - width * .42, y, width * .36, height); ctx.fillRect(x + width * 1.06, y, width * .36, height) }
    ctx.fillStyle = trim; ctx.fillRect(x - 3, y - 3, width + 6, height + 6)
    const g = ctx.createLinearGradient(0, y, 0, y + height)
    g.addColorStop(0, shade(glass, .3)); g.addColorStop(1, shade(glass, -.08))
    ctx.fillStyle = rnd() < .3 ? '#d9a35a' : g; ctx.fillRect(x, y, width, height)
    ctx.fillStyle = trim; ctx.fillRect(x + width / 2 - 1, y, 2, height); ctx.fillRect(x, y + height / 2 - 1, width, 2)
    ctx.fillStyle = lintel; ctx.fillRect(x - 5, y + height + 2, width + 10, 4); ctx.fillRect(x - 4, y - 7, width + 8, 4)
  }
}

const PAINTERS = {
  brick: [256, 256, (c, w, h, r) => paintBrick(c, w, h, r, { base: '#9a4a36', mortar: '#cbbfb0', courses: 12, perRow: 8 })],
  brickBuff: [256, 256, (c, w, h, r) => paintBrick(c, w, h, r, { base: '#c7a578', mortar: '#e2d8c6', courses: 12, perRow: 8 })],
  siding: [128, 256, (c, w, h) => paintSiding(c, w, h, 12)],
  shingle: [256, 128, (c, w, h, r) => paintShingle(c, w, h, r)],
  stone: [256, 256, (c, w, h, r) => paintStone(c, w, h, r, { base: '#8f8577', mortar: '#5f5a52', rows: 5 })],
  rustic: [256, 128, (c, w, h, r) => {
    c.fillStyle = '#b7a88f'; c.fillRect(0, 0, w, h); noise(c, w, h, r, .08, w * h / 4)
    for (let y = 0; y < 2; y++) { c.fillStyle = 'rgba(40,30,20,.55)'; c.fillRect(0, (y + 1) * h / 2 - 7, w, 7); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, y * h / 2, w, 3) }
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { c.fillStyle = 'rgba(40,30,20,.4)'; c.fillRect(x * w / 2 + (y ? w / 4 : 0), y * h / 2, 3, h / 2) }
  }],
  limestone: [128, 128, (c, w, h, r) => { c.fillStyle = '#ddd3bf'; c.fillRect(0, 0, w, h); noise(c, w, h, r, .05); c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, h - 2, w, 2); c.fillRect(w - 2, 0, 2, h) }],
  concrete: [128, 128, (c, w, h, r) => { c.fillStyle = '#b9b6b0'; c.fillRect(0, 0, w, h); noise(c, w, h, r, .06); c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, h - 2, w, 2); c.fillRect(w - 2, 0, 2, h) }],
  panel: [128, 128, (c, w, h, r) => { c.fillStyle = '#5f6b70'; c.fillRect(0, 0, w, h); noise(c, w, h, r, .04); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, h - 3, w, 3); c.fillRect(w - 3, 0, 3, h) }],
  roofFlat: [128, 128, (c, w, h, r) => { c.fillStyle = '#c9c7c2'; c.fillRect(0, 0, w, h); noise(c, w, h, r, .07); c.fillStyle = 'rgba(0,0,0,.1)'; c.fillRect(0, h / 2, w, 2); c.fillRect(0, 0, w, 2) }],
  metalRoof: [64, 64, (c, w, h) => { c.fillStyle = '#d0d4d8'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,.3)'; for (let x = 0; x < 4; x++) c.fillRect(x * w / 4, 0, 3, h) }],
  wood: [128, 128, (c, w, h, r) => { for (let i = 0; i < 8; i++) { c.fillStyle = shade('#9b7a55', (r() - .5) * .14); c.fillRect(0, i * h / 8, w, h / 8 - 2); c.fillStyle = '#4b3a28'; c.fillRect(0, (i + 1) * h / 8 - 2, w, 2) } }],
  awning: [64, 64, (c, w, h) => { for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#f1ece0' : '#bdbdbd'; c.fillRect(i * w / 4, 0, w / 4, h) } }],
  glass: [128, 128, (c, w, h, r) => paintGlass(c, w, h, r, {})],
  glassWarm: [128, 128, (c, w, h, r) => paintGlass(c, w, h, r, { warm: true })],
  glassWarmGlow: [64, 64, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#6b6b6b'); c.fillStyle = g; c.fillRect(0, 0, w, h) }],
  storefront: [256, 256, (c, w, h, r) => {
    paintGlass(c, w, h, r, { panes: [1, 1], frame: '#3d3024', mullion: 6 })
    c.fillStyle = 'rgba(255,196,120,.45)'; c.fillRect(0, h * .35, w, h * .65)
    for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(60,40,25,.45)'; c.fillRect(w * (.08 + i * .19), h * (.6 + r() * .15), w * .1, h * .4) }
    c.fillStyle = '#3d3024'; c.fillRect(0, h * .2, w, 6)
  }],
  storefrontGlow: [64, 64, (c, w, h) => { c.fillStyle = '#2a2a2a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.fillRect(0, h * .3, w, h * .7) }],
  door: [128, 256, (c, w, h) => {
    c.fillStyle = '#f2efe9'; c.fillRect(0, 0, w, h)
    const panel = (x, y, pw, ph) => { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x, y, pw, ph); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 4, y + 4, pw - 8, ph - 8); c.fillStyle = '#e7e3dc'; c.fillRect(x + 7, y + 7, pw - 14, ph - 14) }
    for (const [x, y, pw, ph] of [[14, 14, 44, 64], [70, 14, 44, 64], [14, 92, 44, 70], [70, 92, 44, 70], [14, 176, 44, 66], [70, 176, 44, 66]]) panel(x, y, pw, ph)
    c.fillStyle = '#c9a548'; c.beginPath(); c.arc(w - 18, h * .52, 5, 0, Math.PI * 2); c.fill()
  }],
  solar: [128, 256, (c, w, h) => {
    c.fillStyle = '#c3c9cf'; c.fillRect(0, 0, w, h); c.fillStyle = '#1c2f52'; c.fillRect(5, 5, w - 10, h - 10)
    c.fillStyle = 'rgba(160,190,230,.45)'
    for (let x = 1; x < 6; x++) c.fillRect(5 + x * (w - 10) / 6, 5, 1, h - 10)
    for (let y = 1; y < 10; y++) c.fillRect(5, 5 + y * (h - 10) / 10, w - 10, 1)
  }],
  vent: [64, 64, (c, w, h) => { c.fillStyle = '#d9d6cf'; c.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(3, i * h / 8 + 4, w - 6, 3) } }],
  shutter: [64, 128, (c, w, h) => { c.fillStyle = '#e8e8e8'; c.fillRect(0, 0, w, h); for (let i = 0; i < 18; i++) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(4, i * h / 18 + 3, w - 8, 2) } c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, h / 2 - 2, w, 4) }],
  balusterWood: [32, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#f6f3ec'; c.fillRect(w / 2 - 4, 0, 8, h) }],
  balusterMetal: [32, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#25292d'; c.fillRect(w / 2 - 2, 0, 4, h) }],
  nbBrick: [128, 128, (c, w, h, r) => bayTile(c, w, h, r, { wall: (x, ww, hh) => paintBrick(x, ww, hh, r, { base: '#94503a', mortar: '#bfb3a2', courses: 22, perRow: 7 }) })],
  nbSiding: [128, 128, (c, w, h, r) => bayTile(c, w, h, r, { wall: (x, ww, hh) => paintSiding(x, ww, hh, 14), shutters: '#2b3a33', trim: '#ffffff', lintel: '#ffffff' })],
  nbCommercial: [128, 128, (c, w, h, r) => bayTile(c, w, h, r, { wall: (x, ww, hh) => paintBrick(x, ww, hh, r, { base: '#b99a70', mortar: '#ddd3c1', courses: 22, perRow: 7 }), window: [.7, .55, .28], glass: '#4a5f70' })],
  nbStorefront: [128, 128, (c, w, h, r) => bayTile(c, w, h, r, { wall: (x, ww, hh) => paintStone(x, ww, hh, r, { base: '#a39785', mortar: '#6a6358', rows: 3 }), storefront: true })],
  nbOffice: [128, 128, (c, w, h, r) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#9fb6c8'); g.addColorStop(1, '#4b6175')
    c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = '#5c6670'; c.fillRect(0, h * .78, w, h * .22)
    c.fillStyle = '#d4d8dc'; c.fillRect(0, 0, 4, h); c.fillRect(w / 2 - 2, 0, 4, h * .78); c.fillRect(0, h * .78, w, 3)
    if (r() < .5) { c.fillStyle = 'rgba(255,214,150,.35)'; c.fillRect(6, 6, w / 2 - 10, h * .7) }
  }],
  nbApartment: [128, 128, (c, w, h, r) => bayTile(c, w, h, r, { wall: (x, ww, hh) => paintBrick(x, ww, hh, r, { base: '#8a4a38', mortar: '#bdb2a4', courses: 22, perRow: 7 }), count: 2, window: [.62, .55, .3] })],
  aptFacade: [128, 128, (c, w, h, r) => bayTile(c, w, h, r, { wall: (x, ww, hh) => paintBrick(x, ww, hh, r, { base: '#93503b', mortar: '#c4b8a8', courses: 22, perRow: 7 }), window: [.5, .6, .26], trim: '#3e3226', lintel: '#c9bfae', glass: '#5a6b78' })],
}

/** Lambert materials keyed like `MATERIAL_SPECS`; `highlight(key)` is the teal inspected-building variant. */
export function createBuildingMaterials({ anisotropy = 1, doc = globalThis.document } = {}) {
  const textures = new Map(), materials = new Map(), highlights = new Map()
  const texture = name => {
    if (textures.has(name)) return textures.get(name)
    const [w, h, paint] = PAINTERS[name], canvas = doc.createElement('canvas')
    canvas.width = w; canvas.height = h
    paint(canvas.getContext('2d'), w, h, random(name.length * 7919 + w))
    const t = new CanvasTexture(canvas)
    t.wrapS = t.wrapT = RepeatWrapping
    t.colorSpace = SRGBColorSpace
    t.anisotropy = anisotropy
    textures.set(name, t)
    return t
  }
  const make = (key, highlight) => {
    const look = MATERIAL_LOOKS[key]
    if (!look) throw new Error(`Unknown building material: ${key}`)
    const m = new MeshLambertMaterial({ color: look.color || '#ffffff', vertexColors: true, map: look.texture ? texture(look.texture) : null })
    if (look.emissive) {
      m.emissive.set(look.emissive); m.emissiveIntensity = look.emissiveIntensity ?? 1
      if (look.emissiveTexture) m.emissiveMap = texture(look.emissiveTexture)
    }
    if (look.alphaTest) { m.alphaTest = look.alphaTest; m.side = DoubleSide }
    if (look.offset) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -look.offset }
    if (highlight) { m.color.lerp(new Color(HIGHLIGHT), .6); m.emissive.set('#0f5357'); m.emissiveIntensity = .5; m.emissiveMap = null }
    return m
  }
  const cached = (map, key, highlight) => { if (!map.has(key)) map.set(key, make(key, highlight)); return map.get(key) }
  return {
    get: key => cached(materials, key, false),
    highlight: key => cached(highlights, key, true),
    dispose() {
      for (const m of [...materials.values(), ...highlights.values()]) m.dispose()
      for (const t of textures.values()) t.dispose()
      materials.clear(); highlights.clear(); textures.clear()
    },
  }
}
