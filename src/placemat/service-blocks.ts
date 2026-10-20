import {fail,type State,type Booking} from './model'
export type ServiceBlock={id:string;serviceId:string;scope:'service'|'room'|'arrival'|'private';tableIds:string[];startAt:string;endAt:string}
/** Closure intervals are half-open; arrival restrictions apply to the arrival only. */
export function blockedByChange(s:State,tableIds:string[],startAt:string,endAt:string,arrivalAt=startAt){
 return (s.serviceChanges??[]).some(c=>c.tableIds.some(id=>tableIds.includes(id))&&(c.scope==='arrival'?arrivalAt>=c.startAt&&arrivalAt<c.endAt:startAt<c.endAt&&endAt>c.startAt))
}
export function assertServiceBlocks(s:State,tableIds:string[],startAt:string,endAt:string,arrivalAt=startAt){
 if(blockedByChange(s,tableIds,startAt,endAt,arrivalAt))fail(409,'This inventory is closed or held for private use. Choose another available time or assignment.')
}

/** Until the guest-accepted relocation workflow exists, other assignment doors cannot bypass it. */
export function assertClosureAssignment(s:State,b:Booking,tableIds:unknown){
 if(!Array.isArray(tableIds))return
 const changed=tableIds.length!==b.tableIds.length||b.tableIds.some(id=>!tableIds.includes(id))
 if(changed&&(s.serviceChanges??[]).some(change=>change.tasks.some(task=>task.bookingId===b.id)))fail(409,'Guest acceptance is required before relocating this affected booking. Keep its original assignment.')
}
