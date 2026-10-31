import {fail,id,text,type Actor,type Booking,type Guest,type State} from './model'
import {feePolicy} from './fee-policy'

export type MessageLanguage='en'|'es'
export type MessageTemplate={id:string;language:MessageLanguage;version:number;body:string;createdBy:string;createdAt:string}
export type MessagePolicy={source:'fee'|'experience';id:string;version:number;terms:string}
export type ReminderPreview={bookingId:string;guestId:string;contactName:string;contactEmail:string;contactPhone:string;language:MessageLanguage;templateId:string;templateVersion:number;policies:MessagePolicy[];message:string}
const bodies={
 en:'Hello {{guest_name}}, your table at {{venue_name}} is booked for {{date_time}}, party of {{party_size}}. {{cancellation_terms}}',
 es:'Hola {{guest_name}}, su mesa en {{venue_name}} está reservada para {{date_time}}, para {{party_size}} personas. {{cancellation_terms}}',
}
const substitutions=['guest_name','venue_name','date_time','party_size','guest_phone','venue_phone','cancellation_terms']
export function messageLanguage(value:unknown):MessageLanguage{return value===undefined||value==='en'?'en':value==='es'?'es':fail(400,'Choose English or Spanish for this reminder batch.')}
export function reminderTemplates(s:State):MessageTemplate[]{
 return (['en','es'] as const).map(language=>(s.messageTemplates??[]).filter(t=>t.language===language).at(-1)??{id:'reminder-'+language,language,version:0,body:bodies[language],createdBy:'builtin',createdAt:'2026-01-01T00:00:00.000Z'})
}
export function validateTemplate(body:string){
 const tokens=[...body.matchAll(/\{\{([^{}]+)\}\}/g)].map(m=>m[1])
 if(tokens.some(key=>!substitutions.includes(key))||/[{}]/.test(body.replace(/\{\{([^{}]+)\}\}/g,'')))fail(400,'Use only the listed substitutions inside double braces.')
 if(['venue_name','date_time','party_size','cancellation_terms'].some(key=>!tokens.includes(key)))fail(400,'Keep venue_name, date_time, party_size and cancellation_terms in the template.')
}
export function saveMessageTemplate(s:State,actor:Actor,p:any,now:string){
 if(actor.agent||actor.deviceId||!['owner','admin'].includes(actor.role))fail(403,'A personal venue manager must edit reminder templates.')
 const language=messageLanguage(p.language),current=reminderTemplates(s).find(t=>t.language===language)!
 if(p.version!==current.version)fail(409,'The template changed. Review its current version before saving.')
 const body=text(p.body,'Reminder template',4000);validateTemplate(body)
 const template={id:id(),language,version:current.version+1,body,createdBy:actor.id,createdAt:now}
 ;(s.messageTemplates??=[]).push(template)
 return template
}
/** Display only. Formatting a recorded number never establishes consent or eligibility. */
export function usPhone(value:string){
 const digits=value.replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'')
 return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)?`(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`:value
}
async function applicablePolicies(db:D1Database,b:Booking):Promise<MessagePolicy[]>{
 const bindings=(await db.prepare('SELECT policy_id FROM pm_fee_consents WHERE booking_id=? UNION SELECT policy_id FROM pm_card_guarantees WHERE booking_id=? ORDER BY policy_id').bind(b.id,b.id).all<{policy_id:string}>()).results
 const policies:MessagePolicy[]=[]
 const selected=bindings.length?await Promise.all(bindings.map(row=>feePolicy(db,row.policy_id))):[await feePolicy(db)]
 for(const policy of selected){
  if(!policy){if(bindings.length)fail(409,'Required cancellation terms are unavailable. Restore the existing policy before preparing reminders.');continue}
  if(!policy.terms?.trim())fail(409,'Required cancellation terms are missing. Review the existing policy first.')
  policies.push({source:'fee',id:policy.id,version:policy.version,terms:policy.reviewText})
 }
 if(b.experience){
  if(!b.experience.cancellationRules?.trim())fail(409,'Required experience cancellation terms are missing.')
  policies.push({source:'experience',id:b.experience.id,version:b.experience.version,terms:b.experience.cancellationRules})
 }
 const money=await db.prepare('SELECT (EXISTS(SELECT 1 FROM pm_payment_requests WHERE booking_id=?) OR EXISTS(SELECT 1 FROM pm_refund_charges WHERE booking_id=?)) AS present').bind(b.id,b.id).first<{present:number}>()
 if(money?.present&&!policies.length)fail(409,'This reservation needs recorded cancellation terms before a reminder can be reviewed. No terms or consent were inferred.')
 return policies
}
/** One plain-text renderer serves live preparations and the seeded demo review. */
export function renderReminder(s:State,b:Booking,contact:Pick<Guest,'name'|'email'|'phone'>,template:MessageTemplate,policies:MessagePolicy[]):ReminderPreview{
 const language=template.language
 const values:Record<string,string>={guest_name:contact.name,venue_name:s.venue.name,date_time:new Intl.DateTimeFormat('en-US',{timeZone:s.venue.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(b.startAt))+` (${s.venue.timezone})`,party_size:String(b.partySize),guest_phone:usPhone(contact.phone),venue_phone:usPhone(s.venue.setup?.phone??''),cancellation_terms:policies.map(p=>p.terms).join('\n')}
 const message=template.body.replace(/\{\{([^{}]+)\}\}/g,(_,key:string)=>values[key]).trim()
 return {bookingId:b.id,guestId:b.guestId,contactName:contact.name,contactEmail:contact.email,contactPhone:contact.phone,language,templateId:template.id,templateVersion:template.version,policies,message}
}
/** Plain text is substituted once; HTML and CSV escaping happen at their output doors. */
export async function prepareReminders(db:D1Database,s:State,plan:any,fences:D1PreparedStatement[]){
 const policyVersion=await db.prepare('SELECT COALESCE(MAX(version),0) AS version FROM pm_fee_policies').first<{version:number}>()
 fences.push(db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN (SELECT COALESCE(MAX(version),0) FROM pm_fee_policies)=? THEN 1 ELSE 0 END').bind(policyVersion!.version))
 const language=messageLanguage(plan.language),template=reminderTemplates(s).find(t=>t.language===language)!
 const rows=s.bookings.filter(b=>b.serviceId===plan.serviceId&&b.status==='booked'&&!s.reminders.some(r=>r.bookingId===b.id))
 if(!rows.length)fail(409,'There are no new booked guests to remind.')
 const messages:ReminderPreview[]=[]
 for(const b of rows){
  const row=await db.prepare('SELECT version,data FROM pm_guests WHERE id=?').bind(b.guestId).first<{version:number;data:string}>()
  const guest:Guest=row?JSON.parse(row.data):null
  if(!guest||guest.erased||guest.mergedInto)fail(409,'The reservation contact is unavailable. Review the guest before preparing reminders.')
  const saved=await db.prepare('SELECT guest_id,data FROM pm_booking_contacts WHERE booking_id=?').bind(b.id).first<{guest_id:string;data:string}>()
  if(saved&&saved.guest_id!==guest.id)fail(409,'The reservation contact changed. Review it before preparing reminders.')
  const contact:Pick<Guest,'name'|'email'|'phone'>=saved?JSON.parse(saved.data):guest
  fences.push(db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?) THEN 1 ELSE 0 END').bind(guest.id,row!.version,row!.data))
  fences.push(db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN COALESCE((SELECT data FROM pm_booking_contacts WHERE booking_id=?),\'\')=? THEN 1 ELSE 0 END').bind(b.id,saved?.data??''))
  const policies=await applicablePolicies(db,b)
  messages.push(renderReminder(s,b,contact,template,policies))
 }
 return {serviceId:plan.serviceId,language,template:structuredClone(template),bookings:structuredClone(rows),venue:structuredClone(s.venue),messages}
}
export async function approveReminders(db:D1Database,s:State,plan:any,actor:Actor,now:string,fences:D1PreparedStatement[]){
 // Old pending proposals have no reviewed text. They must be prepared again.
 const current=await prepareReminders(db,s,plan,fences)
 if(JSON.stringify(current)!==JSON.stringify(plan))fail(409,'Bookings, contacts, template or terms changed. Prepare and review the reminders again.')
 for(const message of plan.messages as ReminderPreview[])s.reminders.push({...structuredClone(message),id:id(),status:'approved',approvedBy:actor.id,approvedAt:now})
}
