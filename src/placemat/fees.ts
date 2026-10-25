import {readGuarantees,currentGuarantee,guaranteeView,guaranteeCredentials,type Guarantee} from './card-guarantees'
import {assertStripeCollectionAllowed} from './stripe-merchant'
import {fail,id,text,type Actor} from './model'
import {load} from './store'
import {bookingTerms,feeAuthority,feeCalculation,feeCommit,feeEvent,feeKind,feePolicy,iso,policyFromRow,type FeeConsent,type FeePolicyRow} from './fee-policy'
export {createFeePolicy} from './fee-policy'
export type FeeBindings={DB:D1Database;STRIPE_SECRET_KEY?:string}
type Credentials={consent_id:string;customer_id:string;payment_method_id:string;setup_intent_id:string}
type Preview={id:string;booking_id:string;policy_id:string;consent_id:string|null;actor_id:string;created_at:string;expires_at:string;floor_version:number;data:string}
type Assessment={id:string;request_id:string;booking_id:string;service_id:string;policy_id:string;consent_id:string|null;guest_consent_id:string|null;preview_id:string;kind:'late_cancel'|'no_show';event_id:string;amount_cents:number;action:'charge'|'waive';status:'pending'|'succeeded'|'failed'|'waived';actor_id:string;reason:string;evidence:string;processor_id:string|null;charge_id:string|null;created_at:string;updated_at:string;processing_until:number}
const receipt=(r:Assessment)=>({id:r.id,requestId:r.request_id,bookingId:r.booking_id,serviceId:r.service_id,policyId:r.policy_id,consentId:r.consent_id,...r.guest_consent_id?{guestConsentId:r.guest_consent_id}:{},previewId:r.preview_id,kind:r.kind,eventId:r.event_id,amountCents:r.amount_cents,currency:'usd',action:r.action,status:r.status,actorId:r.actor_id,reason:r.reason,evidence:r.evidence,processorId:r.processor_id,chargeId:r.charge_id,createdAt:r.created_at,updatedAt:r.updated_at})
export const consentView=(c:FeeConsent)=>({id:c.id,bookingId:c.booking_id,policyId:c.policy_id,actorId:c.actor_id,acceptedAt:c.accepted_at,recordedAt:c.recorded_at,evidence:c.evidence,bookingSnapshot:JSON.parse(c.booking_snapshot),reviewText:c.review_text,expiresAt:c.expires_at,authorizationState:Date.parse(c.expires_at)>Date.now()?'current' as const:'expired' as const,protection:'unproved' as const,fundsHeldCents:0,recollection:Date.parse(c.expires_at)<=Date.now()?{ownerId:c.actor_id,dueAt:c.expires_at,requestedAt:c.recollection_requested_at,nextAction:'Obtain fresh guest agreement and a new hosted card collection; no message has been sent.'}:null,source:'owner-attested' as const})
const previewView=(p:Preview)=>({...JSON.parse(p.data),id:p.id,bookingId:p.booking_id,policyId:p.policy_id,consentId:p.consent_id,actorId:p.actor_id,createdAt:p.created_at,expiresAt:p.expires_at})
const consentFor=(db:D1Database,bookingId:string)=>db.prepare('SELECT * FROM pm_fee_consents WHERE booking_id=?').bind(bookingId).first<FeeConsent>()
const credentialFor=(db:D1Database,consentId:string)=>db.prepare('SELECT * FROM pm_fee_credentials WHERE consent_id=?').bind(consentId).first<Credentials>()
const assessmentFor=(db:D1Database,assessmentId:string)=>db.prepare('SELECT * FROM pm_fee_assessments WHERE id=?').bind(assessmentId).first<Assessment>()
function stripeKey(env:FeeBindings){return env.STRIPE_SECRET_KEY||fail(503,'Stripe fee execution is not configured.')}
async function stripe(env:FeeBindings,path:string,body?:URLSearchParams,key?:string):Promise<any>{
 const secret=stripeKey(env)
 if(body)await assertStripeCollectionAllowed(env.DB,env.STRIPE_SECRET_KEY)
 let response:Response
 try{response=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+secret,'stripe-version':'2026-09-30.endive',...body?{'content-type':'application/x-www-form-urlencoded','idempotency-key':key!}:{}},body:body?.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)})}catch{return fail(502,'Stripe did not confirm the fee. Reconcile the same saved request; do not create another charge.')}
 if(!response.ok)fail(502,'Stripe did not confirm the fee. Reconcile the same saved request; provider details are private.')
 try{return await response.json()}catch{return fail(502,'Stripe returned an unreadable fee response. The saved decision remains pending.')}
}

