import {fail,id,number,type Actor,type State,type Booking} from './model'
import {serviceBy,instant,bookingFit} from './availability'
import {checkBookingRules} from './booking-rules'
import {searchTables} from './reservation-search'
import {guestFor,guestGuard,guestInsert} from './guests'
import {recordServing,servingFor,checkStaffing} from './staffing-capacity'

/** A host records a phone reservation against the same physical inventory and online booking policy. */
export async function phoneBooking(db:D1Database,s:State,actor:Actor,command:string,p:any,version:number,now:string){
 const previous=command==='booking.phone.change'?s.bookings.find(b=>b.id===p.bookingId)??fail(404,'Booking not found.'):undefined
 if(previous&&(previous.source!=='phone'||previous.status!=='booked'))fail(409,'Only an unseated phone reservation can change its time or party size here.')
 if(previous&&p.version!==version)fail(409,'The floor changed. Refresh before changing this reservation.')
 const service=serviceBy(s,previous?.serviceId??p.serviceId),partySize=number(p.partySize,'Party size',1,500),startAt=instant(p.startAt,'Arrival time')
 if(service.status!=='published'||service.closedAt||Date.parse(startAt)<Date.now())fail(409,'Choose a future time in an open published service.')
 checkBookingRules(s,service,partySize,startAt,'online')
 const without={...s,bookings:s.bookings.filter(b=>b.id!==previous?.id)},filtered=searchTables(without,p.area??previous?.requiredArea,p.requiredAccessTags??previous?.requiredAccessTags)
 const {tables,...slot}=bookingFit(filtered.state,service,partySize,startAt,'online',p.tableIds)
 const entry=previous?undefined:await guestFor(db,p,actor),guestId=previous?.guestId??entry!.guest.id
 if(without.bookings.some(b=>b.guestId===guestId&&b.startAt===startAt&&!['cancelled','no-show'].includes(b.status)))fail(409,'A booking already exists for this guest at that time.')
 const booking:Booking={...previous,id:previous?.id??id(),serviceId:service.id,guestId,partySize,...slot,tableIds:tables.map(t=>t.id),status:'booked',source:'phone',createdAt:previous?.createdAt??now,requiredAccessTags:filtered.requiredAccessTags,...filtered.requiredArea?{requiredArea:filtered.requiredArea}:{}}
 checkStaffing(s,[booking],now,new Set(previous?[previous.id]:[]))
 recordServing(booking,servingFor(s,service.id,booking.tableIds),actor.id,now,command)
 if(previous)Object.assign(previous,booking);else s.bookings.push(booking)
 return {booking,statements:entry?[guestGuard(db,entry),...entry.fresh?[guestInsert(db,entry.guest,version)]:[]]:[]}
}
