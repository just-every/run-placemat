import {fail,id,text,type State,type Actor,type HandoverTask} from './model'
import {instant} from './availability'

/** Operational follow-up only: completion never asserts payment, delivery or allergy-safe preparation. */
export async function executeHandover(db:D1Database,s:State,actor:Actor,command:string,p:any,now:string){
 const booking=s.bookings.find(b=>b.id===p.bookingId)??fail(404,'Booking not found.')
 let assignment:{ownerId:string;dueAt:string}|undefined
 if(['booking.handover','booking.handover.assign'].includes(command)){
  if(actor.agent||!['owner','admin'].includes(actor.role))fail(403,'A manager assigns handover work.')
  const ownerId=text(p.ownerId,'Follow-up owner',100),operator=await db.prepare('SELECT role,status FROM oa_operators WHERE id=?').bind(ownerId).first<{role:string;status:string}>()
  if(!operator||operator.status!=='active'||!(['owner','admin'].includes(operator.role)||s.hostIds?.includes(ownerId)))fail(409,'Assign an active manager or owner-granted host.')
  assignment={ownerId,dueAt:instant(p.dueAt,'Follow-up due time')}
 }
 if(command==='booking.handover'){
  if(!['request','callback'].includes(p.kind))fail(400,'Choose a guest request or promised callback.')
  if((booking.handover?.length??0)>=40)fail(400,'This reservation supports forty handover tasks.')
  const task:HandoverTask={id:id(),kind:p.kind,text:text(p.text,'Guest follow-up',1000),...assignment!,history:[{actor:actor.id,at:now,action:'assigned',...assignment!}]}
  ;(booking.handover??=[]).push(task);return {id:booking.id,task}
 }
 const task=booking.handover?.find(t=>t.id===p.taskId)??fail(404,'Handover task not found.')
 if(actor.agent||!['owner','admin'].includes(actor.role)&&!(actor.role==='host'&&s.hostIds?.includes(actor.id)&&task.ownerId===actor.id))fail(403,'Only a manager or this task’s active host owner can complete it.')
 if(task.history.some(e=>e.action==='completed'))fail(409,'That handover task is already complete.')
 if(command==='booking.handover.assign'){Object.assign(task,assignment);task.history.push({actor:actor.id,at:now,action:'assigned',...assignment!});return {id:booking.id,task}}
 task.history.push({actor:actor.id,at:now,action:'completed',outcome:text(p.outcome,'Recorded outcome',1000)})
 return {id:booking.id,task}
}

/** New follow-up text never widens the existing read audience: managers or the assigned active host only. */
export function projectHandover(value:any,actor?:Actor|null,visibleTaskIds:ReadonlySet<string>=new Set()):any{
 if(actor&&!actor.agent&&['owner','admin'].includes(actor.role))return value
 if(Array.isArray(value))return value.map(item=>projectHandover(item,actor,visibleTaskIds))
 if(!value||typeof value!=='object')return value
 // Historical snapshots must use today's assignment, never their former ownerId.
 const owns=(task:any)=>actor?.role==='host'&&!actor.agent&&visibleTaskIds.has(task.id)
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='handover'&&Array.isArray(item)?item.filter(owns).map(task=>projectHandover(task,actor,visibleTaskIds)):key==='task'&&item&&typeof item==='object'&&'ownerId' in item&&!owns(item)?null:projectHandover(item,actor,visibleTaskIds)]))
}
