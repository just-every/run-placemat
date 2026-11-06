import test from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest,service} from './harness.mjs'
import {paymentEdge} from './payment-fixture.mjs'
import {refundMailFixture} from './refund-mail-fixture.mjs'

const reviewed=(refund,email)=>({refundId:refund.id,outcome:refund.status,expectedContactEmail:email,acknowledged:true})
async function refundable(h,edge,booking,requestId){
 const chargeId=edge.charge(booking.id)
 await h.command('payment.charge-sync',{bookingId:booking.id,chargeId})
 return h.command('payment.refund',{bookingId:booking.id,chargeId,amountCents:1000,requestId,reason:'Synthetic guest refund request.'})
}
const tasks=(view,bookingId)=>view.state.bookings.find(b=>b.id===bookingId).handover??[]
const email=i=>['guest'+i,'example.test'].join('@')

test('Refund notices reserve one sender-owned delivery callback per attempt, including uncertain acceptance, and preserve human completion on replay and restore',async()=>{
 const edge=paymentEdge(),sent=[];let accept=true
 const h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'},mailEdge:async request=>{
  sent.push(await request.json())
  return accept?Response.json({id:'synthetic-placemat-'+sent.length}):new Response(null,{status:503})
 }})
 let copy
 try{
  const {service:s}=await service(h),booking=(await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})).result,first=await refundable(h,edge,booking,'synthetic-placemat-2')
  const payload=reviewed(first,['guest0','example.test'].join('@')),[notice,duplicate]=await Promise.all([h.command('payment.refund-notice',payload),h.command('payment.refund-notice',payload)])
  assert.equal(notice.id,duplicate.id);assert.equal(sent.length,1);assert.equal(notice.state,'accepted');assert.equal(notice.mailboxDelivery,'unconfirmed')
  let view=await h.api('/api/state'),held=tasks(view,booking.id)
  assert.equal(held.length,1);assert.equal(held[0].id,notice.followupTaskId);assert.equal(held[0].ownerId,view.actor.id);assert.equal(held[0].dueAt,notice.requestedAt)
  assert.match(held[0].text,/Venue owner/);assert.match(held[0].text,/Due now.*unconfirmed.*bounce/);assert.match(held[0].text,/Contact the guest directly.*record the human outcome/)
  assert.deepEqual(sent[0].to,[['guest0','example.test'].join('@')]);assert.match(sent[0].text,/refund of \$10\.00 USD succeeded/)
  await h.command('booking.handover.complete',{bookingId:booking.id,taskId:held[0].id,outcome:'Guest confirmed receipt during a direct conversation.'})
  await h.command('payment.refund-notice',payload)
  view=await h.api('/api/state');held=tasks(view,booking.id);assert.equal(held.length,1);assert.equal(held[0].history.filter(e=>e.action==='completed').length,1);assert.equal(sent.length,1)

  accept=false
  const second=await refundable(h,edge,booking,'synthetic-placemat-3'),uncertain=await h.command('payment.refund-notice',reviewed(second,['guest0','example.test'].join('@')))
  assert.equal(uncertain.state,'unconfirmed');assert.equal(sent.length,2)
  await h.command('payment.refund-notice',reviewed(second,['guest0','example.test'].join('@')))
  view=await h.api('/api/state');held=tasks(view,booking.id);assert.equal(held.length,2);assert.equal(held.filter(t=>t.id===uncertain.followupTaskId).length,1);assert.equal(held[1].ownerId,view.actor.id);assert.equal(sent.length,2)
  assert.equal(edge.calls.filter(c=>c.path==='/v1/refunds'&&c.method==='POST').length,2,'Delivery follow-up never retries a processor refund')
  const archive=await h.api('/api/backup');copy=await installation()
  await copy.api('/api/restore',{archive,confirm:'RESTORE'})
  const restored=await copy.api('/api/state');assert.deepEqual(tasks(restored,booking.id),held);assert.equal(restored.refundNotices.find(n=>n.id===uncertain.id).state,'unconfirmed')
  await h.command('guest.erase',{guestId:view.state.bookings.find(b=>b.id===booking.id).guestId,confirm:'ERASE'})
  assert.equal(tasks(await h.api('/api/state'),booking.id).length,0,'Existing handover privacy removes guest delivery work on erasure')
  await h.command('payment.refund-notice',payload)
  assert.equal(tasks(await h.api('/api/state'),booking.id).length,0,'An idempotent receipt cannot resurrect erased follow-up');assert.equal(sent.length,2)
  assert.ok(!JSON.stringify(await h.api('/api/backup')).includes(['guest0','example.test'].join('@')))
 }finally{if(copy)await copy.close();await h.close()}
})

