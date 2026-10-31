import test from 'node:test'
import assert from 'node:assert/strict'
import { SLOPE_CLASSES, slopeClass, decodeTerrarium, decodeTile, worldPixel, tilesForBounds, createSampler, hornSlope, slopeAt, parcelTerrain, elevationGrid, contourSegments, stitchSegments, contourFeatures, formatElevation, clampBounds, TERRAIN_TILES } from './terrain.js'
import { createTerrainTiles, MAX_TILES_PER_LOAD } from './terrainTiles.js'
import { rectangleAt } from './plannerGeometry.js'

const near = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`)
const site = [-79.94, 40.44]
const Z = 15
const pixelMetres = 156543.03392 * Math.cos(site[1] * Math.PI / 180) / 2 ** Z
const origin = worldPixel(site[0], site[1], Z)

/** Synthetic tiles on a tilted plane: `east` and `south` metres of rise per metre, offset by `base` metres. */
function planeTiles({ east = 0, south = 0, base = 250, missing = () => false } = {}) {
  const cache = new Map()
  return (z, x, y) => {
    if (missing(x, y)) return null
    const key = `${x}/${y}`
    if (!cache.has(key)) {
      const tile = new Float32Array(256 * 256)
      for (let r = 0; r < 256; r++) for (let c = 0; c < 256; c++) {
        const gx = x * 256 + c + .5 - origin[0], gy = y * 256 + r + .5 - origin[1]
        tile[r * 256 + c] = base + (gx * east + gy * south) * pixelMetres
      }
      cache.set(key, tile)
    }
    return cache.get(key)
  }
}

test('Terrarium decoding: (R × 256 + G + B / 256) − 32768 metres', () => {
  assert.equal(decodeTerrarium(128, 0, 0), 0)
  assert.equal(decodeTerrarium(129, 44, 0), 300)
  assert.equal(decodeTerrarium(127, 255, 128), -.5)
  const rgba = new Uint8ClampedArray(256 * 256 * 4)
  rgba.set([129, 44, 128, 255], 0)
  assert.equal(decodeTile(rgba)[0], 300.5)
})

test('tile maths: Web Mercator pixels and the tiles covering a site', () => {
  assert.deepEqual(worldPixel(0, 0, 0), [128, 128])
  const [x, y] = worldPixel(site[0], site[1], Z).map(v => Math.floor(v / 256))
  assert.deepEqual(tilesForBounds([site[0], site[1], site[0], site[1]], Z), [{ z: Z, x, y }])
  const block = tilesForBounds([site[0] - .01, site[1] - .01, site[0] + .01, site[1] + .01], Z)
  assert.ok(block.length >= 6 && block.length <= 16, `${block.length} tiles for about 1.7 × 2.2 km`)
  assert.ok(block.some(t => t.x === x && t.y === y))
  assert.equal(new Set(block.map(t => `${t.x}/${t.y}`)).size, block.length)
  const wide = clampBounds([-80.1, 40.3, -79.8, 40.6], 1500)
  near((wide[3] - wide[1]) * 111320, 1500, 1, 'clamped height')
  near((wide[0] + wide[2]) / 2, -79.95, 1e-9, 'stays centred')
  assert.ok(tilesForBounds(wide, Z).length <= MAX_TILES_PER_LOAD, 'a clamped view fits one load')
  assert.deepEqual(clampBounds([site[0], site[1], site[0] + .001, site[1] + .001]), [site[0], site[1], site[0] + .001, site[1] + .001], 'small bounds unchanged')
  assert.equal(clampBounds(null), null)
  assert.match(TERRAIN_TILES, /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\/\{z\}\/\{x\}\/\{y\}\.png$/)
})

test('Horn slope: rise over run × 100 on planes, zero on flat ground', () => {
  const plane = (gx, gy) => [1, 0, -1].map(r => [-1, 0, 1].map(c => gx * c * 4 + gy * r * 4))
  near(hornSlope(plane(.2, 0), 4), 20, 1e-9, 'east-facing 20%')
  near(hornSlope(plane(0, .3), 4), 30, 1e-9, 'north-facing 30%')
  near(hornSlope(plane(.3, .4), 4), 50, 1e-9, 'diagonal 3-4-5')
  assert.equal(hornSlope([[5, 5, 5], [5, 5, 5], [5, 5, 5]], 4), 0)
  near(hornSlope([[1, 2, 3], [1, 2, 3], [1, 2, 3]], 1), 100, 1e-9, '45° is 100%')
})

test('slope classes: under 15%, 15–25% steep and 25%+ very steep', () => {
  assert.deepEqual(SLOPE_CLASSES.map(c => c.id), ['gentle', 'steep', 'very-steep'])
  assert.equal(slopeClass(0).id, 'gentle')
  assert.equal(slopeClass(14.99).id, 'gentle')
  assert.equal(slopeClass(15).id, 'steep')
  assert.equal(slopeClass(24.99).id, 'steep')
  assert.equal(slopeClass(25).id, 'very-steep')
  assert.equal(slopeClass(140).id, 'very-steep')
  assert.equal(slopeClass(NaN), null)
  assert.equal(slopeClass(null), null)
})

test('the sampler interpolates between pixels and reports slope from real tile data', () => {
  const sampler = createSampler(planeTiles({ east: .18 }), Z)
  const z0 = sampler(site[0], site[1]), z1 = sampler(site[0] + 10 / (111320 * Math.cos(site[1] * Math.PI / 180)), site[1])
  near(z1 - z0, 1.8, .05, '18% over 10 m east')
  near(slopeAt(sampler, ...site), 18, .5, 'Horn slope at the site')
  const flat = createSampler(planeTiles(), Z)
  near(slopeAt(flat, ...site), 0, 1e-6, 'flat')
  near(flat(...site), 250, 1e-3, 'base elevation')
})

test('parcel terrain: mean, range, typical slope and steep shares; null when tiles are missing', () => {
  const lot = rectangleAt(site, 20, 30)
  const steep = parcelTerrain(createSampler(planeTiles({ south: -.3 }), Z), lot)
  near(steep.typical, 30, 1, 'typical slope')
  assert.equal(steep.class, 'very-steep')
  assert.equal(steep.verySteepShare, 1)
  near(steep.maxElevation - steep.minElevation, .3 * 30, 2, 'range across the lot depth')
  assert.ok(steep.samples >= 15)
  const gentle = parcelTerrain(createSampler(planeTiles({ east: .08 }), Z), lot)
  assert.equal(gentle.class, 'gentle')
  assert.equal(gentle.steepShare, 0)
  assert.equal(parcelTerrain(createSampler(planeTiles({ missing: () => true }), Z), lot), null, 'DEM unavailable')
  assert.equal(parcelTerrain(createSampler(planeTiles(), Z), null), null)
})

test('contours: marching squares, stitched into one line per level on a plane', () => {
  const grid = { west: 0, north: 1, dLon: .1, dLat: .1, cols: 6, rows: 4, values: Float32Array.from({ length: 24 }, (_, i) => i % 6) }
  const segments = contourSegments(grid, 2.5)
  assert.equal(segments.length, 3, 'one crossing per row of cells')
  for (const point of segments.flat()) near(point[0], 2.5, 1e-6, 'crossing column')
  assert.equal(stitchSegments(segments).length, 1)
  assert.equal(stitchSegments(segments)[0].length, 4)
  const features = contourFeatures(grid, { interval: 1, indexEvery: 5 })
  assert.deepEqual(features.map(f => f.properties.elevation), [1, 2, 3, 4, 5], 'the grid minimum itself has no crossing')
  assert.equal(features.find(f => f.properties.elevation === 5).properties.index, true)
  assert.equal(features.find(f => f.properties.elevation === 2).properties.label, '2 m')
  const saddle = { cols: 2, rows: 2, values: Float32Array.from([1, 0, 0, 1]) }
  assert.equal(contourSegments(saddle, .5).length, 2, 'saddle cells get two segments')
  assert.deepEqual(contourFeatures(null), [])
})

test('elevation grid follows the sampler and gives up when a tile is missing', () => {
  const sampler = createSampler(planeTiles({ east: .1 }), Z)
  const bounds = [site[0] - .001, site[1] - .001, site[0] + .001, site[1] + .001]
  const grid = elevationGrid(sampler, bounds, 20)
  assert.ok(grid.cols >= 8 && grid.rows >= 11)
  assert.ok(grid.values[grid.cols - 1] > grid.values[0], 'rises to the east')
  assert.equal(elevationGrid(createSampler(planeTiles({ missing: () => true }), Z), bounds, 20), null)
})

test('the tile cache survives a DEM outage: failures resolve, leave no data and are not retried', async () => {
  let calls = 0
  const tiles = createTerrainTiles({ fetchTile: async () => { calls++; throw new Error('offline') } })
  const bounds = [site[0], site[1], site[0], site[1]]
  assert.deepEqual(await tiles.load(bounds), { ok: false, failed: 1, total: 1 })
  assert.equal(tiles.sampler(...site), null)
  await tiles.load(bounds)
  assert.equal(calls, 1, 'a failed tile is remembered')
  const notFound = createTerrainTiles({ fetchTile: async () => ({ ok: false, status: 404 }) })
  assert.equal((await notFound.load(bounds)).ok, false)
  const huge = await tiles.load([-80.1, 40.3, -79.8, 40.6])
  assert.equal(huge.tooLarge, true, `more than ${MAX_TILES_PER_LOAD} tiles is refused`)
  assert.equal(formatElevation(300), '300 m (984 ft)')
  assert.equal(formatElevation(null), '—')
})
