/** Editing is a transaction: the saved plan remains unchanged until Save. */
export function finishBuildingEdit(edit, scenario, replacement) {
  if (!edit?.history || replacement.id !== edit.id || replacement.pin !== edit.pin) throw new Error('Building edit identity changed')
  const buildings = scenario.buildings.filter(b => b.id !== edit.id)
  buildings.splice(Math.min(edit.index, buildings.length), 0, replacement)
  return { past: [...edit.history.past, edit.history.present].slice(-100), present: { ...scenario, draft: { ...scenario.draft, placement: null }, buildings }, future: [] }
}
