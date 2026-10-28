import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {installation,service,publicGuest} from './harness.mjs'
import {publicInquiryLimits} from '../../src/placemat/inquiry-limits.mjs'
import {inquiryService,inquiryPayload,requests} from './inquiries-fixture.mjs'

test('public inquiry replies stop before shared state can crowd out manager and reservation writes',async()=>{
 const h=await installation();try{
  const {service:s}=await service(h,{tables:2,seats:4,covers:8})
  const call=(name,body,ip='203.0.113.10')=>h.request('/api/public/inquiries/'+name,{method:'POST',as:'',headers:{'CF-Connecting-IP':ip},body})
  const created=await (await call('create',{name:'Bounded guest',email:'bounded@example.test',partySize:6,message:'Please help with a group table.'})).json()
  let refusal
  for(let attempt=0;attempt<publicInquiryLimits.messagesPerInquiry+1;attempt++){
   const response=await call('reply',{token:created.token,message:'x'.repeat(4000)})
   if(!response.ok){refusal=response;break}
  }
  assert.ok(refusal,'the configured inquiry cap must refuse repeated maximum-size replies')
  assert.ok([413,429].includes(refusal.status),await refusal.text())
  const stored=await h.db.prepare('SELECT length(CAST(data AS BLOB)) bytes,data FROM pm_state WHERE id=1').first()
  assert.ok(stored.bytes<publicInquiryLimits.stateBytes,`shared state used ${stored.bytes} bytes`)
  const state=JSON.parse(stored.data),replyAudit=state.audit.findLast(row=>row.action==='inquiry.guest-reply')
  const inquiryChange=replyAudit.changes.find(change=>change.kind==='inquiries'&&change.id===created.id)
  assert.ok(!inquiryChange.before?.messages,'inquiry audit does not copy the prior conversation')
  assert.equal(inquiryChange.after.appendedMessages.length,1)
  assert.equal(inquiryChange.after.appendedMessages[0].message.length,4000)
  assert.ok(!inquiryChange.after.messages,'inquiry audit stores the append delta only')
  await h.command('inquiry.close',{inquiryId:created.id,message:'The venue has closed this inquiry at the guest reply cap.'})
  const reservation=(await h.api('/api/public/book',publicGuest(s,0,{partySize:4}),{as:'',status:201})).result
  assert.ok((await h.api('/api/state')).state.bookings.some(row=>row.id===reservation.id))
  assert.ok((await h.db.prepare('SELECT length(CAST(data AS BLOB)) bytes FROM pm_state WHERE id=1').first()).bytes<publicInquiryLimits.stateBytes)
 }finally{await h.close()}
})

test('public inquiry reply rate limits apply independently to an inquiry token and a source IP',async()=>{
 const h=await installation();try{
  const call=(name,body,ip)=>h.request('/api/public/inquiries/'+name,{method:'POST',as:'',headers:{'CF-Connecting-IP':ip},body})
  const create=async(index,ip)=>{
   const response=await call('create',{name:'Rate guest '+index,email:`rate-${index}@example.test`,partySize:6},ip)
   assert.equal(response.status,201,await response.clone().text())
   return response.json()
  }
  const tokenIp='203.0.113.20',tokenInquiry=await create('token',tokenIp)
  for(let attempt=0;attempt<publicInquiryLimits.replyTokenPerMinute;attempt++)assert.equal((await call('reply',{token:tokenInquiry.token},tokenIp)).status,400)
  assert.equal((await call('reply',{token:tokenInquiry.token},tokenIp)).status,429)

  const sharedIp='203.0.113.30',inquiries=[]
  for(let index=0;index<4;index++)inquiries.push(await create('ip-'+index,sharedIp))
  for(const inquiry of inquiries)for(let attempt=0;attempt<publicInquiryLimits.replyIpPerMinute/inquiries.length;attempt++)assert.equal((await call('reply',{token:inquiry.token},sharedIp)).status,400)
  assert.equal((await call('reply',{token:inquiries[0].token},sharedIp)).status,429)
 }finally{await h.close()}
})

