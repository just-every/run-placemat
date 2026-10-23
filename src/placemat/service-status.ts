import {activeHolds} from './staffing-capacity'
import {assertInventory} from './direct-inventory'
import {allocation,active,occupiedStartAt,occupiedEndAt} from './capacity'
import {checkStaffing,recordServing,servingFor} from './staffing-capacity'
import {assignmentFor} from './combinations'
import {fail,id,text,type Actor,type Booking,type State} from './model'

export const serviceStatuses = ['confirmed','reconfirmed','arrived','partially-arrived','seated','ordering','check-open','paid','clearing','completed','late','cancelled','no-show'] as const
export const floorStatuses = ['reserved','seated','mains','dessert','check-dropped','needs-bussing','ready'] as const
export type ServiceStatus = typeof serviceStatuses[number]
export type FloorStatus = typeof floorStatuses[number]
export type ServiceSnapshot = {status:ServiceStatus;floorStatus:FloorStatus;bookingStatus:Booking['status'];needsBussing:boolean}
export type ServiceEvent = {
 id:string;bookingId:string;at:string;actor:string;source:'staff-recorded'|'guest-supplied';reason:string;
 before:ServiceSnapshot;after:ServiceSnapshot;correctsEventId?:string
}

const transitions:Record<ServiceStatus,readonly ServiceStatus[]> = {
 confirmed:['reconfirmed','arrived','partially-arrived','seated','late','cancelled','no-show'],
 reconfirmed:['arrived','partially-arrived','seated','late','cancelled','no-show'],
 arrived:['partially-arrived','seated','cancelled'],
 'partially-arrived':['arrived','seated','cancelled'],
 late:['reconfirmed','arrived','partially-arrived','seated','cancelled','no-show'],
 seated:['ordering','check-open','paid','clearing','completed'],
 ordering:['check-open','paid','clearing','completed'],
 'check-open':['paid','clearing','completed'],
 paid:['clearing','completed'],clearing:['completed'],completed:[],cancelled:[],'no-show':[]
}
const floorTransitions:Record<FloorStatus,readonly FloorStatus[]> = {
 reserved:['seated'],seated:['mains','dessert','check-dropped','needs-bussing'],
 mains:['dessert','check-dropped','needs-bussing'],dessert:['check-dropped','needs-bussing'],
 'check-dropped':['needs-bussing'],'needs-bussing':['ready'],ready:[]
}
const eventsFor = (s:State,b:Booking) => (s.serviceEvents??[]).filter(e=>e.bookingId===b.id)
function initial(b:Booking):ServiceSnapshot {
 const status:ServiceStatus=b.status==='booked'?'confirmed':b.status
 return {status,bookingStatus:b.status,needsBussing:b.needsBussing??['seated','completed'].includes(b.status),
  floorStatus:b.status==='seated'?'seated':b.status==='completed'?'needs-bussing':b.status==='booked'?'reserved':'ready'}
}
export function serviceSnapshot(s:State,b:Booking):ServiceSnapshot {
 const event=eventsFor(s,b).at(-1)
 return event&&event.after.bookingStatus===b.status?{...event.after}:initial(b)
}

/** Reports retain whether an observation came from a staff member or the guest. */
export function floorStage(s:State,b:Booking,now:string) {
 const snapshot=serviceSnapshot(s,b),events=eventsFor(s,b)
 // An operational observation does not restart the course timer.
 const transition=events.findLast(e=>e.before.floorStatus!==e.after.floorStatus)
 const consistent=events.at(-1)?.after.bookingStatus===b.status
 const since=consistent?(transition?.at??(events[0]?.before.floorStatus==='reserved'?b.createdAt:events[0]?.at)??null):b.status==='booked'||b.source==='walk-in'||b.source==='waitlist'?b.createdAt:null
 return {status:snapshot.floorStatus,serviceStatus:snapshot.status,since,nextStages:transitions[snapshot.status],nextFloorStages:floorTransitions[snapshot.floorStatus],
  elapsedMinutes:since?Math.max(0,Math.floor((Date.parse(now)-Date.parse(since))/60000)):null,
  source:consistent?(transition??events.at(-1))!.source:'booking-record' as const,
  actor:consistent?(transition??events.at(-1))!.actor:null,needsBussing:snapshot.needsBussing}
}

