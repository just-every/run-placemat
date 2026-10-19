import { fail, id, number, text, type Actor } from './model'

export const queueStates = ['queued','offered','accepted','arrived','seated','declined','expired','abandoned'] as const
type QueueStatus = typeof queueStates[number]
type Event = { at:string; actor:string; action:string; from:string; to:string; reason:string; owner:string; details?:unknown }
type FollowUp = { id:string; kind:'no-contact'|'missed-offer'|'service-close'; reason:string; owner:string; createdAt:string; status:'open'|'completed'; completedAt?:string; completedBy?:string; outcome?:string }
export type QueueEntry = {
 id:string; serviceId:string; guestId:string; partySize:number; status:QueueStatus|'waiting'|'cancelled';
 createdAt?:string|null; seatedAt?:string; resolvedAt?:string; bookingId?:string; priority?:number;
 quote?:{minMinutes:number;maxMinutes:number;at:string;actor:string;basis:string};
 actualWaitMinutes?:number|null; owner?:string; history?:Event[]; followUps?:FollowUp[]
}
const currentStatus = (row:QueueEntry):string => row.status==='waiting'?'queued':row.status==='cancelled'?'declined':row.status
const terminal = (row:QueueEntry) => ['seated','declined','expired','abandoned'].includes(currentStatus(row))
function history(row:QueueEntry,actor:Actor,now:string,action:string,from:string,to:string,reason:string,details?:unknown) {
 (row.history??=[]).push({at:now,actor:actor.id,action,from,to,reason,owner:row.owner??actor.id,...details===undefined?{}:{details}})
}
function task(row:QueueEntry,actor:Actor,now:string,kind:FollowUp['kind'],reason:string) {
 if(row.followUps?.some(t=>t.kind===kind&&t.status==='open'))return
 ;(row.followUps??=[]).push({id:id(),kind,reason,owner:row.owner??actor.id,createdAt:now,status:'open'})
}
function quote(row:QueueEntry,actor:Actor,p:any,now:string) {
 const minMinutes=number(p.quoteMin,'Minimum quoted wait',0,720),maxMinutes=number(p.quoteMax,'Maximum quoted wait',0,720)
 if(maxMinutes<minMinutes)fail(400,'The maximum quoted wait must be at least the minimum.')
 row.quote={minMinutes,maxMinutes,at:now,actor:actor.id,basis:text(p.basis,'Quote basis',500)}
}
/** Decorate the real waitlist.add result, using the actual matched guest's phone. */
export function initializeQueue(row:QueueEntry,actor:Actor,p:any,now:string):QueueEntry {
 row.status='queued';row.createdAt=now;row.priority=0;row.owner=actor.id;row.history=[];row.followUps=[];row.actualWaitMinutes=null
 if(p.quoteMin!==undefined||p.quoteMax!==undefined)quote(row,actor,p,now)
 if(!p.phone?.trim())task(row,actor,now,'no-contact',p.contactReason?text(p.contactReason,'No-phone contact arrangement',500):'No phone recorded. Confirm an in-person contact arrangement with this party.')
 history(row,actor,now,'joined','','queued','Staff intake',row.quote??null)
 return row
}
/** Check before allocation, then mark only after the real capacity-checked booking exists. */
export function queueCanSeat(row:QueueEntry) {
 if(!['queued','offered','accepted','arrived'].includes(currentStatus(row)))fail(409,'This party is no longer waiting to be seated.')
}
export function markQueueSeated(row:QueueEntry,actor:Actor,now:string,bookingId:string):void {
 queueCanSeat(row)
 const from=currentStatus(row)
 row.status='seated';row.seatedAt=now;row.resolvedAt=now;row.bookingId=bookingId
 row.actualWaitMinutes=row.createdAt?Math.max(0,(Date.parse(now)-Date.parse(row.createdAt))/60000):null
 for(const followUp of row.followUps??[])if(followUp.kind==='no-contact'&&followUp.status==='open')Object.assign(followUp,{status:'completed',completedAt:now,completedBy:actor.id,outcome:'Party reached in person and seated.'})
 history(row,actor,now,'seated',from,'seated','Capacity checked and seated',{bookingId,actualWaitMinutes:row.actualWaitMinutes,quote:row.quote??null})
}
const transitions:Record<string,string[]> = {
 queued:['offered','arrived','declined','abandoned'],offered:['accepted','arrived','declined','expired','abandoned'],
 accepted:['arrived','declined','expired','abandoned'],arrived:['declined','abandoned'],seated:[],declined:[],expired:[],abandoned:[]
}
/** Existing command dispatcher supplies authority checks and atomic save/audit. No message is sent here. */
export function executeQueue(s:any,actor:Actor,p:any,command:string,now:string):QueueEntry|any {
 if(command==='service.close') {
  const service=s.services.find((v:any)=>v.id===p.serviceId)??fail(404,'Service not found.')
  if(service.status!=='published')fail(409,'Publish the service before closing its queue.')
  if(service.closedAt)fail(409,'This service is already closed.')
  const reason=text(p.reason,'Service close reason',500)
  for(const row of s.waitlist.filter((v:QueueEntry)=>v.serviceId===service.id) as QueueEntry[]) {
   row.owner??=actor.id
   if(!terminal(row)) {
    const from=currentStatus(row),next=['offered','accepted'].includes(from)?'expired':'abandoned'
    task(row,actor,now,from==='offered'?'missed-offer':'service-close',reason)
    row.status=next;row.resolvedAt=now;row.actualWaitMinutes=row.createdAt?Math.max(0,(Date.parse(now)-Date.parse(row.createdAt))/60000):null
    history(row,actor,now,'service-closed',from,next,reason,{actualWaitMinutes:row.actualWaitMinutes})
   }
  }
  service.closedAt=now;service.closedBy=actor.id;service.closeReason=reason
  return service
 }
 const row:QueueEntry=s.waitlist.find((v:QueueEntry)=>v.id===p.waitlistId)??fail(404,'Waitlist entry not found.')
 row.owner??=actor.id
 const from=currentStatus(row)
 if(command==='waitlist.followup') {
  const followUp=row.followUps?.find(v=>v.id===p.followUpId)??fail(404,'Follow-up not found.')
  if(followUp.status!=='open')fail(409,'This follow-up is already completed.')
  const outcome=text(p.outcome,'Follow-up outcome',500)
  Object.assign(followUp,{status:'completed',completedAt:now,completedBy:actor.id,outcome})
  history(row,actor,now,'follow-up-completed',from,from,outcome,{followUpId:followUp.id})
  return row
 }
 if(terminal(row))fail(409,'This queue entry is resolved. Its history is retained.')
 const service=s.services.find((v:any)=>v.id===row.serviceId)??fail(404,'Service not found.')
 if(service.closedAt)fail(409,'This service is closed. Complete any assigned follow-up instead.')
 if(command==='waitlist.priority') {
  const priority=number(p.priority,'Priority',0,1000),reason=text(p.reason,'Priority change reason',500)
  const previous=row.priority??0
  row.priority=priority;row.owner=actor.id
  history(row,actor,now,'priority-changed',from,from,reason,{before:previous,after:priority})
 } else if(command==='waitlist.quote') {
  quote(row,actor,p,now)
  history(row,actor,now,'wait-quoted',from,from,row.quote!.basis,row.quote)
 } else if(command==='waitlist.status') {
  const next=p.status,reason=text(p.reason,'Queue status reason',500)
  if(!transitions[from]?.includes(next))fail(409,'That queue transition is unavailable. Seat parties through the capacity-checked seating action.')
  row.status=next
  if(['declined','expired','abandoned'].includes(next)){row.resolvedAt=now;row.actualWaitMinutes=row.createdAt?Math.max(0,(Date.parse(now)-Date.parse(row.createdAt))/60000):null}
  if(next==='expired')task(row,actor,now,'missed-offer',reason)
  history(row,actor,now,'status-changed',from,next,reason,next==='offered'?{source:'staff-recorded',delivery:'not sent by Placemat',capacity:'not reserved; checked at seating'}:undefined)
 } else fail(400,'Unknown queue command.')
 return row
}
