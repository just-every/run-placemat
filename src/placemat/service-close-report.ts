import {closedFeeSql,feeSummary,bookingFees,type ClosedFees,type LegacyFees} from './fee-close-report'
import {performanceReport,type PerformanceReport} from './performance'
import {reservationReport,reportCsv,type ReservationReport} from './reports'
import {fail,id,text,type Actor,type State} from './model'
import {load} from './store'
import {recoveryReport,type RecoveryReport} from './recovery'
import {textPdf,type PdfLine} from './pdf'

type ClosedPerformance=PerformanceReport&{closure:{at:string;actor:string;coverReport:ReservationReport;recovery?:RecoveryReport;fees?:ClosedFees|LegacyFees}}

/** The caller batches this statement with the service.close state save. */
export function prepareCloseReport(db:D1Database,s:State,actor:Actor,serviceId:string,version:number,now:string):{statement:D1PreparedStatement;snapshotId:string} {
 const service=s.services.find(service=>service.id===serviceId)??fail(404,'Service not found.')
 if(!service.closedAt||service.closedBy!==actor.id||service.closedAt!==now)fail(409,'Close the service before preparing its closing report.')
 const snapshotId=id(),performance=performanceReport(s,serviceId,now)
 const report:ClosedPerformance={...performance,closure:{at:now,actor:actor.id,coverReport:reservationReport(s,new URLSearchParams({serviceId}),new Date(now)),recovery:recoveryReport(s,serviceId)}}
 const statement=db.prepare(`INSERT INTO pm_performance_reports(id,service_id,published_at,published_by,floor_version,data) SELECT ?,?,?,?,?,json_set(?,'$.closure.fees',json((SELECT ${closedFeeSql} FROM pm_fee_assessments f WHERE f.service_id=?))) WHERE EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)`)
  .bind(snapshotId,serviceId,now,actor.id,version+1,JSON.stringify(report),serviceId,version)
 return {statement,snapshotId}
}

/** Original facts stay fixed; later observations are identified by event ID, including same-millisecond corrections. Snapshots closed before recovery and fee facts existed report them as null (not recorded at close), never inferred. */
export async function readCloseReport(db:D1Database,serviceId:string) {
 serviceId=text(serviceId,'Service')
 const [{state},saved]=await Promise.all([
  load(db),
  db.prepare("SELECT id,data FROM pm_performance_reports WHERE service_id=? AND json_type(data,'$.closure')='object' ORDER BY published_at,id LIMIT 1")
   .bind(serviceId).first<{id:string;data:string}>(),
 ])
 if(!saved)return fail(404,'No closing report has been recorded for this service.')
 const {closure,...performance}=JSON.parse(saved.data) as ClosedPerformance
 const originalEvents=new Set(performance.rows.flatMap(row=>row.serviceHistory.map(event=>event.id)))
 const bookingIds=new Set([...performance.rows.map(row=>row.bookingId),...state.bookings.filter(booking=>booking.serviceId===serviceId).map(booking=>booking.id)])
 const adjustments=(state.serviceEvents??[]).filter(event=>bookingIds.has(event.bookingId)&&!originalEvents.has(event.id)).map(event=>({
  bookingId:event.bookingId,actor:event.actor,at:event.at,eventId:event.id,before:{...event.before},after:{...event.after},
 }))
 return {snapshotId:saved.id,venue:state.venue,original:{performance,coverReport:closure.coverReport,recovery:closure.recovery??null,fees:closure.fees??null,closedAt:closure.at,closedBy:closure.actor},adjustments,
  current:reservationReport(state,new URLSearchParams({serviceId})),currentRecovery:recoveryReport(state,serviceId)}
}

type CloseReport=Awaited<ReturnType<typeof readCloseReport>>
const credits=(recovery:RecoveryReport|null)=>new Map((recovery?.freed??[]).flatMap(f=>f.replacements.map(r=>[r.bookingId,{covers:r.recoveredCovers,recovers:f.bookingId}] as const)))

/** This CSV always exports the fixed closing population and its original statuses; recoveredCovers sums to the recovered-cover figure (blank when not recorded at close). */
export function closeReportCsv(result:CloseReport) {
 const recovery=result.original.recovery,credit=credits(recovery)
 return reportCsv(result.original.coverReport,{header:['recoveredCovers','recoversBookingId','chargedFeeCents','waivedFeeCents','refundedFeeCents','pendingFeeCents'],values:row=>{const f=bookingFees(result.original.fees,row.bookingId);return [...(recovery?[credit.get(row.bookingId)?.covers??0,credit.get(row.bookingId)?.recovers??'']:['','']),...(f?[f.chargedCents,f.waivedCents,f.refundedCents,f.pendingCents]:['','','',''])]}})
}

