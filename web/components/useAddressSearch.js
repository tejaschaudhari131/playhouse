import { useEffect, useMemo, useRef, useState } from 'react'
import { addressQueryKey, createAddressSearchClient, createAddressSearchController } from '../lib/addressSearch.js'

export default function useAddressSearch(manifest, query) {
  const client = useMemo(() => createAddressSearchClient(manifest), [manifest])
  const controller = useRef(null)
  const [state, setState] = useState({ matches: [], total: 0, pending: false, error: null, status: 'idle', query: '' })
  useEffect(() => {
    const active = createAddressSearchController(client, setState)
    controller.current = active
    return () => active.dispose()
  }, [client])
  useEffect(() => { controller.current?.update(query) }, [client, query])
  const retry = () => controller.current?.update(query)
  if (state.query === addressQueryKey(query)) return { ...state, retry }
  // A render with a changed query must not show a prior query's suggestions.
  const plan = client.plan(query)
  return { retry, matches: [], total: 0, pending: plan.status === 'ready', error: null, status: plan.status === 'ready' ? 'loading' : plan.status, query: plan.key }
}
