import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeFeatureTransport, encodeFeatureTransport } from './featureTransport.js'

const collection = { type: 'FeatureCollection', provenance: { date: '2026-09-25' }, features: [
  { type: 'Feature', id: 'same-site-1', geometry: { type: 'Polygon', coordinates: [[[-79.960001, 40.450001], [-79.960002, 40.450002], [-79.960003, 40.450003], [-79.960001, 40.450001]]] }, properties: { pin: '1', empty: null, zero: 0, false: false, blank: '', scores: { capacity: 100, demand: 51.5 }, evidence: ['same', 'source'] } },
  { type: 'Feature', id: 'same-site-2', geometry: null, properties: { pin: '2', zero: 0, false: false, scores: { capacity: 100, demand: 51.5 }, evidence: ['same', 'source'] } },
] }

test('dictionary transport round-trips every coordinate, ID, property and missing-vs-null distinction', () => {
  const original = structuredClone(collection)
  const encoded = encodeFeatureTransport(collection)
  const decoded = decodeFeatureTransport(JSON.parse(JSON.stringify(encoded)))
  assert.deepEqual(decoded, collection)
  assert.deepEqual(collection, original, 'encoding must never decorate or mutate canonical evidence')
  assert.ok(Object.hasOwn(decoded.features[0].properties, 'empty'))
  assert.ok(!Object.hasOwn(decoded.features[1].properties, 'empty'))
  assert.equal(encoded.propertyValues[encoded.propertyKeys.indexOf('scores')].length, 1)
})

test('legacy GeoJSON is accepted and malformed dictionaries fail closed', () => {
  assert.equal(decodeFeatureTransport(collection), collection)
  const invalid = encodeFeatureTransport(collection)
  invalid.features[0].properties[0] = 99999
  assert.throws(() => decodeFeatureTransport(invalid), /reference/)
  assert.throws(() => decodeFeatureTransport({ ...invalid, propertyValues: [] }), /dictionary/)
})

test('representative shared evidence reduces uncompressed JSON bytes without changing evidence', () => {
  const evidence = { type: 'FeatureCollection', features: Array.from({ length: 300 }, (_, i) => ({ ...collection.features[0], id: `site-${i}`, properties: { ...collection.features[0].properties, pin: `${i}` } })) }
  const original = JSON.stringify(evidence), compact = JSON.stringify(encodeFeatureTransport(evidence))
  assert.ok(compact.length < original.length * .75)
  assert.deepEqual(decodeFeatureTransport(JSON.parse(compact)), evidence)
})
