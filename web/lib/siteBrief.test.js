import test from 'node:test'
import assert from 'node:assert/strict'
import { siteDiagram, standardsTable } from './siteBrief.js'
import { rectangleAt, fitMassing } from './plannerGeometry.js'
import { evaluatePlanner } from './plannerModel.js'
import { initialStudioScenario, defaultComparisonTypes } from './plannerState.js'

const numbers = path => [...path.matchAll(/-?\d+(\.\d+)?/g)].map(m => Number(m[0]))

test('diagram fits the parcel inside the padded frame with north up', () => {
  const parcel = rectangleAt([-79.94, 40.41], 12, 30)
  const d = siteDiagram({ parcel, size: 300, pad: 30 })
  assert.equal(d.viewBox, '0 0 300 300')
  assert.match(d.parcel, /^M[\d. ]+(L[\d. ]+)+Z$/)
  const values = numbers(d.parcel)
  assert.ok(values.every(v => v >= 30 - 1e-6 && v <= 270 + 1e-6), 'inside padding')
  const ys = values.filter((_, i) => i % 2), xs = values.filter((_, i) => !(i % 2))
  assert.ok(Math.abs((Math.max(...ys) - Math.min(...ys)) - 240) < .5, 'the 30 m depth fills the frame vertically')
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - 96) < .5, '12 m wide at the same scale')
  assert.ok(Math.abs(d.metresPerPixel - 0.125) < 1e-3)
  assert.deepEqual([d.lot.width, d.lot.depth], [12, 30])
  assert.equal(d.footprint, null)
  assert.deepEqual(d.north, { x: 282, y: 26 })
  assert.equal(d.scale.label, '10 m')
  assert.equal(d.scale.length, 80)
  assert.equal(siteDiagram({ parcel: null }), null)
})

test('footprint edges are labelled with metres and feet, retained and demolished outlines drawn', () => {
  const parcel = rectangleAt([-79.94, 40.41], 20, 40)
  const massing = fitMassing(parcel, 8, 12, { east: 2, north: -4, bearing: 30 })
  assert.ok(massing.fits)
  const neighbour = rectangleAt([-79.94, 40.4102], 6, 6)
  const far = rectangleAt([-79.9, 40.45], 6, 6)
  const d = siteDiagram({ parcel, footprint: massing.geometry, bearing: 30, retained: [{ geometry: neighbour }, { geometry: far }], demolished: [neighbour] })
  assert.ok(d.footprint.startsWith('M'))
  const width = d.labels.find(l => l.kind === 'width'), depth = d.labels.find(l => l.kind === 'depth')
  assert.deepEqual([width.metres, depth.metres], [8, 12])
  assert.equal(width.text, '8 m (26 ft)')
  assert.equal(depth.text, '12 m (39 ft)')
  assert.ok(Math.abs(width.angle) <= 90 && Math.abs(depth.angle) <= 90, 'labels stay upright')
  assert.ok(Math.abs(Math.abs(width.angle - depth.angle) - 90) < .2, 'edges are perpendicular')
  assert.deepEqual(d.footprintDims, { width: 8, depth: 12, bearing: 30 })
  assert.equal(d.retained.length, 1, 'a far-away building is not drawn')
  assert.equal(d.demolished.length, 1)
})

test('standards table shows numeric thresholds and which reform preset lifts each conflict', () => {
  const rows = { 'Single-Unit Detached': 'P', 'Single-Unit Attached': '', 'Two-Unit': '', 'Three-Unit': '', 'Multi-Unit': '' }
  const zoning = { districts: { 'R1D-L': { use_table_read: true, code_section: 'Fixture', use_rows: rows } } }
  const feature = { type: 'Feature', properties: { pin: 'site', zoning_code: 'R1D-L', lot_sqft: 2000, scores: {} }, geometry: rectangleAt([-79.94, 40.41], 12, 30) }
  const base = initialStudioScenario('site', feature.properties)
  const scenario = { ...base, draft: { ...base.draft, typeId: 'triplex', width: 8, depth: 12, height: 10, floors: 3 }, comparisonTypes: defaultComparisonTypes('triplex') }
  const triplex = evaluatePlanner({ feature, zoning, scenario, stop: null, existingBuildings: [] }).proposal.triplex
  const table = standardsTable(triplex, 'R1D-L')
  assert.deepEqual(table.presets.map(p => p.id), ['bill-2025-1545', 'missing-middle', 'by-right'])
  const lot = table.rows.find(r => r.id === 'lot'), use = table.rows.find(r => r.id === 'use')
  assert.deepEqual([lot.status, lot.required, lot.proposed], ['conflict', '≥ 3,000 sq ft', '2,000 sq ft'])
  assert.deepEqual(lot.reform, { 'bill-2025-1545': 'Applies', 'missing-middle': 'Lifted', 'by-right': 'Lifted' })
  assert.deepEqual(use.reform, { 'bill-2025-1545': 'Applies', 'missing-middle': 'Lifted', 'by-right': 'Lifted' })
  const passing = table.rows.find(r => r.status === 'pass')
  assert.ok(passing)
  assert.ok(Object.values(passing.reform).every(v => v === null))
  assert.equal(table.presets.find(p => p.id === 'missing-middle').eligible, true)
  assert.ok(table.rows.every(r => r.status !== 'not_applicable'))
  assert.ok(table.shown.some(r => r.id === 'lot') && table.shown.some(r => r.id === 'use'))
  assert.ok(table.shown.every(r => r.status === 'conflict' || r.status === 'conditional' || r.id === 'use' || r.required))
  assert.equal(table.shown.length + table.alsoPass.length + table.notAssessed.length, table.rows.length, 'every check is listed once')
  assert.ok(table.notAssessed.length > 0)
})

test('print diagram uses real ground-level network edges without duplicating directions', () => {
  const origin = [-79.94,40.41]
  const parcel = rectangleAt(origin,20,40)
  const network = {nodes:[[-79.9401,40.4099],[-79.9401,40.4101],[-79.8,40.6]],ground:[1,1,0],edges:[[0,1,1],[1,0,1],[1,2,1]]}
  const d = siteDiagram({parcel,network})
  assert.equal(d.networkPaths.length,1)
  assert.match(d.networkPaths[0],/^M[\d.-]+ [\d.-]+L/)
  assert.equal(siteDiagram({parcel}).networkPaths.length,0)
})