test('active inquiries share a venue-wide guest-message budget that closing an inquiry releases',async()=>{
 const h=await installation();try{
  const message='v'.repeat(4000),perInquiry=Math.floor(publicInquiryLimits.messageBytesPerInquiry/Buffer.byteLength(message)),created=[]
  let refusal,last
  for(let index=0;!refusal;index++){
   const ip=`198.51.100.${index+1}`,made=await h.api('/api/public/inquiries/create',{name:'Venue cap '+index,email:`venue-cap-${index}@example.test`,partySize:6},{as:'',headers:{'CF-Connecting-IP':ip},status:201})
   created.push(made);last={made,ip}
   for(let attempt=0;attempt<perInquiry;attempt++){
    const response=await h.request('/api/public/inquiries/reply',{method:'POST',as:'',headers:{'CF-Connecting-IP':ip},body:{token:made.token,message}})
    if(!response.ok){refusal=response;break}
   }
  }
  assert.equal(refusal.status,413,await refusal.text())
  const before=(await h.api('/api/state')).state,activeGuestBytes=before.inquiries.filter(row=>!['closed','converted'].includes(row.status)).flatMap(row=>row.messages.filter(entry=>entry.author==='guest')).reduce((sum,entry)=>sum+Buffer.byteLength(entry.message),0)
  assert.ok(activeGuestBytes<=publicInquiryLimits.activeMessageBytesPerVenue)
  assert.ok(activeGuestBytes+Buffer.byteLength(message)>publicInquiryLimits.activeMessageBytesPerVenue)
  await h.command('inquiry.close',{inquiryId:created[0].id})
  assert.equal((await h.request('/api/public/inquiries/reply',{method:'POST',as:'',headers:{'CF-Connecting-IP':last.ip},body:{token:last.made.token,message}})).status,200)
  assert.ok((await h.db.prepare('SELECT length(CAST(data AS BLOB)) bytes FROM pm_state WHERE id=1').first()).bytes<publicInquiryLimits.stateBytes)
 }finally{await h.close()}
})

