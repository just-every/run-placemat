import {person} from './access'
import {authorizeReports} from './delegation'
import {financeSummary} from './finance'
import {fail,type Actor} from './model'
import {guests,load} from './store'
import {reservationReport,reportCsv} from './reports'

export const reportKinds=['group-covers','reservations','guests','finance'] as const
export type ReportKind=typeof reportKinds[number]
export const reportLabels:Record<ReportKind,string>={'group-covers':'group cover',reservations:'reservation',guests:'guest',finance:'finance'}
const cell=(value:unknown)=>'"'+(/^[\s\u0000-\u001f]*[=+\-@]/.test(String(value))?"'":'')+String(value??'').replaceAll('"','""')+'"'
export const reportRowsCsv=(rows:unknown[][])=>rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'

/** Local report types reuse native export authority; group rights never confer guest or finance access. */
export async function localReportCsv(db:D1Database,actor:Actor,kind:ReportKind,search:URLSearchParams){
 if(actor.agent||actor.deviceId)fail(403,'Use a personal report recipient session.')
 const {state}=await load(db)
 if(kind==='reservations'){
  const url=new URL('https://report.invalid/api/reports/reservations.csv');url.search=search.toString()
  await authorizeReports(db,actor,new Request(url),url);person(actor)
 }else if(kind==='guests')person(actor,true)
 else if(kind==='finance'){
  if(actor.role!=='owner'&&!(['member','finance'].includes(actor.role)&&state.financeIds?.includes(actor.id)&&!state.hostIds?.includes(actor.id)&&!state.serverIds?.includes(actor.id)&&!state.leadIds?.includes(actor.id)))fail(403,'A current owner or separately granted finance identity must open finance reports.')
 }else fail(400,'Choose a local report type.')
 const report=reservationReport(state,search)
 if(kind==='reservations')return reportCsv(report)
 const bookings=state.bookings.filter(b=>report.rows.some(row=>row.bookingId===b.id)),bookingIds=new Set(bookings.map(b=>b.id))
 if(kind==='guests'){
  // Owner data access is not permission to contact a guest. Preserve purpose-specific facts without inventing marketing consent.
  const people=await guests(db)
  return reportRowsCsv([['bookingId','serviceDate','guestId','name','email','phone','confirmationConsent','contactPreference','marketingPermission'],...report.rows.flatMap(row=>{
   const b=bookings.find(b=>b.id===row.bookingId)!,g=people.find(g=>g.id===b.guestId)
   if(!g||g.erased||g.mergedInto)return []
   return [[b.id,row.serviceDate,g.id,g.name,g.email,g.phone,b.staffIntake?.confirmationConsent??'not recorded',b.staffIntake?.contactPreference??'not recorded','Not recorded']]
  })])
 }
 const finance=await financeSummary(db)
 return reportRowsCsv([['kind','bookingId','recordId','amountCents','currency','state','pendingCents','succeededCents','remainingCents'],
  ...finance.requests.filter(r=>bookingIds.has(r.bookingId)).map(r=>['request',r.bookingId,r.id,r.amountCents,r.currency,r.state,'','','']),
  ...finance.charges.filter(r=>bookingIds.has(r.bookingId)).map(r=>['charge',r.bookingId,r.chargeId,r.amountCents,'USD','',r.pendingCents,r.succeededCents,r.remainingCents]),
  ...finance.refunds.filter(r=>bookingIds.has(r.bookingId)).map(r=>['refund',r.bookingId,r.id,r.amountCents,'USD',r.status,'','',''])])
}
