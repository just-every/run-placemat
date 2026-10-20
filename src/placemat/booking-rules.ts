import {fail,number,type Service,type State,type Actor} from './model'
export type BookingRule = {minParty:number;maxParty:number;horizonDays:number;leadMinutes:number;sameDayCutoff:string;slotMinutes:number;inquiryAbove:number;blockedStarts:string[]}
export type BookingRules = Record<'online'|'walk-in'|'waitlist',BookingRule>
export const defaultRule=():BookingRule=>({minParty:1,maxParty:20,horizonDays:3650,leadMinutes:0,sameDayCutoff:'23:59',slotMinutes:15,inquiryAbove:20,blockedStarts:[]})
export function normalizeRules(value:any):BookingRules{
 const result={} as BookingRules
 for(const channel of ['online','walk-in','waitlist'] as const){
  const p=value?.[channel]??defaultRule(),cutoff=p.sameDayCutoff??'23:59'
  if(typeof cutoff!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff))fail(400,'Use HH:MM for the same-day cutoff.')
  const minParty=number(p.minParty,'Minimum party',1,500),maxParty=number(p.maxParty,'Maximum party',minParty,500)
  const blockedStarts=p.blockedStarts??[]
  if(!Array.isArray(blockedStarts)||blockedStarts.length>100||blockedStarts.some(v=>typeof v!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v))))fail(400,'Blocked starts must be offset timestamps (up to 100).')
  result[channel]={minParty,maxParty,horizonDays:number(p.horizonDays,'Advance horizon days',0,3650),leadMinutes:number(p.leadMinutes,'Lead minutes',0,525600),sameDayCutoff:cutoff,slotMinutes:number(p.slotMinutes,'Slot minutes',5,120),inquiryAbove:number(p.inquiryAbove,'Inquiry above party size',1,500),blockedStarts:blockedStarts.map((v:string)=>new Date(v).toISOString())}
 }
 return result
}
export const ruleFor=(service:Service,channel:keyof BookingRules)=>service.bookingRules?.[channel]??defaultRule()
function local(instant:string,zone:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant))
 const get=(type:string)=>parts.find(p=>p.type===type)!.value
 return {day:`${get('year')}-${get('month')}-${get('day')}`,clock:`${get('hour')}:${get('minute')}`}
}
export function checkBookingRules(s:State,service:Service,partySize:number,startAt:string,channel:keyof BookingRules,actor?:Actor,overrideReason?:unknown,allowBlocked=false){
 const rule=ruleFor(service,channel),now=new Date().toISOString(),today=local(now,s.venue.timezone),arrival=local(startAt,s.venue.timezone),violations:string[]=[]
 if(partySize>rule.inquiryAbove)fail(409,'This party needs a large-party inquiry. Contact the venue to discuss availability; no booking has been made.')
 if(!allowBlocked&&rule.blockedStarts.includes(startAt))fail(409,'This arrival time is blocked. Choose another available time.')
 if(arrival.day===today.day&&today.clock>rule.sameDayCutoff)fail(409,'The same-day booking cutoff has passed. Choose another date.')
 if(partySize<rule.minParty||partySize>rule.maxParty)violations.push(`Party size must be ${rule.minParty}–${rule.maxParty}.`)
 const days=(Date.parse(arrival.day)-Date.parse(today.day))/86400000
 if(days>rule.horizonDays)violations.push(`Bookings open ${rule.horizonDays} venue-local calendar days ahead.`)
 if((channel==='online'||rule.leadMinutes>0)&&Date.parse(startAt)-Date.parse(now)<rule.leadMinutes*60000)violations.push(`This channel requires ${rule.leadMinutes} minutes of lead time.`)
 if(!violations.length)return undefined
 if(channel==='online'||!actor||actor.agent||!['owner','admin'].includes(actor.role))fail(409,violations.join(' ')+' Choose another available time.')
 if(typeof overrideReason!=='string'||!overrideReason.trim()||overrideReason.trim().length>1000)fail(409,violations.join(' ')+' A manager must confirm an override with a reason.')
 return {actor:actor!.id,at:now,channel,violations,reason:(overrideReason as string).trim()}
}
