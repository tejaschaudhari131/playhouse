import { demolitionKey, isDemolished } from './redevelopment.js'

/** Small display-only collection. Existing geometry and height data stay untouched. */
export function siteBuildingLabels(rows, selection, demolitions = []) {
  const selectedKey = selection?.kind === 'existing' ? demolitionKey(selection) : null
  return rows.flatMap(row => {
    const selected = selectedKey === row.key, removed = isDemolished(row.building, demolitions)
    if (!row.center || removed && !selected) return []
    return [{ type: 'Feature', id: row.key,
      geometry: { type: 'Point', coordinates: row.center },
      properties: { key: row.key, number: row.number, selected, removed,
        height_m: removed ? 0 : row.displayHeightM || 0 } }]
  })
}
