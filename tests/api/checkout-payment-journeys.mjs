import test from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest,service} from './harness.mjs'
import {paymentEdge} from './payment-fixture.mjs'

function checkoutEdge(){
 const base=paymentEdge(),expiryKeys=[]
 const controls={loseCreate:false,declineExpiry:false,loseExpiryRead:false,pauseCreate:null}
 let failNextRead=false
 const edge=async request=>{
  const path=new URL(request.url).pathname
  if(request.method==='POST'&&path==='/v1/checkout/sessions'){
   const response=await base.edge(request)
   if(controls.pauseCreate){const pause=controls.pauseCreate;controls.pauseCreate=null;await pause()}
   if(controls.loseCreate){controls.loseCreate=false;return new Response(null,{status:503})}
   return response
  }
  if(request.method==='POST'&&path.endsWith('/expire')){
   expiryKeys.push(request.headers.get('idempotency-key'))
   if(controls.declineExpiry)return new Response(null,{status:503})
   const session=base.sessions.get(decodeURIComponent(path.split('/').at(-2)));assert.ok(session)
   if(session.status==='open'&&session.payment_status==='unpaid')session.status='expired'
   if(controls.loseExpiryRead){controls.loseExpiryRead=false;failNextRead=true}
   return Response.json(session)
  }
  if(request.method==='GET'&&path.startsWith('/v1/checkout/sessions/')&&failNextRead){failNextRead=false;return new Response(null,{status:503})}
  return base.edge(request)
 }
 return {...base,edge,controls,expiryKeys}
}
async function requestFor(h,s,index=0){
 const booking=(await h.api('/api/public/book',publicGuest(s,index),{as:'',status:201})).result,owner=(await h.api('/api/state')).actor
 const request=await h.command('payment.request',{bookingId:booking.id,amountCents:2500,dueAt:new Date(Date.now()+2*3600000).toISOString(),followupOwnerId:owner.id,reason:'Synthetic reservation deposit.'})
 return {booking,request}
}
const cancel=(h,booking,status=200)=>h.api('/api/commands',{command:'booking.status',payload:{bookingId:booking.id,status:'cancelled'}},{status})
const bookingState=async(h,booking)=>(await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id).status

test('Unconfirmed Checkout collection retains the reservation until stable recovery and an authoritative expired-unpaid observation',async()=>{
 const edge=checkoutEdge(),h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}})
 try{
  const {service:s}=await service(h),{booking,request}=await requestFor(h,s)
  edge.controls.loseCreate=true
  await h.command('payment.link',{requestId:request.requestId},{status:502})
  assert.equal(edge.sessions.size,1)
  const refusal=await cancel(h,booking,409);assert.match(refusal.error,/Checkout|payment/i);assert.equal(await bookingState(h,booking),'booked')
  await h.command('payment.close',{requestId:request.requestId},{status:409})
  await h.command('payment.link',{requestId:request.requestId});assert.equal(edge.sessions.size,1,'Recovery reuses the original provider idempotency key')
  await cancel(h,booking,409)
  edge.controls.declineExpiry=true
  await h.command('payment.close',{requestId:request.requestId},{status:409});await cancel(h,booking,409)
  edge.controls.declineExpiry=false;edge.controls.loseExpiryRead=true
  await h.command('payment.close',{requestId:request.requestId},{status:502})
  assert.equal([...edge.sessions.values()][0].status,'expired');await cancel(h,booking,409)
  const manager=await h.signIn('synthetic-placemat-close-manager@example.test','admin')
  const closed=await h.command('payment.close',{requestId:request.requestId},{as:manager})
  assert.equal(closed.closeState,'expired-unpaid');assert.equal(closed.releaseAllowed,true);assert.equal(closed.state,'expired');assert.equal(edge.expiryKeys.length,2);assert.ok(edge.expiryKeys[0]);assert.equal(edge.expiryKeys[0],edge.expiryKeys[1])
  assert.equal(await bookingState(h,booking),'booked','Closing collection is separate from cancelling the reservation')
  await cancel(h,booking);assert.equal(await bookingState(h,booking),'cancelled')
  const calls=edge.calls.length
  await h.command('payment.link',{requestId:request.requestId},{status:409});assert.equal(edge.calls.length,calls,'An inactive reservation cannot acquire another Checkout')
 }finally{await h.close()}
})

test('Checkout preparation fences cancellation before its provider call; processing stays protected and confirmed paid or never-attempted requests permit explicit cancellation',async()=>{
 const edge=checkoutEdge(),h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}})
 let release
 try{
  const {service:s}=await service(h),{booking,request}=await requestFor(h,s)
  let entered
  const started=new Promise(resolve=>{entered=resolve}),gate=new Promise(resolve=>{release=resolve})
  edge.controls.pauseCreate=async()=>{entered();await gate}
  const issuing=h.command('payment.link',{requestId:request.requestId})
  await started
  try{await cancel(h,booking,409);assert.equal(await bookingState(h,booking),'booked')}finally{release()}
  await issuing
  const session=[...edge.sessions.values()][0]
  session.status='complete';session.payment_status='unpaid'
  await h.command('payment.sync',{requestId:request.requestId})
  await h.command('payment.close',{requestId:request.requestId},{status:409});await cancel(h,booking,409)
  assert.equal(edge.expiryKeys.length,0,'An in-flight payment is never treated as an open unpaid Checkout to expire')
  session.payment_status='paid'
  const paid=await h.command('payment.sync',{requestId:request.requestId});assert.equal(paid.state,'paid')
  await cancel(h,booking);assert.equal(await bookingState(h,booking),'cancelled','Confirmed payment retains ordinary manager cancellation and refund policy')
  const never=await requestFor(h,s,1),before=edge.sessions.size
  const closed=await h.command('payment.close',{requestId:never.request.requestId});assert.equal(closed.closeState,'no-attempt')
  await cancel(h,never.booking);await h.command('payment.link',{requestId:never.request.requestId},{status:409});assert.equal(edge.sessions.size,before)
 }finally{release?.();await h.close()}
})
