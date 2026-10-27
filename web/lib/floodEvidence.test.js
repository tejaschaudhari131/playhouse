import test from 'node:test'
import assert from 'node:assert/strict'
import { floodEvidence, floodPercent, floodStatus, passesFloodFilter } from './floodEvidence.js'
import { passesRecordFilters } from './sites.js'

test('no-overlap evidence requires both measured zeroes; invalid and absent fractions remain unknown', () => {
  assert.equal(floodStatus({ sfha_overlap: 0, flood_02_overlap: 0 }).status, 'none')
  for (const value of [undefined, null, NaN, -0.1, 1.1, '0', Infinity]) {
    for (const properties of [{ sfha_overlap: value, flood_02_overlap: 0 }, { sfha_overlap: 0, flood_02_overlap: value }]) {
      assert.equal(floodStatus(properties).status, 'unknown')
      assert.equal(passesFloodFilter(properties, 'none'), false)
      assert.equal(passesRecordFilters(properties, { flood: 'none' }), false)
      assert.equal(passesFloodFilter(properties, 'unknown'), true)
    }
  }
})

test('both mapped categories count as overlap, including positive evidence when the other category is missing', () => {
  for (const properties of [{ sfha_overlap: .001, flood_02_overlap: 0 }, { sfha_overlap: 0, flood_02_overlap: 1 }, { sfha_overlap: null, flood_02_overlap: .4 }]) {
    assert.equal(floodStatus(properties).status, 'mapped')
    assert.equal(passesFloodFilter(properties, 'mapped'), true)
    assert.equal(passesRecordFilters(properties, { flood: 'mapped' }), true)
    assert.equal(passesFloodFilter(properties, 'none'), false)
    assert.equal(passesFloodFilter(properties, 'any'), true)
  }
  assert.equal(floodStatus({ sfha_overlap: null, flood_02_overlap: .4 }).complete, false)
  assert.equal(passesFloodFilter({ sfha_overlap: 0, flood_02_overlap: .4 }, 'no_sfha'), true)
  assert.equal(passesFloodFilter({ sfha_overlap: null, flood_02_overlap: 0 }, 'no_sfha'), false)
})

test('source provenance uses the recorded retrieval date without inventing a panel effective date', () => {
  const source = { name: 'FEMA National Flood Hazard Layer flood zones', catalog_name: 'FEMA National Flood Hazard Layer', catalog_url: 'https://www.fema.gov/flood-maps/national-flood-hazard-layer', pulled_at: '2026-09-27', status: 'ok' }
  const evidence = floodEvidence({ sfha_overlap: .125, flood_02_overlap: 0 }, [source])
  assert.equal(evidence.source.retrievedAt, '2026-09-27')
  assert.equal(evidence.source.effectiveDate, null)
  assert.equal(evidence.source.url, source.catalog_url)
  assert.equal(floodEvidence({}, null).source.retrievedAt, null)
  assert.equal(floodEvidence({}, []).status, 'unknown')
})

test('overlap display preserves exported tenths of percent and does not round small positive evidence to zero', () => {
  assert.equal(floodPercent(.001), '0.1%')
  assert.equal(floodPercent(.125), '12.5%')
  assert.equal(floodPercent(.0001), '<0.1%')
  assert.equal(floodPercent(0), '0%')
  assert.equal(floodPercent(1), '100%')
  assert.equal(floodPercent(null), 'Unknown')
})
