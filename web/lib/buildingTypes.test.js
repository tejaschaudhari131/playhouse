import test from 'node:test'
import assert from 'node:assert/strict'
import { BUILDING_TYPE_CATEGORIES, BUILDING_TYPE_IDS, allFilters, buildingCategory, categoryColorExpression, categoryCounts, hiddenCategoryFilter, landUseCategory, parcelCategory, plannedCategoryColor, typologyCategory } from './buildingTypes.js'
import { colorBuildingUses } from './buildingUses.js'

test('County residential uses map to single-family, two-family, 3–4 unit and 5+ apartment categories', () => {
  for (const use of ['SINGLE FAMILY', 'ROWHOUSE', 'TOWNHOUSE', 'MOBILE HOME']) assert.equal(landUseCategory(use, 'RESIDENTIAL'), 'single_family', use)
  assert.equal(landUseCategory('TWO FAMILY', 'RESIDENTIAL'), 'two_family')
  assert.equal(landUseCategory('TWO FAMILY', 'COMMERCIAL'), 'two_family')
  for (const use of ['THREE FAMILY', 'FOUR FAMILY', 'DWG APT CONVERSION']) assert.equal(landUseCategory(use), 'small_multifamily', use)
  for (const [use, group] of [['APART: 5-19 UNITS', 'COMMERCIAL'], ['APART:20-39 UNITS', 'COMMERCIAL'], ['APART:40+ UNITS', 'COMMERCIAL'], ['CONDOMINIUM', 'RESIDENTIAL'],
    ['COMM APRTM CONDOS 5-19 UNITS', 'COMMERCIAL'], ['INDEPENDENT LIVING (SENIORS)', 'COMMERCIAL'], ['OWNED BY METRO HOUSING AU', 'GOVERNMENT'], ['HUD PROJ #202', 'GOVERNMENT']])
    assert.equal(landUseCategory(use, group), 'apartments', use)
})

test('commercial, mixed-use and industrial uses are commercial; civic, exempt and utility uses are institutional', () => {
  for (const [use, group] of [["RETL/APT'S OVER", 'COMMERCIAL'], ['OFFICE/APARTMENTS OVER', 'COMMERCIAL'], ['RESTAURANT, CAFET AND/OR BAR', 'COMMERCIAL'], ['OFFICE - 1-2 STORIES', 'COMMERCIAL'],
    ['PARKING GARAGE/LOTS', 'COMMERCIAL'], ['WAREHOUSE', 'INDUSTRIAL'], ['LIGHT MANUFACTURING', 'INDUSTRIAL'], ['OFFICE - 1-2 STORIES', 'GOVERNMENT']])
    assert.equal(landUseCategory(use, group), use === 'OFFICE - 1-2 STORIES' && group === 'GOVERNMENT' ? 'institutional' : 'commercial', `${use} ${group}`)
  for (const [use, group] of [['CHURCHES, PUBLIC WORSHIP', 'COMMERCIAL'], ['DAYCARE/PRIVATE SCHOOL', 'COMMERCIAL'], ['MUNICIPAL GOVERNMENT', 'GOVERNMENT'], ['OWNED BY BOARD OF EDUCATION', 'GOVERNMENT'],
    ['OWNED BY COLLEGE/UNIV/ACADEMY', 'GOVERNMENT'], ['CHARITABLE EXEMPTION/HOS/HOMES', 'OTHER'], ['NURSING HOME/PRIVATE HOS', 'COMMERCIAL'], ['R.R. - USED IN OPERATION', 'UTILITIES'],
    ['COMM AUX BUILDING', 'COMMERCIAL'], ['RES AUX BUILDING (NO HOUSE)', 'RESIDENTIAL'], ['CEMETERY/MONUMENTS', 'COMMERCIAL']])
    assert.equal(landUseCategory(use, group), 'institutional', use)
})

