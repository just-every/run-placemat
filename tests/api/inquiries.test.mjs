import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {installation} from './harness.mjs'
import {inquiryService,inquiryPayload,requests} from './inquiries-fixture.mjs'

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