test('Native signed SendGrid refund observations bind the original recipient, reject unsafe batches, survive replay and restart, and restore without callback authority',async()=>{
 const mail=refundMailFixture(),edge=paymentEdge(),sent=[],bindings={...mail.bindings,STRIPE_SECRET_KEY:'synthetic-placemat-1'}
 const h=await installation({bindings,stripeEdge:edge.edge,mailEdge:async request=>{const host=new URL(request.url).hostname;assert.ok(['api.sendgrid.com','api.resend.com'].includes(host));sent.push(await request.json());return host==='api.resend.com'?Response.json({id:'synthetic-placemat-'+(20+sent.length)}):new Response(null,{status:202,headers:{'x-message-id':'synthetic-placemat-'+(20+sent.length)}})}})
 let restored
 try{
  const {service:s}=await service(h),bookings=[]
  for(let i=0;i<2;i++)bookings.push((await h.api('/api/public/book',publicGuest(s,i),{as:'',status:201})).result)
  const refund=await refundable(h,edge,bookings[0],'synthetic-placemat-10'),notice=await h.command('payment.refund-notice',reviewed(refund,email(0)))
  const otherRefund=await refundable(h,edge,bookings[1],'synthetic-placemat-11'),otherNotice=await h.command('payment.refund-notice',reviewed(otherRefund,email(1)))
  assert.equal(notice.state,'accepted');assert.equal(notice.mailboxDelivery,'unconfirmed');assert.equal(sent.length,2)
  assert.deepEqual(sent[0].personalizations[0].to.map(r=>r.email),[email(0)])
  const product=sent[0].custom_args.rer_product
  assert.equal(sent[0].custom_args.rer_delivery_id,notice.id)
  const now=Math.floor(Date.now()/1000),event=(id,type='delivered',offset=0)=>({sg_event_id:'synthetic-placemat-'+id,sg_message_id:'synthetic-placemat-21.synthetic-placemat-30',email:email(0),event:type,timestamp:now+offset,rer_delivery_id:notice.id,rer_product:product})
  const csv=async()=>await (await h.request('/api/business-export/refund-mail-events.csv')).text()
  const before=await h.api('/api/state'),unchanged=async()=>{
   const current=await h.api('/api/state');assert.deepEqual(current.refunds,before.refunds);assert.deepEqual(tasks(current,bookings[0].id),tasks(before,bookings[0].id));assert.equal(sent.length,2)
  }
  const empty=await csv(),valid=event(31)
  assert.equal((await h.request('/api/business-export/refund-mail-events.csv',{as:''})).status,401)
  const key=(await h.api('/api/agent-keys',{name:'Refund preparation reader'})).result
  assert.equal((await h.request('/api/business-export/refund-mail-events.csv',{as:'',headers:{authorization:'Bearer '+key.key}})).status,403)
  await h.api('/api/agent-keys/'+key.id,undefined,{method:'DELETE'})
  assert.equal((await h.request('/api/business-export/refund-mail-events.csv',{as:'',headers:{authorization:'Bearer '+key.key}})).status,401)
  for(const unsafe of [{...valid,email:email(1)},{...valid,email:email(0).replace('guest','Guest')},{...valid,rer_product:product+'foreign'},{...valid,rer_delivery_id:otherNotice.id},{...valid,sg_message_id:'synthetic-placemat-22'},{...valid,sg_message_id:'synthetic-placemat-210'},{...valid,rer_delivery_id:undefined},{...valid,rer_product:undefined}]){
   assert.equal((await mail.signedRequest(h,[unsafe])).status,403);assert.equal(await csv(),empty)
  }
  assert.equal((await refundMailFixture().signedRequest(h,[valid])).status,403)
  assert.equal((await mail.signedRequest(h,[valid],{timestamp:now-600})).status,403)
  const mixed=await mail.signedRequest(h,[valid,{...event(32),email:email(1)}]);assert.equal(mixed.status,403);assert.equal(await csv(),empty)
  for(const key of ['SENDGRID_EVENT_PUBLIC_KEY','SENDGRID_EVENT_TENANT_ID','RER_INSTALLATION_ID']){
   const held=bindings[key];delete bindings[key];await h.restart();assert.equal((await mail.signedRequest(h,[valid])).status,503);bindings[key]=held
  }
  bindings.MAIL_PROVIDER='resend';await h.restart();assert.equal((await mail.signedRequest(h,[valid])).status,503);bindings.MAIL_PROVIDER='sendgrid';await h.restart()
  const tenant=bindings.SENDGRID_EVENT_TENANT_ID;bindings.SENDGRID_EVENT_TENANT_ID='synthetic-placemat-foreign';await h.restart();assert.equal((await mail.signedRequest(h,[valid])).status,403);bindings.SENDGRID_EVENT_TENANT_ID=tenant;await h.restart()
  const duplicate=await Promise.all([mail.signedRequest(h,[valid]),mail.signedRequest(h,[valid])]);assert.deepEqual(duplicate.map(r=>r.status),[200,200]);assert.equal((await Promise.all(duplicate.map(r=>r.json()))).reduce((n,r)=>n+r.stored,0),1)
  let view=await h.api('/api/state'),observed=view.refundNotices.find(n=>n.id===notice.id)
  assert.equal(observed.mailboxDelivery,'delivered');assert.equal(observed.deliveryObservationCount,1);assert.equal(observed.state,'accepted');await unchanged()
  assert.equal((await mail.signedRequest(h,[event(31,'bounce')])).status,409)
  const stored=await csv();assert.equal((await mail.signedRequest(h,[event(33,'deferred'),event(31,'bounce')])).status,409);assert.equal(await csv(),stored,'A conflicting later event rolls the entire batch back')
  await h.restart();assert.deepEqual(await (await mail.signedRequest(h,[valid])).json(),{received:1,stored:0})
  for(const observation of [event(34,'processed',20),event(35,'deferred',30),event(36,'bounce',10),event(37,'delivered',5)])assert.equal((await mail.signedRequest(h,[observation])).status,200)
  view=await h.api('/api/state');observed=view.refundNotices.find(n=>n.id===notice.id)
  assert.equal(observed.mailboxDelivery,'bounced','Later acceptance and delay never supersede terminal delivery facts');assert.equal(observed.deliveryObservedAt,new Date((now+10)*1000).toISOString());assert.equal(observed.deliveryObservationCount,5);await unchanged()
  const audit=(await h.api('/api/audit?action=payment.refund-mail-observed')).rows
  assert.equal(audit.length,5);assert.ok(audit.every(r=>r.actor==='sendgrid'&&r.source==='provider'&&r.subject===bookings[0].id));assert.ok(audit.some(r=>r.changes[0].after.status==='bounced'));assert.ok(audit.some(r=>r.changes[0].after.status==='delivered'))
  const auditCsv=await (await h.request('/api/audit.csv?action=payment.refund-mail-observed')).text();assert.ok(auditCsv.includes('payment.refund-mail-observed'));assert.ok((await csv()).includes('synthetic-placemat-36'))
  const guestId=view.state.bookings.find(b=>b.id===bookings[0].id).guestId,access=await h.api('/api/privacy/access',{guestId})
  assert.equal(access.financial.refundMailEvents.length,5)
  const archive=await h.api('/api/backup');restored=await installation({bindings:mail.bindings})
  await restored.api('/api/restore',{archive,confirm:'RESTORE'})
  const restoredView=await restored.api('/api/state');assert.deepEqual(restoredView.refundNotices,view.refundNotices);assert.deepEqual(tasks(restoredView,bookings[0].id),tasks(view,bookings[0].id))
  assert.equal((await mail.signedRequest(restored,[event(38,'delivered',40)])).status,403,'Even the same installation configuration and valid key cannot authorize restored custody')
  assert.equal((await restored.api('/api/state')).refundNotices.find(n=>n.id===notice.id).deliveryObservationCount,5)
  bindings.MAIL_PROVIDER='resend';await h.restart()
  const legacyRefund=await refundable(h,edge,bookings[1],'synthetic-placemat-legacy'),legacy=await h.command('payment.refund-notice',reviewed(legacyRefund,email(1))),legacyProvider='synthetic-placemat-'+(20+sent.length)
  bindings.MAIL_PROVIDER='sendgrid';await h.restart()
  assert.equal((await mail.signedRequest(h,[{...event(43),rer_delivery_id:legacy.id,sg_message_id:legacyProvider,email:email(1)}])).status,403,'Legacy notices without send-time custody remain unbound')
  assert.equal((await mail.signedRequest(h,[event(39,'delivered',40)])).status,200)
  assert.equal((await h.api('/api/state')).refundNotices.find(n=>n.id===notice.id).mailboxDelivery,'delivered')
  await h.command('booking.handover.complete',{bookingId:bookings[0].id,taskId:notice.followupTaskId,outcome:'Guest confirmed receipt directly.'})
  const completed=tasks(await h.api('/api/state'),bookings[0].id)
  assert.equal((await mail.signedRequest(h,[event(40,'bounce',50)])).status,200);assert.deepEqual(tasks(await h.api('/api/state'),bookings[0].id),completed)
  const race=await Promise.all([h.command('guest.erase',{guestId,confirm:'ERASE'}),mail.signedRequest(h,[event(41,'delivered',60)])]);assert.ok([200,403,409].includes(race[1].status))
  assert.equal((await mail.signedRequest(h,[valid])).status,403);assert.equal((await mail.signedRequest(h,[event(42,'delivered',70)])).status,403)
  view=await h.api('/api/state');assert.equal(tasks(view,bookings[0].id).length,0);assert.equal(view.refunds.find(r=>r.id===refund.id).amountCents,1000)
  assert.equal(await h.db.prepare('SELECT COUNT(*) AS n FROM pm_refund_mail_custody WHERE guest_id=?').bind(guestId).first('n'),0)
  assert.ok(!(await h.db.prepare('SELECT event_json FROM rer_mail_event_receipts').all()).results.some(r=>r.event_json.includes(email(0))))
  assert.ok(!JSON.stringify(await h.api('/api/backup')).includes(email(0)))
  assert.equal(edge.calls.filter(c=>c.path==='/v1/refunds'&&c.method==='POST').length,3,'No receipt, refusal, replay, restore or erasure creates another processor refund')
  assert.equal(sent.length,3,'Provider receipts never resend mail')
  console.log('PROBE PAY-005 signed receipts: native owner notices and signed callback route -> bound delivered and bounced observations, unsafe and restored intake refused, no resend or refund action')
 }finally{if(restored)await restored.close();await h.close()}
})

