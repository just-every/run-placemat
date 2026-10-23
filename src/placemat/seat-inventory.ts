import {fail,id,number,text,type State,type Table,type Inventory} from './model'
import {accessTags} from './assignments'
import {overlaps,active} from './capacity'
import {activeHolds} from './staffing-capacity'

/** Each anonymous cover shares the ordinary serialized capacity ledger. Pool units never name a physical seat. */
export function createInventory(s:State,p:any){
 if(!['counter','pool'].includes(p.kind))fail(400,'Choose a counter or unassigned pool.')
 const name=text(p.name,'Inventory name',60)
 if(s.tables.some(t=>t.area===name)||s.inventories?.some(i=>i.name.toLowerCase()===name.toLowerCase()))fail(409,'Use a distinct inventory name and area.')
 if((s.inventories?.length??0)>=10)fail(400,'This venue supports ten counter or pool inventories.')
 if(typeof p.adjacent!=='boolean')fail(400,'Choose whether counter parties require adjacent seats.')
 const inventory:Inventory={id:id(),name,kind:p.kind,capacity:number(p.capacity,'Inventory capacity',1,40),turnMinutes:number(p.turnMinutes,'Inventory turn minutes',15,360),arrivalCovers:number(p.arrivalCovers,'Inventory arrival covers',1,500),intervalMinutes:number(p.intervalMinutes,'Inventory interval minutes',5,120),adjacent:p.kind==='counter'&&p.adjacent}
 const tags=accessTags(p.accessTags,'Inventory access tags')
 const tables:Table[]=Array.from({length:inventory.capacity},(_,i)=>({id:id(),inventoryId:inventory.id,inventoryKind:inventory.kind,ordinal:i+1,inventoryTurnMinutes:inventory.turnMinutes,label:`${name} ${inventory.kind==='counter'?'seat':'unassigned cover'} ${i+1}`,seats:1,area:name,accessTags:tags,shape:'bar',x:10+(i%10)*8,y:15+Math.floor(i/10)*20}))
 ;(s.inventories??=[]).push(inventory);s.tables.push(...tables)
 return inventory
}
export function inventoryAssignment(tables:Table[],size:number){
 if(!tables.some(t=>t.inventoryId))return undefined
 if(tables.some(t=>!t.inventoryId||t.inventoryId!==tables[0].inventoryId)||tables.length!==size)fail(409,'Choose exactly one inventory seat or cover per guest, within the same counter or pool.')
 return tables[0].inventoryId!
}
export function inventoryChoices(s:State,size:number,startAt:string,cleanupMinutes:number){
 const result:string[][]=[],now=new Date().toISOString(),holds=activeHolds(s,now)
 for(const inventory of s.inventories??[]){
  let units=s.tables.filter(t=>t.inventoryId===inventory.id&&!t.retiredAt).sort((a,b)=>a.ordinal!-b.ordinal!)
  const endAt=new Date(Date.parse(startAt)+inventory.turnMinutes*60000).toISOString(),cleanupEndAt=new Date(Date.parse(endAt)+cleanupMinutes*60000).toISOString()
  // Pools can fill fragmented free units; counter adjacency retains the original ordinals.
  units=units.filter(t=>!s.bookings.some(b=>b.tableIds.includes(t.id)&&(active(b)&&overlaps(b,{startAt,endAt,cleanupEndAt})||b.needsBussing&&startAt<=now))&&!holds.some(h=>h.tableIds.includes(t.id)&&overlaps(h,{startAt,endAt,cleanupEndAt},now)))
  for(let i=0;i+size<=units.length;i++){
   const group=units.slice(i,i+size)
   if(inventory.adjacent&&group.some((t,n)=>t.ordinal!==group[0].ordinal!+n))continue
   result.push(group.map(t=>t.id))
  }
 }
 return result
}
