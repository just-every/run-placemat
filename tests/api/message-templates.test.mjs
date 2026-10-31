import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
import {reminderFixture} from './message-template-fixture.mjs'
import {csvRecords} from './business-fixture.mjs'
import {feeEdge,consentBooking} from './fee-fixture.mjs'

const body=(language,extra='')=>(language==='en'?'Hello':'Hola')+' {{guest_name}} · {{venue_name}} · {{date_time}} · {{party_size}} · {{guest_phone}} · {{cancellation_terms}}'+extra
const policyInput=terms=>({cutoffLocalTime:'18:00',cutoffDaysBefore:1,graceMinutes:15,cancellation:{mode:'per_person',amountCents:1500},noShow:{mode:'fixed',amountCents:2500},exemptions:[],terms})

test('Reviewed bilingual reminder templates freeze exact text and terms, refuse stale or unauthorized decisions, and survive portable custody and erasure without sending',async()=>{
 const edge=feeEdge(),h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}}),copy=await installation()
 try{
  const f=await reminderFixture(h),prepare=(language='en',opts)=>h.command('proposal.prepare',{kind:'reminders',plan:{serviceId:f.service.id,language},reason:'Review exact reminder text'},opts)
  const manager=await h.signIn(['synthetic-placemat-manager','example.test'].join(String.fromCharCode(64)),'admin')
  const member=await h.signIn(['synthetic-placemat-member','example.test'].join(String.fromCharCode(64)))
  const key=(await h.api('/api/agent-keys',{name:'synthetic-placemat-preparer'})).result
  const agent={as:'',headers:{authorization:'Bearer '+key.key}}
  let sends=h.messages.length
  await h.command('message-template.save',{language:'en',version:0,body:body('en')},{as:member,status:403})
  await h.command('message-template.save',{language:'en',version:0,body:body('en')},{...agent,status:403})
  await h.command('message-template.save',{language:'fr',version:0,body:body('en')},{status:400})
  await h.command('message-template.save',{language:'en',version:0,body:body('en',' {{private_notes}}')},{status:400})
  await h.command('message-template.save',{language:'en',version:0,body:'{{venue_name}} {{date_time}} {{party_size}}'},{status:400})
  const en=await h.command('message-template.save',{language:'en',version:0,body:body('en')},{as:manager})
  const es=await h.command('message-template.save',{language:'es',version:0,body:body('es')},{as:manager})
  await h.command('message-template.save',{language:'en',version:0,body:body('en')},{status:409})
  let draft=await prepare('en',agent)
  assert.equal(draft.plan.template.id,en.id)
  assert.equal(draft.plan.messages[0].message,`Hello ${f.people[0].name} · Cedar & Salt <Dining> · Jan 16, 2032, 7:30 PM (America/New_York) · 2 · (202) 555-0123 ·`)
  assert.ok(draft.plan.messages[1].message.includes(f.people[1].name),'Guest substitutions are literal, never re-expanded')
  assert.deepEqual(draft.plan.messages[0].policies,[],'No cancellation terms or consent are invented')
  await h.command('proposal.approve',{proposalId:draft.id},{...agent,status:403})
  await h.command('proposal.approve',{proposalId:draft.id},{as:member,status:403})
  // Existing contact changes invalidate the review before any reminder is saved.
  await h.command('booking.management.send',{bookingId:f.bookings[0].id,acknowledged:true})
  assert.equal(h.messages.length,++sends,'Only the explicitly requested management link sends mail')
  const link=new URL(h.messages.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]),token=new URLSearchParams(link.hash.slice(1)).get('token')
  const review=await h.api('/api/public/booking-management/preview',{token,action:'change',contact:{phone:'2025550199'}},{as:''})
  await h.api('/api/public/booking-management/commit',{token,previewId:review.previewId,acknowledged:true},{as:''})
  await h.command('proposal.approve',{proposalId:draft.id},{status:409})
  draft=await prepare('es')
  await h.command('message-template.save',{language:'es',version:es.version,body:body('es',' — Gracias')})
  await h.command('proposal.approve',{proposalId:draft.id},{status:409})
  draft=await prepare('en')
  const policy=await h.command('payment.fee-policy',policyInput('Recorded cancellation terms & exact special characters.'))
  await h.command('proposal.approve',{proposalId:draft.id},{status:409})
  draft=await prepare('es')
  assert.equal(draft.plan.messages[0].language,'es');assert.equal(draft.plan.messages[0].templateVersion,2)
  assert.deepEqual(draft.plan.messages[0].policies,[{source:'fee',id:policy.id,version:policy.version,terms:policy.reviewText}])
  assert.ok(draft.plan.messages[0].message.includes(policy.reviewText))
  // Booking state is another input to the exact review.
  await h.command('booking.status',{bookingId:f.bookings[1].id,status:'no-show'})
  await h.command('proposal.approve',{proposalId:draft.id},{status:409})
  const final=await prepare('es',agent)
  assert.equal(final.plan.messages.length,1)
  await h.command('proposal.approve',{proposalId:final.id},{as:manager})
  await h.command('proposal.approve',{proposalId:final.id},{status:409})
  const approved=(await h.api('/api/state')).state.reminders
  assert.equal(approved[0].message,final.plan.messages[0].message)
  assert.equal(approved[0].templateVersion,2)
  await h.command('message-template.save',{language:'es',version:2,body:body('es',' — New revision')})
  await h.command('payment.fee-policy',policyInput('New venue terms do not rewrite saved messages.'))
  const englishBooking=(await h.api('/api/public/book',publicGuest(f.service,2),{as:'',status:201})).result
  const stalePolicy=await prepare('en')
  await consentBooking(h,edge,englishBooking,policy)
  await h.command('proposal.approve',{proposalId:stalePolicy.id},{status:409})
  const englishReview=await prepare('en')
  assert.deepEqual(englishReview.plan.messages[0].policies,[{source:'fee',id:policy.id,version:policy.version,terms:policy.reviewText}],'The booking keeps its agreed policy even when the venue has a newer one')
  await h.command('proposal.approve',{proposalId:englishReview.id})
  assert.equal(englishReview.plan.messages[0].language,'en')
  const csv=csvRecords(await (await h.request('/api/reminders.csv')).text())
  assert.equal(csv[1].language,'en');assert.equal(csv[1].message,englishReview.plan.messages[0].message)
  assert.equal(csv[0].message,approved[0].message);assert.equal(csv[0].language,'es');assert.equal(csv[0].template_version,'2')
  assert.deepEqual(JSON.parse(csv[0].policy_versions),[{source:'fee',id:policy.id,version:policy.version}])
  assert.equal(csv[0].cancellation_terms,policy.reviewText)
  const exported=csvRecords(await (await h.request('/api/business-export/reminders.csv')).text())
  const spanishExport=exported.find(r=>r.id===approved[0].id)
  assert.equal(spanishExport.message,approved[0].message)
  assert.equal(spanishExport.language,'es');assert.equal(spanishExport.templateId,approved[0].templateId);assert.equal(spanishExport.templateVersion,'2')
  assert.deepEqual(JSON.parse(spanishExport.policies_json),approved[0].policies)
  assert.equal(spanishExport.contactName,approved[0].contactName);assert.equal(spanishExport.contactPhone,approved[0].contactPhone)
  const versions=csvRecords(await (await h.request('/api/business-export/message-templates.csv')).text())
  assert.deepEqual(versions.filter(t=>t.language==='es').map(t=>[t.version,t.body]),[['1',body('es')],['2',body('es',' — Gracias')],['3',body('es',' — New revision')]])
  const archive=await h.api('/api/backup')
  await copy.api('/api/restore',{archive,confirm:'RESTORE'})
  const restored=(await copy.api('/api/state')).state
  assert.deepEqual(restored.reminders,(await h.api('/api/state')).state.reminders)
  assert.deepEqual(restored.messageTemplates,(await h.api('/api/state')).state.messageTemplates)
  assert.equal(csvRecords(await (await copy.request('/api/reminders.csv')).text())[0].message,approved[0].message)
  const owner=(await h.api('/api/state')).actor.id
  await h.command('payment.request',{bookingId:f.bookings[0].id,amountCents:2000,dueAt:'2032-01-15T20:00:00Z',followupOwnerId:owner,reason:'Recorded deposit request'})
  await h.command('guest.erase',{guestId:f.bookings[0].guestId,confirm:'ERASE'})
  const after=await h.api('/api/state'),afterArchive=await h.api('/api/backup')
  for(const value of [f.people[0].name,f.people[0].email,f.people[0].phone,approved[0].message])assert.ok(!JSON.stringify({after,afterArchive}).includes(value),'Erasure clears text and contact copies from proposals, audits and archives')
  assert.deepEqual(csvRecords(await (await h.request('/api/reminders.csv')).text()).map(r=>r.booking_id),[englishBooking.id])
  await h.command('proposal.approve',{proposalId:final.id},{status:409})
  await h.api('/api/restore',{archive,confirm:'RESTORE'},{status:400})
  assert.equal(h.messages.length,sends,'Template writes, approval, export and erasure never send a reminder')
  await h.api('/api/agent-keys/'+key.id,{}, {method:'DELETE'})
  await prepare('en',{...agent,status:401})
 }finally{await h.close();await copy.close()}
})

test('Required existing cancellation terms cannot be replaced by invented reminder text',async()=>{
 const h=await installation()
 try{
  const f=await reminderFixture(h),owner=(await h.api('/api/state')).actor.id
  await h.command('payment.request',{bookingId:f.bookings[0].id,amountCents:2000,dueAt:'2032-01-15T20:00:00Z',followupOwnerId:owner,reason:'Deposit without recorded terms'})
  const result=await h.command('proposal.prepare',{kind:'reminders',plan:{serviceId:f.service.id,language:'en'},reason:'Review reminder'},{status:409})
  assert.equal(result,undefined)
  assert.deepEqual((await h.api('/api/state')).state.reminders,[])
 }finally{await h.close()}
})
