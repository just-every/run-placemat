export function managementWork(state,serviceId,{actor,esc,form,select,guest,time}){
 if(actor?.role!=='owner')return ''
 const bookings=state.bookings.filter(b=>b.serviceId===serviceId&&b.status==='booked'&&Date.parse(b.startAt)>Date.now())
 if(!bookings.length)return ''
 return `<details><summary>Send a private reservation link</summary><p>Send only to the contact recorded for this reservation. Reissuing revokes the previous link. Links expire within 24 hours or at arrival, whichever comes first.</p>${form('booking.management.send',select('Reservation','bookingId',bookings.map(b=>[b.id,`${guest(b.guestId)?.name||'Guest'} · ${time(b.startAt)} · ${b.partySize} guests`]))+'<label><input type="checkbox" name="acknowledged" required> I want to send a private management link to this reservation contact.</label>','Send private reservation link')}<p class="help">A provider acceptance is shown after sending; it does not confirm mailbox delivery.</p></details>`
}
