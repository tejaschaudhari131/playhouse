"use client"

import { Children, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { matchingOption, optionIndex, selectMenuPosition } from '../lib/selectMenu.js'
import { consumeDismissalPointer } from '../lib/dismissPointer.js'

function textContent(children) {
  return Children.toArray(children).map(child => typeof child === 'object' ? textContent(child.props?.children) : child).join('')
}

// A DOM listbox keeps the same click-to-open behavior in desktop and embedded browsers.
export default function Select({ children, value, onChange, disabled = false, className = '', id, ...props }) {
  const generatedId = useId()
  const controlId = id || `select-${generatedId}`
  const menuId = `${controlId}-options`
  const options = useMemo(() => Children.toArray(children).filter(child => child?.type === 'option').map(child => ({
    value: String(child.props.value ?? textContent(child.props.children)),
    text: textContent(child.props.children),
    label: child.props.children,
    disabled: !!child.props.disabled,
  })), [children])
  const selected = options.findIndex(option => option.value === String(value ?? ''))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [position, setPosition] = useState(null)
  const trigger = useRef(null), menu = useRef(null), search = useRef({ text: '', time: 0 })
  const dismissPointer = useRef(null)
  const inactive = disabled || !options.some(option => !option.disabled)
  const activeIndex = options[active] && !options[active].disabled ? active : optionIndex(options, -1, 'first')

  function close() { setOpen(false); search.current = { text: '', time: 0 } }
  function show(index = selected) {
    if (inactive) return
    setActive(options[index] && !options[index].disabled ? index : optionIndex(options, -1, 'first'))
    setOpen(true)
  }
  function choose(index) {
    const option = options[index]
    if (!option || option.disabled) return
    close()
    trigger.current?.focus({ preventScroll: true })
    if (option.value !== String(value ?? '')) onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } })
  }

  useEffect(() => { if (inactive) close() }, [inactive])
  useEffect(() => { if (open) setActive(selected) }, [value])
  useEffect(() => () => dismissPointer.current?.(), [])

  useLayoutEffect(() => {
    if (!open) { setPosition(null); return }
    let frame = 0
    function positionMenu() {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const viewport = window.visualViewport || { width: window.innerWidth, height: window.innerHeight }
      const height = Math.min(320, menu.current?.scrollHeight || 320)
      setPosition(selectMenuPosition(rect, viewport, height))
    }
    function moved(event) {
      // Window and VisualViewport resize events do not target a DOM Node.
      if (event.target instanceof Node && menu.current?.contains(event.target)) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(positionMenu)
    }
    function outside(event) {
      if (trigger.current?.contains(event.target) || menu.current?.contains(event.target)) return
      if (event.type === 'pointerdown') {
        dismissPointer.current?.()
        dismissPointer.current = consumeDismissalPointer(event, document)
        trigger.current?.focus({ preventScroll: true })
      }
      close()
    }
    positionMenu()
    const observer = new ResizeObserver(positionMenu)
    observer.observe(trigger.current)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside, true)
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', moved)
    window.visualViewport?.addEventListener('resize', moved)
    window.visualViewport?.addEventListener('scroll', moved)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside, true)
      window.removeEventListener('scroll', moved, true)
      window.removeEventListener('resize', moved)
      window.visualViewport?.removeEventListener('resize', moved)
      window.visualViewport?.removeEventListener('scroll', moved)
    }
  }, [open, options.length])

  useEffect(() => {
    if (open && position) menu.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, !!position])

  function keyDown(event) {
    const key = event.key
    if (key === 'Tab') { trigger.current?.focus({ preventScroll: true }); close(); return }
    if (key === 'Escape') {
      if (open) { event.preventDefault(); event.stopPropagation(); trigger.current?.focus({ preventScroll: true }); close() }
      return
    }
    if (inactive || event.altKey || event.ctrlKey || event.metaKey) return
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault()
      const direction = key === 'Home' ? 'first' : key === 'End' ? 'last' : key === 'ArrowDown' ? 1 : -1
      if (open) setActive(optionIndex(options, activeIndex, direction))
      else show(typeof direction === 'string' ? optionIndex(options, -1, direction) : selected)
    } else if (key === 'Enter' || (key === ' ' && (!search.current.text || Date.now() - search.current.time >= 700))) {
      event.preventDefault()
      if (open) choose(activeIndex)
      else show()
    } else if (key.length === 1) {
      event.preventDefault()
      const now = Date.now()
      const query = (now - search.current.time < 700 ? search.current.text : '') + key
      const repeated = [...query].every(character => character === query[0])
      const match = matchingOption(options, repeated ? key : query, open ? activeIndex : selected, repeated)
      search.current = { text: query, time: now }
      if (match >= 0) { setActive(match); setOpen(true) }
    }
  }

  return <>
    <button {...props} ref={trigger} id={controlId} type="button" role="combobox" className={`select-control ${className}`} disabled={inactive}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-activedescendant={open && activeIndex >= 0 ? `${menuId}-${activeIndex}` : undefined}
      onClick={event => { event.stopPropagation(); if (open) close(); else show() }} onKeyDown={keyDown}>
      <span>{options[selected]?.label ?? 'Choose an option'}</span><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
    </button>
    {open && createPortal(<div ref={menu} id={menuId} role="listbox" tabIndex={-1} aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby'] || (!props['aria-label'] ? controlId : undefined)}
      aria-activedescendant={activeIndex >= 0 ? `${menuId}-${activeIndex}` : undefined} className="select-menu" style={position ? position : { visibility: 'hidden' }} onKeyDown={keyDown} onClick={event => event.stopPropagation()}>
      {options.map((option, index) => <div key={option.value} id={`${menuId}-${index}`} role="option" aria-selected={index === selected} aria-disabled={option.disabled || undefined}
        className={`select-option${index === activeIndex ? ' active' : ''}`} onPointerDown={event => event.preventDefault()}
        onPointerMove={() => { if (!option.disabled) setActive(index) }} onClick={() => choose(index)}>
        <span>{option.label}</span><span className="select-check" aria-hidden="true">{index === selected ? '✓' : ''}</span>
      </div>)}
    </div>, document.body)}
  </>
}
