import {needLines} from './needs'
import {notesFor} from './service-notes'
import {fail,type Actor,type Guest,type State} from './model'
import {pacingReport} from './pacing'
import {textPdf,type PdfLine} from './pdf'
import type {consentView} from './fees'
import type {PaymentAlert} from './payment-links'

export const serviceDate=(instant:string,timezone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant))
/** This is the sole projection used by JSON, HTML, print and PDF. No raw state or guest is returned. */
export function preshift(state:State,guests:Guest[],actor:Actor,date:string,generatedAt=new Date().toISOString(),names:Record<string,string>={},paymentRequests:PaymentAlert[]=[],authorizations:ReturnType<typeof consentView>[]=[]){
 if(actor.agent||!['owner','admin','host','server'].includes(actor.role))fail(403,'The pre-shift sheet is for managers, owner-granted hosts and signed-in servers.')
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail(400,'Choose a valid service date.')
 const manager=actor.role==='owner'||actor.role==='admin',server=actor.role==='server'
 // A server sees only the shifts they are linked to, their own sections and kitchen notes: no shift notes, contact, guest notes, tags or payments.
 const ownServers=(s:State['services'][number])=>(s.staffing?.servers??[]).filter(v=>server&&v.operatorId===actor.id).map(v=>v.id)
 const ownSections=(s:State['services'][number])=>(s.staffing?.sections??[]).filter(v=>!server||ownServers(s).includes(v.serverId))
 return {venue:state.venue.name,timezone:state.venue.timezone,date,generatedAt,notes:notesFor(state,date,names).filter(n=>!server||n.kind==='kitchen'),audience:manager?'Manager':server?'Server':'Host',services:state.services.filter(s=>serviceDate(s.startAt,state.venue.timezone)===date&&(!server||ownServers(s).length)).map(s=>{
  const bookings=state.bookings.filter(b=>b.serviceId===s.id&&!['cancelled','no-show'].includes(b.status)&&(!server||ownSections(s).some(section=>section.id===b.sectionId))).sort((a,b)=>a.startAt.localeCompare(b.startAt)||a.id.localeCompare(b.id))
  const tableLabels=(ids:string[])=>ids.map(id=>state.tables.find(t=>t.id===id)?.label??'Unknown table')
  return {id:s.id,name:s.name,status:s.status,startAt:s.startAt,endAt:s.endAt,...(!server?{coverLimit:s.coverLimit}:{}),pacing:server?undefined:pacingReport(state,s.id,generatedAt),sections:ownSections(s).map(section=>({name:section.name,server:s.staffing!.servers.find(server=>server.id===section.serverId)?.name??'Unassigned',tables:tableLabels(section.tableIds),expectedCovers:bookings.filter(b=>b.sectionId===section.id).reduce((n,b)=>n+b.partySize,0)})),bookings:bookings.map(b=>{
   const guest=guests.find(g=>g.id===b.guestId)
   const shape={name:'Erased guest',startAt:b.startAt,partySize:b.partySize,tables:tableLabels(b.tableIds)}
   if(!guest||guest.erased)return shape
   const visits=(guest.history??[]).filter(v=>['completed','seated'].includes(v.status)).length+state.bookings.filter(v=>v.guestId===guest.id&&['completed','seated'].includes(v.status)).length
   // Only the server's verified paid state establishes protection. Keep payment
   // links, money and follow-up identities out of this shared host projection.
   const payments=server?[]:paymentRequests.filter(p=>p.bookingId===b.id).map(p=>({state:p.state,dueAt:p.dueAt,protection:p.state==='paid'?'protected' as const:'pending' as const}))
   return {...shape,needLines:needLines(b,names),name:guest.name,status:b.status,vipLevel:guest.profile?.vipLevel??'none',visitCount:visits,occasion:b.requests?.occasion??'',requests:b.requests?{dietary:b.requests.dietaryNotes,allergy:b.requests.allergyNotes,access:[b.requests.wheelchair?'Wheelchair':'',b.requests.highchair?'Highchair':'',b.requests.stroller?'Stroller':''].filter(Boolean)}:undefined,requiredAccessTags:b.requiredAccessTags??[],seatingPreference:b.requests?.seatingPreference||guest.profile?.seatingPreference||'',requestedArea:b.requests?.requestedArea??'',section:b.sectionName??'',server:b.serverName??'',paymentRequests:payments,feeAuthorizations:actor.role==='owner'&&!actor.deviceId?authorizations.filter(c=>c.bookingId===b.id).map(c=>({...c,ownerName:names[c.actorId]??'Venue owner'})):[],...(manager?{email:guest.email,phone:guest.phone,notes:guest.notes,tags:guest.profile?.tags??[]}:{})}
  })}
 })}
}
export type Preshift=ReturnType<typeof preshift>
/** Plain lines also keep the downloadable PDF identical in authority to the screen. */
export function preshiftLines(sheet:Preshift):PdfLine[]{
 const time=(instant:string)=>new Intl.DateTimeFormat('en-US',{timeZone:sheet.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(instant))
 const lines:PdfLine[]=[{text:`${sheet.venue} - Pre-shift sheet`,bold:true,size:18},{text:`${sheet.date} | ${sheet.audience} view | ${sheet.timezone}`},{text:`Generated ${sheet.generatedAt}`},{text:'Guest-supplied requests are unverified; no allergy-safe preparation is confirmed.'}]
 const add=(text:string)=>lines.push({text})
 for(const note of sheet.notes){
  lines.push({text:note.kind==='shift'?'Shift notes':'Kitchen notes',bold:true,size:14})
  for(const [i,entry] of note.history.entries())add(`${i===note.history.length-1?'Current':'Previous'}: ${entry.text} | ${entry.author} | ${entry.at}`)
 }
 for(const s of sheet.services){
  lines.push({text:`${s.name} (${s.status})`,bold:true,size:14})
  add(`Service ${time(s.startAt)} to ${time(s.endAt)}${s.coverLimit===undefined?'':`; service cover limit ${s.coverLimit}`}`)
  if(s.pacing){
   const p=s.pacing.policy;add(`Pacing: ${p.arrivalCovers} covers / ${p.intervalMinutes} minutes; ${p.arrivalParties} parties / interval; ${p.concurrentCovers} concurrent covers`)
   for(const [area,cap] of Object.entries(p.areaArrivalCaps))add(`${area} arrival cap: ${cap}`)
   for(const [area,cap] of Object.entries(s.pacing.kitchenConcurrentCaps))add(`${area} kitchen concurrent cap: ${cap}`)
   for(const i of s.pacing.intervals)add(`${time(i.startAt)}: ${i.covers} expected covers / ${i.limit}, ${i.parties} parties / ${i.partyLimit}`)
  }
  for(const section of s.sections)add(`Section ${section.name} | ${section.server} | Tables ${section.tables.join(', ')} | ${section.expectedCovers} expected covers`)
  for(const b of s.bookings){
   lines.push({text:`${b.name} | ${time(b.startAt)} | ${b.partySize} guests | Tables ${b.tables.join(', ')}`,bold:true})
   if(!('visitCount' in b))continue
   add(`${b.status} | ${b.vipLevel} | ${b.visitCount} recorded visits | ${b.section} / ${b.server}`)
   for(const payment of b.paymentRequests){
    add(`Deposit: ${payment.state} | ${payment.protection==='protected'?'Protected (provider verified)':'Protection pending (unprotected)'}`)
    add(`Deposit deadline: ${time(payment.dueAt)}`)
   }
   for(const consent of b.feeAuthorizations){
    add(`Fee authorization: ${consent.authorizationState} | expires ${time(consent.expiresAt)} | No funds held; not protected by a card guarantee`)
    if(consent.recollection)add(`Renewed collection: ${consent.recollection.requestedAt?'requested':'review required'} | owner ${consent.ownerName} | ${consent.recollection.nextAction}`)
   }
   for(const line of b.needLines)add(line)
   if(b.occasion)add(`Occasion: ${b.occasion}`)
   if(b.seatingPreference)add(`Seating preference: ${b.seatingPreference}`)
   if(b.requestedArea)add(`Requested area: ${b.requestedArea}`)
   if(b.requests?.dietary)add(`Unverified guest-supplied dietary request (original booking declaration): ${b.requests.dietary}`)
   if(b.requests?.allergy)add(`Unverified guest-supplied allergy request (original booking declaration): ${b.requests.allergy}`)
   const access=[...(b.requests?.access??[]),...b.requiredAccessTags];if(access.length)add(`Unverified guest-supplied access requests: ${access.join(', ')}`)
   if('notes' in b){if(b.notes)add(`Guest notes: ${b.notes}`);if(b.tags?.length)add(`Tags: ${b.tags.join(', ')}`);if(b.email||b.phone)add(`Contact: ${b.email} ${b.phone}`)}
  }
 }
 if(!sheet.services.length)add('No services on this date.')
 return lines
}
export const preshiftPdf=(sheet:Preshift)=>textPdf(preshiftLines(sheet))
