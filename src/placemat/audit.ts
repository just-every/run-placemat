import type {SettlementView} from './money-ledger-archive.mjs'
import {fail,id,type Actor,type State,type AuditEntry} from './model'

export type AuditChange={kind:string;id:string;before:unknown;after:unknown}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
// Snapshots come from stored records, never request payloads or credential tables.
function snapshot(value:unknown):unknown {
 if(Array.isArray(value))return value.map(snapshot)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/token|secret|password|credential|bearer|authorization|cookie|session/i.test(key)).map(([key,item])=>[key,snapshot(item)]))
 return value
}

/** Attach all committed state changes to the command's existing accountable event. */
export function captureAudit(previous:State,next:State):void {
 const existing=new Set(previous.audit.map(e=>e.id)),events=next.audit.filter(e=>!existing.has(e.id)),event=events.at(-1)
 if(!event)return
 for(const entry of events)entry.source??=entry.actor==='guest'?'guest-supplied':'person'
 const changes:AuditChange[]=[]
 for(const kind of new Set([...Object.keys(previous),...Object.keys(next)])){
  if(kind==='audit'||kind==='holds')continue
  const before=(previous as any)[kind],after=(next as any)[kind]
  if(same(before,after))continue
  if(Array.isArray(before)||Array.isArray(after)){
   const old=new Map((before??[]).map((row:any)=>[row.id,row])),current=new Map((after??[]).map((row:any)=>[row.id,row]))
   // Primitive grant lists are a single policy record rather than anonymous rows.
   if([...(before??[]),...(after??[])].some(row=>!row||typeof row!=='object'||!row.id))changes.push({kind,id:kind,before:snapshot(before??null),after:snapshot(after??null)})
   else for(const key of new Set([...old.keys(),...current.keys()]))if(!same(old.get(key),current.get(key)))changes.push({kind,id:String(key),before:snapshot(old.get(key)??null),after:snapshot(current.get(key)??null)})
  }else changes.push({kind,id:kind,before:snapshot(before??null),after:snapshot(after??null)})
 }
 event.changes=[...(event.changes??[]),...changes]
}

/** Stable actor/action/subject filters; offset instants are inclusive bounds. */
export function auditRows(state:State,params:URLSearchParams):AuditEntry[]{
 const values=Object.fromEntries(['actor','action','subject','from','to'].map(key=>[key,params.get(key)??'']))
 for(const key of ['from','to'])if(values[key]&&(!/(Z|[+-]\d\d:\d\d)$/.test(values[key])||!Number.isFinite(Date.parse(values[key]))))fail(400,'Audit times need an explicit UTC offset.')
 if(values.from&&values.to&&Date.parse(values.from)>Date.parse(values.to))fail(400,'Audit start must be before its end.')
 return state.audit.filter(row=>(!values.actor||row.actor===values.actor)&&(!values.action||row.action===values.action)&&(!values.subject||row.subject===values.subject||row.changes?.some(change=>change.id===values.subject))&&(!values.from||Date.parse(row.at)>=Date.parse(values.from))&&(!values.to||Date.parse(row.at)<=Date.parse(values.to))).slice().reverse()
}

/** Erasure removes entire linked snapshots, retaining ids and action accountability. */
export function eraseAudit(state:State,guestId:string):void {
 const ids=new Set([guestId,...state.bookings.filter(b=>b.guestId===guestId).map(b=>b.id),...state.waitlist.filter(w=>w.guestId===guestId).map(w=>w.id),...(state.inquiries??[]).filter(i=>i.guestId===guestId).map(i=>i.id)])
 const relatedServices=new Set(state.waitlist.filter(row=>row.guestId===guestId).map(row=>row.serviceId))
 const sharedInstructions=new Set(state.services.filter(service=>relatedServices.has(service.id)).map(service=>service.closeReason).filter((value):value is string=>!!value))
 const scrub=(value:unknown):unknown=>typeof value==='string'&&sharedInstructions.has(value)?'':Array.isArray(value)?value.map(scrub):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,scrub(item)])):value
 const linked=(value:unknown):boolean=>typeof value==='string'?ids.has(value):Array.isArray(value)?value.some(linked):!!value&&typeof value==='object'&&Object.values(value).some(linked)
 for(const event of state.audit){
  const affected=ids.has(event.subject)||(event.changes??[]).some(change=>ids.has(change.id)||linked(change.before)||linked(change.after))
  if(affected){
   // One action can copy a guest's instructions onto several affected records.
   for(const change of event.changes??[]){change.before=change.before===null?null:{redacted:true};change.after=change.after===null?null:{redacted:true}}
   event.reason='';if(event.pacing)event.pacing.reason=''
  }
  // Closing instructions are shared onto other parties' follow-ups and later snapshots.
  for(const change of event.changes??[]){change.before=scrub(change.before);change.after=scrub(change.after)}
  if(event.reason&&sharedInstructions.has(event.reason))event.reason=''
 }
}

/** Human attribution retains its payout context and cannot certify provider agreement. */
export function recordMoneyAttribution(state:State,actor:Actor,at:string,payoutId:string,adjustmentId:string,before:SettlementView,bookingId:string,reason?:string):void {
 state.audit.push({id:id(),at,actor:actor.id,source:'person',action:'payment.ledger-attribution',subject:bookingId,...(reason?{reason}:{}),changes:[{kind:'money-attribution',id:adjustmentId,before:{payoutId,...before},after:{payoutId,...before,bookingId,adjustmentId}}]})
}