test('vacant land, builders lots and missing uses are separated; vacant-flagged public land counts as vacant', () => {
  for (const [use, group] of [['VACANT LAND', 'RESIDENTIAL'], ['VACANT COMMERCIAL LAND', 'COMMERCIAL'], ['VACANT INDUSTRIAL LAND', 'INDUSTRIAL'], ['>10 ACRES VACANT', 'AGRICULTURAL'], ['BUILDERS LOT', 'RESIDENTIAL']])
    assert.equal(landUseCategory(use, group), 'vacant', use)
  assert.equal(landUseCategory(null, null), 'unknown')
  assert.equal(landUseCategory('  single family '), 'single_family', 'case and spacing do not matter')
  assert.equal(parcelCategory({ land_use: 'MUNICIPAL URBAN RENEWAL', land_use_class: 'GOVERNMENT', vacant_lot: true }), 'vacant')
  assert.equal(parcelCategory({ land_use: 'MUNICIPAL URBAN RENEWAL', land_use_class: 'GOVERNMENT', vacant_lot: false }), 'institutional')
  assert.equal(parcelCategory({ land_use: 'SINGLE FAMILY', vacant_lot: true }), 'single_family', 'a recorded house is not reclassified')
  assert.equal(buildingCategory({ land_use: 'VACANT LAND' }), 'unknown', 'a footprint on vacant-recorded land has an unknown use')
  assert.equal(buildingCategory(null), 'unknown')
})

test('proposed typologies take the category they would be recorded as', () => {
  assert.deepEqual(['single_family', 'townhouse_duplex', 'triplex', 'small_apartment', 'large_apartment', 'mystery'].map(typologyCategory),
    ['single_family', 'two_family', 'small_multifamily', 'apartments', 'apartments', 'unknown'])
  assert.match(plannedCategoryColor('apartments'), /^#[0-9a-f]{6}$/)
  assert.notEqual(plannedCategoryColor('apartments'), BUILDING_TYPE_CATEGORIES.find(c => c.id === 'apartments').color)
})

test('legend colours are distinct and map expressions and filters cover every category', () => {
  assert.equal(new Set(BUILDING_TYPE_CATEGORIES.map(c => c.color)).size, BUILDING_TYPE_CATEGORIES.length)
  const expression = categoryColorExpression()
  assert.equal(expression[0], 'match')
  for (const id of BUILDING_TYPE_IDS) assert.ok(expression.includes(id), id)
  assert.equal(hiddenCategoryFilter([]), null)
  assert.deepEqual(hiddenCategoryFilter(['vacant', 'vacant', 'bogus']), ['!', ['in', ['coalesce', ['get', 'type_category'], 'unknown'], ['literal', ['vacant']]]])
  assert.equal(allFilters(null, null), null)
  assert.deepEqual(allFilters(['==', 1, 1], null), ['==', 1, 1])
  assert.equal(allFilters(['==', 1, 1], ['==', 2, 2])[0], 'all')
  const counts = categoryCounts([{ properties: { type_category: 'two_family' } }, { properties: {} }, { properties: { type_category: 'two_family' } }])
  assert.equal(counts.two_family, 2); assert.equal(counts.unknown, 1); assert.equal(counts.vacant, 0)
})

test('prepared footprints carry the parcel category', () => {
  const feature = { type: 'Feature', properties: { id: 'b', pin: 'p' }, geometry: null }
  const [two, none] = colorBuildingUses({ features: [feature, { ...feature, properties: { id: 'c', pin: 'q' } }] }, new Map([['p', { properties: { land_use: 'TWO FAMILY', land_use_class: 'RESIDENTIAL' } }]])).features
  assert.equal(two.properties.type_category, 'two_family')
  assert.equal(none.properties.type_category, 'unknown')
})

test('map parcels carry their category so vacant lots can be highlighted', async () => {
  const { slimParcels } = await import('./plannerGeometry.js')
  const slim = slimParcels({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: null, properties: { pin: 'A', land_use: 'VACANT LAND', land_use_class: 'RESIDENTIAL', vacant_lot: true, area: 'X' } },
    { type: 'Feature', geometry: null, properties: { pin: 'B', land_use: 'TWO FAMILY', land_use_class: 'RESIDENTIAL', area: 'X' } },
  ] })
  assert.deepEqual(slim.features.map(f => f.properties.type_category), ['vacant', 'two_family'])
})
