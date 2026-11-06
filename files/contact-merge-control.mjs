// Separate pre-existing contact-edit composition, discovered while refining the A1 regression fixture.
import assert from 'node:assert/strict'
const {installation}=await import(process.cwd()+'/tests/api/harness.mjs')
const {guestReviewFixture}=await import(process.cwd()+'/tests/api/guest-review-fixture.mjs')
const h=await installation(),empty=await installation()
try{
 const f=await guestReviewFixture(h)
 await h.command('booking.management.send',{bookingId:f.booking.id,acknowledged:true})
 const token=new URLSearchParams(new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]).hash.slice(1)).get('token')
 const change=await h.api('/api/public/booking-management/preview',{token,action:'change',contact:{email:'synthetic-placemat-contact-update@example.test'}},{as:''})
 await h.api('/api/public/booking-management/commit',{token,previewId:change.previewId,acknowledged:true},{as:''})
 const review=await h.api('/api/guests/merge-preview?guestId='+f.b.id+'&duplicateId='+f.a.id)
 await h.command('guest.merge',{guestId:f.b.id,duplicateId:f.a.id,review:review.review,confirm:'MERGE'})
 const archive=await h.api('/api/backup')
 const items=archive.filter(p=>p.kind==='part').flatMap(p=>p.items)
 const contact=items.find(i=>i.table==='pm_booking_contacts').row
 const state=JSON.parse(items.find(i=>i.table==='pm_state').row.data)
 console.log('CONTROL contact guest matches merged booking:',contact.guest_id===state.bookings.find(b=>b.id===f.booking.id).guestId)
 const restored=await empty.request('/api/restore',{method:'POST',body:{archive,confirm:'RESTORE'}})
 console.log('CONTROL pre-existing contact-edit -> merge -> restore:',JSON.stringify({status:restored.status,response:await restored.json()}))
 assert.equal(restored.status,500,'Observe separate existing main contact reconciliation failure')
}finally{await h.close();await empty.close()}
