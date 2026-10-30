import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
import {feedbackFixture,feedbackTick} from './feedback-fixture.mjs'
import {verify,call as diner} from './diner-client.mjs'
import {csvRecords} from './business-fixture.mjs'
import {makePart,ContentVerifier,ArchiveVerifier} from '../../src/modules/portability/format.mjs'
const address=name=>[name,'example.test'].join(String.fromCharCode(64))
const pub=(h,action,p,status)=>h.api('/api/public/reviews'+(action?'/'+action:''),p,{as:'',...(status?{status}:{})})
const payload=(token,b,extra={})=>({token,bookingId:b.id,rating:4,comment:'A thoughtful evening',publish:true,notStaff:true,...extra})
const readRows=(archive,table)=>archive.filter(p=>p.kind==='part').flatMap(p=>p.items).filter(i=>i.table===table).map(i=>i.row)
const csv=async(h,kind)=>csvRecords(await(await h.request('/api/business-export/'+kind+'.csv')).text()).map(r=>JSON.parse(r.data_json))

// One native public-door journey covers publication, aggregates, response and rating-neutral moderation.
test('Verified attended visits publish once, retain private feedback separation and expose dated reviews, reply edits and moderation without rating suppression',async()=>{
 const h=await installation();try{
  const f=await feedbackFixture(h,{count:5}),ratings=[4,1,5,3,2],reviews=[]
  assert.equal(f.invitations.length,5)
  for(const m of f.invitations)assert.match(m.text,/\/reviews#[a-f0-9]{64}/)
  await h.api('/api/public/feedback/submit',{token:f.tokens[0],rating:1,comment:'Private kitchen detail'},{as:''})
  assert.equal((await pub(h,'')).count,0,'Private feedback never becomes a public review')
  for(let i=0;i<5;i++){
   const b=f.bookings[i],s=await verify(h,b,publicGuest(f.service,i).email),p=payload(s.token,b,{rating:ratings[i],comment:i===1?'One star: service was slow':'Public visit '+i,invitationToken:f.tokens[i]})
   if(i===0){await pub(h,'submit',{...p,publish:false},400);await pub(h,'submit',{...p,bookingId:f.bookings[1].id},404)}
   if(i===4){
    const results=await Promise.all([h.request('/api/public/reviews/submit',{method:'POST',as:'',body:p}),h.request('/api/public/reviews/submit',{method:'POST',as:'',body:p})])
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409],'Concurrent captures publish exactly once')
   }else await pub(h,'submit',p)
   await pub(h,'submit',p,409)
   const view=await pub(h,'');reviews.push(view.reviews.find(r=>r.comment===p.comment))
   assert.equal(view.average,i===4?3:null)
  }
  const view=await pub(h,'');assert.equal(view.count,5)
  assert.ok(view.reviews.every(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.visitDate)&&Number.isFinite(Date.parse(r.publishedAt))))
  assert.ok(!JSON.stringify(view).includes('Private kitchen detail'));assert.ok(!JSON.stringify(view).includes(f.bookings[0].guestId))
  const manager=await h.signIn(address('synthetic-placemat-manager'),'admin'),member=await h.signIn(address('synthetic-placemat-reader'))
  await h.api('/api/reviews',undefined,{as:'',status:401});await h.api('/api/reviews',undefined,{as:member,status:403})
  const low=reviews[1]
  await h.api('/api/reviews/reply',{reviewId:low.id,revision:1,message:'We have reviewed the service delay.'},{as:member,status:403})
  await h.api('/api/reviews/reply',{reviewId:low.id,revision:1,message:'We have reviewed the service delay.'},{as:manager})
  await h.api('/api/reviews/reply',{reviewId:low.id,revision:1,message:'Stale reply'},{as:manager,status:409})
  await h.api('/api/reviews/reply',{reviewId:low.id,revision:2,message:'Our manager has changed the service handover.'},{as:manager})
  assert.equal((await pub(h,'')).reviews.find(r=>r.id===low.id).reply,'Our manager has changed the service handover.')
  const report=await h.api('/api/reviews/report',{reviewId:low.id,category:'other',detail:'Please assess under the published guidelines.'},{as:manager})
  await h.api('/api/reviews/moderate',{reportId:report.reportId,outcome:'retained',reason:'No guideline breach; a low rating is allowed.'},{as:manager,status:403})
  await h.api('/api/reviews/moderate',{reportId:report.reportId,outcome:'hidden',reason:'A low rating'},{status:400})
  await h.api('/api/reviews/moderate',{reportId:report.reportId,outcome:'retained',reason:'No guideline breach; a low rating is allowed.'})
  const publicReport=await pub(h,'report',{reviewId:reviews[0].id,category:'spam',detail:'Please review this content.'})
  await h.api('/api/reviews/moderate',{reportId:publicReport.reportId,outcome:'escalated',reason:'Independent assessment requested; retain visibility.'})
  for(const action of ['delete','hide'])await h.api('/api/reviews/'+action,{reviewId:low.id},{status:404})
  assert.equal((await h.request('/api/reviews/'+low.id,{method:'DELETE'})).status,405)
  const after=await pub(h,'');assert.equal(after.count,5);assert.equal(after.average,3)
  assert.equal(after.reviews.find(r=>r.id===low.id).rating,1);assert.equal(after.reviews.find(r=>r.id===low.id).reports[0].outcome,'retained')
  const audit=(await h.api('/api/reviews')).events.filter(e=>e.review_id===low.id)
  assert.equal(audit.filter(e=>e.action==='review.reply').length,2)
  assert.ok(audit.some(e=>e.action==='review.moderated'&&e.actor&&JSON.parse(e.after_data).reason.includes('low rating')))
  const operator=(await h.api('/auth/operators')).find(o=>o.email===address('synthetic-placemat-manager'))
  await h.api('/auth/operator/status',{operatorId:operator.id,status:'inactive'})
  await h.api('/api/reviews/reply',{reviewId:low.id,revision:3,message:'Revoked manager reply'},{as:manager,status:401})
  assert.equal((await pub(h,'')).reviews.find(r=>r.id===low.id).reply,'Our manager has changed the service handover.')
  console.log('PROBE DIST-006 publication: verified completed visit plus explicit public consent -> one dated review; minimum-count average; concurrent duplicate refused')
  console.log('PROBE DIST-006 replies and moderation: manager reply then edit, one-star report -> retained with accountable outcome; hide and delete refused')
 }finally{await h.close()}
})

