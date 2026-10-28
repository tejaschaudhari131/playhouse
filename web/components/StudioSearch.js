'use client'

import { useEffect, useId, useRef, useState } from 'react'

/** Closing suggestions never changes the search text or acts on a result. */
export default function StudioSearch({ query, onQuery, matches = [], pending = false, error, onSelect, onSubmit, closeKey, total = matches.length, status, onRetry, neighborhood = null }) {
  const root = useRef(null), input = useRef(null), buttons = useRef([])
  const restoringFocus = useRef(false), pendingFocus = useRef(null)
  const [open, setOpen] = useState(false)
  const resultsId = useId()
  const visible = open && query.trim().length > 1

  useEffect(() => { setOpen(false) }, [closeKey])
  useEffect(() => {
    if (!visible) return
    function outside(event) {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside, true)
    }
  }, [visible])

  useEffect(() => {
    if (!visible || pendingFocus.current === null) return
    const index = pendingFocus.current === 'last' ? matches.length - 1 : 0
    buttons.current[index]?.focus()
    pendingFocus.current = null
  }, [visible, matches.length])

  function returnToInput() {
    // Focus is synchronous: distinguish this restoration from an intentional new visit.
    restoringFocus.current = true
    input.current?.focus({ preventScroll: true })
    restoringFocus.current = false
  }

  function keyDown(event) {
    if (event.key === 'Escape' && visible) {
      event.preventDefault()
      event.stopPropagation()
      pendingFocus.current = null
      setOpen(false)
      returnToInput()
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const fromInput = event.target === input.current
    if (fromInput && event.key === 'Enter') {
      event.preventDefault()
      onSubmit?.(event)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (!matches.length || query.trim().length <= 1) return
    const current = buttons.current.indexOf(event.target)
    if (!fromInput && current < 0) return
    event.preventDefault()
    event.stopPropagation()
    if (!visible) {
      pendingFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
      setOpen(true)
    } else if (fromInput) {
      buttons.current[event.key === 'ArrowUp' ? matches.length - 1 : 0]?.focus()
    } else if (event.key === 'ArrowUp' && current === 0) {
      returnToInput()
    } else {
      buttons.current[Math.min(matches.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))]?.focus()
    }
  }

  function choose(pin) {
    setOpen(false)
    returnToInput()
    onSelect?.(pin)
  }

  return <div ref={root} onKeyDown={keyDown}>
    <label data-tour="site" className="site-search">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/></svg>
      <input ref={input} id="studio-address-search" aria-label="Search Pittsburgh address or parcel ID" placeholder="Search Pittsburgh address or parcel ID…" value={query} aria-controls={visible ? resultsId : undefined}
        onChange={event => { onQuery(event.target.value); setOpen(true) }}
        onFocus={() => { if (!restoringFocus.current) setOpen(true) }} onClick={() => setOpen(true)}/>
    </label>
    {visible && <div id={resultsId} className="search-results" role="region" aria-label="Citywide address results" aria-busy={pending}>
      {matches.length ? <>
        <p>{total} citywide matches{neighborhood ? ` · ${neighborhood} first` : ''}{total > matches.length ? ' · showing six' : ''}</p>
        {matches.map((feature, index) => <button type="button" key={feature.properties.pin} ref={node => { buttons.current[index] = node }} onClick={() => choose(feature.properties.pin)}>{feature.properties.address || feature.properties.pin}<small>{feature.properties.neighborhood} · PIN {feature.properties.pin}</small></button>)}
      </> : <p role="status">{pending ? 'Searching Pittsburgh addresses…' : error || (status === 'pin' ? 'Press Enter to open this parcel ID.' : status === 'short' ? 'Enter at least three letters of a street name, or an exact parcel ID.' : 'No matching address in the city index. Parcels without searchable addresses can still be opened by parcel ID.')}</p>}
      {error && onRetry && <button type="button" onClick={onRetry}>Retry address search</button>}
    </div>}
  </div>
}
