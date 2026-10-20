import {instant,serviceBy} from './availability'
import {id,fail,text,type State,type Actor,type Proposal} from './model'
import type {ServiceBlock} from './service-blocks'
export type ChangeTask={id:string;bookingId:string;ownerId:string;status:'open'|'failed-contact';reason:string;outcome?:string;updatedAt:string;updatedBy:string}
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
