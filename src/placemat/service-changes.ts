import {serviceInput} from './service-input'
import {instant,serviceBy} from './availability'
import {id,fail,text,type State,type Actor,type Proposal} from './model'
import type {ServiceBlock} from './service-blocks'
export type ChangeTask={relocation?:import('./service-relocation').Relocation;outreach?:{id:string;state:'sending'|'accepted'|'unconfirmed'|'guest-opened';at:string;actor:string;providerId?:string|null};cancellation?:{at:string;actor:string;reason:string;refundId?:string;amountCents:number};id:string;bookingId:string;ownerId:string;status:'open'|'failed-contact';reason:string;outcome?:string;updatedAt:string;updatedBy:string}
export type ServiceChange=ServiceBlock&{reason:string;approvedBy:string;approvedAt:string;tasks:ChangeTask[]}
const snapshot=(s:State)=>({services:s.services,tables:s.tables,bookings:s.bookings,serviceChanges:s.serviceChanges??[]})
export function prepareClosure(s:State,p:any,now:string){
 const service=serviceBy(s,p.serviceId)
 if(service.status!=='published'||service.closedAt||service.endAt<=now)fail(409,'Choose an open published service with remaining time.')
 if(!['service','room','arrival','private'].includes(p.scope))fail(400,'Choose a service, room, arrival-window closure or private hold.')
 const scope=p.scope as ServiceBlock['scope']
 const startAt=scope==='service'?service.startAt:instant(p.startAt??service.startAt,'Closure start'),endAt=scope==='service'?service.endAt:instant(p.endAt??service.endAt,'Closure end')
 if(startAt>=endAt||startAt<service.startAt||endAt>service.endAt)fail(400,'Choose a positive interval inside the published service.')
 let tableIds=s.tables.filter(t=>!t.retiredAt).map(t=>t.id)
 if(scope==='room'){
  const area=text(p.area,'Room',80)
  tableIds=s.tables.filter(t=>!t.retiredAt&&(t.area??'Dining room')===area).map(t=>t.id)
  if(!tableIds.length)fail(404,'Choose a room with active tables.')
 }else if(scope==='private'){
  if(!Array.isArray(p.tableIds)||!p.tableIds.length||new Set(p.tableIds).size!==p.tableIds.length||p.tableIds.some((id:unknown)=>!tableIds.includes(String(id))))fail(400,'Select distinct active tables for private use.')
  tableIds=p.tableIds
 }
 const bookingIds=s.bookings.filter(b=>['booked','seated'].includes(b.status)&&b.tableIds.some(t=>tableIds.includes(t))&&(scope==='arrival'?b.startAt>=startAt&&b.startAt<endAt:(b.setupStartAt??b.startAt)<endAt&&(b.cleanupEndAt??b.endAt)>startAt)).map(b=>b.id)
 return {serviceId:service.id,scope,tableIds,startAt,endAt,bookingIds,snapshot:structuredClone(snapshot(s))}
}
export function approveClosure(s:State,actor:Actor,proposal:Proposal,now:string){
 const p=proposal.plan
 if(JSON.stringify(snapshot(s))!==JSON.stringify(p.snapshot))fail(409,'The service, bookings or inventory changed. Prepare and review the impacts again.')
 const change:ServiceChange={id:proposal.id,serviceId:p.serviceId,scope:p.scope,tableIds:p.tableIds,startAt:p.startAt,endAt:p.endAt,reason:proposal.reason,approvedBy:actor.id,approvedAt:now,tasks:p.bookingIds.map((bookingId:string)=>({id:id(),bookingId,ownerId:actor.id,status:'open',reason:proposal.reason,updatedAt:now,updatedBy:actor.id}))}
 ;(s.serviceChanges??=[]).push(change)
 return change
}
export function followupChange(s:State,actor:Actor,p:any,now:string){
 const change=s.serviceChanges?.find(c=>c.id===p.changeId)??fail(404,'Service change not found.'),task=change.tasks.find(t=>t.id===p.taskId)??fail(404,'Affected booking task not found.')
 if(!['open','failed-contact'].includes(p.status))fail(400,'Keep follow-up open or record failed contact. No message is sent here.')
 task.status=p.status;task.outcome=text(p.outcome,'Staff-recorded outcome',500);task.ownerId=actor.id;task.updatedAt=now;task.updatedBy=actor.id
 s.audit.push({id:id(),actor:actor.id,at:now,action:'service.followup.recorded',subject:task.bookingId,reason:task.outcome})
 return task
}

/** Reviewed changes to future seating hours and capacity never rewrite commitments. */
export function prepareAmendment(s:State,p:any,now:string){
 const service=serviceBy(s,p.serviceId)
 if(service.status!=='published'||service.closedAt||service.endAt<=now)fail(409,'Choose an open published service with remaining time.')
 const changes=p.changes
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length||Object.keys(changes).some(k=>!['endAt','coverLimit'].includes(k)))fail(400,'Amend the service end or cover limit only; other settings retain their existing reviewed doors.')
 const normalized=serviceInput(s,{...service,...changes},service)
 const next={...service,endAt:normalized.endAt,coverLimit:normalized.coverLimit,version:service.version+1}
 if(next.endAt===service.endAt&&next.coverLimit===service.coverLimit)fail(400,'Choose a changed service end or cover limit.')
 const commitments=s.bookings.filter(b=>b.serviceId===service.id&&['booked','seated'].includes(b.status))
 if(s.holds?.some(h=>h.serviceId===service.id))fail(409,'Wait for active checkout holds to complete or expire before amending this service.')
 if(commitments.some(b=>(b.cleanupEndAt??b.endAt)>next.endAt))fail(409,'The amended end would exclude an existing commitment. Keep its full turn and cleanup.')
 if(s.bookings.filter(b=>b.serviceId===service.id&&['booked','seated','completed'].includes(b.status)).reduce((total,b)=>total+b.partySize,0)>next.coverLimit)fail(409,'The cover limit cannot exclude existing active bookings.')
 if(next.endAt>service.endAt&&s.services.some(v=>v.id!==service.id&&v.status==='published'&&!v.closedAt&&v.startAt<next.endAt&&v.endAt>service.endAt))fail(409,'The extended hours overlap another published service. Review that service separately.')
 return {serviceId:service.id,before:structuredClone(service),after:next,bookingIds:commitments.map(b=>b.id),snapshot:structuredClone(snapshot(s))}
}
export function approveAmendment(s:State,actor:Actor,proposal:Proposal,now:string){
 if(actor.agent||actor.deviceId||!['owner','admin'].includes(actor.role))fail(403,'A personal owner or manager must approve a service amendment.')
 const p=proposal.plan
 if(JSON.stringify(snapshot(s))!==JSON.stringify(p.snapshot))fail(409,'The service, bookings or inventory changed. Prepare and review the amendment again.')
 // Revalidate against the current time, not only the saved input snapshot.
 const checked=prepareAmendment(s,{serviceId:p.serviceId,changes:{endAt:p.after.endAt,coverLimit:p.after.coverLimit}},now)
 Object.assign(serviceBy(s,p.serviceId),checked.after)
 s.audit.push({id:id(),actor:actor.id,at:now,action:'service.amend',subject:p.serviceId,reason:proposal.reason})
 return checked.after
}
