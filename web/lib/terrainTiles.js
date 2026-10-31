import { TERRAIN_MAX_ZOOM, TERRAIN_TILES, createSampler, decodeTile, tileKey, tilesForBounds } from './terrain.js'

/** At most this many z15 tiles (about 1.2 km × 1.2 km at Pittsburgh) are requested per call. */
export const MAX_TILES_PER_LOAD = 16

async function decodePng(blob) {
  const bitmap = await createImageBitmap(blob)
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(bitmap.width, bitmap.height) : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return decodeTile(ctx.getImageData(0, 0, 256, 256).data)
}

/**
 * Browser cache of decoded Terrarium tiles. `load(bounds)` resolves to `{ ok, failed }`; failed tiles are remembered
 * and simply leave the sampler without data, so every caller falls back to flat ground.
 */
export function createTerrainTiles({ url = TERRAIN_TILES, zoom = TERRAIN_MAX_ZOOM, fetchTile = fetch } = {}) {
  const tiles = new Map(), pending = new Map()
  const tileAt = (z, x, y) => { const t = tiles.get(tileKey(z, x, y)); return t instanceof Float32Array ? t : null }
  const sampler = createSampler(tileAt, zoom)
  function request({ z, x, y }) {
    const key = tileKey(z, x, y)
    if (tiles.has(key)) return Promise.resolve(tiles.get(key) !== 'error')
    if (pending.has(key)) return pending.get(key)
    const promise = fetchTile(url.replace('{z}', z).replace('{x}', x).replace('{y}', y), { mode: 'cors' })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.blob() })
      .then(decodePng)
      .then(values => { tiles.set(key, values); return true })
      .catch(() => { tiles.set(key, 'error'); return false })
      .finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }
  async function load(bounds) {
    const wanted = tilesForBounds(bounds, zoom)
    if (wanted.length > MAX_TILES_PER_LOAD) return { ok: false, failed: 0, total: wanted.length, tooLarge: true }
    const results = await Promise.all(wanted.map(request))
    const failed = results.filter(r => !r).length
    return { ok: failed === 0, failed, total: wanted.length }
  }
  return { load, sampler, tileAt }
}
