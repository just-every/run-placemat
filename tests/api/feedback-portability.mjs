import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
import {feedbackTick,feedbackReviewUrl} from './feedback-fixture.mjs'
import {csvRecords} from './business-fixture.mjs'
import {makePart,ContentVerifier,ArchiveVerifier} from '../../src/modules/portability/format.mjs'
const rows=(archive,table)=>archive.filter(p=>p.kind==='part').flatMap(p=>p.items).filter(i=>i.table===table).map(i=>i.row)
const csv=async(h,kind)=>csvRecords(await(await h.request('/api/business-export/'+kind+'.csv')).text()).map(r=>JSON.parse(r.data_json))
async function orphaned(archive){
 const altered=structuredClone(archive);rows(altered,'pm_feedback_messages')[0].visit_id='synthetic-placemat-missing'
 const content=new ContentVerifier(altered[0]),integrity=new ArchiveVerifier(altered[0])
 for(let i=1;i<altered.length-1;i++){altered[i]=await makePart(altered[i].index,altered[i].items);integrity.add(altered[i]);for(const item of altered[i].items)content.add(item)}
 altered.at(-1).contentHash=content.digest();altered.at(-1).archiveHash=integrity.digest();return altered
}
/** Continue the same business journey through subject access, exit, inert restore and erasure. */
export async function assertFeedbackPortability(h,f){
 const restored=await installation(),refused=await installation(),erased=await installation()
 try{
  const access=await h.api('/api/privacy/access',{guestId:f.visits[0].guestId})
  assert.equal(access.bookings[0].feedbackEmailConsent.source,'guest-supplied');assert.ok(access.bookings[0].feedbackEmailConsent.at)
  assert.equal(access.feedback.visits.length,1);assert.equal(access.feedback.visits[0].comment,'Waited too long')
  assert.ok(access.feedback.messages.some(m=>m.author==='manager'&&m.state==='accepted'))
  assert.ok(!JSON.stringify(access).includes('Lovely evening'));assert.ok(!f.tokens.some(token=>JSON.stringify(access).includes(token)))
  const pending=(await h.api('/api/public/book',publicGuest(f.service,2,{feedbackEmailConsent:true}),{as:'',status:201})).result
  const visits=await csv(h,'feedback-visits'),thread=await csv(h,'feedback-messages')
  assert.equal(visits.length,2);assert.equal(visits.find(v=>v.id===f.visits[0].id).case_state,'closed');assert.ok(thread.some(m=>m.author==='manager'))
  const archive=await h.api('/api/backup'),serialized=JSON.stringify(archive)
  for(const secret of f.tokens)assert.ok(!serialized.includes(secret),'Private links never leave custody')
  await refused.api('/api/restore',{archive:await orphaned(archive),confirm:'RESTORE'},{status:400})
  assert.equal((await refused.api('/api/state')).state.bookings.length,0,'Invalid feedback relationships restore nothing')
  await restored.api('/api/restore',{archive,confirm:'RESTORE'})
  assert.deepEqual(await csv(restored,'feedback-visits'),visits);assert.deepEqual(await csv(restored,'feedback-messages'),thread)
  await restored.api('/api/public/feedback/status',{token:f.tokens[0]},{as:'',status:404})
  await restored.api('/api/feedback/reply',{visitId:f.visits[0].id,message:'Restored replay',requestId:'synthetic-placemat-restored'},{status:404})
  await restored.api('/api/feedback/settings',{enabled:true,publicReviewUrl:feedbackReviewUrl})
  await restored.command('booking.status',{bookingId:pending.id,status:'seated'});await restored.command('booking.status',{bookingId:pending.id,status:'completed'})
  await feedbackTick(restored);assert.equal(restored.messages.length,0,'Restored consent and history cannot execute outbound work')
  const rules=Object.fromEntries(['guestNotes','messageContent','imports','financialEvidence'].map(k=>[k,{days:365,ground:'Recorded restaurant service and accounting purpose'}]))
  await h.api('/api/privacy/policy',{version:0,rules})
  const result=await h.api('/api/privacy/erase',{guestId:f.visits[0].guestId,confirm:'ERASE'})
  assert.ok(result.processorTasks>=2,'Actual accepted survey and recovery provider references need processor follow-up')
  await h.api('/api/public/feedback/status',{token:f.tokens[0]},{as:'',status:404})
  assert.equal((await csv(h,'feedback-visits')).some(v=>v.id===f.visits[0].id),false)
  assert.equal((await csv(h,'feedback-messages')).some(m=>m.visit_id===f.visits[0].id),false)
  const later=await h.api('/api/backup')
  for(const personal of ['Waited too long','We arrived on time','We are sorry about the wait'])assert.ok(!JSON.stringify(later).includes(personal))
  await erased.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400})
 }finally{await restored.close();await refused.close();await erased.close()}
}