/** Staff records evidence of the guest's exact agreement; this is never labelled online guest consent. */
export async function recordFeeConsent(env:FeeBindings,actor:Actor,p:any){
 await feeAuthority(env.DB,actor)
 const {state,version}=await load(env.DB),bookingId=text(p.bookingId,'Reservation'),booking=state.bookings.find(b=>b.id===bookingId)??fail(404,'Reservation not found.')
 if(booking.status!=='booked'||Date.parse(booking.startAt)<=Date.now())fail(409,'Record fee consent before arrival while the reservation is active.')
 const guest=await env.DB.prepare('SELECT data FROM pm_guests WHERE id=?').bind(booking.guestId).first<{data:string}>()
 if(!guest||JSON.parse(guest.data).erased)fail(409,'Fee consent requires a retained reservation guest.')
 const policy=await feePolicy(env.DB,text(p.policyId,'Fee policy'))??fail(404,'Fee policy not found.'),acceptedAt=iso(p.acceptedAt,'Consent time'),evidence=text(p.evidence,'Guest agreement evidence',2000),setupId=text(p.setupIntentId,'Stripe SetupIntent',200)
 if(p.attest!==true||p.reviewedPolicyVersion!==policy.version||p.reviewedPolicyText!==policy.reviewText)fail(409,'Attest to the guest agreement and exactly the reviewed policy text and version.')
 if(Date.parse(acceptedAt)>Date.now()||acceptedAt<policy.createdAt||acceptedAt<booking.createdAt)fail(400,'Consent time must follow policy and reservation creation and cannot be in the future.')
 if(await consentFor(env.DB,bookingId))fail(409,'This reservation already has immutable fee consent. Review its agreed policy.')
 const setup=await stripe(env,'setup_intents/'+encodeURIComponent(setupId))
 if(setup?.object!=='setup_intent'||setup.id!==setupId||setup.status!=='succeeded'||setup.usage!=='off_session'||typeof setup.customer!=='string'||!setup.customer||typeof setup.payment_method!=='string'||!setup.payment_method||setup.metadata?.placemat_booking_id!==bookingId||setup.metadata?.placemat_policy_id!==policy.id)fail(409,'Stripe must confirm a successful off-session SetupIntent with this reservation and exact policy metadata.')
 const service=state.services.find(s=>s.id===booking.serviceId)??fail(409,'Reservation service not found.')
 const expiresAt=p.expiresAt===undefined?service.endAt:iso(p.expiresAt,'Authorization expiry')
 if(Date.parse(expiresAt)<=Date.now()||Date.parse(expiresAt)>Date.parse(service.endAt))fail(400,'Authorization expiry must be in the future and no later than service end.')
 const consentId=id(),now=new Date().toISOString(),view={id:consentId,bookingId,policyId:policy.id,actorId:actor.id,acceptedAt,recordedAt:now,evidence,bookingSnapshot:bookingTerms(booking),reviewText:policy.reviewText,expiresAt,authorizationState:'current',protection:'unproved',fundsHeldCents:0,recollection:null,source:'owner-attested'}
 await feeCommit(env.DB,actor,version,[env.DB.prepare('INSERT INTO pm_fee_consents(id,booking_id,policy_id,actor_id,accepted_at,recorded_at,evidence,booking_snapshot,review_text,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(consentId,bookingId,policy.id,actor.id,acceptedAt,now,evidence,JSON.stringify(bookingTerms(booking)),policy.reviewText,expiresAt),env.DB.prepare('INSERT INTO pm_fee_credentials(consent_id,customer_id,payment_method_id,setup_intent_id) VALUES(?,?,?,?)').bind(consentId,setup.customer,setup.payment_method,setupId),feeEvent(env.DB,actor,'payment.fee-consent',consentId,view,bookingId)])
 return view
}

/** Read-only financial consequences, including missing consent. A preview never captures money. */
export async function feeConsequences(db:D1Database,bookingId:string,kind:unknown,at=new Date().toISOString(),exemptionCode?:string){
 const {state}=await load(db),booking=state.bookings.find(b=>b.id===bookingId)??fail(404,'Reservation not found.'),consent=await consentFor(db,bookingId),guarantee=await currentGuarantee(db,bookingId),useGuest=!!guarantee&&(!consent||guarantee.created_at>=consent.recorded_at),policy=await feePolicy(db,useGuest?guarantee!.policy_id:consent?.policy_id)
 if(!policy)return {bookingId,kind:feeKind(kind),policyId:null,amountCents:0,chargeAllowed:false,reviewRequired:true,note:'No fee policy or recorded guest consent exists.'}
 if(useGuest){
  const g=guarantee!,view=await guaranteeView(db,g),calculation=feeCalculation(state,booking,policy,feeKind(kind),iso(at,'Violation time'),exemptionCode),credentials=await guaranteeCredentials(db,g.id),binding=!!g.accepted_at&&g.booking_snapshot===JSON.stringify(bookingTerms(booking)),beforeObservation=!!g.accepted_at&&Date.parse(g.accepted_at)<=Date.parse(calculation.occurredAt),authorizationCurrent=view.authorizationState==='current'&&Date.parse(calculation.occurredAt)<Date.parse(view.expiresAt),chargeAllowed=binding&&beforeObservation&&authorizationCurrent&&!!credentials&&calculation.amountCents>=50&&calculation.amountCents<=g.max_fee_cents
  return {...calculation,consentId:null,guestConsentId:g.id,consentRecorded:binding,beforeObservation,authorizationCurrent,authorizationExpiresAt:view.expiresAt,executionReady:!!credentials&&authorizationCurrent,chargeAllowed,reviewRequired:!chargeAllowed,reviewText:g.review_text,note:chargeAllowed?'Guest-captured exact fee terms and hosted card setup confirmed. An explicit owner decision is required.':'Guest fee authority is unconfirmed or expired. Fresh guest agreement and collection are required.'}
 }
 const calculation=feeCalculation(state,booking,policy,feeKind(kind),iso(at,'Violation time'),exemptionCode),binding=!!consent&&consent.booking_snapshot===JSON.stringify(bookingTerms(booking)),credentials=consent?await credentialFor(db,consent.id):null
 const beforeObservation=!!consent&&Date.parse(consent.recorded_at)<=Date.parse(calculation.occurredAt)&&Date.parse(consent.accepted_at)<=Date.parse(calculation.occurredAt)
 const authorizationCurrent=!!consent&&Date.parse(consent.expires_at)>Date.now()&&Date.parse(calculation.occurredAt)<Date.parse(consent.expires_at)
 const chargeAllowed=binding&&beforeObservation&&authorizationCurrent&&!!credentials&&calculation.amountCents>=50
 return {...calculation,consentId:consent?.id??null,consentRecorded:binding,beforeObservation,authorizationCurrent,authorizationExpiresAt:consent?.expires_at??null,executionReady:!!credentials&&authorizationCurrent,chargeAllowed,reviewRequired:!binding||!beforeObservation||!credentials||!authorizationCurrent,reviewText:policy.reviewText,note:!binding?'No matching guest consent: owner review required.':!authorizationCurrent?'Fee authorization expired. Fresh guest agreement and card collection are required; no protection is claimed.':!credentials?'Historical consent has no execution credentials; no charge is authorized.':'An explicit owner decision is required; this preview takes no money.'}
}

/** Preview uses a recorded terminal event when present, otherwise shows only a hypothetical consequence. */
export async function previewFee(db:D1Database,actor:Actor,p:any){
 await feeAuthority(db,actor)
 const bookingId=text(p.bookingId,'Reservation'),kind=feeKind(p.kind),{state,version}=await load(db),booking=state.bookings.find(b=>b.id===bookingId)??fail(404,'Reservation not found.')
 const events=(state.serviceEvents??[]).filter(e=>e.bookingId===bookingId),status=kind==='late_cancel'?'cancelled':'no-show',event=booking.status===status&&events.at(-1)?.after.bookingStatus===status?events.findLast(e=>e.after.bookingStatus===status&&e.before.bookingStatus!==status):undefined
 const data=await feeConsequences(db,bookingId,kind,event?.at??(p.occurredAt===undefined?new Date().toISOString():iso(p.occurredAt,'Preview time')),p.exemptionCode===undefined||p.exemptionCode===''?undefined:text(p.exemptionCode,'Exemption code',40))
 if(!data.policyId)fail(409,'Create a fee policy before reviewing fees.')
 const previewId=id(),now=new Date().toISOString(),expiresAt=new Date(Date.now()+15*60000).toISOString(),complete={...data,actionable:!!event,chargeAllowed:data.chargeAllowed&&!!event}
 await feeCommit(db,actor,version,[db.prepare('INSERT INTO pm_fee_previews(id,booking_id,policy_id,consent_id,actor_id,created_at,expires_at,floor_version,data) VALUES(?,?,?,?,?,?,?,?,?)').bind(previewId,bookingId,data.policyId,'consentId' in data?data.consentId:null,actor.id,now,expiresAt,version,JSON.stringify(complete)),feeEvent(db,actor,'payment.fee-preview',previewId,complete,bookingId)])
 return {...complete,id:previewId,actorId:actor.id,createdAt:now,expiresAt}
}

/** Reserve a single violation before the network call. Replays only reconcile that immutable decision. */
export async function assessFee(env:FeeBindings,actor:Actor,p:any){
 await feeAuthority(env.DB,actor)
 if(p.action==='dispute'){
  const assessment=await assessmentFor(env.DB,text(p.assessmentId,'Fee assessment'))??fail(404,'Fee assessment not found.'),reason=text(p.reason,'Dispute reason',1000),evidence=text(p.evidence,'Dispute evidence',2000),{version}=await load(env.DB),disputeId=id(),at=new Date().toISOString()
  await feeCommit(env.DB,actor,version,[env.DB.prepare('INSERT INTO pm_fee_disputes(id,assessment_id,actor_id,at,reason,evidence) VALUES(?,?,?,?,?,?)').bind(disputeId,assessment.id,actor.id,at,reason,evidence),feeEvent(env.DB,actor,'payment.fee-dispute',disputeId,{assessmentId:assessment.id,reason,evidence},assessment.booking_id)])
  return {id:disputeId,assessmentId:assessment.id,actorId:actor.id,at,reason,evidence,status:'recorded',note:'Dispute recorded for owner review. No new charge or refund was made.'}
 }
 if(p.action!=='charge'&&p.action!=='waive')fail(400,'Choose an explicit fee charge or waiver.')
 const previewId=text(p.previewId,'Reviewed fee preview'),requestId=text(p.requestId,'Stable fee request ID',120),reason=text(p.reason,'Fee decision reason',1000),evidence=text(p.evidence,'Fee decision evidence',2000)
 let assessment=await env.DB.prepare('SELECT * FROM pm_fee_assessments WHERE request_id=?').bind(requestId).first<Assessment>()
 if(assessment){
  if(assessment.preview_id!==previewId||assessment.action!==p.action||assessment.reason!==reason||assessment.evidence!==evidence)fail(409,'This fee request ID already belongs to different decision details.')
 }else{
  const preview=await env.DB.prepare('SELECT * FROM pm_fee_previews WHERE id=?').bind(previewId).first<Preview>()??fail(404,'Fee preview not found.'),data=JSON.parse(preview.data)
  const {state,version}=await load(env.DB)
  if(preview.actor_id!==actor.id||Date.parse(preview.expires_at)<=Date.now()||preview.floor_version!==version)fail(409,'The fee preview expired or reservation facts changed. Review a fresh preview.')
  if(!data.actionable||!data.eventId)fail(409,'Record the cancellation or no-show before deciding its fee.')
  const fresh=await feeConsequences(env.DB,preview.booking_id,data.kind,data.occurredAt,data.exemption?.code)
  const {actionable,...reviewed}=data
  if(JSON.stringify({...fresh,chargeAllowed:fresh.chargeAllowed&&!!actionable})!==JSON.stringify(reviewed))fail(409,'Fee facts changed. Review a fresh preview.')
  // Compare actual booking and event again; the state version is transactionally fenced below.
  const booking=state.bookings.find(b=>b.id===preview.booking_id)??fail(404,'Reservation not found.')
  if(p.action==='charge'&&(!data.chargeAllowed||data.amountCents<50))fail(409,'This preview has no consented chargeable fee. Record a waiver or request manager review.')
  if(p.action==='charge')stripeKey(env)
  const assessedCents=p.action==='waive'&&(!data.consentRecorded||!data.beforeObservation)?0:data.amountCents
  const assessmentId=id(),now=new Date().toISOString()
  await feeCommit(env.DB,actor,version,[env.DB.prepare("INSERT INTO pm_fee_assessments(id,request_id,booking_id,service_id,policy_id,consent_id,preview_id,kind,event_id,amount_cents,action,status,actor_id,reason,evidence,created_at,updated_at,guest_consent_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(assessmentId,requestId,booking.id,booking.serviceId,preview.policy_id,preview.consent_id,preview.id,data.kind,data.eventId,assessedCents,p.action,p.action==='waive'?'waived':'pending',actor.id,reason,evidence,now,now,data.guestConsentId??null),feeEvent(env.DB,actor,'payment.fee-'+p.action,assessmentId,{bookingId:booking.id,policyId:preview.policy_id,policyVersion:data.policyVersion,consentId:preview.consent_id,kind:data.kind,eventId:data.eventId,amountCents:assessedCents,action:p.action,reason,evidence},booking.id)])
  assessment=await env.DB.prepare('SELECT * FROM pm_fee_assessments WHERE request_id=?').bind(requestId).first<Assessment>()
  if(!assessment)fail(409,'This reservation violation already has a fee decision. Review the recorded decision; no second charge is allowed.')
 }
 if(assessment!.status!=='pending')return receipt(assessment!)
 const credentials=(assessment!.guest_consent_id?await guaranteeCredentials(env.DB,assessment!.guest_consent_id):assessment!.consent_id?await credentialFor(env.DB,assessment!.consent_id):null)??fail(409,'Execution credentials are unavailable. Historical consent alone cannot authorize a charge.')
 if(!assessment!.processor_id&&Date.now()-Date.parse(assessment!.created_at)>23*3600000)fail(409,'This unconfirmed fee requires processor reconciliation; its violation remains reserved.')
 const locked=await env.DB.prepare("UPDATE pm_fee_assessments SET processing_until=? WHERE id=? AND status='pending' AND processing_until<=? RETURNING *").bind(Date.now()+60000,assessment!.id,Date.now()).first<Assessment>()
 if(!locked)return receipt(assessment!)
 assessment=locked
 try{
  await feeAuthority(env.DB,actor)
  const consent=await consentFor(env.DB,assessment.booking_id)
  if(assessment.guest_consent_id){
   const g=await env.DB.prepare('SELECT * FROM pm_card_guarantees WHERE id=?').bind(assessment.guest_consent_id).first<Guarantee>()
   if(!g||g.policy_id!==assessment.policy_id||g.booking_id!==assessment.booking_id||!g.accepted_at||!(Date.parse(g.ended_at??g.expires_at)>Date.now()))fail(409,'Guest fee authority expired. No processor attempt is permitted.')
  }
  if(!assessment.guest_consent_id&&!assessment.processor_id&&(!consent||!(Date.parse(consent.expires_at)>Date.now())))fail(409,'Fee authorization expired. No new processor attempt is permitted; reconcile any earlier unconfirmed attempt manually.')
  const form=new URLSearchParams({amount:String(assessment.amount_cents),currency:'usd',customer:credentials.customer_id,payment_method:credentials.payment_method_id,confirm:'true',off_session:'true','allowed_payment_method_types[0]':'card','metadata[placemat_fee_id]':assessment.id,'metadata[placemat_booking_id]':assessment.booking_id,'metadata[placemat_policy_id]':assessment.policy_id,'expand[0]':'latest_charge'})
  const result=assessment.processor_id?await stripe(env,'payment_intents/'+encodeURIComponent(assessment.processor_id)+'?expand[]=latest_charge'):await stripe(env,'payment_intents',form,'placemat-fee-'+assessment.id)
  if(result?.object!=='payment_intent'||typeof result.id!=='string'||!result.id||assessment.processor_id&&assessment.processor_id!==result.id||result.currency!=='usd'||result.amount!==assessment.amount_cents||result.customer!==credentials.customer_id||result.payment_method!==credentials.payment_method_id||result.metadata?.placemat_fee_id!==assessment.id||result.metadata?.placemat_booking_id!==assessment.booking_id||result.metadata?.placemat_policy_id!==assessment.policy_id||!['succeeded','processing','requires_action','requires_payment_method','canceled','requires_confirmation','requires_capture'].includes(result.status))fail(502,'Stripe fee confirmation did not match the saved decision. The violation remains reserved.')
  // Save the confirmed intent identity before reading its charge, so failed reads reconcile by GET.
  await env.DB.prepare('UPDATE pm_fee_assessments SET processor_id=? WHERE id=?').bind(result.id,assessment.id).run()
  let chargeId:string|null=null,status:Assessment['status']=result.status==='requires_payment_method'||result.status==='canceled'?'failed':'pending'
  if(result.status==='succeeded'){
   const charge=typeof result.latest_charge==='string'?await stripe(env,'charges/'+encodeURIComponent(result.latest_charge)):result.latest_charge
   if(charge?.object!=='charge'||typeof charge.id!=='string'||!charge.id||charge.payment_intent!==result.id||charge.customer!==credentials.customer_id||charge.paid!==true||charge.captured!==true||charge.currency!=='usd'||charge.amount_captured!==assessment.amount_cents)fail(502,'Stripe has not confirmed the captured fee charge. Reconcile this saved decision.')
   chargeId=charge.id;status='succeeded'
  }
  const updatedAt=new Date().toISOString(),before=receipt(assessment),after={...before,processorId:result.id,chargeId,status,updatedAt}
  await env.DB.batch([env.DB.prepare("UPDATE pm_fee_assessments SET status=?,charge_id=?,updated_at=? WHERE id=? AND status='pending'").bind(status,chargeId,updatedAt,assessment.id),feeEvent(env.DB,actor,'payment.fee-result',assessment.id,after,assessment.booking_id,before)])
 }finally{await env.DB.prepare('UPDATE pm_fee_assessments SET processing_until=0 WHERE id=?').bind(assessment.id).run()}
 return receipt((await assessmentFor(env.DB,assessment.id))!)
}

/** Credentials never leave this module, including full-owner state reads. */
export async function readFees(db:D1Database,actor:Actor,bookingId?:string){
 await feeAuthority(db,actor)
 const [policies,consents,previews,assessments,disputes]=await Promise.all([
  db.prepare('SELECT * FROM pm_fee_policies ORDER BY version').all<FeePolicyRow>(),db.prepare('SELECT * FROM pm_fee_consents ORDER BY recorded_at,id').all<FeeConsent>(),db.prepare('SELECT * FROM pm_fee_previews ORDER BY created_at,id').all<Preview>(),db.prepare('SELECT * FROM pm_fee_assessments ORDER BY created_at,id').all<Assessment>(),db.prepare('SELECT id,assessment_id AS assessmentId,actor_id AS actorId,at,reason,evidence FROM pm_fee_disputes ORDER BY at,id').all(),
 ])
 return {guarantees:await readGuarantees(db,actor),policies:policies.results.map(r=>({...policyFromRow(r),data:JSON.parse(r.data)})),consents:consents.results.filter(c=>!bookingId||c.booking_id===bookingId).map(consentView),previews:previews.results.filter(p=>!bookingId||p.booking_id===bookingId).map(previewView),assessments:assessments.results.filter(a=>!bookingId||a.booking_id===bookingId).map(receipt),disputes:disputes.results}
}
export async function feeAudit(db:D1Database,actor:Actor){
 await feeAuthority(db,actor)
 const rows=await db.prepare('SELECT * FROM pm_fee_events ORDER BY at,id').all<{id:string;booking_id:string|null;actor_id:string;at:string;action:string;subject_id:string;before_data:string|null;after_data:string}>()
 return rows.results.map(e=>({id:'fee-'+e.id,at:e.at,actor:e.actor_id,action:e.action,subject:e.booking_id??e.subject_id,source:e.action==='payment.guarantee-guest-consent'?'guest-supplied' as const:['payment.card-verified','payment.merchant-capability'].includes(e.action)?'provider' as const:'person' as const,changes:[{kind:'fees',id:e.subject_id,before:e.before_data?JSON.parse(e.before_data):null,after:JSON.parse(e.after_data)}]}))
}

/** A saved card never implies indefinite authority. Expiry only shortens; reads never send. */
export async function endFeeAuthorization(db:D1Database,actor:Actor,p:any){
 await feeAuthority(db,actor)
 const bookingId=text(p.bookingId,'Reservation'),consent=await consentFor(db,bookingId)??fail(404,'Recorded fee agreement not found.'),{version}=await load(db)
 const now=new Date().toISOString(),before=consentView(consent)
 if(Date.parse(consent.expires_at)<=Date.now())return before
 await feeCommit(db,actor,version,[db.prepare('UPDATE pm_fee_consents SET expires_at=? WHERE id=? AND expires_at>?').bind(now,consent.id,now),feeEvent(db,actor,'payment.fee-expiry',consent.id,{...before,expiresAt:now,authorizationState:'expired'},bookingId,before,'expiry-'+consent.id)])
 return consentView((await consentFor(db,bookingId))!)
}
export async function requestFeeRecollection(db:D1Database,actor:Actor,p:any){
 await feeAuthority(db,actor)
 const bookingId=text(p.bookingId,'Reservation'),consent=await consentFor(db,bookingId)??fail(404,'Recorded fee agreement not found.'),{state,version}=await load(db)
 const booking=state.bookings.find(b=>b.id===bookingId)??fail(404,'Reservation not found.')
 if(booking.status!=='booked'||Date.parse(booking.startAt)<=Date.now())fail(409,'Renewed collection requires an upcoming active reservation.')
 const guest=await db.prepare('SELECT data FROM pm_guests WHERE id=?').bind(booking.guestId).first<{data:string}>()
 if(!guest||JSON.parse(guest.data).erased)fail(409,'An erased guest cannot receive a recollection request.')
 if(Date.parse(consent.expires_at)>Date.now())fail(409,'End the current authorization before requesting renewed collection.')
 if(consent.recollection_requested_at)return consentView(consent)
 const now=new Date().toISOString()
 await feeCommit(db,actor,version,[db.prepare('UPDATE pm_fee_consents SET recollection_requested_at=? WHERE id=? AND recollection_requested_at IS NULL').bind(now,consent.id),feeEvent(db,actor,'payment.fee-recollection',consent.id,{ownerId:consent.actor_id,requestedAt:now,nextAction:'Obtain fresh guest agreement and hosted card collection',delivery:'not-sent'},bookingId,null,'recollection-'+consent.id)])
 return consentView((await consentFor(db,bookingId))!)
}
/** Only the personal owner receives agreement details. No held funds are inferred from setup. */
export async function feeAuthorizations(db:D1Database,actor:Actor){
 if(actor.role!=='owner'||actor.agent||actor.deviceId)return []
 await feeAuthority(db,actor)
 return (await db.prepare('SELECT * FROM pm_fee_consents ORDER BY recorded_at,id').all<FeeConsent>()).results.map(consentView)
}
