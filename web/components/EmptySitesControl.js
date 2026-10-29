import { useEffect, useId, useRef, useState } from 'react'
import { consumeDismissalPointer } from '../lib/dismissPointer.js'

export default function EmptySitesControl({ enabled, onChange, count, pending, loading, error, zoomedOut }) {
  const root = useRef(null), infoButton = useRef(null), dismissPointer = useRef(null)
  const [showHelp, setShowHelp] = useState(false)
  const helpId = useId(), headingId = `${helpId}-heading`, statusId = `${helpId}-status`

  useEffect(() => () => dismissPointer.current?.(), [])
  useEffect(() => {
    if (!showHelp) return
    function outside(event) {
      if (root.current?.contains(event.target)) return
      if (event.type === 'pointerdown') {
        dismissPointer.current?.()
        dismissPointer.current = consumeDismissalPointer(event, document)
        infoButton.current?.focus({ preventScroll: true })
      }
      setShowHelp(false)
    }
    function escape(event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      setShowHelp(false)
      infoButton.current?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [showHelp])

  return <div ref={root} className="empty-sites-control" role="group" aria-label="Empty sites" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <div className="empty-sites-row">
      <button type="button" className="empty-sites-toggle" aria-label="Highlight empty sites" aria-pressed={enabled} aria-describedby={enabled ? statusId : undefined} onClick={() => onChange(!enabled)}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 7 10-3 6 6-3 10-12-3Z"/><path d="m4 7 7 6 9-3M11 13l-6 4M11 13l6 7"/></svg>
        <span className="empty-sites-copy"><span className="empty-sites-label">Empty sites</span>
          {enabled && <span id={statusId} className="empty-sites-status" role="status">{error ? 'Unavailable' : zoomedOut ? 'Zoom in' : loading || pending ? 'Checking…' : `${count} in view`}</span>}
        </span>
      </button>
      <button ref={infoButton} type="button" className="empty-sites-info-toggle" aria-label="About empty sites" aria-expanded={showHelp} aria-controls={helpId} onClick={() => setShowHelp(value => !value)}><span aria-hidden="true">i</span></button>
    </div>
    {showHelp && <div id={helpId} className="empty-sites-help" role="region" aria-labelledby={headingId} tabIndex={0}>
      <strong id={headingId}>What qualifies?</strong>
      <p>Recorded vacant, no mapped building overlap, and at least one standard housing template fits with a by-right use and no supported zoning conflict.</p>
      <p>Click a highlight to try a fitting template. Highlights use the active site filters, including flood, within visible loaded neighborhoods. The site list includes all matching parcels in the selected area.</p>
      <p>Existing conditions only; unknown checks remain unassessed. Availability, utilities and development approval need review. Unhighlighted parcels may still have options.</p>
      {enabled && loading && <p>Only loaded neighborhoods are screened.</p>}
      {enabled && error && <p role="alert">{error}</p>}
    </div>}
  </div>
}
