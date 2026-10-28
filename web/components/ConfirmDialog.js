import { useEffect, useRef } from 'react'

export default function ConfirmDialog({ title, children, actionLabel, onConfirm, onClose, busy = false }) {
  const dialog = useRef(null), cancel = useRef(null)
  useEffect(() => {
    const previous = document.activeElement, node = dialog.current
    node.showModal(); cancel.current?.focus()
    return () => { node.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className="plan-confirm" aria-labelledby="plan-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onClick={event => { if (!busy && event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose() } }}>
    <h2 id="plan-confirm-title">{title}</h2>{children}
    <div className="placement-actions"><button ref={cancel} disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy} onClick={onConfirm}>{busy ? 'Loading scenario…' : actionLabel}</button></div>
  </dialog>
}
