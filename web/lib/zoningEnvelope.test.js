import test from 'node:test'
import assert from 'node:assert/strict'
import { envelopeHeight, setbackPad, envelopeFeatures } from './zoningEnvelope.js'
import { districtStandards } from './titleNineRules.js'
import { localFrame, signedArea, segmentDistance } from './localFrame.js'
import { rectangleAt } from './plannerGeometry.js'

const ORIGIN = [-79.94, 40.41]
const FT = .3048

test('only the Affordable Housing Bonus raises the envelope, and only for 4+ home types in bonus districts', () => {
  const current = envelopeHeight('RM-M', 'current', 'small_apartment')
  assert.equal(current.heightFt, 55)
  assert.match(current.text, /55 ft \(§ 903\.03\) · Current Code/)
  const bill = envelopeHeight('RM-M', 'bill-2025-1545', 'small_apartment')
  assert.equal(bill.heightFt, 85)
  assert.equal(bill.bonusFt, 30)
  assert.ok(Math.abs(bill.heightM - 85 * FT) < 1e-9)
  assert.match(bill.text, /\+ 30 ft Affordable Housing Bonus .*50% AMI.*pending/)
  assert.equal(envelopeHeight('RM-M', 'bill-2025-1545', 'triplex').bonusFt, 0, 'three homes are below the bonus minimum')
  assert.equal(envelopeHeight('R1D-L', 'bill-2025-1545', 'small_apartment').bonusFt, 0, 'R1D is not a bonus district')
  for (const preset of ['missing-middle', 'by-right']) {
    const e = envelopeHeight('RM-M', preset, 'small_apartment')
    assert.equal(e.heightFt, 55)
    assert.match(e.text, /unchanged by/)
  }
  assert.equal(envelopeHeight('XYZ', 'current', 'triplex'), null, 'no adopted standards, no envelope')
})

test('setback pad: narrow ends lose the larger front/rear yard, long sides the interior side yard', () => {
  const lot = rectangleAt(ORIGIN, 12, 36)
  const yards = districtStandards('R1D-L').yards
  const { pad, endFt, sideFt } = setbackPad(lot, yards)
  assert.deepEqual([endFt, sideFt], [30, 5])
  const width = 12 - 2 * 5 * FT, depth = 36 - 2 * 30 * FT
  assert.ok(Math.abs(signedArea(pad) - width * depth) < .2, `pad ${signedArea(pad)} vs ${width * depth}`)
  const rotated = { type: 'Polygon', coordinates: [lot.coordinates[0].map(([x, y]) => [ORIGIN[0] + (y - ORIGIN[1]) * 1.316, ORIGIN[1] - (x - ORIGIN[0]) / 1.316])] }
  const turned = setbackPad(rotated, yards)
  assert.ok(turned.pad && Math.abs(signedArea(turned.pad) - width * depth) < .5, 'the long axis is found at any orientation')
  assert.equal(setbackPad(rectangleAt(ORIGIN, 12, 16), yards).pad, null, 'a shallow lot has no pad that clears 30 ft at both ends')
  assert.equal(setbackPad(lot, null), null)
})

test('envelope features: ground pad, a post per corner and a top frame at the limit; a grey frame marks Current Code', () => {
  const lot = rectangleAt(ORIGIN, 14, 40)
  const yards = districtStandards('RM-M').yards
  const raised = envelopeFeatures({ parcel: lot, yards, heightM: 85 * FT, ghostHeightM: 55 * FT })
  assert.equal(raised.pad, true)
  assert.deepEqual(raised.ground.map(f => f.properties.part), ['pad', 'pad-rim'])
  const parts = raised.envelope.map(f => f.properties.part)
  assert.equal(parts.filter(p => p === 'post').length, 4)
  assert.ok(raised.envelope.filter(f => f.properties.part === 'post').every(f => Math.abs(f.properties.top - 85 * FT) < 1e-9))
  const frame = raised.envelope.find(f => f.properties.part === 'frame')
  assert.ok(Math.abs(frame.properties.top - 85 * FT) < 1e-9)
  assert.ok(Math.abs(raised.envelope.find(f => f.properties.part === 'current-code').properties.top - 55 * FT) < 1e-9)
  const flat = envelopeFeatures({ parcel: lot, yards, heightM: 55 * FT, ghostHeightM: 55 * FT })
  assert.ok(!flat.envelope.some(f => f.properties.part === 'current-code'), 'no ghost when nothing changes')
  const shallow = envelopeFeatures({ parcel: rectangleAt(ORIGIN, 12, 16), yards: districtStandards('R1D-L').yards, heightM: 40 * FT })
  assert.equal(shallow.pad, false)
  assert.equal(shallow.ground.length, 0)
  assert.equal(shallow.envelope.filter(f => f.properties.part === 'post').length, 4, 'posts fall back to the lot corners')
  assert.deepEqual(envelopeFeatures({ parcel: lot, yards, heightM: 0 }).envelope, [])
})

test('every pad vertex keeps at least the side yard from every lot edge', () => {
  const lot = { type: 'Polygon', coordinates: [[[-79.94, 40.41], [-79.9398, 40.41], [-79.93975, 40.4104], [-79.94004, 40.4104], [-79.94, 40.41]]] }
  const { pad, frame, lot: ring } = setbackPad(lot, [25, 25, 25, 10])
  assert.ok(pad)
  for (const p of pad) for (let i = 0; i < ring.length; i++) assert.ok(segmentDistance(p, ring[i], ring[(i + 1) % ring.length]) >= 10 * FT - 1e-6)
  assert.ok(frame && localFrame)
})
