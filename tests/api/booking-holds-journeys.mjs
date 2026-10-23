import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'

/** Public checkout lifecycle; caller owns installation/test registration and payment proof. */
export async function bookingHoldsJourney(h){
 await h.command('venue.update',{name:'synthetic-placemat-1',timezone:'America/New_York'})
 const table=await h.command('table.save',{label:'synthetic-placemat-1',seats:4,x:40,y:40})
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),startAt=day+'T20:00:00.000Z'
 const service=await h.command('service.save',{name:'synthetic-placemat-1',startAt,endAt:day+'T23:00:00.000Z',turnMinutes:90,coverLimit:40})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'synthetic-placemat-1'})
 await h.command('proposal.approve',{proposalId:proposal.id})
 const booking=n=>({serviceId:service.id,startAt,partySize:4,name:`synthetic-placemat-${n}`,email:`synthetic-placemat-${n}@example.test`})
 const capability=n=>({requestId:`synthetic-placemat-${n}`,token:randomBytes(32).toString('hex')})
 const first={...capability(1),booking:booking(1),ttlSeconds:20},second={...capability(2),booking:booking(2),ttlSeconds:300}
 const create=(payload,status=200)=>h.api('/api/public/booking-holds',payload,{as:'',status})
 const status=(payload,expected=200)=>h.api('/api/public/booking-holds/status',payload,{as:'',status:expected})
 const held=await create(first),reloaded=await create(first)
 assert.equal(held.status,'active');assert.equal(reloaded.hold.id,held.hold.id);assert.equal(reloaded.hold.expiresAt,held.hold.expiresAt)
 assert.deepEqual(held.hold.tableIds,[table.id])
 await status({...first,token:randomBytes(32).toString('hex')},404)
 await create({...first,booking:{...first.booking,partySize:3}},409)
 await create(second,409)
 await h.api('/api/public/book',booking(3),{as:'',status:409})
 await h.command('booking.phone',{...booking(3),staffIntake:{source:'phone',contactPreference:'none',confirmationConsent:false}},{status:409})
 const visible=await h.api('/api/state')
 assert.equal(visible.state.bookings.length,0,'An inventory hold is never a guest reservation')
 const spare=await h.command('table.save',{label:'Spare two-top',seats:2,x:70,y:40})
 const other=await h.command('booking.phone',{...booking(9),partySize:2,tableIds:[spare.id]})
 const floor=await h.api('/api/floor-version')
 await h.command('booking.move',{bookingId:other.id,tableIds:[table.id],version:floor.version},{status:409})
 await h.command('proposal.prepare',{kind:'table.assign',plan:{bookingId:other.id,tableIds:[table.id]},reason:'Attempt to use held inventory'},{status:409})
 await h.command('table.save',{id:table.id,label:'Changed held table',seats:4,x:40,y:40},{status:409})
 const waiting=await h.command('waitlist.add',{serviceId:service.id,name:'Waiting party',partySize:4})
 await h.command('waitlist.seat',{waitlistId:waiting.id,startAt},{status:409})
 assert.ok(!JSON.stringify(visible).includes(first.token),'Capabilities never enter staff projections')
 const remaining=Date.parse(held.hold.expiresAt)-Date.now()
 if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining+100))
 assert.equal((await status(first)).status,'expired')
 await h.api('/api/public/book',{...first.booking,checkout:{requestId:first.requestId,token:first.token}},{as:'',status:409})
 const active=await create(second)
 assert.equal(active.status,'active');assert.notEqual(active.hold.id,held.hold.id)
 const abandoned=await h.api('/api/public/booking-holds/abandon',second,{as:''})
 assert.equal(abandoned.status,'abandoned')
 assert.equal((await create(second)).status,'abandoned','The same request never renews an abandoned hold')
 const competitors=[{...capability(4),booking:booking(2),ttlSeconds:300},{...capability(5),booking:booking(3),ttlSeconds:300}]
 const raced=await Promise.all(competitors.map(body=>h.request('/api/public/booking-holds',{method:'POST',body,as:''})))
 assert.deepEqual(raced.map(r=>r.status).sort(),[200,409],'Only one concurrent checkout holds the final fitting four-top')
 const final=competitors[raced.findIndex(r=>r.status===200)]
 const commit={...final.booking,checkout:{requestId:final.requestId,token:final.token}}
 const saved=(await h.api('/api/public/book',commit,{as:'',status:201})).result
 const replay=(await h.api('/api/public/book',commit,{as:'',status:201})).result
 assert.deepEqual(replay,saved,'A retried checkout returns the original reservation result')
 const recovered=await status(final)
 assert.equal(recovered.status,'completed');assert.deepEqual(recovered.result,saved)
 assert.equal((await h.api('/api/state')).state.bookings.filter(b=>b.id===saved.id).length,1)
 assert.equal((await h.api('/api/public/booking-holds/abandon',final,{as:''})).status,'completed','Abandon cannot release converted inventory')
 await create({...capability(6),booking:booking(5),ttlSeconds:300},409)
 return {service,table,booking:saved,checkout:final}
}
