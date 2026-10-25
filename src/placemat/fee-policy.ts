import {fail,id,text,type Actor,type Booking,type State} from './model'
import {resolveLocalTime} from './local-time'
import {load} from './store'

export type FeeRule={mode:'fixed'|'per_person';amountCents:number}
export type FeePolicy={id:string;version:number;timezone:string;cutoffDaysBefore:number;cutoffLocalTime:string;cutoffOffset?:string;graceMinutes:number;cancellation:FeeRule;noShow:FeeRule;exemptions:Array<{code:string;label:string}>;requiredEvidence:string[];terms:string;reviewText:string;createdBy:string;createdAt:string}
export type FeePolicyRow={id:string;version:number;created_by:string;created_at:string;data:string}
export type FeeConsent={id:string;booking_id:string;policy_id:string;actor_id:string;accepted_at:string;recorded_at:string;evidence:string;booking_snapshot:string;review_text:string;expires_at:string;recollection_requested_at:string|null}
export type FeeKind='late_cancel'|'no_show'
export const bookingTerms=(b:Booking)=>({bookingId:b.id,serviceId:b.serviceId,guestId:b.guestId,startAt:b.startAt,partySize:b.partySize})
export const policyFromRow=(r:FeePolicyRow):FeePolicy=>({...JSON.parse(r.data),id:r.id,version:r.version,createdBy:r.created_by,createdAt:r.created_at})
export const feeKind=(kind:unknown):FeeKind=>kind==='late_cancel'||kind==='no_show'?kind:fail(400,'Choose late_cancel or no_show.')
export const iso=(value:unknown,label:string):string=>{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail(400,`${label} needs a valid time with an explicit timezone.`)
 return new Date(value as string).toISOString()
}
export async function feeAuthority(db:D1Database,actor:Actor){
 if(actor.agent||actor.deviceId||actor.role!=='owner')fail(403,'Fee decisions require a full owner session.')
 if(!await db.prepare("SELECT id FROM oa_operators WHERE id=? AND status='active' AND role='owner'").bind(actor.id).first())fail(403,'Active owner fee authority is required.')
}
export function feeEvent(db:D1Database,actor:Actor,action:string,subject:string,after:unknown,bookingId:string|null=null,before:unknown=null,eventId?:string){
 return db.prepare(`${eventId?'INSERT OR IGNORE':'INSERT'} INTO pm_fee_events(id,booking_id,actor_id,at,action,subject_id,before_data,after_data) VALUES(?,?,?,?,?,?,?,?)`).bind(eventId??id(),bookingId,actor.id,new Date().toISOString(),action,subject,before===null?null:JSON.stringify(before),JSON.stringify(after))
}
/** Authority and floor revision are checked in the same transaction as each owner decision. */
export async function feeCommit(db:D1Database,actor:Actor,version:number,statements:D1PreparedStatement[]){
 try{await db.batch([
  db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role='owner') AND EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) THEN 1 ELSE 0 END").bind(actor.id,version),
  ...statements,db.prepare('DELETE FROM pm_assertions'),
 ])}catch(error){if(error instanceof Error&&error.message.includes('pm_assertions'))fail(409,'Owner authority or reservation facts changed. Review a fresh fee preview.');if(error instanceof Error&&error.message.includes('UNIQUE constraint failed'))fail(409,'These fee facts already have a saved decision. Review it before proceeding.');throw error}
}
export async function feePolicy(db:D1Database,policyId?:string){
 const row=await (policyId?db.prepare('SELECT * FROM pm_fee_policies WHERE id=?').bind(policyId):db.prepare('SELECT * FROM pm_fee_policies ORDER BY version DESC LIMIT 1')).first<FeePolicyRow>()
 return row?policyFromRow(row):null
}
function integer(value:unknown,label:string,max:number){return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max?value:fail(400,`${label} must be a whole number between 0 and ${max}.`)}
function rule(value:any):FeeRule{
 if(!value||!['fixed','per_person'].includes(value.mode))fail(400,'Fee basis must be fixed or per_person.')
 return {mode:value.mode,amountCents:integer(value.amountCents,'Fee cents',99999999)}
}
export async function createFeePolicy(db:D1Database,actor:Actor,p:any){
 await feeAuthority(db,actor)
 const {state,version}=await load(db),timezone=state.venue.timezone
 try{new Intl.DateTimeFormat('en',{timeZone:timezone})}catch{fail(400,'The venue needs a valid IANA timezone.')}
 if(typeof p.cutoffLocalTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.cutoffLocalTime))fail(400,'Cutoff must be a venue-local HH:MM time.')
 const cutoffDaysBefore=integer(p.cutoffDaysBefore,'Days before arrival',365),graceMinutes=integer(p.graceMinutes,'No-show grace minutes',1440),cancellation=rule(p.cancellation),noShow=rule(p.noShow),terms=text(p.terms,'Guest fee terms',4000)
 const cutoffOffset=p.cutoffOffset===undefined||p.cutoffOffset===''?undefined:text(p.cutoffOffset,'Repeated-time cutoff offset',6)
 if(cutoffOffset&&!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(cutoffOffset))fail(400,'Use an explicit cutoff offset such as -04:00.')
 if(!Array.isArray(p.exemptions)||p.exemptions.length>20)fail(400,'Provide up to twenty fee exemptions, including an empty list when none apply.')
 const exemptions:Array<{code:string;label:string}>=p.exemptions.map((e:any)=>({code:text(e?.code,'Exemption code',40),label:text(e?.label,'Exemption explanation',300)}))
 if(new Set(exemptions.map(e=>e.code)).size!==exemptions.length)fail(400,'Exemption codes must be distinct.')
 const latest=await feePolicy(db),policyId=id(),policyVersion=(latest?.version??0)+1,now=new Date().toISOString()
 const describe=(r:FeeRule)=>`USD ${(r.amountCents/100).toFixed(2)} ${r.mode==='per_person'?'per person':'per reservation'}`
 const requiredEvidence=['Prior guest agreement to this exact policy and reservation','Recorded cancellation or no-show observation with its time','Owner decision reason and supporting evidence']
 const reviewText=`Fee policy ${policyVersion}. Venue timezone: ${timezone}. Late cancellation: ${describe(cancellation)} after ${p.cutoffLocalTime}, ${cutoffDaysBefore} local calendar day(s) before arrival${cutoffOffset?` (repeated-time offset ${cutoffOffset})`:''}. At the cutoff is on time. No-show: ${describe(noShow)} after ${graceMinutes} minute(s) grace from arrival. Exemptions: ${exemptions.length?exemptions.map(e=>`${e.code}: ${e.label}`).join('; '):'none'}. Required evidence: ${requiredEvidence.join('; ')}. An explicit owner decision is required. ${terms}`
 const data={requiredEvidence,timezone,cutoffDaysBefore,cutoffLocalTime:p.cutoffLocalTime,...cutoffOffset?{cutoffOffset}:{},graceMinutes,cancellation,noShow,exemptions,terms,reviewText}
 await feeCommit(db,actor,version,[db.prepare('INSERT INTO pm_fee_policies(id,version,created_by,created_at,data) VALUES(?,?,?,?,?)').bind(policyId,policyVersion,actor.id,now,JSON.stringify(data)),feeEvent(db,actor,'payment.fee-policy',policyId,{...data,version:policyVersion})])
 return (await feePolicy(db,policyId))!
}

