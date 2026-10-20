import {fitAt} from './turn-fit'
import {checkBookingRules,ruleFor} from './booking-rules'
import { fail, number, type State, type Service } from './model'
// Adapted from Dial's UTC-first engine: half-open intervals and duration-fit
// checks are pure. Placemat adds venue cover limits and table combinations.
export {allocation,active,overlaps} from './capacity'
export function instant(value:unknown,label:string) {
 if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value))) fail(400,`${label} requires a timestamp with a UTC offset.`)
 return new Date(value as string).toISOString()
}
export function serviceBy(s:State,id:unknown):Service {return s.services.find(x=>x.id===id)??fail(404,'Service not found.')}
export function bookingFit(s:State,service:Service,partySize:number,value:unknown,channel:'online'|'walk-in'|'waitlist'='online',requested?:unknown,allowPacing=false){
 const startAt=instant(value,'Start')
 if((Date.parse(startAt)-Date.parse(service.startAt))%(ruleFor(service,channel).slotMinutes*60000)!==0)fail(400,`Choose a ${ruleFor(service,channel).slotMinutes}-minute start that fits the full turn within the service.`)
 const unavailable=channel==='online'?[]:s.bookings.filter(b=>b.needsBussing).flatMap(b=>b.tableIds)
 return fitAt(s,service,partySize,startAt,requested,unavailable,allowPacing)
}
export function slots(s:State,service:Service,size:unknown){
 if(service.closedAt)return []
 const partySize=number(size,'Party size',1,500),result:{startAt:string;endAt:string;cleanupEndAt:string}[]=[]
 for(let t=Date.parse(service.startAt);t<Date.parse(service.endAt);t+=ruleFor(service,'online').slotMinutes*60000){
  if(t<Date.now())continue
  const startAt=new Date(t).toISOString()
  try{checkBookingRules(s,service,partySize,startAt,'online');const {startAt:arrival,endAt,cleanupEndAt}=fitAt(s,service,partySize,startAt);result.push({startAt:arrival,endAt,cleanupEndAt})}catch(error){if(!(error instanceof Error)||!('status' in error)||![400,409].includes(Number(error.status)))throw error}
 }
 return result
}
