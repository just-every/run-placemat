import {assertPacing} from './pacing'
import {fail,id,text,type Actor,type Booking,type State,type AuditEntry,type ServingAssignment} from './model'
import {serviceSnapshot} from './service-status'
import {occupiedEndAt} from './capacity'
import {assignmentFor} from './combinations'
import {checkStaffing,recordServing} from './staffing-capacity'

export function accessTags(value:unknown,label:string):string[]{
 if(value===undefined)return []
 if(!Array.isArray(value)||value.length>20)fail(400,`${label} must be an array of up to 20 tags.`)
 return [...new Set((value as unknown[]).map(v=>text(v,label,80)))].sort()
}
export function accessibleTables(s:State,required:string[]):State{
 return {...s,allocationTables:s.allocationTables??s.tables,tables:s.tables.filter(t=>required.every(tag=>t.accessTags?.includes(tag))),combinations:s.combinations?.filter(c=>required.every(tag=>c.accessTags.includes(tag)))}
}
/** Preserve the promised interval and its reset when a recorded actual turn overruns. */
export function assignmentInterval(b:Booking,now=new Date().toISOString()){
 const reset=Math.max(0,Date.parse(b.cleanupEndAt??b.endAt)-Date.parse(b.endAt))
 const cleanupEndAt=new Date(Math.max(Date.parse(b.cleanupEndAt??b.endAt),Date.parse(occupiedEndAt(b,now)))).toISOString()
 return {startAt:b.setupStartAt??b.startAt,endAt:new Date(Date.parse(cleanupEndAt)-reset).toISOString(),cleanupEndAt}
}
const overlaps=(a:{startAt:string;cleanupEndAt:string},b:{startAt:string;cleanupEndAt:string})=>a.startAt<b.cleanupEndAt&&a.cleanupEndAt>b.startAt
const active=(b:Booking)=>!['cancelled','no-show'].includes(b.status)
export const assignmentSnapshot=(b:Booking)=>({bookingId:b.id,tableIds:[...b.tableIds],locked:b.assignmentLocked??false,...b.serverId?{serverId:b.serverId,sectionId:b.sectionId,serverName:b.serverName,sectionName:b.sectionName}:{},setupStartAt:b.setupStartAt??b.startAt,...b.combination?{combination:structuredClone(b.combination)}:{}})
function currentParty(s:State,bookingId:unknown){
 const b=s.bookings.find(b=>b.id===bookingId)??fail(404,'Booking not found.')
 if(!['booked','seated'].includes(b.status))fail(409,'Only booked, arrived or seated parties can change assignments.')
 return b
}
export function assignmentChange(s:State,b:Booking,tableIds:unknown,preserve=false){
 const service=s.services.find(v=>v.id===b.serviceId)??fail(404,'Service not found.')
 return assignmentFor(s,tableIds,b.partySize,b.startAt,service.startAt,b.requiredAccessTags??[],b.requiredArea,preserve?b:undefined)
}
export function applyAssignment(b:Booking,assignment:ReturnType<typeof assignmentFor>&{serving?:ServingAssignment|null},context?:{actor:string;at:string;action:string;reason?:string}){
 if(assignment.serving!==undefined){if(context)recordServing(b,assignment.serving,context.actor,context.at,context.action,context.reason,true);else if(assignment.serving)Object.assign(b,assignment.serving);else{delete b.serverId;delete b.sectionId;delete b.serverName;delete b.sectionName}}
 b.tableIds=assignment.tables.map(t=>t.id);b.setupStartAt=assignment.setupStartAt
 if(assignment.combination)b.combination=structuredClone(assignment.combination);else delete b.combination
}
/** Validate a complete proposed floor without mutating it; swaps exclude both sources. */
export function validateAssignments(s:State,moves:Array<{booking:Booking;tableIds:unknown}>,now:string,preserve=false){
 const moving=new Set(moves.map(m=>m.booking.id)),others=s.bookings.filter(b=>!moving.has(b.id))
 const destinations=moves.map(m=>({booking:m.booking,...assignmentChange(s,m.booking,m.tableIds,preserve)}))
 for(const {booking:b,tables,setupStartAt} of destinations){
  const service=s.services.find(v=>v.id===b.serviceId)??fail(404,'Service not found.')
  const ids=tables.map(t=>t.id),interval=assignmentInterval({...b,setupStartAt},now)
  const stage=serviceSnapshot(s,b).status,physical=b.status==='seated'||['arrived','partially-arrived'].includes(stage)
  const occupiesNow=physical||interval.startAt<=now&&interval.cleanupEndAt>now
  const candidates=[...others,...destinations.filter(d=>d.booking.id!==b.id).map(d=>({...d.booking,tableIds:d.tables.map(t=>t.id),setupStartAt:d.setupStartAt}))]
  for(const other of candidates){
   if(!other.tableIds.some(id=>ids.includes(id)))continue
   if(occupiesNow&&(other.needsBussing||other.status==='seated'||active(other)&&assignmentInterval(other,now).startAt<=now&&assignmentInterval(other,now).cleanupEndAt>now))fail(409,'A selected table is occupied now or still needs bussing. Review the current floor before moving this party.')
   if(active(other)&&overlaps(interval,assignmentInterval(other,now)))fail(409,'A selected table clashes with another party’s promised turn, overrun or cleanup. Choose another table.')
  }
 }
 const parties=destinations.map(d=>({...d.booking,tableIds:d.tables.map(t=>t.id),setupStartAt:d.setupStartAt}))
 for(const party of parties)assertPacing({...s,bookings:[...others,...parties]},s.services.find(v=>v.id===party.serviceId)!,party,now,s)
 const allowBreak=new Set(parties.filter(b=>preserve||b.status==='seated').filter(b=>preserve||s.services.find(v=>v.id===b.serviceId)?.staffing?.sections.some(section=>section.serverId===b.serverId&&b.tableIds.every(id=>section.tableIds.includes(id)))).map(b=>b.id))
 const serving=checkStaffing(s,parties,now,allowBreak,true)
 return destinations.map((d,i)=>({...d,serving:serving[i]}))
}
export function validateAssignment(s:State,b:Booking,tableIds:unknown,now:string){return validateAssignments(s,[{booking:b,tableIds}],now)[0].tables}

