import {assertPacing} from './pacing'
import {fail,type State,type Service,type Table,type Booking} from './model'
import {assignmentFor,candidateSets} from './combinations'
import {checkStaffing} from './staffing-capacity'
type Occupancy = {startAt:string;setupStartAt?:string;endAt:string;cleanupEndAt?:string;expectedEndAt?:string;status?:string}
/** A changed forecast retains the original reset duration and reservation fields. */
export function occupiedEndAt(slot:Occupancy,now=new Date().toISOString()):string {
 const reset=Math.max(0,Date.parse(slot.cleanupEndAt??slot.endAt)-Date.parse(slot.endAt))
 let departure=Math.max(Date.parse(slot.endAt),Date.parse(slot.expectedEndAt??slot.endAt))
 if(slot.status==='seated')departure=Math.max(departure,Date.parse(now)+1)
 return new Date(departure+reset).toISOString()
}
export const occupiedStartAt=(slot:Occupancy)=>slot.setupStartAt??slot.startAt
export const occupiedInterval=(slot:Occupancy,now=new Date().toISOString())=>({startAt:occupiedStartAt(slot),endAt:occupiedEndAt(slot,now)})
export const overlaps=(a:Occupancy,b:Occupancy,now=new Date().toISOString())=>Date.parse(occupiedStartAt(a))<Date.parse(occupiedEndAt(b,now))&&Date.parse(occupiedEndAt(a,now))>Date.parse(occupiedStartAt(b))
export const active=(b:Booking)=>b.status==='booked'||b.status==='seated'||b.status==='completed'
export function allocation(s:State,service:Service,partySize:number,slot:Occupancy,requested?:unknown,except?:string,unavailable:string[]=[],now=new Date().toISOString(),allowPacing=false):Table[] {
 const bookings=s.bookings.filter(b=>b.id!==except)
 const existing=except?s.bookings.find(b=>b.id===except):undefined
 const choices=requested===undefined?candidateSets(s):[requested]
 let best:ReturnType<typeof assignmentFor>|undefined
 for(const ids of choices){
  let choice:ReturnType<typeof assignmentFor>
  try{choice=assignmentFor(s,ids,partySize,slot.startAt,service.startAt,existing?.requiredAccessTags??[],existing?.requiredArea,existing)}catch(error){if(requested===undefined&&error instanceof Error&&'status' in error&&[404,409].includes(Number(error.status)))continue;throw error}
  const interval={...slot,setupStartAt:choice.setupStartAt},tableIds=choice.tables.map(t=>t.id)
  const blocked=tableIds.some(id=>unavailable.includes(id))||bookings.some(b=>b.tableIds.some(id=>tableIds.includes(id))&&(active(b)&&overlaps(b,interval,now)||b.needsBussing&&occupiedStartAt(interval)<=now&&occupiedEndAt(interval,now)>now))
  if(blocked){if(requested!==undefined)fail(409,'A selected table is already occupied during setup, the turn or cleanup. Review the current floor; clashes cannot be overridden.');continue}
  try{checkStaffing(s,[{...existing,...interval,serviceId:service.id,partySize,tableIds,status:(slot.status??existing?.status??'booked') as Booking['status']}],now,new Set(existing?.status==='seated'?[existing.id]:[]))}catch(error){if(requested===undefined&&error instanceof Error&&'status'in error&&Number(error.status)===409)continue;throw error}
  if(!allowPacing)assertPacing(s,service,{...existing,...interval,partySize,tableIds,status:(slot.status??existing?.status??'booked') as Booking['status']},now)
  const capacity=choice.combination?.capacity??choice.tables[0].seats,bestCapacity=best?.combination?.capacity??best?.tables[0].seats??Infinity
  if(!best||capacity<bestCapacity||capacity===bestCapacity&&choice.tables.length<best.tables.length)best=choice
 }
 return best?.tables??fail(409,'No approved table assignment fits this party at that time. Try another time or join the waitlist with staff.')
}
