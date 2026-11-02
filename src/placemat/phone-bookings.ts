import {fail,id,text,type Actor,type State,type Booking,type Guest} from './model'
import {guestFor,guestGuard,guestInsert} from './guests'
import {recordServing,servingFor,checkStaffing} from './staffing-capacity'
import {phonePreview,mayPace,approvePacing} from './pacing-review'
import {campaignCode} from './embed'
import {normalizeBookingRequests} from './booking-requests'

async function returningGuest(db:D1Database,value:unknown){
 const guestId=text(value,'Returning guest',100)
 const row=await db.prepare('SELECT data FROM pm_guests WHERE id=?').bind(guestId).first<{data:string}>()
 const guest:Guest&{mergedInto?:string}=row?JSON.parse(row.data):fail(404,'Returning guest not found. Search and select the current guest again.')
 if(guest.erased||guest.mergedInto)fail(409,'This guest is no longer available. Search and select the current guest again.')
 return {guest,fresh:false,hashes:[] as string[]}
}
function intake(p:any,previous?:Booking){
 if(p.staffIntake===undefined)return previous?.staffIntake??{source:'phone' as const,contactPreference:'none' as const,confirmationConsent:false}
 const value=p.staffIntake
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['source','contactPreference','confirmationConsent','campaign'].includes(k))||!['phone','concierge','offline'].includes(value.source)||!['email','sms','none'].includes(value.contactPreference)||typeof value.confirmationConsent!=='boolean')fail(400,'Choose a reservation source, contact preference and explicit confirmation permission.')
 if(previous?.staffIntake&&value.source!==previous.staffIntake.source)fail(409,'The original reservation source must be preserved.')
 const campaign=value.campaign===undefined?previous?.staffIntake?.campaign:campaignCode(value.campaign)
 if(previous&&campaign!==previous.staffIntake?.campaign)fail(409,'The original campaign must be preserved.')
 if(value.confirmationConsent&&value.contactPreference==='none')fail(400,'Choose a channel before recording confirmation permission.')
 return {source:value.source,contactPreference:value.contactPreference,confirmationConsent:value.confirmationConsent,...campaign?{campaign}:{}} as NonNullable<Booking['staffIntake']>
}

/** Future staff reservations share live inventory; delivery and money are separate saved actions. */
export async function phoneBooking(db:D1Database,s:State,actor:Actor,command:string,p:any,version:number,now:string,pacingSecret?:string){
 if(actor.agent||!['owner','admin','host'].includes(actor.role))fail(403,'An active host or manager must create or change this reservation.')
 const preview=phonePreview(s,actor,command,p,now),{previous,without,service,partySize,requiredArea,requiredAccessTags,fit,ruleOverride,violations}=preview
 if(previous&&p.version!==version)fail(409,'The floor changed. Refresh before changing this reservation.')
 if(previous&&p.guestId!==undefined&&p.guestId!==previous.guestId)fail(409,'Changing a reservation cannot replace its guest identity.')
 if(violations.length&&!mayPace(s,actor))fail(403,'A manager or host with the pacing grant must review the exceeded limits: '+violations.map(v=>`${v.label}: limit ${v.limit}, projected ${v.projected}, excess ${v.excess}`).join('; '))
 const pacingOverride=await approvePacing(pacingSecret,actor,command,p,version,now,violations)
 const entry=await (previous?returningGuest(db,previous.guestId):p.guestId?returningGuest(db,p.guestId):guestFor(db,p,actor))
 const staffIntake=intake(p,previous)
 if(staffIntake.confirmationConsent&&!(staffIntake.contactPreference==='sms'?entry.guest.phone:entry.guest.email))fail(400,'The selected guest needs a recorded contact for this confirmation channel.')
 if(p.requests!==undefined&&p.requestsAcknowledged!==true)fail(400,'Acknowledge which guest requests are not guarantees.')
 const requests=p.requests===undefined?previous?.requests:normalizeBookingRequests(p)
 const {tables,...slot}=fit
 if(without.bookings.some(b=>b.guestId===entry.guest.id&&b.startAt===slot.startAt&&!['cancelled','no-show'].includes(b.status)))fail(409,'A booking already exists for this guest at that time.')
 const booking:Booking={...previous,id:previous?.id??id(),serviceId:service.id,guestId:entry.guest.id,partySize,...slot,tableIds:tables.map(t=>t.id),status:'booked',source:'phone',staffIntake,createdAt:previous?.createdAt??now,requiredAccessTags,...requiredArea?{requiredArea}:{},...requests?{requests,requestsAcknowledgedAt:p.requests!==undefined?now:previous?.requestsAcknowledgedAt}:{}}
 delete booking.pacingOverride;delete booking.ruleOverride
 if(pacingOverride)booking.pacingOverride=pacingOverride
 if(ruleOverride)booking.ruleOverride={...ruleOverride,channel:'phone'}
 checkStaffing(without,[booking],now,new Set(),Boolean(pacingOverride))
 recordServing(booking,servingFor(s,service.id,booking.tableIds),actor.id,now,command)
 if(previous)Object.assign(previous,booking);else s.bookings.push(booking)
 // Clear superseded exceptions on a changed reservation while preserving their audit history.
 if(previous&&!pacingOverride)delete previous.pacingOverride
 if(previous&&!ruleOverride)delete previous.ruleOverride
 if(pacingOverride)s.audit.push({id:id(),at:now,actor:actor.id,action:'booking.pacing-override',subject:booking.id,pacing:pacingOverride})
 if(ruleOverride)s.audit.push({id:id(),at:now,actor:actor.id,action:'booking.rule-override',subject:booking.id})
 return {booking,statements:[guestGuard(db,entry),...entry.fresh?[guestInsert(db,entry.guest,version)]:[]]}
}
