import {fail,type State,type Booking} from './model'
export type ServiceBlock={id:string;serviceId:string;scope:'service'|'room'|'arrival'|'private';tableIds:string[];startAt:string;endAt:string}
/** Closure intervals are half-open; arrival restrictions apply to the arrival only. */
export function blockedByChange(s:State,tableIds:string[],startAt:string,endAt:string,arrivalAt=startAt){
 return (s.serviceChanges??[]).some(c=>c.tableIds.some(id=>tableIds.includes(id))&&(c.scope==='arrival'?arrivalAt>=c.startAt&&arrivalAt<c.endAt:startAt<c.endAt&&endAt>c.startAt))
}
export function assertServiceBlocks(s:State,tableIds:string[],startAt:string,endAt:string,arrivalAt=startAt){
 if(blockedByChange(s,tableIds,startAt,endAt,arrivalAt))fail(409,'This inventory is closed or held for private use. Choose another available time or assignment.')
}

/** Existing assignment doors cannot bypass a still-unanswered guest offer. */
export function assertClosureAssignment(s:State,b:Booking,tableIds:unknown){
 if(!Array.isArray(tableIds))return
 const changed=tableIds.length!==b.tableIds.length||b.tableIds.some(id=>!tableIds.includes(id))
 if(changed&&(s.serviceChanges??[]).some(change=>change.tasks.some(task=>task.bookingId===b.id&&!task.relocation?.acceptedAt&&!task.cancellation)))fail(409,'Guest acceptance is required before relocating this affected booking. Keep its original assignment.')
}

/** Every existing write door preserves affected commitments until the guest accepts. */
export function assertClosureCommitments(previous:State,next:State){
 const keys=['serviceId','startAt','endAt','cleanupEndAt','setupStartAt','partySize','tableIds'] as const
 for(const change of previous.serviceChanges??[])for(const task of change.tasks){
  if(task.relocation?.acceptedAt||task.cancellation)continue
  const before=previous.bookings.find(b=>b.id===task.bookingId),after=next.bookings.find(b=>b.id===task.bookingId)
  if(!before||!after||!keys.some(key=>JSON.stringify(before[key])!==JSON.stringify(after[key])))continue
  const decided=next.serviceChanges?.find(c=>c.id===change.id)?.tasks.find(t=>t.id===task.id)?.relocation
  if(!decided?.acceptedAt||decided.id!==task.relocation?.id||keys.some(key=>JSON.stringify(after[key])!==JSON.stringify(decided.after[key]))||!next.audit.some(e=>e.action==='service.relocation.accepted'&&e.actor==='guest'&&e.subject===after.id&&e.at===decided.acceptedAt))fail(409,'Guest acceptance is required before changing this affected booking commitment. Review a relocation offer first.')
 }
}
