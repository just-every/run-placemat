import assert from 'node:assert/strict'
import {paymentEdge} from './payment-fixture.mjs'

/** Only Stripe is faked. Reservations, sessions, D1, policy and charge decisions use the actual Worker. */
export function feeEdge(){
 const payments=paymentEdge(),setups=new Map(),intents=new Map(),charges=new Map(),keys=new Map(),calls=[];let loseNext=false,malformedNext=false
 const edge=async request=>{
  const url=new URL(request.url),path=url.pathname,body=request.method==='POST'?new URLSearchParams(await request.clone().text()):null
  calls.push({path,method:request.method,body,key:request.headers.get('idempotency-key')})
  if(request.method==='GET'&&path.startsWith('/v1/setup_intents/'))return Response.json(setups.get(decodeURIComponent(path.split('/').at(-1)))??{})
  if(request.method==='POST'&&path==='/v1/payment_intents'){
   const key=request.headers.get('idempotency-key');assert.ok(key)
   if(keys.has(key))return Response.json(keys.get(key))
   const intentId=`synthetic-placemat-intent-${intents.size+1}`,chargeId=`synthetic-placemat-fee-charge-${charges.size+1}`,amount=Number(body.get('amount')),metadata={placemat_fee_id:body.get('metadata[placemat_fee_id]'),placemat_booking_id:body.get('metadata[placemat_booking_id]'),placemat_policy_id:body.get('metadata[placemat_policy_id]')}
   assert.equal(body.get('allowed_payment_method_types[0]'),'card');assert.equal(body.get('confirm'),'true');assert.equal(body.get('off_session'),'true')
   const charge={object:'charge',id:chargeId,payment_intent:intentId,customer:body.get('customer'),currency:'usd',paid:true,captured:true,amount_captured:amount,amount_refunded:0,metadata}
   const intent={object:'payment_intent',id:intentId,status:'succeeded',amount,currency:'usd',customer:body.get('customer'),payment_method:body.get('payment_method'),metadata,latest_charge:charge}
   intents.set(intentId,intent);charges.set(chargeId,charge);keys.set(key,intent)
   if(loseNext){loseNext=false;return new Response('synthetic lost confirmation',{status:503})}
   if(malformedNext){malformedNext=false;return Response.json({...intent,amount:amount+1})}
   return Response.json(intent)
  }
  if(request.method==='GET'&&path.startsWith('/v1/payment_intents/'))return Response.json(intents.get(decodeURIComponent(path.split('/').at(-1)))??{})
  if(request.method==='GET'&&path.startsWith('/v1/charges/')&&charges.has(decodeURIComponent(path.split('/').at(-1))))return Response.json(charges.get(decodeURIComponent(path.split('/').at(-1))))
  return payments.edge(request)
 }
 return {edge,calls,setups,intents,charges,payments,loseNextConfirmation(){loseNext=true},malformNextConfirmation(){malformedNext=true},setup(bookingId,policyId,extra={}){const setupId=`synthetic-placemat-setup-${setups.size+1}`;setups.set(setupId,{object:'setup_intent',id:setupId,status:'succeeded',usage:'off_session',customer:`synthetic-placemat-customer-${setups.size+1}`,payment_method:`synthetic-placemat-method-${setups.size+1}`,metadata:{placemat_booking_id:bookingId,placemat_policy_id:policyId},...extra});return setupId}}
}
export const feePolicyInput=(extra={})=>({cutoffDaysBefore:30,cutoffLocalTime:'18:00',graceMinutes:0,cancellation:{mode:'per_person',amountCents:2000},noShow:{mode:'fixed',amountCents:3500},exemptions:[{code:'venue-cancelled',label:'The venue cancelled the sitting'}],terms:'The guest agrees to this fee only for this reservation, with the stated cancellation deadline and no-show grace.',...extra})
export const feeApi=async(h,path,payload,opts={})=>(await h.api('/api/payments/'+path,payload,opts)).result
export async function feeService(h,{startAt=new Date(Date.now()+86400000).toISOString(),timezone='America/New_York',tables=4,name='Fee review sitting',tablePrefix=`Fee ${startAt}`}={}){
 await h.command('venue.update',{name:'Synthetic Cedar',timezone})
 const floor=[];for(let i=0;i<tables;i++)floor.push(await h.command('table.save',{label:`${tablePrefix} ${i+1}`,seats:4,x:20+i*20,y:30}))
 const draft=await h.command('service.save',{name,startAt,endAt:new Date(Date.parse(startAt)+4*3600000).toISOString(),turnMinutes:60,coverLimit:40})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Owner reviewed this sitting'})
 await h.command('proposal.approve',{proposalId:proposal.id})
 return {service:draft,floor}
}
export async function feeBooking(h,service,index=1){return h.command('booking.phone',{serviceId:service.id,startAt:service.startAt,partySize:2,name:`Synthetic Guest ${index}`,email:`synthetic-fee-${index}@example.test`,phone:''})}
export async function consentBooking(h,edge,booking,policy,extra={}){
 const payload={bookingId:booking.id,policyId:policy.id,reviewedPolicyVersion:policy.version,reviewedPolicyText:policy.reviewText,acceptedAt:new Date().toISOString(),attest:true,evidence:'Owner attests the guest reviewed and accepted this exact policy on the recorded phone call.',setupIntentId:edge.setup(booking.id,policy.id),...extra}
 return {consent:await feeApi(h,'fee-consent',payload),payload}
}
export const feeDecision=(preview,action='charge',extra={})=>({previewId:preview.id,requestId:`synthetic-fee-decision-${preview.id}`,action,reason:action==='waive'?'Owner approved the documented exception.':'Owner verified the recorded violation against the agreed terms.',evidence:'Retained guest agreement and the recorded service observation reviewed.',...extra})
