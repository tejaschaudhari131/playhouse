import test from 'node:test'
import assert from 'node:assert/strict'
import { consumeDismissalPointer } from './dismissPointer.js'

function setup() {
  const listeners = new Map()
  const document = {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener) },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener) },
    dispatch(event) { for (const listener of [...(listeners.get(event.type) || [])]) { listener(event); if (event.stopped) break } },
  }
  const count = () => [...listeners.values()].reduce((total, handlers) => total + handlers.size, 0)
  return { document, count }
}
function event(type, extra = {}) {
  return { type, pointerId: 1, pointerType: 'mouse', button: 0, detail: 1, cancelable: true,
    preventDefault() { this.defaultPrevented = true }, stopImmediatePropagation() { this.stopped = true }, ...extra }
}

test('outside dismissal consumes the map pointer, compatibility mouse and click events, then releases the next click', () => {
  const { document, count } = setup()
  const start = event('pointerdown')
  consumeDismissalPointer(start, document)
  assert.equal(start.stopped, true)
  assert.equal(start.defaultPrevented, true)
  for (const type of ['mousedown', 'pointerup', 'mouseup', 'click']) {
    const next = event(type)
    document.dispatch(next)
    assert.equal(next.stopped, true, type)
  }
  assert.equal(count(), 0)
  const nextClick = event('click')
  document.dispatch(nextClick)
  assert.equal(nextClick.stopped, undefined)
})

test('touch cancellation preserves native scrolling and removes all gesture handlers', () => {
  const { document, count } = setup()
  const touch = event('pointerdown', { pointerType: 'touch' })
  consumeDismissalPointer(touch, document)
  assert.equal(touch.defaultPrevented, undefined)
  for (const type of ['pointermove', 'touchmove', 'wheel']) {
    const move = event(type, { pointerType: 'touch' })
    document.dispatch(move)
    assert.equal(move.stopped, undefined)
    assert.equal(move.defaultPrevented, undefined)
  }
  document.dispatch(event('pointercancel', { pointerType: 'touch' }))
  assert.equal(count(), 0)
})

test('a second gesture is usable when the first gesture had no click, and keyboard activation is not consumed', () => {
  const { document, count } = setup()
  consumeDismissalPointer(event('pointerdown'), document)
  const keyboard = event('click', { detail: 0 })
  document.dispatch(keyboard)
  assert.equal(keyboard.stopped, undefined)
  const otherPointer = event('pointerup', { pointerId: 2 })
  document.dispatch(otherPointer)
  assert.equal(otherPointer.stopped, undefined)
  const nextDown = event('pointerdown')
  document.dispatch(nextDown)
  assert.equal(nextDown.stopped, undefined)
  assert.equal(count(), 0)
})

test('pointer release without a click expires the guard', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const { document, count } = setup()
  consumeDismissalPointer(event('pointerdown'), document)
  document.dispatch(event('pointerup'))
  assert.ok(count() > 0)
  context.mock.timers.tick(500)
  assert.equal(count(), 0)
})
