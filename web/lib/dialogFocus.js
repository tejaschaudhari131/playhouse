/** Keep Tab inside a native modal even in embedded browsers that visit the page body. */
export function trapDialogTab(event, dialog) {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !dialog) return false
  const candidates = [...dialog.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter(node => {
    if (node.tabIndex < 0 || node.matches(':disabled') || node.closest('[hidden], [inert], [aria-hidden="true"]') || !node.getClientRects().length) return false
    const style = dialog.ownerDocument.defaultView?.getComputedStyle(node)
    return style?.visibility !== 'hidden' && style?.visibility !== 'collapse'
  })
  const first = candidates[0], last = candidates.at(-1)
  const active = dialog.ownerDocument.activeElement
  const outside = !candidates.includes(active)
  const target = !first ? dialog : event.shiftKey ? (outside || active === first ? last : null) : (outside || active === last ? first : null)
  if (!target) return false
  event.preventDefault()
  target.focus({ preventScroll: true })
  return true
}