test('BOOK-007: required access and requested patio stay distinct; owned scoped inquiry offers need guest acceptance and fresh capacity before conversion',async()=>{
 const h=await installation();try{
  const {service,small,large}=await inquiryService(h)
  const publicCall=(name,p,status=200)=>h.api('/api/public/inquiries/'+name,p,{as:'',status})
  const direct={serviceId:service.id,startAt:service.startAt,name:'Nora Lane',email:'nora@example.test',partySize:4,area:'Dining room',requiredAccessTags:['step-free'],requests,requestsAcknowledged:true}
  await h.api('/api/public/book',{...direct,requestsAcknowledged:false},{as:'',status:400})
  const normal=(await h.api('/api/public/book',direct,{as:'',status:201})).result
  assert.deepEqual(normal.requiredAccessTags,['step-free']);assert.equal(normal.area,'Dining room');assert.equal(normal.requests.requestedArea,'Patio');assert.ok(normal.requestTerms.some(t=>/not guaranteed/.test(t)))
  const booked=(await h.api('/api/state')).state.bookings.find(b=>b.id===normal.id)
  assert.deepEqual(booked.tableIds,[small.id]);assert.deepEqual(booked.requests,requests);assert.ok(booked.requestsAcknowledgedAt)
  await h.api('/api/public/book',{...direct,email:'too-large@example.test',partySize:16},{as:'',status:409})
  await publicCall('create',{...inquiryPayload(service),requestsAcknowledged:false},400)
  const created=await publicCall('create',inquiryPayload(service),201),token=created.token
  assert.match(token,/^[a-f0-9]{64}$/);assert.equal(created.inquiry.status,'open');assert.equal(created.inquiry.partySize,16);assert.ok(created.inquiry.replyDueAt)
  const manager=await h.signIn('inquiry-manager@example.test','admin'),reader=await h.signIn('inquiry-reader@example.test')
  const native=(await h.api('/auth/operators')).find(o=>o.email==='inquiry-manager@example.test')
  const key=(await h.api('/api/agent-keys',{name:'Inquiry reader'})).result,agent={as:'',headers:{authorization:'Bearer '+key.key}}
  let state=(await h.api('/api/state')).state,row=state.inquiries.find(i=>i.id===created.id)
  assert.ok(row.ownerId);assert.equal(row.tokenHash,createHash('sha256').update(token).digest('hex'));assert.ok(!JSON.stringify(state).includes(token))
  assert.equal(created.inquiry.tokenHash,undefined);assert.equal(created.inquiry.guestId,undefined)
  for(const opts of [{as:''},{as:reader},agent])await h.command('inquiry.assign',{inquiryId:created.id,ownerId:native.id},{...opts,status:opts.as===''&&!opts.headers?401:403})
  const replyDueAt=new Date(Date.now()+2*86400000).toISOString()
  await h.command('inquiry.assign',{inquiryId:created.id,ownerId:native.id,replyDueAt},{as:manager})
  row=(await h.api('/api/state')).state.inquiries.find(i=>i.id===created.id);assert.equal(row.ownerId,native.id);assert.equal(row.replyDueAt,replyDueAt)
  const offered=await h.command('inquiry.reply',{inquiryId:created.id,serviceId:service.id,startAt:service.startAt,message:'An accessible dining-room table is offered; patio and equipment remain requests.'},{as:manager})
  assert.ok(offered.offer.guarantees.some(t=>t.includes('step-free')));assert.ok(offered.offer.guarantees.some(t=>t.includes('Dining room')))
  const guest=await publicCall('status',{token});assert.match(guest.inquiry.messages[1].message,/offered/);assert.equal(guest.inquiry.messages[1].actorId,undefined);assert.deepEqual(guest.inquiry.offer,offered.offer)
  await h.command('inquiry.convert',{inquiryId:created.id},{as:manager,status:409})
  await publicCall('reply',{token,acceptOfferVersion:offered.offer.version-1},409)
  await publicCall('reply',{token,message:'Thank you; we accept the exact required guarantees.',acceptOfferVersion:offered.offer.version})
  const other=await publicCall('create',inquiryPayload(service,'Racing group','racing@example.test'),201)
  assert.equal((await publicCall('status',{token:other.token,inquiryId:created.id})).inquiry.id,other.id,'A token cannot read a different inquiry')
  const otherOffer=await h.command('inquiry.reply',{inquiryId:other.id,serviceId:service.id,startAt:service.startAt,message:'Alternative group offer'})
  await publicCall('reply',{token:other.token,acceptOfferVersion:otherOffer.offer.version})
  const raced=await h.command('inquiry.convert',{inquiryId:other.id})
  await h.command('inquiry.convert',{inquiryId:created.id},{as:manager,status:409})
  assert.equal((await h.api('/api/state')).state.inquiries.find(i=>i.id===created.id).status,'accepted')
  await h.command('booking.stage',{bookingId:raced.booking.id,stage:'cancelled'})
  const converted=await h.command('inquiry.convert',{inquiryId:created.id},{as:manager})
  assert.equal(converted.inquiry.status,'converted');assert.deepEqual(converted.booking.tableIds,[large.id]);assert.deepEqual(converted.booking.requiredAccessTags,['step-free']);assert.equal(converted.booking.requiredArea,'Dining room');assert.deepEqual(converted.booking.requests,requests);assert.ok(converted.booking.requestsAcknowledgedAt)
  await publicCall('status',{token},404);await publicCall('reply',{token,message:'Expired'},404);await h.command('inquiry.convert',{inquiryId:created.id},{status:409})
  const closed=await publicCall('create',inquiryPayload(service,'Closing guest','closing@example.test'),201)
  await h.command('inquiry.close',{inquiryId:closed.id});await publicCall('status',{token:closed.token},404);await publicCall('status',{token:'0'.repeat(64)},404)
  const guestId=converted.booking.guestId
  await h.command('guest.erase',{guestId,confirm:'ERASE'})
  state=(await h.api('/api/state')).state;row=state.inquiries.find(i=>i.id===created.id)
  assert.equal(row.tokenHash,undefined);assert.deepEqual(row.messages,[]);assert.deepEqual(row.requiredAccessTags,[]);assert.equal(row.requests.allergyNotes,'');assert.deepEqual(row.offer.guarantees,[])
  assert.equal(state.bookings.find(b=>b.id===converted.booking.id).requests.occasion,'')
 }finally{await h.close()}
})
