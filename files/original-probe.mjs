import assert from 'node:assert/strict'
const {installation}=await import(process.cwd()+'/tests/api/harness.mjs')
const {guestReviewFixture}=await import(process.cwd()+'/tests/api/guest-review-fixture.mjs')
const bindings={MAIL_PROVIDER:'resend',RER_INSTALLATION_ID:'synthetic-placemat-gate-installation',MAIL_EVENT_NAMESPACE:'synthetic-placemat-gate-observations'}
console.log('PROBE creating source installation');const h=await installation({bindings});console.log('PROBE creating empty destination');const empty=await installation({bindings});console.log('PROBE installations ready')
try{
 const f=await guestReviewFixture(h)
 await h.command('booking.management.send',{bookingId:f.booking.id,acknowledged:true})
 const before=await h.request('/api/booking-mail')
 console.log('PROBE before merge:',JSON.stringify({deliveryReadStatus:before.status,...before.status===200?{deliveryCount:(await before.json()).deliveries.length}:{}}))
 const preview=await h.api('/api/guests/merge-preview?guestId='+f.b.id+'&duplicateId='+f.a.id)
 await h.command('guest.merge',{guestId:f.b.id,duplicateId:f.a.id,review:preview.review,confirm:'MERGE'})
 const state=await h.api('/api/state');assert.equal(state.state.bookings.find(b=>b.id===f.booking.id).guestId,f.b.id)
 const after=await h.request('/api/booking-mail')
 console.log('PROBE after merge:',JSON.stringify({deliveryReadStatus:after.status,...after.status===200?{deliveryCount:(await after.json()).deliveries.length}:{}}))
 const archive=await h.api('/api/backup')
 const restored=await empty.request('/api/restore',{method:'POST',body:{archive,confirm:'RESTORE'}})
 const response=await restored.json()
 console.log('PROBE genuine send -> reviewed merge -> backup -> empty restore:',JSON.stringify({status:restored.status,error:response.error??null}))
 assert.equal(restored.status,200,'An unmodified genuine owner backup must restore after a supported guest merge')
 console.log('PROBE restore succeeded')
}finally{await empty.close();await h.close()}
