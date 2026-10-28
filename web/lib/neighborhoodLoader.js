import { collection } from './studioData.js'
import { decodeFeatureTransport } from './featureTransport.js'

export async function fetchDataFile(file, signal, fetcher = fetch) {
  // Only build-generated relative files, never a URL or arbitrary filesystem path.
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.json$/.test(file)) throw new Error('Invalid neighborhood data filename')
  const response = await fetcher(`/data/studio/${file}`, { signal })
  if (!response.ok) throw new Error(`${file}: ${response.status}`)
  const payload = await response.json()
  if (signal?.aborted) throw new DOMException('Neighborhood request cancelled', 'AbortError')
  return decodeFeatureTransport(payload)
}

/** Small parts avoid a single large parse; two in flight prevent decode bursts.
 * Yield between parts so map gestures and loading feedback remain responsive.
 */
export async function loadDataParts(files, signal, fetcher = fetch, concurrency = 2) {
  const result = new Array(files.length)
  let next = 0, failure = null
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (next < files.length && !failure && !signal?.aborted) {
      const index = next++
      try {
        result[index] = await fetchDataFile(files[index], signal, fetcher)
        if (next < files.length) await new Promise(resolve => setTimeout(resolve, 0))
      } catch (error) { failure ||= error }
    }
  }))
  if (signal?.aborted) throw new DOMException('Neighborhood request cancelled', 'AbortError')
  if (failure) throw failure
  return result
}

export async function loadNeighborhood(descriptor, signal, fetcher = fetch, withBuildings = true) {
  if (!descriptor) throw new Error('Neighborhood is not in this release')
  if (descriptor.file) return fetchDataFile(descriptor.file, signal, fetcher)
  const parcels = await loadDataParts(descriptor.parcelFiles, signal, fetcher)
  const [buildings, emptySites] = await Promise.all([
    withBuildings ? loadDataParts(descriptor.buildingFiles, signal, fetcher) : [],
    withBuildings && descriptor.emptySitesFile ? fetchDataFile(descriptor.emptySitesFile, signal, fetcher) : null,
  ])
  return { parcels: collection(parcels.flatMap(c => c.features)), buildings: collection(buildings.flatMap(c => c.features)), emptySites }
}

/** Limit simultaneous parse/download bursts; obsolete camera requests never start queued work. */
export async function loadNeighborhoodBatch(ids, load, signal, onLoad, concurrency = 2) {
  let next = 0
  const errors = []
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
    while (next < ids.length && !signal.aborted) {
      const id = ids[next++]
      try {
        const data = await load(id, signal)
        if (!signal.aborted) onLoad(id, data)
      } catch (error) { if (!signal.aborted) errors.push(error) }
    }
  }))
  return errors
}

export async function locateNeighborhood(manifest, pin, signal, fetcher = fetch) {
  if (!/^[0-9A-Z]{6,24}$/.test(pin || '')) return null
  if (manifest.catalogue) return manifest.neighborhoods.find(n => n.id === manifest.catalogue.find(row => row[0] === pin)?.[2]) || null
  const direct = manifest.neighborhoods.find(n => n.examplePin === pin)
  if (direct) return direct
  const file = manifest.pinLookup[pin.slice(0, 3)]
  if (!file) return null
  const rows = await fetchDataFile(file, signal, fetcher)
  return manifest.neighborhoods.find(n => n.id === rows[pin]) || null
}
