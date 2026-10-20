import {accessibleTables,applyAssignment,assignmentInterval,assignmentSnapshot,validateAssignments} from './assignments'
import {ruleFor} from './booking-rules'
import {allocation,occupiedEndAt} from './capacity'
import {assignmentFor,candidateSets,sameTables,tableArea} from './combinations'
import {Problem,fail,id,type Actor,type Booking,type Proposal,type Service,type State} from './model'
import {assertPacing} from './pacing'
import {queueCanSeat,type QueueEntry} from './queue'
import {serviceSnapshot} from './service-status'
import {checkStaffing} from './staffing-capacity'
import {fitAt} from './turn-fit'
import {tableTurn} from './turn-policy'

export type AllocationMove={bookingId:string;tableIds:string[]}
export type AllocationWait={waitlistId:string;partySize:number;requestedAt:string;requestedSlotAt:string;earliestAt:string|null;waitMinutes:number|null;delayMinutes:number|null}
export type AllocationDemand={feasibleQueuedCovers:number;requestedSlotCovers:number;waits:AllocationWait[]}
export type AllocationPreview={
 affectedBookings:Array<{bookingId:string;guestId:string;partySize:number;original:{startAt:string;endAt:string;setupStartAt:string;cleanupEndAt:string;requiredArea:string|null;requiredAccessTags:string[]};before:ReturnType<typeof assignmentSnapshot>;after:ReturnType<typeof assignmentSnapshot>}>;
 waits:Array<{waitlistId:string;partySize:number;requestedAt:string;requestedSlotAt:string;before:Pick<AllocationWait,'earliestAt'|'waitMinutes'|'delayMinutes'>;after:Pick<AllocationWait,'earliestAt'|'waitMinutes'|'delayMinutes'>}>;
 explanations:string[]
}
export type AllocationAlternative={id:string;key:string;serviceId:string;moves:AllocationMove[];before:AllocationDemand;after:AllocationDemand;preview:AllocationPreview}
const inputsFor=(s:State)=>structuredClone({venue:s.venue,services:s.services,bookings:s.bookings,tables:s.tables,allocationTables:s.allocationTables??null,combinations:s.combinations??[],serviceEvents:s.serviceEvents??[],waitlist:s.waitlist})
export type AllocationPlan={serviceId:string;moves:AllocationMove[];preview:AllocationPreview;inputs:ReturnType<typeof inputsFor>}
export type AllocationSelection={serviceId:string;alternativeId?:string;id?:string;key?:string}
const basis='Deterministic queue-order feasibility on the remaining published service slots, with full setup, turn, cleanup, access, area, staffing, kitchen and pacing checks. Hypothetical queue placements are not reservations or wait promises. Search considers single moves and exact two-party swaps; it does not claim a global optimum.'
const canonical=(moves:AllocationMove[])=>JSON.stringify(moves.map(m=>({bookingId:m.bookingId,tableIds:[...m.tableIds].sort()})).sort((a,b)=>a.bookingId.localeCompare(b.bookingId)))
const isConflict=(error:unknown)=>error instanceof Problem&&[400,404,409].includes(error.status)
const serviceFor=(s:State,serviceId:string,now:string)=>{
 if(!Number.isFinite(Date.parse(now)))fail(400,'A valid allocation advice time is required.')
 const service=s.services.find(v=>v.id===serviceId)??fail(404,'Service not found.')
 if(service.status!=='published'||service.closedAt||service.endAt<=now)fail(409,'Choose an open, published service with remaining seating time.')
 return service
}
function movable(s:State,b:Booking,now:string){
 const stage=serviceSnapshot(s,b)
 return b.status==='booked'&&!b.assignmentLocked&&!b.needsBussing&&!stage.needsBussing&&!['arrived','partially-arrived'].includes(stage.status)&&(b.setupStartAt??b.startAt)>=now
}
const strictPacing=(s:State,service:Service,b:Booking,now:string)=>assertPacing(s,service,b,now,{...s,bookings:[]})
/** Stage the complete ledger before any mutation; old terms and room promises survive. */
function stageMoves(s:State,service:Service,moves:AllocationMove[],now:string){
 if(!moves.length||moves.length>2||new Set(moves.map(m=>m.bookingId)).size!==moves.length)fail(409,'Choose an exact generated single move or two-party swap.')
 const staged={...s,bookings:s.bookings.map(b=>({...b,tableIds:[...b.tableIds]}))}
 const destinations=validateAssignments(staged,moves.map(move=>{
  const booking=staged.bookings.find(b=>b.id===move.bookingId)??fail(404,'Booking not found.')
  if(booking.serviceId!==service.id||!movable(s,booking,now))fail(409,'The allocation includes a locked, arrived, seated or started commitment. Prepare fresh advice.')
  const oldAreas=[...new Set(booking.tableIds.map(id=>tableArea(s.tables.find(t=>t.id===id)!)))].sort()
  const newTables=assignmentFor(s,move.tableIds,booking.partySize,booking.startAt,service.startAt,booking.requiredAccessTags??[],booking.requiredArea).tables
  if(JSON.stringify(oldAreas)!==JSON.stringify([...new Set(newTables.map(tableArea))].sort()))fail(409,'Retain the booked dining area when improving allocations.')
  if(newTables.some(t=>tableTurn(service,t,booking.partySize)*60000>Date.parse(booking.endAt)-Date.parse(booking.startAt)))fail(409,'The destination requires a longer turn than the party’s promised reservation.')
  return {booking,tableIds:move.tableIds}
 }),now)
 for(const destination of destinations){
  if(destination.setupStartAt<now)fail(409,'The destination’s full setup must still fit before arrival.')
  applyAssignment(destination.booking,destination)
 }
 const active=staged.bookings.filter(b=>b.serviceId===service.id&&['booked','seated'].includes(b.status))
 const movedIds=new Set(moves.map(m=>m.bookingId))
 // Unchanged owners may retain their existing break assignment; moved parties may not.
 checkStaffing(staged,active,now,new Set(active.filter(b=>!movedIds.has(b.id)).map(b=>b.id)),false)
 for(const b of staged.bookings.filter(b=>b.serviceId===service.id&&['booked','seated','completed'].includes(b.status)))strictPacing(staged,service,b,now)
 return staged
}
function demandRows(s:State,serviceId:string){
 return s.waitlist.filter(row=>{
  if(row.serviceId!==serviceId||row.bookingId&&s.bookings.some(b=>b.id===row.bookingId&&['booked','seated'].includes(b.status)))return false
  try{queueCanSeat(row);return true}catch(error){if(isConflict(error))return false;throw error}
 }).sort((a,b)=>(b.priority??0)-(a.priority??0)||(a.createdAt??'').localeCompare(b.createdAt??'')||a.id.localeCompare(b.id))
}
function requestedSlot(service:Service,row:QueueEntry,now:string){
 const origin=Date.parse(service.startAt),rule=ruleFor(service,'waitlist'),step=rule.slotMinutes*60000
 const requestedAt=row.preferredAt??now,desired=Math.max(origin,Date.parse(now)+rule.leadMinutes*60000,Date.parse(requestedAt))
 return {requestedAt,requestedSlotAt:new Date(origin+Math.ceil((desired-origin)/step)*step).toISOString(),step}
}
function localTime(at:string,timezone:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at))
 const part=(type:string)=>parts.find(p=>p.type===type)!.value
 return {day:`${part('year')}-${part('month')}-${part('day')}`,clock:`${part('hour')}:${part('minute')}`}
}
function channelAllows(s:State,service:Service,row:QueueEntry,startAt:string,now:string){
 const rule=ruleFor(service,'waitlist'),today=localTime(now,s.venue.timezone),arrival=localTime(startAt,s.venue.timezone)
 return row.partySize>=rule.minParty&&row.partySize<=rule.maxParty&&row.partySize<=rule.inquiryAbove&&!rule.blockedStarts.includes(startAt)&&!(arrival.day===today.day&&today.clock>rule.sameDayCutoff)&&(Date.parse(arrival.day)-Date.parse(today.day))/86400000<=rule.horizonDays
}
/** Freeze ongoing occupancy at the supplied clock because fitAt owns a wall-clock default. */
function fitLedger(s:State,now:string):State{
 return {...s,bookings:s.bookings.map(b=>b.status==='seated'?{...b,status:'booked' as const,expectedEndAt:new Date(Math.max(Date.parse(b.expectedEndAt??b.endAt),Date.parse(now)+1)).toISOString()}:b)}
}
function queueFit(s:State,service:Service,row:QueueEntry,startAt:string,now:string){
 if(!channelAllows(s,service,row,startAt,now))return null
 const filtered=accessibleTables(s,row.requiredAccessTags??[])
 filtered.tables=filtered.tables.filter(t=>!row.preferredArea||tableArea(t)===row.preferredArea)
 const unavailable=s.bookings.filter(b=>b.needsBussing).flatMap(b=>b.tableIds)
 // Try each approved set so a kitchen-rejected first fit cannot hide a valid other area.
 for(const tableIds of candidateSets(filtered).sort((a,b)=>a.length-b.length||a.join('|').localeCompare(b.join('|')))){
  try{
   assignmentFor(filtered,tableIds,row.partySize,startAt,service.startAt,row.requiredAccessTags??[],row.preferredArea)
   const fit=fitAt(fitLedger(filtered,now),service,row.partySize,startAt,tableIds,unavailable,true)
   const booking:Booking={id:`allocation-demand:${row.id}`,serviceId:service.id,guestId:row.guestId,partySize:row.partySize,startAt:fit.startAt,endAt:fit.endAt,cleanupEndAt:fit.cleanupEndAt,setupStartAt:fit.setupStartAt,tableIds:fit.tables.map(t=>t.id),status:'booked',source:'waitlist',createdAt:now,requiredAccessTags:row.requiredAccessTags,requiredArea:row.preferredArea,...fit.combination?{combination:fit.combination}:{}}
   allocation(filtered,service,row.partySize,booking,booking.tableIds,undefined,unavailable,now,true)
   const serving=checkStaffing(filtered,[booking],now,new Set(),false)[0]
   if(serving)Object.assign(booking,serving)
   strictPacing(filtered,service,booking,now)
   return booking
  }catch(error){if(isConflict(error))continue;throw error}
 }
 return null
}
/** Each feasible queue placement consumes capacity for subsequent real waiting parties. */
function evaluateDemand(s:State,service:Service,rows:QueueEntry[],now:string):AllocationDemand{
 const ledger={...s,bookings:[...s.bookings]},waits:AllocationWait[]=[]
 let feasibleQueuedCovers=0,requestedSlotCovers=0
 for(const row of rows){
  const {requestedAt,requestedSlotAt,step}=requestedSlot(service,row,now)
  let booking:Booking|null=null
  for(let t=Date.parse(requestedSlotAt);t<Date.parse(service.endAt);t+=step){
   booking=queueFit(ledger,service,row,new Date(t).toISOString(),now)
   if(booking)break
  }
  if(booking){ledger.bookings.push(booking);feasibleQueuedCovers+=row.partySize;if(booking.startAt===requestedSlotAt)requestedSlotCovers+=row.partySize}
  waits.push({waitlistId:row.id,partySize:row.partySize,requestedAt,requestedSlotAt,earliestAt:booking?.startAt??null,waitMinutes:booking?Math.max(0,(Date.parse(booking.startAt)-Date.parse(now))/60000):null,delayMinutes:booking?Math.max(0,(Date.parse(booking.startAt)-Date.parse(requestedAt))/60000):null})
 }
 return {feasibleQueuedCovers,requestedSlotCovers,waits}
}
function preview(s:State,staged:State,moves:AllocationMove[],before:AllocationDemand,after:AllocationDemand):AllocationPreview{
 return {affectedBookings:moves.map(move=>{
  const b=s.bookings.find(b=>b.id===move.bookingId)!,next=staged.bookings.find(b=>b.id===move.bookingId)!
  return {bookingId:b.id,guestId:b.guestId,partySize:b.partySize,original:{startAt:b.startAt,endAt:b.endAt,setupStartAt:b.setupStartAt??b.startAt,cleanupEndAt:b.cleanupEndAt??b.endAt,requiredArea:b.requiredArea??null,requiredAccessTags:[...b.requiredAccessTags??[]]},before:assignmentSnapshot(b),after:assignmentSnapshot(next)}
 }),waits:before.waits.map(old=>{
  const next=after.waits.find(w=>w.waitlistId===old.waitlistId)!
  const terms=(wait:AllocationWait)=>({earliestAt:wait.earliestAt,waitMinutes:wait.waitMinutes,delayMinutes:wait.delayMinutes})
  return {waitlistId:old.waitlistId,partySize:old.partySize,requestedAt:old.requestedAt,requestedSlotAt:old.requestedSlotAt,before:terms(old),after:terms(next)}
 }),explanations:[`${after.requestedSlotCovers-before.requestedSlotCovers} more queued covers fit at their requested eligible slots (${before.requestedSlotCovers} before; ${after.requestedSlotCovers} after).`,`${before.feasibleQueuedCovers} queued covers fit in the remaining service before; ${after.feasibleQueuedCovers} after.`,...moves.map(m=>`Move booking ${m.bookingId} from ${s.bookings.find(b=>b.id===m.bookingId)!.tableIds.join(', ')} to ${m.tableIds.join(', ')}; keep its arrival, departure, cleanup, dining area and required access.`),'Earliest slots are checked feasibility in queue priority order; they are not reservations, quoted waits or model probabilities.']}
}
function improves(before:AllocationDemand,after:AllocationDemand){return after.requestedSlotCovers>before.requestedSlotCovers&&after.feasibleQueuedCovers>=before.feasibleQueuedCovers}
/** Two deterministic, reviewable alternatives; advice never writes live state. */
export function adviseAllocations(s:State,serviceId:string,now:string){
 const service=serviceFor(s,serviceId,now),rows=demandRows(s,serviceId),before=evaluateDemand(s,service,rows,now),alternatives:AllocationAlternative[]=[]
 if(!rows.length)return {serviceId,generatedAt:now,before,alternatives,basis}
 const candidates=candidateSets(s).sort((a,b)=>{
  const capacity=(ids:string[])=>ids.length===1?s.tables.find(t=>t.id===ids[0])!.seats:s.combinations!.find(c=>sameTables(c.tableIds,ids)&&c.enabled)!.capacity
  return capacity(a)-capacity(b)||a.length-b.length||a.join('|').localeCompare(b.join('|'))
 })
 // Only reservations overlapping an unmet party's requested-slot footprint can free it.
 const targets=rows.filter(r=>before.waits.find(w=>w.waitlistId===r.id)?.earliestAt!==requestedSlot(service,r,now).requestedSlotAt).flatMap(row=>{
  const startAt=requestedSlot(service,row,now).requestedSlotAt
  return candidates.flatMap(tableIds=>{try{
   const fit=assignmentFor(s,tableIds,row.partySize,startAt,service.startAt,row.requiredAccessTags??[],row.preferredArea)
   const endAt=new Date(Date.parse(startAt)+Math.max(...fit.tables.map(t=>tableTurn(service,t,row.partySize)))*60000+(service.turnPolicy?.cleanupMinutes??0)*60000).toISOString()
   return [{tableIds,startAt:fit.setupStartAt,endAt}]
  }catch(error){if(isConflict(error))return [];throw error}})
 })
 const relevant=(b:Booking)=>targets.some(t=>b.tableIds.some(id=>t.tableIds.includes(id))&&assignmentInterval(b,now).startAt<t.endAt&&occupiedEndAt(b,now)>t.startAt)
 const parties=s.bookings.filter(b=>b.serviceId===serviceId&&movable(s,b,now)).sort((a,b)=>a.startAt.localeCompare(b.startAt)||a.id.localeCompare(b.id))
 const consider=(moves:AllocationMove[])=>{
  try{
   const staged=stageMoves(s,service,moves,now),after=evaluateDemand(staged,service,rows,now)
   if(!improves(before,after))return
   const key=canonical(moves)
   alternatives.push({id:`allocation:${encodeURIComponent(serviceId)}:${encodeURIComponent(key)}`,key,serviceId,moves:structuredClone(moves),before,after,preview:preview(s,staged,moves,before,after)})
  }catch(error){if(!isConflict(error))throw error}
 }
 for(const b of parties.filter(relevant)){
  for(const tableIds of candidates){
   if(sameTables(b.tableIds,tableIds))continue
   consider([{bookingId:b.id,tableIds}])
   if(alternatives.length===2)break
  }
  if(alternatives.length===2)break
 }
 if(alternatives.length<2)for(let i=0;i<parties.length;i++){
  for(let j=i+1;j<parties.length;j++){
   const a=parties[i],b=parties[j]
   if(!relevant(a)&&!relevant(b)||sameTables(a.tableIds,b.tableIds))continue
   consider([{bookingId:a.id,tableIds:b.tableIds},{bookingId:b.id,tableIds:a.tableIds}])
   if(alternatives.length===2)break
  }
  if(alternatives.length===2)break
 }
 alternatives.sort((a,b)=>b.after.requestedSlotCovers-a.after.requestedSlotCovers||b.after.feasibleQueuedCovers-a.after.feasibleQueuedCovers||a.moves.length-b.moves.length||a.key.localeCompare(b.key))
 return {serviceId,generatedAt:now,before,alternatives,basis}
}
export function prepareAllocation(s:State,plan:AllocationSelection,now:string):AllocationPlan{
 const advice=adviseAllocations(s,plan.serviceId,now),selection=plan.alternativeId??plan.id??plan.key
 const alternative=advice.alternatives.find(a=>a.id===selection||a.key===selection)??fail(409,'This alternative is unavailable. Refresh allocation advice and choose an exact alternative.')
 return {serviceId:advice.serviceId,moves:structuredClone(alternative.moves),preview:structuredClone(alternative.preview),inputs:inputsFor(s)}
}
export function approveAllocation(s:State,actor:Actor,proposal:Proposal,now:string){
 if(actor.agent||!['owner','admin'].includes(actor.role))fail(403,'A venue manager must approve allocation improvements.')
 if(proposal.status!=='pending')fail(409,'This proposal has already been decided.')
 const plan=proposal.plan as AllocationPlan
 if(!plan||JSON.stringify(plan.inputs)!==JSON.stringify(inputsFor(s)))fail(409,'Allocation inputs changed. Prepare and review fresh advice.')
 const service=serviceFor(s,plan.serviceId,now),staged=stageMoves(s,service,plan.moves,now),rows=demandRows(s,service.id)
 const beforeDemand=evaluateDemand(s,service,rows,now),afterDemand=evaluateDemand(staged,service,rows,now)
 if(!improves(beforeDemand,afterDemand))fail(409,'These moves no longer improve the queued parties’ requested-slot feasibility. Prepare fresh advice.')
 const reason=proposal.reason,before=plan.moves.map(m=>assignmentSnapshot(s.bookings.find(b=>b.id===m.bookingId)!))
 const destinations=validateAssignments(staged,plan.moves.map(m=>({booking:staged.bookings.find(b=>b.id===m.bookingId)!,tableIds:m.tableIds})),now)
 for(const destination of destinations){
  // Clone append-only serving history before recording the approved change.
  if(destination.booking.servingHistory)destination.booking.servingHistory=structuredClone(destination.booking.servingHistory)
  applyAssignment(destination.booking,destination,{actor:actor.id,at:now,action:'allocation.improve',reason})
 }
 const after=destinations.map(d=>assignmentSnapshot(d.booking)),reviewedPreview=preview(s,staged,plan.moves,beforeDemand,afterDemand)
 const audit={id:id(),actor:actor.id,at:now,action:'allocation.improve',subject:service.id,before,after,reason}
 s.bookings=staged.bookings;s.audit.push(audit)
 return {serviceId:service.id,moves:structuredClone(plan.moves),preview:reviewedPreview,before,after,audit}
}
