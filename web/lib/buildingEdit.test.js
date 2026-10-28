import test from 'node:test'
import assert from 'node:assert/strict'
import { finishBuildingEdit } from './buildingEdit.js'
import { historyFor, initialStudioScenario, scenarioReducer } from './plannerState.js'

test('saving a shape edit keeps identity and order; one undo restores the exact original plan', () => {
  const original = initialStudioScenario('0056F00338000000')
  const building = {id:'first',pin:original.pin,option:{...original.draft}}
  original.buildings = [building,{...building,id:'second'}]
  const history = historyFor(original)
  const edit = {id:building.id,pin:building.pin,index:0,history}
  const temporary = {...original,buildings:[original.buildings[1]],draft:{...original.draft,width:11}}
  const saved = finishBuildingEdit(edit,temporary,{...building,option:temporary.draft})
  assert.deepEqual(saved.present.buildings.map(b=>b.id),['first','second'])
  assert.equal(saved.present.buildings[0].option.width,11)
  assert.equal(history.present.buildings[0].option.width,9,'original stays immutable for autosave/cancel')
  assert.deepEqual(scenarioReducer(saved,{type:'undo'}).present,original)
  assert.deepEqual(scenarioReducer(scenarioReducer(saved,{type:'undo'}),{type:'redo'}).present,saved.present)
  assert.throws(()=>finishBuildingEdit(edit,temporary,{...building,id:'changed'}),/identity/)
})
test('building placement itself is undoable and redoable', () => {
  const original=initialStudioScenario('0056F00338000000')
  const placed=scenarioReducer(historyFor(original),{type:'addBuilding',building:{id:'one',pin:original.pin,option:original.draft}})
  assert.equal(placed.present.buildings.length,1)
  const undone=scenarioReducer(placed,{type:'undo'})
  assert.equal(undone.present.buildings.length,0)
  assert.equal(scenarioReducer(undone,{type:'redo'}).present.buildings.length,1)
})
