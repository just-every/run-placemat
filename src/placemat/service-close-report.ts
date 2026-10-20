import {performanceReport,type PerformanceReport} from './performance'
import {reservationReport,reportCsv,type ReservationReport} from './reports'
import {fail,id,text,type Actor,type State} from './model'
import {load} from './store'

type ClosedPerformance=PerformanceReport&{closure:{at:string;actor:string;coverReport:ReservationReport}}

/** The caller batches this statement with the service.close state save. */
export function prepareCloseReport(db:D1Database,s:State,actor:Actor,serviceId:string,version:number,now:string):{statement:D1PreparedStatement;snapshotId:string} {
 const service=s.services.find(service=>service.id===serviceId)??fail(404,'Service not found.')
 if(!service.closedAt||service.closedBy!==actor.id||service.closedAt!==now)fail(409,'Close the service before preparing its closing report.')
 const snapshotId=id(),performance=performanceReport(s,serviceId,now)
 const report:ClosedPerformance={...performance,closure:{at:now,actor:actor.id,coverReport:reservationReport(s,new URLSearchParams({serviceId}),new Date(now))}}
 const statement=db.prepare('INSERT INTO pm_performance_reports(id,service_id,published_at,published_by,floor_version,data) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)')
  .bind(snapshotId,serviceId,now,actor.id,version+1,JSON.stringify(report),version)
 return {statement,snapshotId}
}

/** Original facts stay fixed; later observations are identified by event ID, including same-millisecond corrections. */
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
 return {snapshotId:saved.id,original:{performance,coverReport:closure.coverReport,closedAt:closure.at,closedBy:closure.actor},adjustments,
  current:reservationReport(state,new URLSearchParams({serviceId}))}
}

/** This CSV always exports the fixed closing population and its original statuses. */
export function closeReportCsv(result:Awaited<ReturnType<typeof readCloseReport>>) {
 return reportCsv(result.original.coverReport)
}
