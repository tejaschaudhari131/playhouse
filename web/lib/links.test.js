import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { codeLinkLabel, externalLinkLabel, linkHost } from './links.js'

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
