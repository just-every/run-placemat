import {fail,id,text,type Actor,type Booking,type State,type Table,type AuditEntry} from './model'
import {serviceSnapshot} from './service-status'
import {occupiedEndAt} from './capacity'

export function accessTags(value:unknown,label:string):string[]{
 if(value===undefined)return []
 if(!Array.isArray(value)||value.length>20)fail(400,`${label} must be an array of up to 20 tags.`)
 return [...new Set((value as unknown[]).map(v=>text(v,label,80)))].sort()
}
export function accessibleTables(s:State,required:string[]):State{
 return {...s,tables:s.tables.filter(t=>required.every(tag=>t.accessTags?.includes(tag)))}
}
/** Preserve the promised interval and its reset when a recorded actual turn overruns. */
export function assignmentInterval(b:Booking,now=new Date().toISOString()){
 const reset=Math.max(0,Date.parse(b.cleanupEndAt??b.endAt)-Date.parse(b.endAt))
 const cleanupEndAt=new Date(Math.max(Date.parse(b.cleanupEndAt??b.endAt),Date.parse(occupiedEndAt(b,now)))).toISOString()
 return {startAt:b.startAt,endAt:new Date(Date.parse(cleanupEndAt)-reset).toISOString(),cleanupEndAt}
}
const overlaps=(a:{startAt:string;cleanupEndAt:string},b:{startAt:string;cleanupEndAt:string})=>a.startAt<b.cleanupEndAt&&a.cleanupEndAt>b.startAt
const active=(b:Booking)=>!['cancelled','no-show'].includes(b.status)
const snapshot=(b:Booking)=>({bookingId:b.id,tableIds:[...b.tableIds],locked:b.assignmentLocked??false})
function currentParty(s:State,bookingId:unknown){
 const b=s.bookings.find(b=>b.id===bookingId)??fail(404,'Booking not found.')
 if(!['booked','seated'].includes(b.status))fail(409,'Only booked, arrived or seated parties can change assignments.')
 return b
}
function selectedTables(s:State,b:Booking,tableIds:unknown):Table[]{
 if(!Array.isArray(tableIds)||!tableIds.length||tableIds.some(id=>typeof id!=='string')||new Set(tableIds).size!==tableIds.length)fail(400,'Choose distinct tables.')
 const tables=(tableIds as string[]).map(id=>s.tables.find(t=>t.id===id)??fail(404,'Table not found.'))
 if(tables.reduce((n,t)=>n+t.seats,0)<b.partySize)fail(409,'The selected tables do not have enough seats.')
 if(new Set(tables.map(t=>t.area??'Dining room')).size>1)fail(409,'A table combination must be in the same dining area.')
 if(tables.some(t=>(b.requiredAccessTags??[]).some(tag=>!t.accessTags?.includes(tag))))fail(409,'The selected tables do not meet this party’s required access needs.')
 return tables
}
/** Validate a complete proposed floor without mutating it; swaps exclude both sources. */
export function validateAssignments(s:State,moves:Array<{booking:Booking;tableIds:unknown}>,now:string){
 const moving=new Set(moves.map(m=>m.booking.id)),others=s.bookings.filter(b=>!moving.has(b.id))
 const destinations=moves.map(m=>({booking:m.booking,tables:selectedTables(s,m.booking,m.tableIds)}))
 for(const {booking:b,tables} of destinations){
  const service=s.services.find(v=>v.id===b.serviceId)??fail(404,'Service not found.')
  const covers=[...others,...moves.map(m=>m.booking)].filter(v=>v.serviceId===service.id&&active(v)).reduce((n,v)=>n+v.partySize,0)
  if(covers>service.coverLimit)fail(409,'This service has reached its cover limit.')
  const ids=tables.map(t=>t.id),interval=assignmentInterval(b,now)
  const stage=serviceSnapshot(s,b).status,physical=b.status==='seated'||['arrived','partially-arrived'].includes(stage)
  const occupiesNow=physical||interval.startAt<=now&&interval.cleanupEndAt>now
  const candidates=[...others,...destinations.filter(d=>d.booking.id!==b.id).map(d=>({...d.booking,tableIds:d.tables.map(t=>t.id)}))]
  for(const other of candidates){
   if(!other.tableIds.some(id=>ids.includes(id)))continue
   if(occupiesNow&&(other.needsBussing||other.status==='seated'||active(other)&&assignmentInterval(other,now).startAt<=now&&assignmentInterval(other,now).cleanupEndAt>now))fail(409,'A selected table is occupied now or still needs bussing. Review the current floor before moving this party.')
   if(active(other)&&overlaps(interval,assignmentInterval(other,now)))fail(409,'A selected table clashes with another party’s promised turn, overrun or cleanup. Choose another table.')
  }
 }
 return destinations
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
 const before=parties.map(snapshot)
 if(command==='booking.move'){
  const tables=validateAssignment(s,b,p.tableIds,now)
  b.tableIds=tables.map(t=>t.id)
 }else if(command==='booking.swap'){
  const destinations=validateAssignments(s,[{booking:b,tableIds:parties[1].tableIds},{booking:parties[1],tableIds:b.tableIds}],now)
  for(const destination of destinations)destination.booking.tableIds=destination.tables.map(t=>t.id)
 }else {
  if(p.locked)validateAssignment(s,b,b.tableIds,now)
  b.assignmentLocked=p.locked
 }
 const after=parties.map(snapshot)
 const audit:AuditEntry={id:id(),actor:actor.id,at:now,action:command,subject:b.id,before,after,...reason?{reason}:{}}
 return {id:b.id,booking:b,...parties[1]?{otherBooking:parties[1]}:{},audit}
}