/** Calendar subtraction occurs in venue wall time, then the target date resolves its actual DST offset. */
export function feeCutoff(policy:FeePolicy,booking:Booking){
 const values:Record<string,string>={}
 for(const part of new Intl.DateTimeFormat('en-CA',{timeZone:policy.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(booking.startAt)))if(part.type!=='literal')values[part.type]=part.value
 const localDate=new Date(Date.UTC(Number(values.year),Number(values.month)-1,Number(values.day))-policy.cutoffDaysBefore*86400000).toISOString().slice(0,10)
 const local=`${localDate}T${policy.cutoffLocalTime}`
 // A configured repeated-time choice must not override the actual offset on ordinary dates.
 try{return resolveLocalTime(local,policy.timezone).at}catch(error){if(!policy.cutoffOffset)throw error;return resolveLocalTime(local,policy.timezone,policy.cutoffOffset).at}
}
export function feeCalculation(state:State,booking:Booking,policy:FeePolicy,kind:FeeKind,at:string,exemptionCode?:string){
 const cutoffAt=feeCutoff(policy,booking),graceEndsAt=new Date(Date.parse(booking.startAt)+policy.graceMinutes*60000).toISOString()
 const exempt=exemptionCode?policy.exemptions.find(e=>e.code===exemptionCode)??fail(400,'That exemption is absent from the agreed policy.'):null
 const applies=kind==='late_cancel'?Date.parse(at)>Date.parse(cutoffAt):Date.parse(at)>Date.parse(graceEndsAt)
 const r=kind==='late_cancel'?policy.cancellation:policy.noShow,policyAmountCents=r.amountCents*(r.mode==='per_person'?booking.partySize:1)
 if(!Number.isSafeInteger(policyAmountCents)||policyAmountCents>99999999)fail(409,'The agreed fee exceeds the supported USD amount. Owner review is required.')
 const events=(state.serviceEvents??[]).filter(e=>e.bookingId===booking.id),last=events.at(-1),status=kind==='late_cancel'?'cancelled':'no-show'
 const event=last?.after.bookingStatus===status&&booking.status===status?events.findLast(e=>e.after.bookingStatus===status&&e.before.bookingStatus!==status):undefined
 return {bookingId:booking.id,serviceId:booking.serviceId,policyId:policy.id,policyVersion:policy.version,timezone:policy.timezone,kind,occurredAt:at,cutoffAt,graceEndsAt,partySize:booking.partySize,basis:r.mode,policyAmountCents,amountCents:applies&&!exempt?policyAmountCents:0,applies,exemption:exempt,eventId:event?.id??null,observedAt:event?.at??null,bookingSnapshot:bookingTerms(booking)}
}