/** The same fixed figures, each with its denominator and reservations, as a printable PDF. */
export function closeReportPdf(result:CloseReport,names:Record<string,string>) {
 const {performance:p,coverReport:r,recovery,fees}=result.original,tz=result.venue.timezone,sum=r.summary
 const local=(at:string)=>new Intl.DateTimeFormat('en-US',{timeZone:tz,dateStyle:'medium',timeStyle:'short'}).format(new Date(at))
 const who=(id:string)=>names[id]??'Unknown person',pct=(n:number|null)=>n===null?'no rate':`${n.toFixed(1)}%`,mins=(n:number|null)=>n===null?'not recorded':`${n.toFixed(2)} min`
 const credit=credits(recovery),source=(name:string)=>{const rows=r.rows.filter(b=>b.source===name);return `${rows.reduce((n,b)=>n+b.partySize,0)} covers (${rows.length} parties)`}
 const d=p.distributions
 const lines:PdfLine[]=[
  {text:'End-of-service report',bold:true,size:16},{text:`${result.venue.name} · ${p.serviceName}`,bold:true,size:12},
  {text:`Closed ${local(result.original.closedAt)} (${tz}) by ${who(result.original.closedBy)}. These figures were fixed at close; later observations are listed as adjustments and never rewrite them.`},{text:''},
  {text:'Covers',bold:true,size:12},
  {text:`Booked: ${sum.booked.covers} covers (${sum.booked.bookings} reservations, including cancellations and no-shows)`},
  {text:`Attended: ${sum.attended.covers} / ${sum.booked.covers} covers (${pct(sum.rates.attended.percentage)})`},
  {text:`Cancelled: ${sum.cancelled.covers} / ${sum.booked.covers} covers (${pct(sum.rates.cancelled.percentage)})`},
  {text:`No-show: ${sum.noShow.covers} / ${sum.booked.covers} covers (${pct(sum.rates.noShow.percentage)})`},
  {text:`By source: online ${source('online')}; phone ${source('phone')}; walk-in ${source('walk-in')}; waitlist-seated ${source('waitlist')}`},
  {text:recovery?`Recovered from cancellations and no-shows: ${recovery.covers} / ${recovery.freedCovers} freed covers by ${recovery.replacementParties} seated replacement parties (cancellations ${recovery.fromCancellations}, no-shows ${recovery.fromNoShows})`:'Recovered covers: not recorded at close'},
  {text:`Pacing overrides (SERVICE-007): ${sum.pacingOverrides.bookings} reservations`},
  {text:`Average actual turn: ${mins(d.actualTurns.mean)} (${d.actualTurns.sampleSize} recorded / ${d.actualTurns.sampleSize+d.actualTurns.missing} possible) against expected ${mins(d.expectedTurns.mean)} (${d.expectedTurns.sampleSize} reservations)`},
  {text:`Quoted waits: ${mins(d.quotedWaitMin.mean)} to ${mins(d.quotedWaitMax.mean)} (${d.quotedWaitMin.sampleSize} quotes); actual wait ${mins(d.actualWait.mean)} (${d.actualWait.sampleSize} recorded / ${d.actualWait.sampleSize+d.actualWait.missing} possible)`},
  {text:`Fees charged, waived and refunded: ${feeSummary(fees)}`},{text:''},
  {text:`Reservations (${r.rows.length})`,bold:true,size:12},
  ...r.rows.map(b=>({text:`ref ${b.bookingId} · ${b.tables.join(' + ')||'No table'} · ${b.partySize} guests · ${b.source} · ${b.status} · ${local(b.startAt)}${(()=>{const f=bookingFees(fees,b.bookingId);return f?` · fees charged ${f.chargedCents}c / waived ${f.waivedCents}c / refunded ${f.refundedCents}c / pending ${f.pendingCents}c`:''})()}${credit.has(b.bookingId)?` · recovers ${credit.get(b.bookingId)!.covers} covers of ref ${credit.get(b.bookingId)!.recovers}`:''}`})),{text:''},
  {text:`Observations after close (${result.adjustments.length})`,bold:true,size:12},
  ...(result.adjustments.length?result.adjustments.map(a=>({text:`ref ${a.bookingId} · ${local(a.at)} · ${who(a.actor)} · ${a.before.status} -> ${a.after.status} · reservation ${a.before.bookingStatus} -> ${a.after.bookingStatus}`})):[{text:'None. The original figures above are unchanged.'}]),
 ]
 return textPdf(lines)
}