export function executeAssignment(s:State,actor:Actor,p:any,command:string,version:number,now:string){
 if(actor.agent||!['owner','admin','host'].includes(actor.role))fail(403,'A host or venue manager must change assignments.')
 if(typeof p.version!=='number'||!Number.isInteger(p.version)||p.version!==version)fail(409,'The floor changed. Refresh before changing this assignment.')
 const b=currentParty(s,p.bookingId),reason=p.reason===undefined||typeof p.reason==='string'&&!p.reason.trim()?undefined:text(p.reason,'Assignment reason',1000)
 const parties=[b]
 if(command==='booking.swap'){
  const other=currentParty(s,p.otherBookingId)
  if(other.id===b.id)fail(400,'Choose two different parties to swap.')
  parties.push(other)
 }
 if(command!=='booking.lock'&&parties.some(b=>b.assignmentLocked))fail(409,'Unlock the assignment before moving or swapping this party.')
 if(command==='booking.lock'&&typeof p.locked!=='boolean')fail(400,'Choose whether this assignment is locked.')
 const before=parties.map(assignmentSnapshot)
 if(command==='booking.move'){
  applyAssignment(b,validateAssignments(s,[{booking:b,tableIds:p.tableIds}],now)[0],{actor:actor.id,at:now,action:command,reason})
 }else if(command==='booking.swap'){
  const destinations=validateAssignments(s,[{booking:b,tableIds:parties[1].tableIds},{booking:parties[1],tableIds:b.tableIds}],now)
  for(const destination of destinations)applyAssignment(destination.booking,destination,{actor:actor.id,at:now,action:command,reason})
 }else {
  if(p.locked)validateAssignments(s,[{booking:b,tableIds:b.tableIds}],now,true)
  b.assignmentLocked=p.locked
 }
 const after=parties.map(assignmentSnapshot)
 const audit:AuditEntry={id:id(),actor:actor.id,at:now,action:command,subject:b.id,before,after,...reason?{reason}:{}}
 return {id:b.id,booking:b,...parties[1]?{otherBooking:parties[1]}:{},audit}
}
