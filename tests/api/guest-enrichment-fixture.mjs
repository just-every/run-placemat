// Real public bookings and staff attendance, with a pinned clock supplied by the caller.
export const enrichmentContact=n=>['synthetic-placemat-'+n,'example.test'].join(String.fromCharCode(64))
export async function enrichmentFixture(h,setClock){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'Etc/UTC'})
 await h.command('table.save',{label:'T1',seats:2,x:20,y:30})
 const draft=await h.command('service.save',{name:'Recorded visits',startAt:'2026-10-20T10:00:00Z',endAt:'2026-10-20T20:00:00Z',turnMinutes:60,coverLimit:20})
 const publication=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Reviewed native service'})
 await h.command('proposal.approve',{proposalId:publication.id})
 const visits=[]
 for(let i=0;i<5;i++){
  const at=`2026-10-20T${10+i*2}:00:00Z`
  const b=(await h.api('/api/public/book',{serviceId:draft.id,startAt:at,name:'Synthetic Placemat Guest',email:enrichmentContact(1),phone:'2025550199',partySize:2,requestsAcknowledged:true,requests:{occasion:'anniversary',seatingPreference:'window',dietaryNotes:'Maybe avoids nuts?',allergyNotes:'Unclear; ask guest'}},{as:'',status:201})).result
  if(i<2){setClock(Date.parse(at));await h.command('booking.status',{bookingId:b.id,status:'seated'});await h.command('booking.status',{bookingId:b.id,status:'completed'});await h.command('booking.stage',{bookingId:b.id,stage:'ready'})}
  if(i===2)await h.command('booking.status',{bookingId:b.id,status:'cancelled'})
  if(i===3)await h.command('booking.status',{bookingId:b.id,status:'no-show'})
  visits.push(b)
 }
 setClock(Date.parse('2026-10-20T17:00:00Z'))
 const guestId=(await h.api('/api/state')).state.bookings.find(b=>b.id===visits[0].id).guestId
 await h.command('guest.profile',{guestId,notes:'synthetic-placemat-ambiguous: perhaps allergic, not confirmed',seatingPreference:'quiet',tags:['Existing fact']})
 return {guestId,visits,service:draft}
}
