import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyStudioHref } from './legacyExplorerLink.js'

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
test('old parcel bookmarks retain their site without restoring legacy model inputs', () => {
  assert.equal(legacyStudioHref({ pin: '0056f00338000000', weights: 'old' }), '/?from=explorer&pin=0056F00338000000')
  const s = encode({ v: 1, drops: [{ pin: '0056F00338000000', typeId: 'triplex' }], weights: { demand: 100 } })
  assert.equal(legacyStudioHref({ s }), '/?from=explorer&pin=0056F00338000000')
  assert.equal(legacyStudioHref({ pin: 'SITE123', s }), '/?from=explorer&pin=SITE123')
  assert.equal(legacyStudioHref({ s: encode({ v: 1, pin: '0056G00082000000' }) }), '/?from=explorer&pin=0056G00082000000')
})
test('malformed, oversized, repeated and unknown-version bookmarks cannot redirect off site', () => {
  for (const params of [{}, { pin: '//evil.test' }, { pin: ['a', 'b'] }, { s: '!' }, { s: 'a'.repeat(4001) }, { s: encode(null) }, { s: encode({ v: 99, pin: '123' }) }]) {
    assert.equal(legacyStudioHref(params), '/?from=explorer')
  }
})
