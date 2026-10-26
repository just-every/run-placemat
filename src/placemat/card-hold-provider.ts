import {fail} from './model'
import {merchantStripe,type MerchantEnv} from './stripe-merchant'

type HoldGuarantee={id:string;booking_id:string;policy_id:string;authorization_cents:number;review_text:string}
export type CardHoldObservation={reference:string;state:'held'|'released'|'captured'|'unconfirmed';heldCents:number;expiresAt:string|null;verifiedAt:string;customer:string|null;method:string|null;releasable?:boolean}

function amount(guarantee:HoldGuarantee){
 if(!Number.isSafeInteger(guarantee.authorization_cents)||guarantee.authorization_cents<50||guarantee.authorization_cents>99999999)fail(409,'The saved card authorization amount is invalid.')
 return guarantee.authorization_cents
}

export function holdCheckout(body:URLSearchParams,guarantee:HoldGuarantee){
 const cents=amount(guarantee)
 for(const key of [...body.keys()]){
  if(key==='setup_intent_data'||key.startsWith('setup_intent_data[')||key.startsWith('line_items[')||key.includes('[setup_future_usage]')||key.startsWith('saved_payment_method_options[')||key.startsWith('payment_method_options[card][capture_'))body.delete(key)
  if(key.startsWith('payment_method_types[')&&body.get(key)!=='card')body.delete(key)
 }
 if(![...body.entries()].some(([key,value])=>key.startsWith('payment_method_types[')&&value==='card'))body.set('payment_method_types[0]','card')
 body.set('mode','payment')
 body.set('currency','usd')
 body.set('line_items[0][quantity]','1')
 body.set('line_items[0][price_data][currency]','usd')
 body.set('line_items[0][price_data][unit_amount]',String(cents))
 body.set('line_items[0][price_data][product_data][name]','Reservation card hold')
 body.set('line_items[0][price_data][product_data][description]',guarantee.review_text)
 body.set('payment_intent_data[capture_method]','manual')
 body.set('payment_intent_data[metadata][placemat_collection_id]',guarantee.id)
 body.set('payment_intent_data[metadata][placemat_booking_id]',guarantee.booking_id)
 body.set('payment_intent_data[metadata][placemat_policy_id]',guarantee.policy_id)
 return body
}

export async function observeCardHold(env:MerchantEnv,session:any,guarantee:HoldGuarantee):Promise<CardHoldObservation>{
 const cents=amount(guarantee),reference=session?.payment_intent
 if(typeof reference!=='string'||!reference)fail(502,'Stripe did not confirm the reservation authorization reference.')
 const intent=await merchantStripe(env,'payment_intents/'+encodeURIComponent(reference)+'?expand[]=latest_charge')
 if(intent?.object!=='payment_intent'||intent.id!==reference||intent.currency!=='usd'||intent.amount!==cents||intent.capture_method!=='manual'||intent.metadata?.placemat_collection_id!==guarantee.id||intent.metadata?.placemat_booking_id!==guarantee.booking_id||intent.metadata?.placemat_policy_id!==guarantee.policy_id)fail(502,'Stripe authorization identity or amount did not match the reservation.')
 if(intent.customer!==session.customer||!(intent.customer===null||typeof intent.customer==='string'&&intent.customer.length>0))fail(502,'Stripe customer did not match the hosted authorization.')
 const observation:CardHoldObservation={reference,state:'unconfirmed',heldCents:0,expiresAt:null,verifiedAt:new Date().toISOString(),customer:intent.customer,method:typeof intent.payment_method==='string'&&intent.payment_method?intent.payment_method:null}
 if(intent.status==='canceled')return {...observation,state:'released'}
 if(intent.status==='succeeded')return {...observation,state:'captured'}
 if(intent.status!=='requires_capture')return observation
 if(intent.amount_capturable!==cents)fail(502,'Stripe capturable amount did not match the saved authorization.')
 const charge=intent.latest_charge
 if(!charge||typeof charge!=='object')return observation
 if(charge.object!=='charge'||typeof charge.id!=='string'||!charge.id||charge.payment_intent!==reference||charge.amount!==cents||charge.currency!=='usd'||charge.customer!==intent.customer||charge.payment_method!==intent.payment_method)fail(502,'Stripe card charge identity or amount did not match the authorization.')
 const deadline=charge.payment_method_details?.card?.capture_before
 if(charge.captured!==false||charge.amount_captured!==0||charge.paid!==true||charge.payment_method_details?.type!=='card'||!observation.method||typeof deadline!=='number'||!Number.isFinite(deadline))return observation
 const deadlineMs=deadline*1000
 if(!Number.isFinite(deadlineMs)||deadlineMs>8640000000000000)return observation
 if(deadlineMs<=Date.now())return {...observation,expiresAt:new Date(deadlineMs).toISOString(),releasable:true}
 return {...observation,state:'held',heldCents:cents,releasable:true,expiresAt:new Date(deadlineMs).toISOString()}
}

export async function releaseCardHold(env:MerchantEnv,session:any,guarantee:HoldGuarantee):Promise<CardHoldObservation>{
 amount(guarantee)
 if(session?.object!=='checkout.session'||typeof session.id!=='string'||!session.id||session.mode!=='payment'||session.client_reference_id!==guarantee.id||session.metadata?.placemat_collection_id!==guarantee.id||session.metadata?.placemat_booking_id!==guarantee.booking_id)fail(502,'Stripe hosted authorization identity did not match the reservation.')
 if(session.status==='open'){
  const expired=await merchantStripe(env,'checkout/sessions/'+encodeURIComponent(session.id)+'/expire',new URLSearchParams(),'placemat-card-hold-expire-'+guarantee.id)
  if(expired?.object!=='checkout.session'||expired.id!==session.id||expired.status!=='expired')fail(502,'Stripe did not confirm the hosted authorization expired.')
  if(expired.payment_intent){
   const observed=await observeCardHold(env,{...session,payment_intent:expired.payment_intent},guarantee)
   if(observed.state==='captured')fail(409,'This authorization was captured. A manager must review a refund; release cannot refund a captured payment.')
   return observed
  }
  return {reference:session.id,state:'released',heldCents:0,expiresAt:null,verifiedAt:new Date().toISOString(),customer:typeof session.customer==='string'?session.customer:null,method:null}
 }
 if(session.status==='expired'&&!session.payment_intent)return {reference:session.id,state:'released',heldCents:0,expiresAt:null,verifiedAt:new Date().toISOString(),customer:typeof session.customer==='string'?session.customer:null,method:null}
 if(session.status!=='complete'&&session.status!=='expired')fail(409,'Stripe hosted authorization is unconfirmed. Review its provider status before release.')
 const before=await observeCardHold(env,session,guarantee)
 if(before.state==='captured')fail(409,'This authorization was captured. A manager must review a refund; release cannot refund a captured payment.')
 if(before.state!=='held'&&!before.releasable)return before
 await merchantStripe(env,'payment_intents/'+encodeURIComponent(before.reference)+'/cancel',new URLSearchParams(),'placemat-card-hold-release-'+guarantee.id)
 const after=await observeCardHold(env,session,guarantee)
 if(after.state==='captured')fail(409,'This authorization was captured. A manager must review a refund; release cannot refund a captured payment.')
 return after
}
