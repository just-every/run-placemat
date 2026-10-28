import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
import {feedbackFixture,feedbackReviewUrl,feedbackTick} from './feedback-fixture.mjs'
import {assertFeedbackPortability} from './feedback-portability.mjs'
const address=name=>[name,'example.test'].join('@')
const pub=(h,action,p,status)=>h.api('/api/public/feedback/'+action,p,{as:'',...(status?{status}:{})})

test('CRM-005 completed visits get identical review invitations, scoped feedback and assigned recovery through accepted reply and closure',async()=>{
 const h=await installation();try{
  const f=await feedbackFixture(h)
  assert.equal(f.tokens.length,2)
  const before=await Promise.all(f.tokens.map(token=>pub(h,'status',{token})))
  assert.ok(before.every(v=>v.publicReviewUrl===feedbackReviewUrl&&v.rating===null&&v.messages.length===0))
  const low=await pub(h,'submit',{token:f.tokens[0],rating:1,comment:'Waited too long'}),high=await pub(h,'submit',{token:f.tokens[1],rating:5,comment:'Lovely evening'})
  assert.equal(low.publicReviewUrl,high.publicReviewUrl);assert.equal(low.publicReviewUrl,before[0].publicReviewUrl)
  assert.ok(low.case.assigneeId);assert.ok(low.case.assigneeName);assert.equal(low.case.state,'open');assert.ok(Date.parse(low.case.dueAt)>Date.now());assert.equal(high.case,null)
  assert.deepEqual(await pub(h,'submit',{token:f.tokens[0],rating:1,comment:'Waited too long'}),low)
  await pub(h,'submit',{token:f.tokens[0],rating:5,comment:'Changed'},409)
  await pub(h,'status',{token:f.tokens[0],bookingId:f.bookings[1].id},404)
  await pub(h,'reply',{token:f.tokens[0],message:'We arrived on time'})
  await h.api('/api/feedback/close',{visitId:f.visits[0].id,outcome:'Attempted closure before reply'},{status:409})
  const requestId='synthetic-feedback-recovery-001',payload={visitId:f.visits[0].id,message:'We are sorry about the wait and have reviewed the handover.',requestId}
  const count=h.messages.length
  const competing=await Promise.all([h.request('/api/feedback/reply',{method:'POST',body:payload}),h.request('/api/feedback/reply',{method:'POST',body:payload})])
  assert.ok(competing.some(r=>r.status===200));assert.ok(competing.every(r=>[200,409].includes(r.status)))
  await h.api('/api/feedback/reply',payload)
  assert.equal(h.messages.length,count+1,'Exactly one network attempt for the request identifier')
  assert.equal(h.messages.at(-1).text.includes(payload.message),true)
  const thread=await pub(h,'status',{token:f.tokens[0]})
  assert.equal(thread.messages.filter(m=>m.author==='manager'&&m.state==='accepted').length,1)
  assert.ok(!JSON.stringify(await pub(h,'status',{token:f.tokens[1]})).includes('arrived on time'))
  await h.api('/api/feedback/close',{visitId:f.visits[0].id,outcome:'Guest received the reply and accepted the recovery.'})
  const closed=await pub(h,'status',{token:f.tokens[0]});assert.equal(closed.case.state,'closed');assert.ok(closed.case.outcome)
  const row=await h.db.prepare('SELECT assigned_by,assigned_at,closed_by FROM pm_feedback_visits WHERE id=?').bind(f.visits[0].id).first();assert.ok(row.assigned_by&&row.assigned_at&&row.closed_by)
  await feedbackTick(h);assert.equal(h.messages.length,count+1)
  const stored=JSON.stringify((await h.db.prepare('SELECT * FROM pm_feedback_credentials').all()).results);assert.ok(!f.tokens.some(t=>stored.includes(t)))
  await assertFeedbackPortability(h,f)
 }finally{await h.close()}
})