test('Review eligibility refuses absent visits, staff, changed contact, revoked devices and withdrawn invitations without publishing or resending',async()=>{
 const h=await installation();try{
  const f=await feedbackFixture(h,{count:5,complete:false}),proofs=[]
  for(let i=0;i<5;i++)proofs.push(await verify(h,f.bookings[i],publicGuest(f.service,i).email))
  await pub(h,'submit',payload(proofs[0].token,f.bookings[0]),409)
  await h.command('booking.status',{bookingId:f.bookings[0].id,status:'seated'})
  await pub(h,'submit',payload(proofs[0].token,f.bookings[0]))
  await h.command('booking.status',{bookingId:f.bookings[1].id,status:'cancelled'})
  await h.command('booking.status',{bookingId:f.bookings[2].id,status:'no-show'})
  for(const i of [1,2])await pub(h,'submit',payload(proofs[i].token,f.bookings[i]),409)
  await h.command('booking.status',{bookingId:f.bookings[3].id,status:'seated'})
  await h.signIn(publicGuest(f.service,3).email)
  await pub(h,'submit',payload(proofs[3].token,f.bookings[3]),403)
  const b=f.bookings[4]
  await h.command('booking.status',{bookingId:b.id,status:'seated'});await h.command('booking.status',{bookingId:b.id,status:'completed'})
  await feedbackTick(h)
  const message=h.messages.find(m=>m.text?.includes('/feedback#')),invitationToken=message.text.match(/\/feedback#([a-f0-9]{64})/)[1]
  await pub(h,'status',{...payload(proofs[4].token,b),invitationToken})
  await h.api('/api/public/feedback/withdraw',{token:invitationToken},{as:''})
  await pub(h,'submit',{...payload(proofs[4].token,b),invitationToken},404)
  const count=h.messages.length;await feedbackTick(h);assert.equal(h.messages.length,count)
  const guest=await h.db.prepare('SELECT data FROM pm_guests WHERE id=?').bind(b.guestId).first(),changed={...JSON.parse(guest.data),email:address('synthetic-placemat-new')}
  await h.db.prepare('UPDATE pm_guests SET data=?,version=version+1 WHERE id=?').bind(JSON.stringify(changed),b.guestId).run()
  await pub(h,'submit',payload(proofs[4].token,b),404)
  await diner(h,'logout',{token:proofs[0].token});await pub(h,'status',payload(proofs[0].token,f.bookings[0]),404)
  assert.equal((await pub(h,'')).count,1)
  console.log('PROBE DIST-006 eligibility: booked, no-show, cancelled, staff, changed contact, revoked device and withdrawn invitation -> refused; seated guest -> published; no resend')
 }finally{await h.close()}
})

test('Reviews, reply history and reports export inertly, reject broken restores and disappear with guest erasure including old archives',async()=>{
 const h=await installation(),restored=await installation(),refused=await installation(),erased=await installation();try{
  const f=await feedbackFixture(h,{count:2}),b=f.bookings[0],s=await verify(h,b,publicGuest(f.service,0).email)
  const r=await pub(h,'submit',payload(s.token,b,{comment:'Synthetic visit content'})),reviewId=r.reviewId
  await h.api('/api/reviews/reply',{reviewId,revision:1,message:'Synthetic public reply'})
  const report=await pub(h,'report',{reviewId,category:'other',detail:'Synthetic report detail'})
  await h.api('/api/reviews/moderate',{reportId:report.reportId,outcome:'retained',reason:'Synthetic rating-neutral outcome'})
  const access=await h.api('/api/privacy/access',{guestId:b.guestId});assert.equal(access.reviews.reviews[0].comment,'Synthetic visit content');assert.equal(access.reviews.events.length,4)
  const records=await csv(h,'reviews'),reports=await csv(h,'review-reports'),events=await csv(h,'review-events')
  assert.equal(records.length,1);assert.equal(records[0].rating,4);assert.equal(reports[0].outcome,'retained');assert.equal(events.length,4)
  const archive=await h.api('/api/backup');assert.ok(!JSON.stringify(archive).includes(s.token));assert.ok(!f.tokens.some(t=>JSON.stringify(archive).includes(t)))
  await restored.api('/api/restore',{archive,confirm:'RESTORE'})
  assert.deepEqual(await csv(restored,'reviews'),records);assert.deepEqual(await csv(restored,'review-reports'),reports);assert.deepEqual(await csv(restored,'review-events'),events)
  assert.equal((await pub(restored,'')).count,0,'Restore never restores public exposure authority')
  await pub(restored,'submit',payload(s.token,b),404);await feedbackTick(restored);assert.equal(restored.messages.length,0)
  const renewed=await verify(restored,b,publicGuest(f.service,0).email)
  await pub(restored,'submit',payload(renewed.token,b,{comment:'Fresh explicit publication after restore'}));assert.equal((await pub(restored,'')).count,1)
  const altered=structuredClone(archive);readRows(altered,'pm_review_reports')[0].review_id='synthetic-placemat-orphan'
  const content=new ContentVerifier(altered[0]),integrity=new ArchiveVerifier(altered[0])
  for(let i=1;i<altered.length-1;i++){altered[i]=await makePart(altered[i].index,altered[i].items);integrity.add(altered[i]);for(const item of altered[i].items)content.add(item)}
  altered.at(-1).contentHash=content.digest();altered.at(-1).archiveHash=integrity.digest()
  await refused.api('/api/restore',{archive:altered,confirm:'RESTORE'},{status:400});assert.equal((await refused.api('/api/state')).state.bookings.length,0)
  const rules=Object.fromEntries(['guestNotes','messageContent','imports','financialEvidence'].map(k=>[k,{days:365,ground:'Recorded venue service purpose'}]))
  await h.api('/api/privacy/policy',{version:0,rules});await h.api('/api/privacy/erase',{guestId:b.guestId,confirm:'ERASE'})
  assert.equal((await pub(h,'')).count,0);await pub(h,'submit',payload(s.token,b),404)
  assert.equal((await csv(h,'reviews')).length,0);assert.equal((await csv(h,'review-events')).length,0);assert.equal((await csv(h,'review-reports')).length,0)
  const later=await h.api('/api/backup');for(const value of ['Synthetic visit content','Synthetic public reply','Synthetic report detail','Synthetic rating-neutral outcome'])assert.ok(!JSON.stringify(later).includes(value))
  await erased.api('/api/restore',{archive,journal:later,confirm:'RESTORE'},{status:400})
  console.log('PROBE DIST-006 portability and erasure: populated CSV and archive -> inert restore with fresh consent required; erasure removes content; old archive with later journal refused')
 }finally{await h.close();await restored.close();await refused.close();await erased.close()}
})