export function assertTablesReady(s:State,tableIds:string[],except?:string){
 if(s.bookings.some(b=>b.id!==except&&b.needsBussing&&b.tableIds.some(id=>tableIds.includes(id))))fail(409,'A selected table still needs bussing. Staff must record clearing and ready before seating another party.')
}

function fit(s:State,b:Booking,now:string,seating:boolean) {
 const service=s.services.find(v=>v.id===b.serviceId)??fail(404,'Service not found.')
 if(service.status!=='published'||service.closedAt)fail(409,'Choose an open, published service before seating this party.')
 assertInventory(s,b.tableIds,b.setupStartAt??b.startAt,occupiedEndAt(b,now),b.source)
 allocation(s,service,b.partySize,{...b,status:seating?'seated':b.status},b.tableIds,b.id,[],now)
 if(seating){
  assertTablesReady(s,b.tableIds,b.id)
  // Check the actual current instant separately from the protected reservation.
  // This does not invent an occupied interval between now and a future booking.
  if(activeHolds(s,now).some(h=>(h.setupStartAt??h.startAt)<=now&&(h.cleanupEndAt??h.endAt)>now&&h.tableIds.some(id=>b.tableIds.includes(id))))fail(409,'A selected table is reserved by a live checkout hold.')
  if(s.bookings.some(other=>other.id!==b.id&&active(other)&&occupiedStartAt(other)<=now&&occupiedEndAt(other,now)>now&&other.tableIds.some(id=>b.tableIds.includes(id))))fail(409,'A selected table is occupied now. Review the current floor before seating or correcting this party.')
 }
}

function advance(before:ServiceSnapshot,status:ServiceStatus):ServiceSnapshot {
 const next={...before,status}
 if(['confirmed','reconfirmed','arrived','partially-arrived','late'].includes(status))next.bookingStatus='booked'
 else if(['cancelled','no-show','completed'].includes(status))next.bookingStatus=status as Booking['status']
 else next.bookingStatus='seated'
 if(status==='seated'){next.floorStatus='seated';next.needsBussing=true}
 else if(['clearing','completed'].includes(status)){next.floorStatus='needs-bussing';next.needsBussing=true}
 else if(status==='paid'){next.floorStatus='check-dropped';next.needsBussing=true}
 else if(['cancelled','no-show'].includes(status))next.floorStatus=before.needsBussing?'needs-bussing':'ready'
 return next
}

/** booking.stage: stage and/or floorStage; correction uses correctsEventId + reason.
 * The command dispatcher supplies the atomic save and general audit row. */
