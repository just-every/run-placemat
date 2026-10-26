import assert from 'node:assert/strict'
import {feeEdge} from './fee-fixture.mjs'
/** Provider edges only; all state, permissions and consent transitions use the real Worker. */
export function merchantEdge(){
 const fees=feeEdge(),sessions=new Map(),keys=new Map(),customers=new Map(),account={object:'account',id:'synthetic-placemat-merchant-1',country:'US',default_currency:'usd',charges_enabled:true,payouts_enabled:true,details_submitted:true,livemode:false},calls=[];let loseCapture=false
 const edge=async request=>{
  const url=new URL(request.url),body=request.method==='POST'?new URLSearchParams(await request.clone().text()):null;calls.push({path:url.pathname,method:request.method,body})
  if(url.pathname==='/v1/country_specs/US')return Response.json({object:'country_spec',id:'US',supported_payment_currencies:['usd']})
  if(url.pathname==='/v1/account')return Response.json(account)
  if(url.pathname==='/v1/customers'){
   const key=request.headers.get('idempotency-key');assert.ok(key)
   if(!customers.has(key))customers.set(key,{object:'customer',id:'synthetic-placemat-customer-'+customers.size})
   return Response.json(customers.get(key))
  }
  if(request.method==='POST'&&url.pathname==='/v1/checkout/sessions'){
   const key=request.headers.get('idempotency-key');assert.ok(key)
   if(keys.has(key))return Response.json(keys.get(key))
   const session={object:'checkout.session',id:'synthetic-placemat-checkout-'+sessions.size,amount:Number(body.get('line_items[0][price_data][unit_amount]')||0),mode:body.get('mode'),client_reference_id:body.get('client_reference_id'),metadata:{placemat_collection_id:body.get('metadata[placemat_collection_id]'),placemat_booking_id:body.get('metadata[placemat_booking_id]')},status:'open',url:'https://checkout.stripe.com/c/synthetic-placemat-'+sessions.size,setupMetadata:Object.fromEntries(['placemat_collection_id','placemat_booking_id','placemat_policy_id'].map(key=>[key,body.get((body.get('mode')==='payment'?'payment_intent_data':'setup_intent_data')+'[metadata]['+key+']')])),customer:body.get('customer')}
   assert.ok(['setup','payment'].includes(body.get('mode')));if(body.get('mode')==='payment')assert.equal(body.get('payment_intent_data[capture_method]'),'manual');assert.equal(body.get('payment_method_types[0]'),'card');sessions.set(session.id,session);keys.set(key,session);return Response.json(session)
  }
  if(request.method==='POST'&&url.pathname.endsWith('/expire')){const session=sessions.get(url.pathname.split('/').at(-2));session.status='expired';return Response.json(session)}
  if(url.pathname.startsWith('/v1/checkout/sessions/'))return Response.json(sessions.get(url.pathname.split('/').at(-1))??{})
  if(request.method==='POST'&&/^\/v1\/payment_intents\/[^/]+\/(cancel|capture)$/.test(url.pathname)){
   const intent=fees.intents.get(url.pathname.split('/').at(-2));assert.ok(intent);const key=request.headers.get('idempotency-key');assert.ok(key)
   if(keys.has(key))return Response.json(keys.get(key))
   if(url.pathname.endsWith('/cancel')){assert.equal(intent.status,'requires_capture');intent.status='canceled';intent.amount_capturable=0}
   else{
    assert.equal(intent.status,'requires_capture');const captured=Number(body.get('amount_to_capture'));assert.ok(captured>0&&captured<=intent.amount_capturable)
    intent.status='succeeded';intent.amount_received=captured;intent.amount_capturable=0;intent.metadata.placemat_fee_id=body.get('metadata[placemat_fee_id]');intent.latest_charge.captured=true;intent.latest_charge.amount_captured=captured;intent.latest_charge.metadata={...intent.metadata}
   }
   keys.set(key,structuredClone(intent));if(loseCapture&&url.pathname.endsWith('/capture')){loseCapture=false;return new Response('synthetic unconfirmed capture',{status:503})}
   return Response.json(intent)
  }
  return fees.edge(request)
 }
 const complete=collection=>{
  const session=sessions.get(collection.providerReference);assert.ok(session)
  if(session.mode==='payment'){
   const reference='synthetic-placemat-authorization-'+sessions.size,method='synthetic-placemat-held-method-'+sessions.size,charge={object:'charge',id:'synthetic-placemat-held-charge-'+sessions.size,payment_intent:reference,customer:session.customer,payment_method:method,currency:'usd',amount:session.amount,amount_captured:0,amount_refunded:0,captured:false,paid:true,payment_method_details:{type:'card',card:{capture_before:Math.floor(Date.now()/1000)+2*86400}}}
   const intent={object:'payment_intent',id:reference,currency:'usd',capture_method:'manual',status:'requires_capture',customer:session.customer,payment_method:method,amount:session.amount,amount_capturable:session.amount,metadata:session.setupMetadata,latest_charge:charge}
   fees.intents.set(reference,intent);fees.charges.set(charge.id,charge);session.status='complete';session.payment_intent=reference;return session
  }
  const setupId=fees.setup(session.metadata.placemat_booking_id,session.setupMetadata.placemat_policy_id,{customer:session.customer,metadata:session.setupMetadata});session.status='complete';session.setup_intent=setupId;return session
 }
 return {edge,complete,fees,sessions,account,calls,loseNextCapture(){loseCapture=true}}
}
