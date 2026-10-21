import {inventoryAssignment} from './seat-inventory'
import {fail,id,number,type Booking,type Combination,type CombinationSnapshot,type State,type Table} from './model'

export const sameTables=(a:string[],b:string[])=>a.length===b.length&&a.every(id=>b.includes(id))
export const tableArea=(t:Table)=>t.area??'Dining room'
export function chosenTables(s:State,value:unknown):Table[]{
 if(!Array.isArray(value)||!value.length||value.some(v=>typeof v!=='string')||new Set(value).size!==value.length)fail(400,'Choose distinct tables.')
 return (value as string[]).map(id=>s.tables.find(t=>t.id===id)??fail(404,'Table not found.'))
}
function tags(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>20||value.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>80))fail(400,'Combination access tags must contain up to 20 tags.')
 return [...new Set((value as string[]).map(v=>v.trim()))].sort()
}
function assertFit(tables:Table[],c:Pick<Combination,'capacity'|'accessTags'>,size:number,requiredTags:string[],requiredArea?:string){
 if(c.capacity>tables.reduce((n,t)=>n+t.seats,0)||size>c.capacity)fail(409,'The selected assignment does not have enough approved seats.')
 if(requiredArea&&tables.some(t=>tableArea(t)!==requiredArea))fail(409,'The selected tables do not meet this booking’s required dining area.')
 if(c.accessTags.some(tag=>tables.some(t=>!t.accessTags?.includes(tag)))||requiredTags.some(tag=>!c.accessTags.includes(tag)||tables.some(t=>!t.accessTags?.includes(tag))))fail(409,'The selected assignment does not meet this party’s required access needs.')
}
/** A new assignment may use only a single table or an explicitly approved exact set. */
export function assignmentFor(s:State,tableIds:unknown,size:number,startAt:string,serviceStartAt:string,requiredTags:string[]=[],requiredArea?:string,frozen?:Booking){
 const tables=chosenTables(s,tableIds)
 if(tables.some(t=>t.retiredAt)&&(!frozen||!['booked','seated'].includes(frozen.status)||!sameTables(frozen.tableIds,tables.map(t=>t.id))))fail(409,'Retired tables cannot receive new assignments.')
 const inventoryId=inventoryAssignment(tables,size)
 let combination:CombinationSnapshot|undefined
 if(inventoryId){
  const inventory=s.inventories?.find(v=>v.id===inventoryId)??fail(409,'Inventory is unavailable.')
  const sorted=[...tables].sort((a,b)=>a.ordinal!-b.ordinal!)
  if(inventory.adjacent&&sorted.some((t,n)=>t.ordinal!==sorted[0].ordinal!+n))fail(409,'Choose adjacent counter seats.')
  combination={id:inventoryId,tableIds:tables.map(t=>t.id),capacity:size,accessTags:tables[0].accessTags??[],setupMinutes:0,areas:[tableArea(tables[0])]}
  assertFit(tables,combination,size,requiredTags,requiredArea)
 }
 if(!inventoryId&&tables.length>1){
  const saved=frozen?.combination
  if(saved&&sameTables(saved.tableIds,tables.map(t=>t.id))&&sameTables(frozen!.tableIds,saved.tableIds)){
   combination=structuredClone(saved)
   if(JSON.stringify(saved.areas)!==JSON.stringify([...new Set(tables.map(tableArea))].sort()))fail(409,'The saved combination no longer matches its dining area.')
  }else{
   if(frozen)fail(409,'This joined booking has no valid approved combination snapshot. Review its assignment.')
   const current=s.combinations?.find(c=>c.enabled&&c.adjacent===true&&sameTables(c.tableIds,tables.map(t=>t.id)))??fail(409,'Choose a single table or a manager-approved adjacent combination.')
   const {enabled,adjacent,...snapshot}=current
   combination={...structuredClone(snapshot),areas:[...new Set(tables.map(tableArea))].sort()}
  }
  assertFit(tables,combination,size,requiredTags,requiredArea)
 }else if(!inventoryId)assertFit(tables,{capacity:tables[0].seats,accessTags:tables[0].accessTags??[]},size,requiredTags,requiredArea)
 const calculated=new Date(Date.parse(startAt)-(combination?.setupMinutes??0)*60000).toISOString()
 const setupStartAt=frozen?.setupStartAt??calculated
 if(setupStartAt!==calculated||setupStartAt<serviceStartAt)fail(409,'The approved combination’s full setup must fit before arrival within service hours.')
 return {tables,setupStartAt,...combination?{combination}:{}}
}
export function candidateSets(s:State):string[][]{
 return [...s.tables.filter(t=>!t.retiredAt&&!t.inventoryId).map(t=>[t.id]),...(s.combinations??[]).filter(c=>c.enabled&&c.adjacent===true&&c.tableIds.every(id=>s.tables.some(t=>t.id===id&&!t.retiredAt))).map(c=>c.tableIds)]
}
/** Existing commitments freeze their terms; disabling affects only new assignments. */
export function saveCombination(s:State,p:any){
 const current=p.id?s.combinations?.find(c=>c.id===p.id):undefined
 if(p.id&&!current)fail(404,'Combination not found.')
 if(p.adjacent!==true)fail(400,'A manager must explicitly confirm that these tables are adjacent.')
 if(typeof p.enabled!=='boolean')fail(400,'Choose whether this combination is enabled.')
 const tables=chosenTables(s,p.tableIds)
 if(tables.some(t=>t.inventoryId))fail(409,'Counter seats and pool covers use their own inventory rules, not table joins.')
 if(tables.some(t=>t.retiredAt))fail(409,'Retired tables cannot belong to a new or edited combination.')
 if(tables.length<2)fail(400,'An approved combination needs at least two tables.')
 const combination:Combination={id:current?.id??id(),tableIds:tables.map(t=>t.id).sort(),capacity:number(p.capacity,'Combined seats',1,tables.reduce((n,t)=>n+t.seats,0)),accessTags:tags(p.accessTags),setupMinutes:number(p.setupMinutes,'Setup minutes',0,120),enabled:p.enabled,adjacent:true}
 if(combination.accessTags.some(tag=>tables.some(t=>!t.accessTags?.includes(tag))))fail(400,'Combination access tags must be supported by every constituent table.')
 assertFit(tables,combination,1,[])
 if(s.combinations?.some(c=>c.id!==combination.id&&sameTables(c.tableIds,combination.tableIds)))fail(409,'This exact table combination already exists. Edit it instead.')
 if(current&&inUse(s,current)&&(!sameTables(current.tableIds,combination.tableIds)||current.capacity!==combination.capacity||JSON.stringify([...current.accessTags].sort())!==JSON.stringify(combination.accessTags)||current.setupMinutes!==combination.setupMinutes))fail(409,'An active booked or seated party uses this combination. Keep its settings until those commitments finish; enabled may be changed for future assignments.')
 if(!current&&(s.combinations?.length??0)>=200)fail(400,'This venue supports up to 200 approved combinations.')
 if(current)Object.assign(current,combination);else(s.combinations??=[]).push(combination)
 return combination
}
function inUse(s:State,c:Combination){return s.bookings.some(b=>['booked','seated'].includes(b.status)&&(b.combination?.id===c.id||sameTables(b.tableIds,c.tableIds)))}