test('CRM-005 survey eligibility, withdrawal, manager permissions and contact and owner revocation are enforced',async()=>{
 const h=await installation();try{
  const f=await feedbackFixture(h,{count:2})
  const manager=await h.signIn(address('feedback-manager'),'admin'),member=await h.signIn(address('feedback-member'))
  await h.api('/api/feedback',undefined,{as:member,status:403});await h.api('/api/feedback',undefined,{as:'',status:401})
  await h.api('/api/feedback/settings',{enabled:false,publicReviewUrl:feedbackReviewUrl},{as:manager,status:403})
  const operators=await h.api('/auth/operators'),who=operators.find(o=>o.email===address('feedback-manager'))
  await pub(h,'submit',{token:f.tokens[0],rating:2,comment:'Please follow up'})
  await h.api('/api/feedback/assign',{visitId:f.visits[0].id,assigneeId:who.id,dueAt:new Date(Date.now()-60000).toISOString()},{as:manager})
  const assigned=(await h.api('/api/feedback',undefined,{as:manager})).visits.find(v=>v.id===f.visits[0].id);assert.equal(assigned.case.overdue,true);assert.equal(assigned.case.assigneeId,who.id)
  await h.api('/auth/operator/status',{operatorId:who.id,status:'inactive'})
  const before=h.messages.length
  await h.api('/api/feedback/reply',{visitId:f.visits[0].id,message:'Revoked caller',requestId:'synthetic-revoked-manager'},{as:manager,status:401})
  await h.api('/api/feedback/reply',{visitId:f.visits[0].id,message:'Inactive assignment',requestId:'synthetic-inactive-assignee'},{status:409})
  assert.equal(h.messages.length,before)
  await pub(h,'withdraw',{token:f.tokens[1]});await pub(h,'status',{token:f.tokens[1]},404)
  await feedbackTick(h);assert.equal(h.messages.length,before)
  const contact=(await h.db.prepare('SELECT data FROM pm_booking_contacts WHERE booking_id=?').bind(f.bookings[0].id).first())
  if(contact){const data=JSON.parse(contact.data);data.email=address('corrected-contact');await h.db.prepare('UPDATE pm_booking_contacts SET data=? WHERE booking_id=?').bind(JSON.stringify(data),f.bookings[0].id).run()}
  else {const guest=await h.db.prepare('SELECT data FROM pm_guests WHERE id=?').bind(f.bookings[0].guestId).first();const data=JSON.parse(guest.data);data.email=address('corrected-contact');await h.db.prepare('UPDATE pm_guests SET data=?,version=version+1 WHERE id=?').bind(JSON.stringify(data),f.bookings[0].guestId).run()}
  await pub(h,'status',{token:f.tokens[0]},404)
  const without=(await h.api('/api/public/book',publicGuest(f.service,3),{as:'',status:201})).result
  await h.command('booking.status',{bookingId:without.id,status:'seated'});await h.command('booking.status',{bookingId:without.id,status:'completed'})
  await feedbackTick(h);assert.equal(h.messages.length,before)
 }finally{await h.close()}
})

test('CRM-005 an uncertain provider acceptance never causes an automatic survey or recovery resend',async()=>{
 const h=await installation({mailEdge:async()=>new Response('Unconfirmed',{status:502})});try{
  const f=await feedbackFixture(h,{count:1})
  assert.equal(f.tokens.length,0);assert.equal(f.visits[0].inviteState,'unconfirmed')
  const before=JSON.stringify((await h.db.prepare('SELECT * FROM pm_feedback_visits').all()).results)
  await feedbackTick(h);assert.equal(JSON.stringify((await h.db.prepare('SELECT * FROM pm_feedback_visits').all()).results),before)
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM pm_feedback_credentials').first()).n,0)
 }finally{await h.close()}
})

test('CRM-005 cancellation, no-show, owner revocation, uncertain recovery and development suppression never dispatch another invitation',async()=>{
 let uncertain=false,h
 const attempts=[]
 h=await installation({mailEdge:async request=>{const message=await request.json();attempts.push(message);h?.messages.push(message);return uncertain?new Response('Unconfirmed',{status:502}):Response.json({id:'synthetic-feedback-provider-'+attempts.length})}})
 try{
  const f=await feedbackFixture(h,{count:4,complete:false})
  await h.command('booking.status',{bookingId:f.bookings[0].id,status:'seated'});await h.command('booking.status',{bookingId:f.bookings[0].id,status:'completed'})
  await h.command('booking.status',{bookingId:f.bookings[1].id,status:'cancelled'})
  await h.command('booking.status',{bookingId:f.bookings[2].id,status:'no-show'})
  await feedbackTick(h);assert.equal(attempts.length,1)
  const token=h.messages[0].text.match(/\/feedback#([a-f0-9]{64})/)[1],visit=(await h.api('/api/feedback')).visits[0]
  await pub(h,'submit',{token,rating:1,comment:'Recover this visit'})
  uncertain=true
  const payload={visitId:visit.id,message:'We have reviewed your feedback.',requestId:'synthetic-uncertain-recovery'}
  await h.api('/api/feedback/reply',payload);await h.api('/api/feedback/reply',payload)
  assert.equal(attempts.length,2)
  const status=await pub(h,'status',{token});assert.equal(status.messages.at(-1).state,'unconfirmed')
  await h.api('/api/feedback/close',{visitId:visit.id,outcome:'Cannot call unconfirmed email resolved'},{status:409})
  const owner=(await h.api('/auth/operators')).find(o=>o.role==='owner')
  // Preserve the native last-owner guard while exercising out-of-band owner revocation.
  await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'owner','active',?)").bind('synthetic-feedback-reserve-owner',address('reserve-feedback-owner'),'Reserve owner',Date.now()).run()
  await h.db.prepare("UPDATE oa_operators SET status='inactive' WHERE id=?").bind(owner.id).run()
  await pub(h,'status',{token},404)
  await h.db.prepare("UPDATE oa_operators SET status='active' WHERE id=?").bind(owner.id).run()
  await pub(h,'status',{token},404)
  await feedbackTick(h);assert.equal(attempts.length,2)
 }finally{await h.close()}
 const local=await installation({origin:'http://localhost:8787',bindings:{AUTH_LOCAL:'true'}})
 try{
  const f=await feedbackFixture(local,{count:1})
  assert.equal(f.tokens.length,0);assert.equal(local.messages.length,0);assert.equal(f.visits[0].inviteState,'suppressed')
  await feedbackTick(local);assert.equal(local.messages.length,0)
 }finally{await local.close()}
})
