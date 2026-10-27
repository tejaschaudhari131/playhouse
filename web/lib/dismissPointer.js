// Closing a floating control must not turn the same gesture into a map click.
// Keep this guard alive after the control closes, only for that pointer sequence.
export function consumeDismissalPointer(start, document) {
  const pointerId = start.pointerId
  const button = start.button ?? 0
  let released = false, timer = null, done = false
  const listeners = []
  const samePointer = event => pointerId == null || event.pointerId == null || event.pointerId === pointerId
  function consume(event) {
    // Do not cancel native touch panning. No wheel, move or touch listeners are used.
    if (event.cancelable && !(event.type.startsWith('pointer') && event.pointerType === 'touch')) event.preventDefault()
    event.stopImmediatePropagation()
  }
  function cleanup() {
    if (done) return
    done = true
    clearTimeout(timer)
    for (const [type, listener] of listeners) document.removeEventListener(type, listener, true)
    document.defaultView?.removeEventListener('blur', cleanup)
  }
  function listen(type, listener) {
    listeners.push([type, listener])
    document.addEventListener(type, listener, true)
  }
  function release(event) {
    if (!samePointer(event)) return
    consume(event)
    released = true
    // Click normally follows pointerup synchronously; allow delayed touch clicks too.
    timer = setTimeout(cleanup, 500)
  }
  function mouse(event) {
    if ((event.button ?? 0) === button) consume(event)
  }
  function click(event) {
    if (event.detail === 0 || !samePointer(event) || (event.button ?? 0) !== button) return
    consume(event)
    cleanup()
  }
  consume(start)
  // The next gesture is always independent, even if the browser omitted a click.
  listen('pointerdown', cleanup)
  listen('pointerup', release)
  listen('pointercancel', event => { if (samePointer(event)) cleanup() })
  listen('mousedown', mouse)
  listen('mouseup', mouse)
  listen('click', click)
  listen('contextmenu', event => {
    if (!samePointer(event)) return
    consume(event)
    if (released) cleanup()
  })
  document.defaultView?.addEventListener('blur', cleanup)
  return cleanup
}
