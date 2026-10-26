import { INITIAL_WEIGHTS } from './plannerState.js'
import { passesRecordFilters, DEFAULT_SITE_FILTERS, typePermission } from './sites.js'
import { resolveZoning } from './zoning.js'
export const FACTOR_LABELS = { demand: 'Market fit', physical: 'Physical fit', affordability: 'Housing-cost burden', displacement: 'Lower neighborhood displacement risk', capacity: 'Assumed transit capacity', access: 'Access', carbon: 'Carbon estimate' }
export const STUDIO_PRESETS = [
 { id:'balanced', label:'Balanced', description:'Spreads weight across the seven factors, with more weight on market fit and housing costs. This is a starting point, not an agreed public priority.', weights:{...INITIAL_WEIGHTS} },
 { id:'resident', label:'Costs & stability', description:'Emphasizes lower housing-cost burden and lower existing neighborhood displacement vulnerability. It does not estimate tenant protection or the displacement caused by a project.', weights:{demand:5,physical:15,affordability:25,displacement:30,capacity:5,access:15,carbon:5} },
 { id:'cdc', label:'Housing costs first', description:'Gives housing-cost burden the largest share. Lower neighborhood vulnerability also raises the score; this is not a strategy for directing investment to the highest-need communities.', weights:{demand:5,physical:10,affordability:40,displacement:20,capacity:5,access:15,carbon:5} },
 { id:'developer', label:'Market & fit', description:'Emphasizes the market proxy and physical fit. It does not estimate construction cost, financing, profit or developer preferences.', weights:{demand:40,physical:25,affordability:10,displacement:5,capacity:10,access:5,carbon:5} },
 { id:'climate', label:'Carbon & access', description:'Emphasizes the relative carbon proxy and modeled access. Neither measures a project’s actual emissions or travel behavior.', weights:{demand:5,physical:10,affordability:15,displacement:10,capacity:5,access:20,carbon:35} },
]
/** Exact relative contributions against the best other eligible template, no invented outcomes. */
export function templateTradeoffs(entry, entries, factors, state) {
 const candidate=entry[state]
 const reference=entries.filter(e=>e.id!==entry.id && e[state].eligible && Number.isFinite(e[state].total)).sort((a,b)=>b[state].total-a[state].total)[0]
 if(!reference || !candidate.eligible) return {reference:null,pros:[],cons:[]}
 const changes=factors.filter(f=>f.included).map(f=>({id:f.id,label:FACTOR_LABELS[f.id],points:(candidate.scores[f.id]-reference[state].scores[f.id])*f.effectiveWeight}))
 return {reference:reference[state].label,pros:changes.filter(f=>f.points>=.05).sort((a,b)=>b.points-a.points).slice(0,2),cons:changes.filter(f=>f.points<=-.05).sort((a,b)=>a.points-b.points).slice(0,2)}
}
export function studioSites(parcels, zoning, area, filters) {
 const query=(filters.query||'').trim().toLowerCase()
 return parcels.features.filter(f=>{
  const p=f.properties
  if(!passesRecordFilters(p,{...DEFAULT_SITE_FILTERS,...filters,area})) return false
  if(query && !`${p.address||''} ${p.pin}`.toLowerCase().includes(query)) return false
  if(filters.typeId && typePermission(filters.typeId,resolveZoning(p.zoning_code,zoning))!=='by_right' && typePermission(filters.typeId,resolveZoning(p.zoning_code,zoning))!=='partial') return false
  return true
 }).sort((a,b)=>Number(!a.properties.address)-Number(!b.properties.address)||(a.properties.address||a.properties.pin).localeCompare(b.properties.address||b.properties.pin, undefined, {numeric:true}))
}
