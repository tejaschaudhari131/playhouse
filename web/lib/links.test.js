import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { codeLinkLabel, externalLinkLabel, linkHost, parcelHref } from './links.js'

test('parcel links carry the selected parcel both ways and stay valid without one', () => {
  assert.equal(parcelHref('/explore', '0055D00123000000'), '/explore?pin=0055D00123000000')
  assert.equal(parcelHref('/', ' 12 34 '), '/?pin=12%2034')
  assert.equal(parcelHref('/', null), '/')
  assert.equal(parcelHref('/explore', ''), '/explore')
})

test('new-tab link names are never empty and cite the code section', () => {
  assert.equal(externalLinkLabel('Zoning map ↗'), 'Zoning map (opens in a new tab)')
  assert.equal(externalLinkLabel('   ', 'data.wprdc.org'), 'data.wprdc.org (opens in a new tab)')
  assert.equal(codeLinkLabel('903.03', 'Height (ft)'), 'Pittsburgh Zoning Code §903.03: Height (ft) (opens in a new tab)')
  assert.equal(codeLinkLabel('§911.02'), 'Pittsburgh Zoning Code §911.02 (opens in a new tab)')
  assert.equal(codeLinkLabel(undefined), 'Pittsburgh Zoning Code (opens in a new tab)')
  assert.equal(linkHost('https://www.ura.org/pages/housing'), 'ura.org')
  assert.equal(linkHost('not a url'), '')
})

test('every new-tab link in the components has visible text or an accessible name', () => {
  const dir = new URL('../components/', import.meta.url)
  const missing = []
  for (const file of readdirSync(dir).filter(name => name.endsWith('.js'))) {
    const source = readFileSync(new URL(file, dir), 'utf8')
    for (const match of source.matchAll(/<a\b([^>]*target="_blank"[^>]*)>([\s\S]*?)<\/a>/g)) {
      const [, attributes, body] = match
      if (/aria-label=/.test(attributes)) continue
      const text = body.replace(/\{[^}]*\}/g, '').replace(/<[^>]+>/g, '').replace(/[↗\s·]/g, '')
      if (!text) missing.push(`${file}: ${match[0].slice(0, 80)}`)
    }
  }
  assert.deepEqual(missing, [])
})
