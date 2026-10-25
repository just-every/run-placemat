import assert from 'node:assert/strict'
import {feeEdge} from './fee-fixture.mjs'
/** Provider edges only; all state, permissions and consent transitions use the real Worker. */
export function merchantEdge(){
 const fees=feeEdge(),sessions=new Map(),keys=new Map(),customers=new Map(),account={object:'account',id:'synthetic-placemat-merchant-1',country:'US',default_currency:'usd',charges_enabled:true,payouts_enabled:true,details_submitted:true,livemode:false},calls=[]
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
   const session={object:'checkout.session',id:'synthetic-placemat-checkout-'+sessions.size,mode:body.get('mode'),client_reference_id:body.get('client_reference_id'),metadata:{placemat_collection_id:body.get('metadata[placemat_collection_id]'),placemat_booking_id:body.get('metadata[placemat_booking_id]')},status:'open',url:'https://checkout.stripe.com/c/synthetic-placemat-'+sessions.size,setupMetadata:{placemat_collection_id:body.get('setup_intent_data[metadata][placemat_collection_id]'),placemat_booking_id:body.get('setup_intent_data[metadata][placemat_booking_id]'),placemat_policy_id:body.get('setup_intent_data[metadata][placemat_policy_id]')},customer:body.get('customer')}
   assert.equal(body.get('mode'),'setup');assert.equal(body.get('payment_method_types[0]'),'card');sessions.set(session.id,session);keys.set(key,session);return Response.json(session)
  }
  if(url.pathname.startsWith('/v1/checkout/sessions/'))return Response.json(sessions.get(url.pathname.split('/').at(-1))??{})
  return fees.edge(request)
 }
 const complete=collection=>{
  const session=sessions.get(collection.providerReference);assert.ok(session)
  const setupId=fees.setup(session.metadata.placemat_booking_id,session.setupMetadata.placemat_policy_id,{customer:session.customer,metadata:session.setupMetadata});session.status='complete';session.setup_intent=setupId;return session
 }
 return {edge,complete,fees,sessions,account,calls}
}