test('Refund notices refuse changed or erased reservation contacts and send only to the freshly reviewed recorded email',async()=>{
 const edge=paymentEdge(),mail=refundMailFixture(),sent=[],bindings={STRIPE_SECRET_KEY:'synthetic-placemat-1'},h=await installation({stripeEdge:edge.edge,bindings,mailEdge:async request=>{sent.push(await request.json());return new URL(request.url).hostname==='api.resend.com'?Response.json({id:'synthetic-placemat-50'}):new Response(null,{status:202,headers:{'x-message-id':'synthetic-placemat-51'}})}})
 try{
  const {service:s}=await service(h),booking=(await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})).result
  await h.command('booking.management.send',{bookingId:booking.id,acknowledged:true})
  const link=sent.at(-1).text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0],token=new URLSearchParams(new URL(link).hash.slice(1)).get('token')
  const preview=await h.api('/api/public/booking-management/preview',{token,action:'change',contact:{email:['synthetic-refund-contact','example.test'].join('@')}},{as:''})
  await h.api('/api/public/booking-management/commit',{token,previewId:preview.previewId,acknowledged:true},{as:''})
  Object.assign(bindings,mail.bindings);await h.restart()
  const first=await refundable(h,edge,booking,'synthetic-placemat-4'),before=sent.length
  const stale=await h.api('/api/commands',{command:'payment.refund-notice',payload:reviewed(first,['guest0','example.test'].join('@'))},{status:409})
  assert.match(stale.error,/contact changed/);assert.equal(sent.length,before);assert.equal((await h.api('/api/state')).refundNotices.length,0)
  await h.command('payment.refund-notice',{...reviewed(first,['synthetic-refund-contact','example.test'].join('@')),channel:'sms'},{status:400})
  await h.command('payment.refund-notice',{...reviewed(first,['synthetic-refund-contact','example.test'].join('@')),acknowledged:false},{status:400})
  assert.equal(sent.length,before)
  const notice=await h.command('payment.refund-notice',reviewed(first,['synthetic-refund-contact','example.test'].join('@')))
  assert.deepEqual(sent.at(-1).personalizations[0].to.map(r=>r.email),[['synthetic-refund-contact','example.test'].join('@')])
  const receipt={sg_event_id:'synthetic-placemat-52',sg_message_id:'synthetic-placemat-51',event:'delivered',timestamp:Math.floor(Date.now()/1000),rer_delivery_id:notice.id,rer_product:sent.at(-1).custom_args.rer_product}
  assert.equal((await mail.signedRequest(h,[{...receipt,email:email(0)}])).status,403,'The original guest profile address is not the changed reservation send-time contact')
  assert.equal((await mail.signedRequest(h,[{...receipt,email:['synthetic-refund-contact','example.test'].join('@')}])).status,200)
  assert.equal((await h.api('/api/state')).refundNotices.find(n=>n.id===notice.id).mailboxDelivery,'delivered')
  const second=await refundable(h,edge,booking,'synthetic-placemat-5'),view=await h.api('/api/state')
  await h.command('guest.erase',{guestId:view.state.bookings.find(b=>b.id===booking.id).guestId,confirm:'ERASE'})
  const erased=await h.api('/api/commands',{command:'payment.refund-notice',payload:reviewed(second,['synthetic-refund-contact','example.test'].join('@'))},{status:409})
  assert.match(erased.error,/contact was erased/);assert.equal(sent.length,before+1);assert.equal((await h.api('/api/state')).refundNotices.length,1)
 }finally{await h.close()}
})
