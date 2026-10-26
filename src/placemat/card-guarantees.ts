import {fail,id,text,type Actor} from './model'
import {hash,load} from './store'
import {bookingTerms,feeAuthority,feeCommit,feeEvent,feePolicy,iso} from './fee-policy'
import {connectedMerchant,collectMerchantCard,syncMerchantCard,merchantStripe,type MerchantEnv} from './stripe-merchant'
import {authorityExpiry} from './fee-expiry'
import {releaseCardHold} from './card-hold-provider'
import {holdObservationStatements} from './card-hold-records'
export type Guarantee={id:string;booking_id:string;policy_id:string;actor_id:string;created_at:string;accepted_at:string|null;review_text:string;booking_snapshot:string;expires_at:string;ended_at:string|null;recollection_requested_at:string|null;max_fee_cents:number;authorization_cents:number;authorization_reference:string|null;authorization_state:'unconfirmed'|'held'|'released'|'captured';authorization_held_cents:number;authorization_expires_at:string|null;authorization_verified_at:string|null}
export async function guaranteeView(db:D1Database,g:Guarantee){
 const collection=await db.prepare('SELECT state,verified_at FROM pm_stripe_collections WHERE id=?').bind(g.id).first<{state:string;verified_at:string|null}>(),custody=await db.prepare('SELECT method_reference FROM pm_stripe_collection_custody WHERE collection_id=?').bind(g.id).first<{method_reference:string|null}>(),{state}=await load(db),booking=state.bookings.find(b=>b.id===g.booking_id)
 const merchant=await db.prepare("SELECT state FROM pm_stripe_merchant WHERE id=1").first<{state:string}>()
 const boundary=authorityExpiry(g.expires_at,state.services.find(s=>s.id===booking?.serviceId)?.endAt,g.ended_at),expiry=g.authorization_expires_at?authorityExpiry(boundary,g.authorization_expires_at):boundary,expired=Date.parse(expiry)<=Date.now(),matching=!!booking&&g.booking_snapshot===JSON.stringify(bookingTerms(booking)),current=merchant?.state==='connected'&&!expired&&!!g.accepted_at&&collection?.state==='collected'&&!!custody?.method_reference&&matching&&(!g.authorization_cents||g.authorization_state==='held'&&g.authorization_held_cents===g.authorization_cents&&!!g.authorization_expires_at)
 return {reservation:{startAt:booking?.startAt,partySize:booking?.partySize,venue:state.venue.name,timezone:state.venue.timezone},id:g.id,bookingId:g.booking_id,policyId:g.policy_id,actorId:g.actor_id,acceptedAt:g.accepted_at,recordedAt:g.created_at,reviewText:g.review_text,expiresAt:expiry,authorizationState:expired?'expired':current?'current':'unconfirmed',source:'guest-captured',collectionMode:g.authorization_cents?'authorization':'setup',heldState:g.authorization_held_cents&&(expired||g.authorization_state==='unconfirmed')?'release-unconfirmed':g.authorization_state,heldVerifiedAt:g.authorization_verified_at,fundsHeldCents:g.authorization_held_cents,maxFeeCents:g.max_fee_cents,protection:current?(g.authorization_cents?'card-authorization':'tokenized-card-guarantee'):'unprotected',recollection:expired?{ownerId:g.actor_id,requestedAt:g.recollection_requested_at,nextAction:g.authorization_held_cents>0?'Verify release of the earlier authorization, then explicitly issue a new guest collection link. No message has been sent.':'Explicitly issue a new guest collection link. No message has been sent.'}:null}
}
export async function readGuarantees(db:D1Database,actor:Actor){
 if(actor.role!=='owner'||actor.agent||actor.deviceId)return []
 await feeAuthority(db,actor)
 return Promise.all((await db.prepare('SELECT * FROM pm_card_guarantees ORDER BY created_at,id').all<Guarantee>()).results.map(g=>guaranteeView(db,g)))
}
export async function currentGuarantee(db:D1Database,bookingId:string){
 return db.prepare('SELECT * FROM pm_card_guarantees WHERE booking_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(bookingId).first<Guarantee>()
}
export async function issueGuarantee(env:MerchantEnv,actor:Actor,p:any){
 await feeAuthority(env.DB,actor)
 const merchant=await connectedMerchant(env),{state,version}=await load(env.DB),bookingId=text(p.bookingId,'Reservation'),booking=state.bookings.find(b=>b.id===bookingId)??fail(404,'Reservation not found.')
 if(booking.status!=='booked'||Date.parse(booking.startAt)<=Date.now())fail(409,'Guarantees require a future active reservation.')
 const guest=await env.DB.prepare('SELECT data FROM pm_guests WHERE id=?').bind(booking.guestId).first<{data:string}>()
 if(!guest||JSON.parse(guest.data).erased)fail(409,'A retained reservation guest is required.')
 const policy=await feePolicy(env.DB,text(p.policyId,'Fee policy'))??fail(404,'Fee policy not found.'),service=state.services.find(s=>s.id===booking.serviceId)!
 const existing=await currentGuarantee(env.DB,bookingId)
 if(existing&&(await guaranteeView(env.DB,existing)).authorizationState!=='expired')fail(409,'End the existing guarantee before issuing renewed collection.')
 if(existing?.authorization_cents&&existing.authorization_held_cents>0)fail(409,'Verify release of the earlier card authorization before renewed collection.')
 const amount=(rule:{mode:string;amountCents:number})=>rule.amountCents*(rule.mode==='per_person'?booking.partySize:1),max=Math.max(amount(policy.cancellation),amount(policy.noShow))
 if(!Number.isSafeInteger(max)||max<50||max>99999999)fail(409,'The agreed maximum fee is outside the supported USD amount.')
 const authorizationCents=p.collectionMode==='authorization'?Number(p.authorizationCents):0
 if(p.collectionMode!==undefined&&!['setup','authorization'].includes(p.collectionMode)||!Number.isSafeInteger(authorizationCents)||p.collectionMode==='authorization'&&(authorizationCents<50||authorizationCents>max))fail(400,'Choose a card setup or an authorization no larger than the agreed maximum fee.')
 const reviewText=policy.reviewText+(authorizationCents?` A temporary card authorization of USD ${(authorizationCents/100).toFixed(2)} reserves funds only for this reservation. It is not a charge. Only an explicit permitted fee decision may capture it; there is no automatic capture. An unclaimed authorization is released on explicit ending or provider expiry; release is reported only after provider confirmation.`:'')
 const collectionId=id(),now=new Date().toISOString(),expiresAt=p.expiresAt===undefined?service.endAt:iso(p.expiresAt,'Guarantee expiry'),linkExpiry=new Date(Math.min(Date.now()+24*3600000,Date.parse(booking.startAt))).toISOString(),token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join(''),origin=new URL(env.AUTH_ORIGIN)
 if(Date.parse(expiresAt)<=Date.now()||Date.parse(expiresAt)>Date.parse(service.endAt))fail(400,'Guarantee expiry must be in the future and no later than service end.')
 if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password)fail(409,'Configure the venue origin.')
 await feeCommit(env.DB,actor,version,[
  env.DB.prepare("INSERT INTO pm_stripe_collections(id,booking_id,account_id,created_by,created_at,expires_at,state) VALUES(?,?,?,?,?,?,'pending')").bind(collectionId,bookingId,merchant.account_id,actor.id,now,linkExpiry),
  env.DB.prepare('INSERT INTO pm_card_guarantees(id,booking_id,policy_id,actor_id,created_at,review_text,booking_snapshot,expires_at,max_fee_cents,authorization_cents) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(collectionId,bookingId,policy.id,actor.id,now,reviewText,JSON.stringify(bookingTerms(booking)),expiresAt,max,authorizationCents),
  env.DB.prepare('INSERT INTO pm_stripe_collection_custody(collection_id,return_url,token_hash,token_expires_at) VALUES(?,?,?,?)').bind(collectionId,origin.origin+'/manage-booking',await hash(token),linkExpiry),
  env.DB.prepare('UPDATE pm_stripe_collection_custody SET token_hash=NULL WHERE collection_id IN (SELECT id FROM pm_card_guarantees WHERE booking_id=? AND id<>?)').bind(bookingId,collectionId),
  feeEvent(env.DB,actor,'payment.guarantee-issue',collectionId,{bookingId,policyId:policy.id,reviewText,expiresAt,maxFeeCents:max,authorizationCents,delivery:'not-sent'},bookingId),
 ])
 return {id:collectionId,bookingId,guestUrl:origin.origin+'/manage-booking#card='+token,delivery:'copy-required',expiresAt,linkExpiresAt:linkExpiry}
}
async function guestRow(env:MerchantEnv,token:unknown){
 const missing=()=>fail(404,'This private collection link is unavailable. Ask the restaurant for a new link.')
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return missing()
 const g=await env.DB.prepare('SELECT g.* FROM pm_card_guarantees g JOIN pm_stripe_collection_custody c ON c.collection_id=g.id WHERE c.token_hash=? AND c.token_expires_at>?').bind(await hash(token),new Date().toISOString()).first<Guarantee>()
 if(!g)return missing()
 const {state}=await load(env.DB),booking=state.bookings.find(b=>b.id===g!.booking_id),guest=booking?await env.DB.prepare('SELECT data FROM pm_guests WHERE id=?').bind(booking.guestId).first<{data:string}>():null
 if(!booking||!guest||JSON.parse(guest.data).erased||booking.status!=='booked'||g!.booking_snapshot!==JSON.stringify(bookingTerms(booking)))return missing()
 await feeAuthority(env.DB,{id:g!.actor_id,role:'owner'} as Actor)
 return g!
}
const publicView=(g:Awaited<ReturnType<typeof guaranteeView>>)=>({reservation:g.reservation,id:g.id,reviewText:g.reviewText,acceptedAt:g.acceptedAt,expiresAt:g.expiresAt,authorizationState:g.authorizationState,source:g.source,collectionMode:g.collectionMode,heldState:g.heldState,heldVerifiedAt:g.heldVerifiedAt,fundsHeldCents:g.fundsHeldCents,maxFeeCents:g.maxFeeCents,protection:g.protection})
export async function guestGuarantee(env:MerchantEnv,p:any,action:string){
 const g=await guestRow(env,p.token),actor={id:g.actor_id,role:'owner'} as Actor
 if(action==='status')return publicView(await guaranteeView(env.DB,g))
 if((await guaranteeView(env.DB,g)).authorizationState==='expired')fail(409,'This fee authority has expired. Ask the restaurant for renewed collection.')
 if(action==='accept'){
  if(p.accept!==true||p.reviewedText!==g.review_text)fail(409,'Explicitly accept the exact displayed fee terms before continuing to Stripe.')
  const now=new Date().toISOString(),{version}=await load(env.DB)
  if(!g.accepted_at)await feeCommit(env.DB,actor,version,[env.DB.prepare('UPDATE pm_card_guarantees SET accepted_at=? WHERE id=? AND accepted_at IS NULL').bind(now,g.id),feeEvent(env.DB,{...actor,id:'guest:'+g.id},'payment.guarantee-guest-consent',g.id,{source:'guest',acceptedAt:now,reviewText:g.review_text,bookingSnapshot:JSON.parse(g.booking_snapshot),expiresAt:g.expires_at,maxFeeCents:g.max_fee_cents},g.booking_id)])
  return collectMerchantCard(env,actor,{bookingId:g.booking_id,requestId:g.id,guestToken:p.token})
 }
 if(action==='sync'){
  await syncMerchantCard(env,actor,{requestId:g.id})
  return publicView(await guaranteeView(env.DB,(await guestRow(env,p.token))))
 }
 fail(404,'Collection action not found.')
}
export async function endGuarantee(env:MerchantEnv,actor:Actor,p:any){
 const db=env.DB
 await feeAuthority(db,actor)
 let g=await db.prepare('SELECT * FROM pm_card_guarantees WHERE id=?').bind(text(p.id,'Guarantee')).first<Guarantee>()??fail(404,'Guarantee not found.')
 if(!g.ended_at){
  const {version}=await load(db),before=await guaranteeView(db,g),now=new Date().toISOString()
  await feeCommit(db,actor,version,[db.prepare('UPDATE pm_card_guarantees SET ended_at=?,recollection_requested_at=? WHERE id=? AND ended_at IS NULL').bind(now,now,g.id),feeEvent(db,actor,'payment.guarantee-expiry',g.id,{...before,expiresAt:now,authorizationState:'expired',protection:'unprotected',recollection:{ownerId:g.actor_id,requestedAt:now,delivery:'not-sent'}},g.booking_id,before,'guarantee-expiry-'+g.id)])
  g={...g,ended_at:now,recollection_requested_at:now}
 }
 if(g.authorization_cents&&g.authorization_state!=='released'){
  const collection=await db.prepare('SELECT provider_reference FROM pm_stripe_collections WHERE id=?').bind(g.id).first<{provider_reference:string|null}>()
  if(collection?.provider_reference){
   const session=await merchantStripe(env,'checkout/sessions/'+encodeURIComponent(collection.provider_reference)),observed=await releaseCardHold(env,session,g),{version}=await load(db)
   await feeCommit(db,actor,version,holdObservationStatements(db,actor,g,observed))
   g=(await db.prepare('SELECT * FROM pm_card_guarantees WHERE id=?').bind(g.id).first<Guarantee>())!
  }
 }
 return guaranteeView(db,g)
}

/** Execution custody is never a public projection or portable authority. */
export async function guaranteeCredentials(db:D1Database,guaranteeId:string){
 const g=await db.prepare('SELECT authorization_cents,authorization_reference FROM pm_card_guarantees WHERE id=?').bind(guaranteeId).first<{authorization_cents:number;authorization_reference:string|null}>()
 const c=await db.prepare('SELECT customer_reference,payment_method_reference,setup_reference FROM (SELECT customer_reference,method_reference AS payment_method_reference,setup_reference,collection_id FROM pm_stripe_collection_custody) WHERE collection_id=?').bind(guaranteeId).first<{customer_reference:string|null;payment_method_reference:string|null;setup_reference:string|null}>()
 return c?.customer_reference&&c.payment_method_reference&&(c.setup_reference||g?.authorization_cents&&g.authorization_reference)?{consent_id:guaranteeId,customer_id:c.customer_reference,payment_method_id:c.payment_method_reference,setup_intent_id:c.setup_reference??'',...(g?.authorization_cents?{authorization_reference:g.authorization_reference!,authorization_cents:g.authorization_cents}:{})}:null
}
