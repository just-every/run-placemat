import {service,publicGuest} from './harness.mjs'

// Remains open so API and browser journeys can close it through their own public doors.
export async function closeReportService(h) {
 const setup=await service(h,{tables:5,covers:40}),s=setup.service,noShows=[],waiting=[],waitlistSeats=[]
 // Both parties hold their own tables before either is released.
 const online=[]
 for(let i=0;i<2;i++)online.push((await h.api('/api/public/book',publicGuest(s,i),{as:'',status:201})).result)
 for(const booking of online) {
  const observed=await h.command('booking.stage',{bookingId:booking.id,stage:'no-show',reason:'Host recorded that the party did not attend'})
  noShows.push(observed.booking)
 }
 for(let i=0;i<2;i++) {
  const row=await h.command('waitlist.add',publicGuest(s,i+2,{phone:`+61 400 000 00${i}`}))
  waiting.push(row)
  // Each waitlist party refills a no-show's freed table (REPORT-007 recovered covers).
  waitlistSeats.push(await h.command('waitlist.seat',{waitlistId:row.id,startAt:s.startAt,tableIds:noShows[i].tableIds}))
 }
 const walkin=await h.command('booking.walkin',publicGuest(s,4,{tableIds:[setup.floor[4].id]}))
 const accidental=await h.command('booking.stage',{bookingId:waitlistSeats[0].id,stage:'ordering',reason:'Accidental course observation to correct after the close'})
 return {service:s,bookings:[...noShows,...waitlistSeats,walkin],noShows,waiting,waitlistSeats,walkin,correctionEventId:accidental.event.id}
}
