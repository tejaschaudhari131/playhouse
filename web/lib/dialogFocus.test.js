import test from 'node:test'
import assert from 'node:assert/strict'
import { trapDialogTab } from './dialogFocus.js'

function fixture() {
  const doc = { activeElement: null, defaultView: { getComputedStyle: node => ({ visibility: node.visibility || 'visible' }) } }
  const button = (options = {}) => ({ tabIndex: 0, matches: () => false, closest: () => null, getClientRects: () => [{}], focus() { doc.activeElement = this }, ...options })
  const print = button(), close = button(), hidden = button({ visibility: 'hidden' }), disabled = button({ matches: () => true })
  const dialog = { ownerDocument: doc, querySelectorAll: () => [print, close, hidden, disabled], focus() { doc.activeElement = this } }
  const key = (shiftKey = false) => ({ key: 'Tab', shiftKey, prevented: false, preventDefault() { this.prevented = true } })
  return { doc, print, close, dialog, key }
}

test('Tab and Shift+Tab wrap between visible enabled dialog controls', () => {
  const { doc, print, close, dialog, key } = fixture()
  doc.activeElement = close
  const forward = key()
  assert.equal(trapDialogTab(forward, dialog), true)
  assert.equal(forward.prevented, true)
  assert.equal(doc.activeElement, print)
  const backward = key(true)
  assert.equal(trapDialogTab(backward, dialog), true)
  assert.equal(doc.activeElement, close)
})

test('focus on the dialog or page body returns to its controls; normal inner Tab is unchanged', () => {
  const { doc, print, close, dialog, key } = fixture()
  doc.activeElement = dialog
  trapDialogTab(key(), dialog)
  assert.equal(doc.activeElement, print)
  doc.activeElement = { name: 'body' }
  trapDialogTab(key(true), dialog)
  assert.equal(doc.activeElement, close)
  doc.activeElement = print
  const forward = key()
  assert.equal(trapDialogTab(forward, dialog), false)
  assert.equal(forward.prevented, false)
})

test('browser shortcuts are untouched and a dialog without controls retains focus', () => {
  const { doc, dialog, key } = fixture()
  const browserShortcut = { ...key(), ctrlKey: true }
  assert.equal(trapDialogTab(browserShortcut, dialog), false)
  assert.equal(browserShortcut.prevented, false)
  dialog.querySelectorAll = () => []
  assert.equal(trapDialogTab(key(), dialog), true)
  assert.equal(doc.activeElement, dialog)
})
