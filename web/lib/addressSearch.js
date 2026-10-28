export const ADDRESS_PREFIX_LENGTH = 3
export const ADDRESS_RESULT_LIMIT = 6
const aliases = { avenue: 'ave', street: 'st', road: 'rd', boulevard: 'blvd', drive: 'dr', lane: 'ln', place: 'pl', court: 'ct', circle: 'cir', terrace: 'ter', trail: 'trl', highway: 'hwy' }
const generic = new Set([...Object.keys(aliases), ...Object.values(aliases), 'way', 'apt', 'unit'])
const validHash = /^[a-f0-9]{16}$/
const empty = (status, query = '') => ({ matches: [], total: 0, pending: false, error: null, status, query })

export function addressTokens(value) {
  return (String(value || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().match(/[a-z0-9]+/g) || []).map(token => aliases[token] || token)
}

const searchableTokens = tokens => [...new Set(tokens.filter(token => token.length >= ADDRESS_PREFIX_LENGTH && !generic.has(token)))]
export const addressQueryKey = query => addressTokens(String(query || '').slice(0, 120)).join(' ')
export const isParcelSearch = query => /^(?:[0-9]{4}[A-Z][0-9A-Z]{10,15}|SITE[0-9A-F]{16})$/i.test(String(query || '').trim())

/** Each row is only [PIN, original address, neighborhood ID]; no geometry or scores. */
export function partitionAddressRows(rows) {
  const shards = new Map(), seen = new Set()
  let addressed = 0, indexed = 0, missingAddress = 0, unsearchable = 0
  for (const row of rows) {
    if (seen.has(row[0])) throw new Error(`Duplicate address parcel ${row[0]}`)
    seen.add(row[0])
    if (!row[1]?.trim()) { missingAddress++; continue }
    addressed++
    const prefixes = new Set(searchableTokens(addressTokens(row[1])).map(token => token.slice(0, ADDRESS_PREFIX_LENGTH)))
    if (!prefixes.size) { unsearchable++; continue }
    indexed++
    for (const prefix of prefixes) {
      if (!shards.has(prefix)) shards.set(prefix, [])
      shards.get(prefix).push(row)
    }
  }
  for (const records of shards.values()) records.sort((a, b) => a[0].localeCompare(b[0]))
  return { shards, addressed, indexed, missingAddress, unsearchable }
}

export function addressSearchPlan(manifest, query) {
  const key = addressQueryKey(query), tokens = addressTokens(key)
  if (!key) return { status: 'idle', key }
  if (isParcelSearch(key)) return { status: 'pin', key }
  const words = searchableTokens(tokens)
  if (!words.length) return { status: 'short', key }
  if (manifest?.addressSearch?.version !== 1) return { status: 'unavailable', key }
  const prefixes = [...new Set(words.map(word => word.slice(0, ADDRESS_PREFIX_LENGTH)))]
  // An absent meaningful prefix cannot match an indexed address.
  if (prefixes.some(prefix => !manifest.addressSearch.shards[prefix])) return { status: 'empty', key }
  const [prefix, descriptor] = prefixes.map(prefix => [prefix, manifest.addressSearch.shards[prefix]])
    .sort((a, b) => a[1][1] - b[1][1] || a[0].localeCompare(b[0]))[0]
  if (!Array.isArray(descriptor) || !validHash.test(descriptor[0])) return { status: 'unavailable', key }
  return { status: 'ready', key, tokens, file: `addresses-${prefix}.${descriptor[0]}.json` }
}

export function searchAddressRows(rows, tokens, neighborhoods, limit = ADDRESS_RESULT_LIMIT, currentNeighborhood = null) {
  const names = new Map(neighborhoods.map(n => [n.id, n.name]))
  const matches = rows.flatMap(row => {
    if (!Array.isArray(row) || row.length !== 3 || !row.every(value => typeof value === 'string') || !names.has(row[2])) throw new Error('The address search index could not be read.')
    const words = addressTokens(row[1])
    if (!tokens.every(token => words.some(word => word.startsWith(token)))) return []
    return [{ row, local: row[2] === currentNeighborhood || names.get(row[2]) === currentNeighborhood, exact: tokens.filter(token => words.includes(token)).length }]
  }).sort((a, b) => Number(b.local) - Number(a.local) || b.exact - a.exact || a.row[1].localeCompare(b.row[1], undefined, { numeric: true }) || a.row[0].localeCompare(b.row[0]))
  return { total: matches.length, matches: matches.slice(0, limit).map(({ row: [pin, address, id] }) => ({ id, properties: { pin, address, neighborhood: names.get(id) } })) }
}

/** Fetch a single prefix shard only after a useful query; cache a small recent set. */
export function createAddressSearchClient(manifest, fetcher = fetch, currentNeighborhood = null) {
  const cache = new Map()
  return {
    plan: query => addressSearchPlan(manifest, query),
    async search(query, signal) {
      const plan = addressSearchPlan(manifest, query)
      if (plan.status !== 'ready') return empty(plan.status, plan.key)
      let rows = cache.get(plan.file)
      if (!rows) {
        const response = await fetcher(`/data/studio/${plan.file}`, { signal })
        if (!response.ok) throw new Error('Address search could not load. Try again.')
        rows = await response.json()
        if (!Array.isArray(rows)) throw new Error('The address search index could not be read.')
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      }
      const result = searchAddressRows(rows, plan.tokens, manifest.neighborhoods, ADDRESS_RESULT_LIMIT, currentNeighborhood)
      cache.delete(plan.file); cache.set(plan.file, rows)
      if (cache.size > 8) cache.delete(cache.keys().next().value)
      return { ...empty(result.total ? 'ready' : 'empty', plan.key), ...result }
    },
  }
}

/** Debounce and revision checks are shared by the hook and deterministic race tests. */
export function createAddressSearchController(client, publish, { delay = 250, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let revision = 0, timer = null, controller = null, closed = false
  function stop() { if (timer !== null) cancel(timer); timer = null; controller?.abort(); controller = null }
  return {
    update(query) {
      if (closed) return
      stop()
      const own = ++revision, plan = client.plan(query)
      if (plan.status !== 'ready') {
        publish({ ...empty(plan.status, plan.key), error: plan.status === 'unavailable' ? 'Citywide address search is unavailable. You can still choose a neighborhood or enter an exact parcel ID.' : null })
        return
      }
      publish({ ...empty('loading', plan.key), pending: true })
      controller = new AbortController()
      const signal = controller.signal
      timer = schedule(async () => {
        timer = null
        try {
          const result = await client.search(query, signal)
          if (!closed && own === revision && !signal.aborted) publish(result)
        } catch (error) {
          if (!closed && own === revision && !signal.aborted) publish({ ...empty('error', plan.key), error: error.message || 'Address search failed. Try again.' })
        }
      }, delay)
    },
    dispose() { closed = true; revision++; stop() },
  }
}
