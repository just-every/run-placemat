import {fail,text,type Actor,type State} from './model'
import {serviceBy,bookingFit,instant} from './availability'
import {checkBookingRules,ruleFor} from './booking-rules'
import {searchTables} from './reservation-search'
import {queueCanSeat} from './queue'
import {pacingViolations,type LimitViolation} from './pacing'

export const mayPace=(s:State,a:Actor)=>!a.agent&&(['owner','admin'].includes(a.role)||a.role==='lead'&&s.leadIds?.includes(a.id)||a.role==='host'&&s.hostIds?.includes(a.id)&&s.pacingHostIds?.includes(a.id))
/** Phone intake follows online timing rules with the existing staff exception authority.
 * Physical staff inventory remains distinct from direct website inventory. */
export function phonePreview(s:State,actor:Actor,command:string,p:any,now:string){
 const previous=command==='booking.phone.change'?s.bookings.find(b=>b.id===p.bookingId)??fail(404,'Booking not found.'):undefined
 if(previous&&(previous.source!=='phone'||previous.status!=='booked'))fail(409,'Only an unseated phone reservation can change its time or party size here.')
 const service=serviceBy(s,previous?.serviceId??p.serviceId),partySize=Number(p.partySize),startAt=instant(p.startAt,'Arrival time')
 if(!Number.isInteger(partySize)||partySize<1||partySize>500)fail(400,'Party size must be 1–500.')
 if(service.status!=='published'||service.closedAt||Date.parse(startAt)<=Date.parse(now))fail(409,'Choose a future time in an open published service.')
 const without={...s,bookings:s.bookings.filter(b=>b.id!==previous?.id)}
 const {state:filtered,requiredArea,requiredAccessTags}=searchTables(without,p.area??previous?.requiredArea,p.requiredAccessTags??previous?.requiredAccessTags)
 if(previous?.assignmentLocked&&p.tableIds!==undefined&&JSON.stringify(p.tableIds)!==JSON.stringify(previous.tableIds))fail(409,'Unlock this assignment before changing its tables.')
 const rules=ruleFor(service,'online'),staffService={...service,bookingRules:{...service.bookingRules,online:rules,'walk-in':rules,waitlist:ruleFor(service,'waitlist')}}
 const ruleOverride=checkBookingRules(s,staffService,partySize,startAt,'walk-in',actor,p.overrideReason,true)
 const fit=bookingFit(filtered,staffService,partySize,startAt,'walk-in',previous?.assignmentLocked?previous.tableIds:p.tableIds,true,'phone')
 const candidate={...fit,partySize,tableIds:fit.tables.map(t=>t.id),status:'booked' as const}
 const violations=pacingViolations(without,service,candidate,now)
 if(rules.blockedStarts.includes(startAt))violations.push({kind:'blocked-start',label:'Blocked arrival timeslot',limit:0,current:0,projected:1,excess:1})
 return {previous,without,service,partySize,requiredArea,requiredAccessTags,ruleOverride,fit,violations}
}
export function seatingPreview(s:State,actor:Actor,command:string,p:any,now:string){
 if(['booking.phone','booking.phone.change'].includes(command)){
  if(!mayPace(s,actor))fail(403,'A manager or host with the pacing grant must review this reservation.')
  return {...phonePreview(s,actor,command,p,now),waiting:null}
 }
 if(!['booking.walkin','waitlist.seat'].includes(command))fail(400,'Choose walk-in or waitlist seating for review.')
 if(!mayPace(s,actor))fail(403,'A manager or host with the pacing grant must seat this party.')
 const waiting=command==='waitlist.seat'?(s.waitlist.find(w=>w.id===p.waitlistId)??fail(404,'Waitlist entry not found.')):null
 if(waiting)queueCanSeat(waiting)
 const service=serviceBy(s,waiting?.serviceId??p.serviceId)
 if(service.status!=='published'||service.closedAt)fail(409,'Choose an open published service.')
 const {state:filtered,requiredArea,requiredAccessTags}=searchTables(s,p.area??p.requiredArea,waiting?.requiredAccessTags??p.requiredAccessTags)
 const partySize=waiting?.partySize??Number(p.partySize),startAt=instant(p.startAt,'Start')
 if(!Number.isInteger(partySize)||partySize<1||partySize>500)fail(400,'Party size must be 1–500.')
 const channel=waiting?'waitlist':'walk-in',ruleOverride=checkBookingRules(s,service,partySize,startAt,channel,actor,p.overrideReason,true)
 const fit=bookingFit(filtered,service,partySize,startAt,channel,p.tableIds,true)
 const candidate={...fit,partySize,tableIds:fit.tables.map(t=>t.id),status:'seated' as const}
 const violations=pacingViolations(s,service,candidate,now)
 if(ruleFor(service,channel).blockedStarts.includes(startAt))violations.push({kind:'blocked-start',label:'Blocked arrival timeslot',limit:0,current:0,projected:1,excess:1})
 return {service,waiting,partySize,requiredArea,requiredAccessTags,ruleOverride,fit,violations}
}
const encoder=new TextEncoder()
function signedInput(actor:Actor,command:string,p:any,version:number,expiry:number){
 const payload=Object.fromEntries(Object.keys(p).filter(k=>!['pacingReview','pacingReason','pacingConfirm'].includes(k)).sort().map(k=>[k,p[k]]))
 return encoder.encode(JSON.stringify([actor.id,command,payload,version,expiry]))
}
const signingKey=(secret:string)=>crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])
export async function issuePacingReview(secret:string,actor:Actor,command:string,p:any,version:number,now:string){
 const expiry=Date.parse(now)+5*60000,key=await signingKey(secret)
 const signature=await crypto.subtle.sign('HMAC',key,signedInput(actor,command,p,version,expiry))
 return `${expiry}.${Array.from(new Uint8Array(signature),v=>v.toString(16).padStart(2,'0')).join('')}`
}
export async function approvePacing(secret:string|undefined,actor:Actor,command:string,p:any,version:number,now:string,violations:LimitViolation[]){
 if(!violations.length)return undefined
 const message=violations.map(v=>`${v.label}: limit ${v.limit}, current ${v.current}, projected ${v.projected}, excess ${v.excess}`).join('; ')
 if(!secret||typeof p.pacingReview!=='string'||p.pacingConfirm!=='yes')fail(409,message+'. Review these limits and explicitly confirm with a reason before proceeding.')
 const [expires,hex,...extra]=p.pacingReview.split('.'),expiry=Number(expires)
 if(extra.length||!/^\d+$/.test(expires)||!Number.isFinite(expiry)||expiry<=Date.parse(now)||expiry>Date.parse(now)+5*60000||!/^[a-f0-9]{64}$/.test(hex??''))fail(409,'This pacing review expired. Review the current limits again.')
 const signature=Uint8Array.from((hex as string).match(/../g)!,v=>parseInt(v,16))
 if(!await crypto.subtle.verify('HMAC',await signingKey(secret!),signature,signedInput(actor,command,p,version,expiry)))fail(409,'The floor or booking changed. Review the current pacing warning again.')
 return {actor:actor.id,at:now,reason:text(p.pacingReason,'Pacing override reason',1000),violations}
}
