import { useEffect, useMemo, useRef, useState } from 'react'
import { addressQueryKey, createAddressSearchClient, createAddressSearchController } from '../lib/addressSearch.js'

export default function useAddressSearch(manifest, query, neighborhood = null) {
  const client = useMemo(() => createAddressSearchClient(manifest, fetch, neighborhood), [manifest, neighborhood])
  const controller = useRef(null), activeClient = useRef(null)
  const [state, setState] = useState({ matches: [], total: 0, pending: false, error: null, status: 'idle', query: '' })
  useEffect(() => {
    const active = createAddressSearchController(client, setState)
    controller.current = active
    activeClient.current = client
    return () => active.dispose()
  }, [client])
  useEffect(() => { controller.current?.update(query) }, [client, query])
  const retry = () => controller.current?.update(query)
  if (activeClient.current === client && state.query === addressQueryKey(query)) return { ...state, retry }
  // A render with a changed query must not show a prior query's suggestions.
  const plan = client.plan(query)
  return { retry, matches: [], total: 0, pending: plan.status === 'ready', error: null, status: plan.status === 'ready' ? 'loading' : plan.status, query: plan.key }
}
