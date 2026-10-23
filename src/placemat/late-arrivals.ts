import {allocation} from './capacity'
import {instant} from './availability'
import {fail,id,number,text,type Actor,type State} from './model'
export type LateOperations={graceMinutes?:number;holdUntil?:string;history:Array<{id:string;action:'grace'|'contact'|'hold';at:string;actor:string;reason:string;until?:string;minutes?:number;method?:string;outcome?:string}>}
export function executeLate(s:State,actor:Actor,p:any,now:string){
 const b=s.bookings.find(b=>b.id===p.bookingId)??fail(404,'Booking not found.')
 if(b.status!=='booked')fail(409,'Only an unseated reservation has late-arrival actions.')
 const ops=b.lateOperations??{history:[]},reason=text(p.reason,'Late-arrival reason',1000)
 if(p.action==='grace'){
  const minutes=number(p.minutes,'Grace minutes',0,120);ops.graceMinutes=minutes
  ops.history.push({id:id(),action:'grace',at:now,actor:actor.id,reason,minutes})
 }else if(p.action==='contact'){
  if(!['phone','in-person','other'].includes(p.method))fail(400,'Choose a contact method.')
  ops.history.push({id:id(),action:'contact',at:now,actor:actor.id,reason,method:p.method,outcome:text(p.outcome,'Recorded contact outcome',1000)})
 }else if(p.action==='hold'){
  const until=instant(p.until,'Running-late arrival')
  if(until<=now||until<=b.startAt||ops.holdUntil&&until<=ops.holdUntil)fail(400,'Hold beyond now, the booked arrival and the current hold.')
  const expectedEndAt=new Date(Date.parse(b.endAt)+Date.parse(until)-Date.parse(b.startAt)).toISOString()
  const service=s.services.find(v=>v.id===b.serviceId)??fail(404,'Service not found.')
  if(expectedEndAt>service.endAt)fail(409,'The full delayed turn must fit within this service.')
  allocation(s,service,b.partySize,{...b,expectedEndAt},b.tableIds,b.id,[],now)
  b.expectedEndAt=expectedEndAt;ops.holdUntil=until
  ops.history.push({id:id(),action:'hold',at:now,actor:actor.id,reason,until})
 }else fail(400,'Choose grace, contact or hold.')
 b.lateOperations=ops;return b
}
