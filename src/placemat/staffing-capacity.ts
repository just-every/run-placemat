import {fail,id,type Booking,type Service,type ServingAssignment,type State} from './model'

export type DiningParty=Pick<Booking,'serviceId'|'partySize'|'startAt'|'endAt'|'tableIds'|'status'>&Partial<Pick<Booking,'id'|'expectedEndAt'|'serverId'|'sectionId'>>
export const diningActive=(b:{status:string})=>b.status==='booked'||b.status==='seated'
export function servingFor(s:State,serviceId:string,tableIds:string[]):ServingAssignment|null {
 const staffing=s.services.find(v=>v.id===serviceId)?.staffing
 if(!staffing?.sections.length)return null
 const section=staffing.sections.find(section=>tableIds.every(id=>section.tableIds.includes(id)))??fail(409,'Every selected table must belong to one server section for this shift. Joins cannot cross sections.')
 const server=staffing.servers.find(server=>server.id===section.serverId)??fail(409,'The selected section needs a shift server.')
 return {serverId:server.id,serverName:server.name,sectionId:section.id,sectionName:section.name}
}
export function diningInterval(b:DiningParty,now:string){
 const start=Date.parse(b.startAt),departure=Date.parse(b.expectedEndAt??b.endAt),clock=Date.parse(now)
 return {start:b.status==='seated'?Math.min(start,clock):start,end:b.status==='seated'?Math.max(departure,clock+1):departure}
}
/** The sweep uses half-open dining intervals; setup and cleanup consume physical tables only. */
export function concurrentCovers(parties:DiningParty[],now:string,window?:{start:number;end:number}){
 const events:Array<{at:number;delta:number}>=[]
 for(const b of parties.filter(diningActive)){
  const interval=diningInterval(b,now),start=Math.max(interval.start,window?.start??-Infinity),end=Math.min(interval.end,window?.end??Infinity)
  if(start<end)events.push({at:start,delta:b.partySize},{at:end,delta:-b.partySize})
 }
 events.sort((a,b)=>a.at-b.at||a.delta-b.delta)
 let covers=0,peak=0;for(const event of events){covers+=event.delta;peak=Math.max(peak,covers)}return peak
}
function areasFor(s:State,b:DiningParty){return [...new Set(b.tableIds.map(id=>(s.allocationTables??s.tables).find(t=>t.id===id)?.area??'Dining room'))]}
/** Validate the final ledger atomically, so a swap never charges both old and new owners. */
export function checkStaffing(s:State,candidates:DiningParty[],now:string,allowBreakIds:Set<string>=new Set()){
 const ids=new Set(candidates.flatMap(b=>b.id?[b.id]:[])),others=s.bookings.filter(b=>!ids.has(b.id)&&diningActive(b))
 const assignments=candidates.map(b=>servingFor(s,b.serviceId,b.tableIds))
 const final=candidates.map((b,i)=>({...b,...assignments[i]??{}}))
 for(const [index,b] of final.entries()){
  if(!diningActive(b))continue
  const service=s.services.find(v=>v.id===b.serviceId)??fail(404,'Service not found.'),staffing=service.staffing
  if(!staffing)continue
  const serving=assignments[index],window=diningInterval(b,now),all=[...others,...final].filter(v=>v.serviceId===b.serviceId)
  if(serving){
   const server=staffing.servers.find(v=>v.id===serving.serverId)!
   if(server.onBreak&&(!b.id||!allowBreakIds.has(b.id)))fail(409,`${server.name} is on break. Choose another server section before assigning or seating this party.`)
   const covers=concurrentCovers(all.filter(v=>v.serverId===server.id),now,window)
   if(covers>server.coverCap)fail(409,`${server.name} would have ${covers} overlapping dining covers against a cap of ${server.coverCap}. Choose another section or time.`)
  }
  for(const area of areasFor(s,b)){
   const cap=Object.hasOwn(staffing.kitchenAreaCaps,area)?staffing.kitchenAreaCaps[area]:undefined
   if(cap===undefined)continue
   const covers=concurrentCovers(all.filter(v=>areasFor(s,v).includes(area)),now,window)
   if(covers>cap)fail(409,`${area} kitchen would have ${covers} overlapping dining covers against a cap of ${cap}. Choose another area or time.`)
  }
 }
 return assignments
}
export function recordServing(b:Booking,to:ServingAssignment|null,actor:string,at:string,action:string,reason?:string,force=false){
 const from=b.serverId&&b.sectionId?{serverId:b.serverId,sectionId:b.sectionId,serverName:b.serverName??b.serverId,sectionName:b.sectionName??b.sectionId}:null
 if(!force&&from?.serverId===to?.serverId&&from?.sectionId===to?.sectionId)return
 if(to)Object.assign(b,to);else{delete b.serverId;delete b.serverName;delete b.sectionId;delete b.sectionName}
 if(from||to)(b.servingHistory??=[]).push({id:id(),at,actor,action,from,to:to?{...to}:null,...reason?{reason}:{}})
}
/** Policy edits may not silently reroute or unassign any active guest. */
export function assertStaffingEdit(s:State,service:Service,now:string){
 const parties=s.bookings.filter(b=>b.serviceId===service.id&&diningActive(b))
 for(const b of parties){
  const owner=servingFor(s,b.serviceId,b.tableIds)
  if((b.serverId??null)!==(owner?.serverId??null)||(b.sectionId??null)!==(owner?.sectionId??null))fail(409,'Active parties use this section mapping. Move or finish those parties before changing its tables or server.')
 }
 checkStaffing(s,parties,now,new Set(parties.map(b=>b.id)))
}