export function executeServiceStatus(s:State,actor:Actor,p:any,now:string) {
 if(actor.agent||!['owner','admin','host','lead'].includes(actor.role))fail(403,'A host or venue manager must record service status.')
 if(p.source!==undefined&&p.source!=='staff-recorded')fail(400,'This action records a staff observation, not a POS signal.')
 if(!Number.isFinite(Date.parse(now)))fail(400,'A valid service observation time is required.')
 const b=s.bookings.find(v=>v.id===p.bookingId)??fail(404,'Booking not found.')
 const history=eventsFor(s,b),before=serviceSnapshot(s,b)
 if(history.at(-1)&&now<history.at(-1)!.at)fail(409,'An observation cannot precede the latest service event.')
 let after:ServiceSnapshot,reason=p.reason===undefined||typeof p.reason==='string'&&!p.reason.trim()?'':text(p.reason,'Service status reason',1000)
 let correctsEventId:string|undefined
 if(p.correctsEventId!==undefined) {
  reason=text(p.reason,'Correction reason',1000)
  const original=history.find(e=>e.id===p.correctsEventId)??fail(404,'Service event not found.')
  if(original.id!==history.at(-1)?.id)fail(409,'Correct the latest service event so later observations remain intact.')
  if(original.after.bookingStatus!==b.status)fail(409,'The booking changed after this observation. Review its current state.')
  if(p.stage!==undefined||p.floorStage!==undefined)fail(400,'A correction restores the selected event’s prior state; do not supply another stage.')
  after={...original.before};correctsEventId=original.id
  // Reversing a label cannot certify that a physical table has been cleaned.
  if(before.needsBussing&&after.floorStatus!=='ready') {
   after.needsBussing=true
   if(after.floorStatus==='reserved')after.floorStatus='needs-bussing'
  }
 } else {
  const raw=p.stage,explicitFloor=p.floorStage??(floorStatuses.includes(raw)&&!serviceStatuses.includes(raw)?raw:undefined)
  if(raw!==undefined&&!serviceStatuses.includes(raw)&&!floorStatuses.includes(raw))fail(400,'Choose a supported service or floor stage.')
  if(explicitFloor!==undefined&&!floorStatuses.includes(explicitFloor))fail(400,'Choose a supported floor stage.')
  let status:ServiceStatus|undefined=serviceStatuses.includes(raw)?raw:undefined
  if(explicitFloor==='seated'&&before.bookingStatus==='booked')status='seated'
  if(explicitFloor==='needs-bussing'&&before.bookingStatus==='seated'&&status===undefined)status='clearing'
  if(explicitFloor==='ready') {
   if(before.floorStatus!=='needs-bussing')fail(409,'Record clearing or needs bussing before marking the table ready.')
   if(status!==undefined&&status!=='completed')fail(409,'A ready table completes its seated party.')
   status=before.bookingStatus==='seated'?'completed':status
  }
  if(status===undefined&&explicitFloor===undefined)fail(400,'Choose a service or floor stage.')
  if(status!==undefined&&status!==before.status&&!transitions[before.status].includes(status))fail(409,'That service transition is unavailable. Correct an accidental observation with a reason.')
  after=status===undefined||status===before.status?{...before}:advance(before,status)
  if(explicitFloor!==undefined) {
   if(explicitFloor!==before.floorStatus&&!floorTransitions[before.floorStatus].includes(explicitFloor))fail(409,'That floor transition is unavailable. Correct an accidental observation with a reason.')
   if(!['seated','completed'].includes(after.bookingStatus)&&explicitFloor!=='reserved'&&explicitFloor!=='ready')fail(409,'Seat the party before recording courses or clearing.')
   if(explicitFloor==='ready'&&after.bookingStatus!=='completed')fail(409,'Complete the seated party before marking its table ready.')
   if(after.bookingStatus==='completed'&&!['needs-bussing','ready'].includes(explicitFloor))fail(409,'A completed party needs bussing until staff mark its table ready.')
   after.floorStatus=explicitFloor;after.needsBussing=explicitFloor==='ready'?false:after.needsBussing||explicitFloor!=='reserved'
  }
  if(after.status===before.status&&after.floorStatus===before.floorStatus&&history.length)fail(409,'That service state is already recorded.')
 }
 if(['booked','seated'].includes(after.bookingStatus)){
  const service=s.services.find(v=>v.id===b.serviceId)??fail(404,'Service not found.')
  assignmentFor(s,b.tableIds,b.partySize,b.startAt,service.startAt,b.requiredAccessTags??[],b.requiredArea,b)
 }
 if(after.bookingStatus==='seated'&&b.tableIds.some(id=>s.tables.find(t=>t.id===id)?.inventoryKind==='pool'))fail(409,'Assign physical counter seats or a table before seating a pool reservation.')
 const newlySeating=after.bookingStatus==='seated'&&before.bookingStatus!=='seated'
 if((after.bookingStatus==='booked'||after.bookingStatus==='seated')&&(newlySeating||!['booked','seated'].includes(before.bookingStatus))){
  checkStaffing(s,[{...b,status:after.bookingStatus}],now,new Set(),true)
 }
 const reacquiring=['booked','seated'].includes(after.bookingStatus)&&!['booked','seated'].includes(before.bookingStatus)
 if(reacquiring||after.needsBussing&&(!before.needsBussing||before.floorStatus==='ready'))fit(s,{...b,status:after.bookingStatus},now,after.needsBussing||after.bookingStatus==='seated')
 // All validation completes before changing the booking or its append-only log.
 if(newlySeating||b.status==='seated'&&!history.length)recordServing(b,servingFor(s,b.serviceId,b.tableIds),actor.id,now,'seated',reason,true)
 b.status=after.bookingStatus;b.needsBussing=after.needsBussing
 const event:ServiceEvent={id:id(),bookingId:b.id,at:now,actor:actor.id,source:'staff-recorded',reason,before,after,...correctsEventId?{correctsEventId}:{}}
 ;(s.serviceEvents??=[]).push(event)
 return {id:b.id,booking:b,event,stage:floorStage(s,b,now)}
}
