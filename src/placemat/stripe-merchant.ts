import {holdCheckout,observeCardHold} from './card-hold-provider'
import {holdObservationStatements} from './card-hold-records'
import type {Guarantee} from './card-guarantees'
import {fail,text,type Actor} from './model'
import {hash,load} from './store'
import {feeAuthority,feeCommit,feeEvent} from './fee-policy'
export type MerchantEnv={DB:D1Database;STRIPE_SECRET_KEY?:string;AUTH_ORIGIN:string}
type Merchant={account_id:string;state:'connected'|'restricted'|'disconnected';charges_enabled:number;payouts_enabled:number;details_submitted:number;livemode:number;updated_by:string;updated_at:string}
type Collection={authorization_held_cents?:number;id:string;booking_id:string;account_id:string;created_by:string;created_at:string;expires_at:string;provider_reference:string|null;state:'pending'|'collected'|'expired';verified_at:string|null}
const row=(db:D1Database)=>db.prepare('SELECT * FROM pm_stripe_merchant WHERE id=1').first<Merchant>()
const view=(r:Merchant|null)=>r?{accountId:r.account_id,state:r.state,chargesEnabled:!!r.charges_enabled,payoutsEnabled:!!r.payouts_enabled,onboardingComplete:!!r.details_submitted,mode:r.livemode?'live':'test',updatedBy:r.updated_by,updatedAt:r.updated_at}:null
const collectionView=(r:Collection)=>({id:r.id,bookingId:r.booking_id,accountId:r.account_id,createdBy:r.created_by,createdAt:r.created_at,expiresAt:r.expires_at,providerReference:r.provider_reference,state:r.state==='pending'&&Date.parse(r.expires_at)<=Date.now()?'expired':r.state,verifiedAt:r.verified_at,fundsHeldCents:r.authorization_held_cents??0,protection:'unproved'})
export const stripeCostDisclosure='Stripe bills the restaurant directly under its merchant agreement. US standard domestic card pricing is 2.9% plus USD 0.30 per successful charge; other cards, methods and optional services may cost more. Check the merchant agreement for current prices. Placemat charges no fee and holds no merchant funds.'
export async function merchantStripe(env:MerchantEnv,path:string,body?:URLSearchParams,key?:string):Promise<any>{
 if(!env.STRIPE_SECRET_KEY)fail(409,'Configure the restaurant Stripe credential privately before connecting.')
 let response:Response
 try{response=await fetch('https://api.stripe.com/v1'+(path.startsWith('/')?path:'/'+path),{method:body?'POST':'GET',headers:{authorization:'Bearer '+env.STRIPE_SECRET_KEY,...body?{'content-type':'application/x-www-form-urlencoded','idempotency-key':key!}:{}},body:body?.toString(),redirect:'manual',signal:AbortSignal.timeout(15000)})}catch{return fail(502,'Stripe is unavailable. Review the saved collection; no delivery is recorded.')}
 if(!response.ok)fail(502,'Stripe did not confirm this request. Provider details are private.')
 try{return await response.json()}catch{return fail(502,'Stripe returned an unreadable response.')}
}
async function account(env:MerchantEnv){
 const a=await merchantStripe(env,'account')
 if(a?.object!=='account'||typeof a.id!=='string'||!a.id||typeof a.country!=='string'||!(/^[A-Z]{2}$/.test(a.country))||typeof a.charges_enabled!=='boolean'||typeof a.payouts_enabled!=='boolean'||typeof a.details_submitted!=='boolean')fail(409,'Stripe must confirm the restaurant merchant, USD currency and capability state.')
 const country=await merchantStripe(env,'country_specs/'+a.country)
 if(country.object!=='country_spec'||country.id!==a.country||!Array.isArray(country.supported_payment_currencies)||!country.supported_payment_currencies.includes('usd'))fail(409,'Stripe must confirm USD card collection is supported for this merchant country.')
 return a
}
/** A disconnect fences all existing charge doors, while retained obligations remain readable. */
export async function assertStripeCollectionAllowed(db:D1Database,secret?:string){
 const m=await row(db)
 // Existing configured fee and deposit installations retain their earlier connection foundation until explicitly connected here.
 if(m)await connectedMerchant({DB:db,STRIPE_SECRET_KEY:secret,AUTH_ORIGIN:''})
}
export async function connectedMerchant(env:MerchantEnv){
 const m=await row(env.DB)
 if(!m||m.state!=='connected')fail(409,'Connect the restaurant merchant before collecting a card.')
 try{
  const a=await account(env)
  if(a.id!==m!.account_id||!a.charges_enabled||!a.details_submitted)fail(409,'The configured Stripe merchant changed or cannot collect. Reconnect and review capability state.')
 }catch(error){
  const now=new Date().toISOString()
  await env.DB.batch([env.DB.prepare("UPDATE pm_stripe_merchant SET state='restricted',charges_enabled=0,updated_at=? WHERE id=1 AND state='connected'").bind(now),feeEvent(env.DB,{id:m!.updated_by,name:'Merchant capability observation',role:'owner'},'payment.merchant-capability',m!.account_id,{accountId:m!.account_id,state:'restricted',observedAt:now,source:'provider'},null,view(m))])
  throw error
 }
 return m!
}
export async function readMerchant(db:D1Database,actor:Actor){
 await feeAuthority(db,actor)
 return {merchant:view(await row(db)),costDisclosure:stripeCostDisclosure,collections:(await db.prepare('SELECT c.*,g.authorization_held_cents FROM pm_stripe_collections c LEFT JOIN pm_card_guarantees g ON g.id=c.id ORDER BY c.created_at,c.id').all<Collection>()).results.map(collectionView)}
}
export async function connectMerchant(env:MerchantEnv,actor:Actor,p:any){
 await feeAuthority(env.DB,actor)
 if(p.acceptCosts!==true||p.reviewedCosts!==stripeCostDisclosure)fail(409,'Review the exact Stripe cost disclosure before enabling collection.')
 const a=await account(env),before=await row(env.DB),{version}=await load(env.DB)
 if(before&&before.account_id!==a.id)fail(409,'This installation retains obligations for another merchant. Do not replace its account.')
 a.livemode=typeof a.livemode==='boolean'?a.livemode:!(/^(?:sk|rk)_test_/.test(env.STRIPE_SECRET_KEY??''))
 const state=a.charges_enabled&&a.details_submitted?'connected':'restricted',now=new Date().toISOString(),after={accountId:a.id,state,chargesEnabled:a.charges_enabled,payoutsEnabled:a.payouts_enabled,onboardingComplete:a.details_submitted,mode:a.livemode?'live':'test',updatedBy:actor.id,updatedAt:now}
 await feeCommit(env.DB,actor,version,[env.DB.prepare('INSERT INTO pm_stripe_merchant(id,account_id,state,charges_enabled,payouts_enabled,details_submitted,livemode,updated_by,updated_at) VALUES(1,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,charges_enabled=excluded.charges_enabled,payouts_enabled=excluded.payouts_enabled,details_submitted=excluded.details_submitted,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(a.id,state,+a.charges_enabled,+a.payouts_enabled,+a.details_submitted,+!!a.livemode,actor.id,now),feeEvent(env.DB,actor,'payment.merchant-connect',a.id,after,null,view(before))])
 return after
}
export async function disconnectMerchant(env:MerchantEnv,actor:Actor){
 await feeAuthority(env.DB,actor)
 const before=await row(env.DB)??fail(409,'No merchant is connected.'),{version}=await load(env.DB),now=new Date().toISOString()
 await feeCommit(env.DB,actor,version,[env.DB.prepare("UPDATE pm_stripe_merchant SET state='disconnected',updated_by=?,updated_at=? WHERE id=1").bind(actor.id,now),feeEvent(env.DB,actor,'payment.merchant-disconnect',before.account_id,{...view(before),state:'disconnected',updatedBy:actor.id,updatedAt:now},null,view(before))])
 return view(await row(env.DB))
}
export async function collectMerchantCard(env:MerchantEnv,actor:Actor,p:any){
 await feeAuthority(env.DB,actor)
 const merchant=await connectedMerchant(env),{state,version}=await load(env.DB),bookingId=text(p.bookingId,'Reservation'),booking=state.bookings.find(b=>b.id===bookingId)??fail(404,'Reservation not found.')
 if(booking.status!=='booked'||Date.parse(booking.startAt)<=Date.now())fail(409,'Collect only for a current future reservation.')
 const guest=await env.DB.prepare('SELECT data FROM pm_guests WHERE id=?').bind(booking.guestId).first<{data:string}>()
 if(!guest||JSON.parse(guest.data).erased)fail(409,'A retained reservation guest is required.')
 const collectionId=text(p.requestId,'Stable collection request ID',120)
 let saved=await env.DB.prepare('SELECT * FROM pm_stripe_collections WHERE id=?').bind(collectionId).first<Collection>()
 if(saved&&(saved.booking_id!==bookingId||saved.created_by!==actor.id||saved.account_id!==merchant.account_id))fail(409,'This collection request belongs to other facts.')
 if(!saved){
  const now=new Date().toISOString(),expiresAt=new Date(Date.now()+3600000).toISOString(),origin=new URL(env.AUTH_ORIGIN)
  if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password)fail(409,'Configure the venue origin.')
  await feeCommit(env.DB,actor,version,[env.DB.prepare("INSERT INTO pm_stripe_collections(id,booking_id,account_id,created_by,created_at,expires_at,state) VALUES(?,?,?,?,?,?,'pending')").bind(collectionId,bookingId,merchant.account_id,actor.id,now,expiresAt),env.DB.prepare('INSERT INTO pm_stripe_collection_custody(collection_id,return_url) VALUES(?,?)').bind(collectionId,origin.origin+'/'),feeEvent(env.DB,actor,'payment.card-collection',collectionId,{id:collectionId,bookingId,accountId:merchant.account_id,state:'pending',expiresAt},bookingId)])
  saved=await env.DB.prepare('SELECT * FROM pm_stripe_collections WHERE id=?').bind(collectionId).first<Collection>()
 }
 const r=saved!,custody=await env.DB.prepare('SELECT return_url,provider_url,token_hash FROM pm_stripe_collection_custody WHERE collection_id=?').bind(r.id).first<{return_url:string;provider_url:string|null;token_hash:string|null}>()
 if(!custody||Date.parse(r.expires_at)<=Date.now()||r.state!=='pending')fail(409,'This collection has ended. Review its saved outcome.')
 const guarantee=await env.DB.prepare('SELECT * FROM pm_card_guarantees WHERE id=?').bind(r.id).first<Guarantee>()
 if(guarantee&&(guarantee.ended_at||Date.parse(guarantee.expires_at)<=Date.now()))fail(409,'This guest fee authority expired. Collect a new agreement.')
 if(r.provider_reference)return {...collectionView(r),hostedUrl:custody!.provider_url,delivery:'copy-required'}
 const body=new URLSearchParams({mode:'setup',currency:'usd',success_url:custody!.return_url,cancel_url:custody!.return_url,client_reference_id:r.id,'metadata[placemat_collection_id]':r.id,'metadata[placemat_booking_id]':r.booking_id,'setup_intent_data[metadata][placemat_booking_id]':r.booking_id,'setup_intent_data[metadata][placemat_collection_id]':r.id,'payment_method_types[0]':'card',expires_at:String(Math.floor(Date.parse(r.expires_at)/1000))})
 // Setup saves a card only. It creates neither held funds nor guest consent to a fee.
 if(guarantee){
  if(typeof p.guestToken!=='string'||await hash(p.guestToken)!==custody!.token_hash)fail(409,'Continue through the guest private link to create hosted collection.')
  body.set('success_url',custody!.return_url+'#card='+p.guestToken);body.set('cancel_url',custody!.return_url+'#card='+p.guestToken)
  if(!guarantee.accepted_at)fail(409,'The guest must accept the exact fee terms before hosted collection.')
  const customer=await merchantStripe(env,'customers',new URLSearchParams({'metadata[placemat_collection_id]':r.id}),'placemat-card-customer-'+r.id)
  if(customer.object!=='customer'||typeof customer.id!=='string'||!customer.id)fail(502,'Stripe did not confirm the collection customer.')
  body.set('customer',customer.id)
  const terms=await env.DB.prepare('SELECT policy_id FROM pm_card_guarantees WHERE id=?').bind(r.id).first<{policy_id:string}>()
  body.set('setup_intent_data[metadata][placemat_policy_id]',terms!.policy_id)
  if(guarantee.authorization_cents)holdCheckout(body,guarantee)
 }
 const result=await merchantStripe(env,'/checkout/sessions',body,'placemat-card-'+r.id)
 let url:URL;try{url=new URL(result.url)}catch{return fail(502,'Stripe did not return a hosted collection link.')}
 if(result.object!=='checkout.session'||typeof result.id!=='string'||result.mode!==(guarantee?.authorization_cents?'payment':'setup')||result.client_reference_id!==r.id||result.metadata?.placemat_booking_id!==r.booking_id||result.metadata?.placemat_collection_id!==r.id||url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password||url.port)fail(502,'Stripe collection did not match the saved request.')
 await feeAuthority(env.DB,actor);await connectedMerchant(env)
 const {version:current}=await load(env.DB)
 await feeCommit(env.DB,actor,current,[env.DB.prepare('UPDATE pm_stripe_collections SET provider_reference=? WHERE id=? AND provider_reference IS NULL').bind(result.id,r.id),env.DB.prepare('UPDATE pm_stripe_collection_custody SET provider_url=? WHERE collection_id=?').bind(url.href,r.id)])
 return {...collectionView({...r,provider_reference:result.id}),hostedUrl:url.href,delivery:'copy-required'}
}
export async function syncMerchantCard(env:MerchantEnv,actor:Actor,p:any){
 await feeAuthority(env.DB,actor)
 const merchant=await connectedMerchant(env),r=await env.DB.prepare('SELECT * FROM pm_stripe_collections WHERE id=?').bind(text(p.requestId,'Collection request')).first<Collection>()??fail(404,'Collection not found.')
 if(r.account_id!==merchant.account_id||!r.provider_reference)fail(409,'No matching merchant collection is recorded.')
 const {state,version}=await load(env.DB),booking=state.bookings.find(b=>b.id===r.booking_id)??fail(404,'Reservation not found.'),guest=await env.DB.prepare('SELECT data FROM pm_guests WHERE id=?').bind(booking.guestId).first<{data:string}>()
 if(!guest||JSON.parse(guest.data).erased)fail(409,'The collection guest is erased.')
 const guarantee=await env.DB.prepare('SELECT * FROM pm_card_guarantees WHERE id=?').bind(r.id).first<Guarantee>()
 const session=await merchantStripe(env,'/checkout/sessions/'+encodeURIComponent(r.provider_reference!))
 if(session.object!=='checkout.session'||session.id!==r.provider_reference||session.mode!==(guarantee?.authorization_cents?'payment':'setup')||session.client_reference_id!==r.id||session.metadata?.placemat_collection_id!==r.id||session.metadata?.placemat_booking_id!==r.booking_id)fail(502,'Stripe collection identity did not match.')
 if(guarantee?.authorization_cents){
  if(!guarantee.accepted_at)fail(409,'This authorization has no recorded guest agreement.')
  let observation
  try{observation=session.payment_intent?await observeCardHold(env,session,guarantee):null}catch(error){
   await feeCommit(env.DB,actor,version,[env.DB.prepare("UPDATE pm_card_guarantees SET authorization_state='unconfirmed' WHERE id=?").bind(guarantee.id),feeEvent(env.DB,actor,'payment.card-hold-unconfirmed',guarantee.id,{state:'unconfirmed',protection:'unprotected',nextAction:'Reconcile the original provider authorization.'},guarantee.booking_id)])
   throw error
  }
  const next:Collection['state']=session.status==='complete'?'collected':session.status==='expired'?'expired':'pending',now=new Date().toISOString()
  await feeCommit(env.DB,actor,version,[env.DB.prepare('UPDATE pm_stripe_collections SET state=?,verified_at=? WHERE id=?').bind(next,now,r.id),...(observation?[
   ...holdObservationStatements(env.DB,actor,guarantee,observation),
   env.DB.prepare('UPDATE pm_stripe_collection_custody SET customer_reference=?,method_reference=?,provider_url=NULL WHERE collection_id=?').bind(observation.customer,observation.method,r.id)
  ]:[]),feeEvent(env.DB,actor,'payment.card-verified',r.id,{...collectionView({...r,state:next,verified_at:now}),fundsHeldCents:observation?.heldCents??0},r.booking_id)])
  return {...collectionView({...r,state:next,verified_at:now}),fundsHeldCents:observation?.heldCents??0}
 }
 let next:Collection['state']='pending',setup:any=null
 if(session.status==='expired')next='expired'
 else if(session.status==='complete'){
  if(typeof session.setup_intent!=='string')fail(502,'Stripe setup is unconfirmed.')
  setup=await merchantStripe(env,'setup_intents/'+encodeURIComponent(session.setup_intent))
  if(setup.object!=='setup_intent'||setup.id!==session.setup_intent||setup.status!=='succeeded'||setup.usage!=='off_session'||typeof setup.payment_method!=='string'||!setup.payment_method||setup.metadata?.placemat_booking_id!==r.booking_id||setup.metadata?.placemat_collection_id!==r.id)fail(502,'Stripe did not confirm this reservation card setup.')
  next='collected'
 }
 if(guarantee){
  const {bookingTerms}=await import('./fee-policy')
  if(setup&&(typeof setup.customer!=='string'||setup.customer!==session.customer))fail(502,'Stripe customer did not match the hosted collection.')
  if(!guarantee.accepted_at||guarantee.booking_snapshot!==JSON.stringify(bookingTerms(booking))||booking.status!=='booked'||guarantee.ended_at||Date.parse(guarantee.expires_at)<=Date.now()||setup&&setup.metadata?.placemat_policy_id!==guarantee.policy_id)fail(409,'The guest agreement is expired or reservation facts changed. Collect a new agreement.')
 }
 const now=new Date().toISOString(),after={...collectionView({...r,state:next,verified_at:now})}
 await feeAuthority(env.DB,actor);await connectedMerchant(env)
 await feeCommit(env.DB,actor,version,[env.DB.prepare('UPDATE pm_stripe_collections SET state=?,verified_at=? WHERE id=?').bind(next,now,r.id),...(setup?[env.DB.prepare('UPDATE pm_stripe_collection_custody SET setup_reference=?,customer_reference=?,method_reference=?,provider_url=NULL WHERE collection_id=?').bind(setup.id,setup.customer??null,setup.payment_method,r.id)]:[]),feeEvent(env.DB,actor,'payment.card-verified',r.id,after,r.booking_id,collectionView(r))])
 return after
}
