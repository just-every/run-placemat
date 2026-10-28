import type {State} from './model'
import {load} from './store'
import {consentRow,contact,factsRow,purpose,type Config,type Recipient} from './retention-store'
export function localParts(date:Date,timezone:string){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))}
export function quietNow(config:Config,state:State,now:Date){const p=localParts(now,state.venue.timezone),time=`${p.hour}:${p.minute}`;return config.quietStart<config.quietEnd?time>=config.quietStart&&time<config.quietEnd:time>=config.quietStart||time<config.quietEnd}
export async function occurrence(db:D1Database,config:Config,guestId:string,state:State,now:Date){
 const facts=await factsRow(db,guestId),local=localParts(now,state.venue.timezone),day=`${local.month}-${local.day}`
 const complete=state.bookings.filter(b=>b.guestId===guestId&&b.status==='completed'&&Date.parse(b.endAt)<=now.getTime()).sort((a,b)=>a.endAt.localeCompare(b.endAt)||a.id.localeCompare(b.id))
 const age=(at:string)=>Math.floor((now.getTime()-Date.parse(at))/86400000)
 if(config.trigger==='welcome')return facts&&age(facts.created_at)>=config.delayDays?'welcome':null
 if(config.trigger==='birthday'||config.trigger==='anniversary')return facts?.[config.trigger]===day?`${config.trigger}:${local.year}`:null
 if(config.trigger==='experience'){const e=state.experiences?.find(e=>e.id===config.experienceId&&e.status==='published');return e?`experience:${e.id}:${e.version}`:null}
 if(state.bookings.some(b=>b.guestId===guestId&&['booked','seated'].includes(b.status)))return null
 if(config.trigger==='first-to-second')return complete.length===1&&age(complete[0].endAt)>=config.delayDays?`first:${complete[0].id}`:null
 const last=complete.at(-1)
 return last&&age(last.endAt)>=config.lapsedDays+config.delayDays?`lapsed:${last.id}`:null
}
export async function eligible(db:D1Database,config:Config,guestId:string,state:State,now:Date):Promise<Recipient|null>{
 const c=await contact(db,guestId),consent=await consentRow(db,guestId)
 if(!c||!consent||consent.purpose!==purpose||consent.venue_scope!==state.venue.name||consent.email_hash!==c.emailHash||consent.identity_data!==c.identityData||Date.parse(consent.confirmed_at)>now.getTime())return null
 const event=await occurrence(db,config,guestId,state,now)
 if(!event)return null
 const facts=await factsRow(db,guestId)
 return {guestId,name:c.guest.name,email:c.email,emailHash:c.emailHash,identityData:c.identityData,consentId:consent.id,occurrence:event,factsRevision:facts?.updated_at??null}
}
export async function capped(db:D1Database,r:Recipient,config:Config,now:Date,excludeId=''){
 return !!await db.prepare("SELECT id FROM pm_retention_deliveries WHERE id!=? AND (guest_id=? OR email_hash=?) AND state IN('claimed','accepted','unconfirmed') AND (cap_until>? OR created_at>?) LIMIT 1").bind(excludeId,r.guestId,r.emailHash,now.toISOString(),new Date(now.getTime()-config.capDays*86400000).toISOString()).first()
}
export async function candidates(db:D1Database,config:Config,workflowId:string,now:Date){
 const {state}=await load(db),rows=(await db.prepare('SELECT guest_id FROM pm_retention_consents ORDER BY guest_id').all<{guest_id:string}>()).results,out:Recipient[]=[],addresses=new Set<string>()
 for(const row of rows){
  const c=await contact(db,row.guest_id),consent=await consentRow(db,row.guest_id),facts=await factsRow(db,row.guest_id)
  if(!c||!consent||consent.purpose!==purpose||consent.venue_scope!==state.venue.name||consent.email_hash!==c.emailHash||consent.identity_data!==c.identityData||addresses.has(c.emailHash))continue
  out.push({guestId:c.guest.id,name:c.guest.name,email:c.email,emailHash:c.emailHash,identityData:c.identityData,consentId:consent.id,occurrence:'',factsRevision:facts?.updated_at??null});addresses.add(c.emailHash)
 }
 return out
}
