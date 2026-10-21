import type {Booking,State} from './model'

export const recoveryDefinition='A freed reservation is a cancelled or no-show reservation of this service, released at the latest staff observation recording that status (no observation: release not recorded, nothing attributed). A replacement is another reservation of the service created at or after that release, sharing at least one of its tables, whose reserved interval overlaps the freed one (half-open), and which is seated or completed; offered, booked or waiting parties never count. Each replacement counts once, for the earliest-starting freed reservation it matches (then booking id), and a freed reservation recovers at most its own party size. Every current seating is staff-recorded.'

/** REPORT-007 covers recovered from cancellations and no-shows, counted only once the replacement party is seated. AGENT-002 inherits agent attribution before an agent seats anyone. */
export function recoveryReport(s:State,serviceId:string){
 const bookings=s.bookings.filter(b=>b.serviceId===serviceId)
 const releasedAt=(b:Booking)=>(s.serviceEvents??[]).filter(e=>e.bookingId===b.id&&e.after.bookingStatus===b.status).map(e=>e.at).sort().at(-1)??null
 const overlaps=(a:Booking,b:Booking)=>Date.parse(a.startAt)<Date.parse(b.endAt)&&Date.parse(b.startAt)<Date.parse(a.endAt)
 const freed=bookings.filter(b=>b.status==='cancelled'||b.status==='no-show').map(booking=>({booking,releasedAt:releasedAt(booking)}))
  .sort((a,b)=>a.booking.startAt.localeCompare(b.booking.startAt)||a.booking.id.localeCompare(b.booking.id))
 const matches=(f:typeof freed[number],p:Booking)=>f.releasedAt!==null&&p.id!==f.booking.id&&Date.parse(p.createdAt)>=Date.parse(f.releasedAt)&&p.tableIds.some(t=>f.booking.tableIds.includes(t))&&overlaps(f.booking,p)
 const counted=new Set<string>()
 const rows=freed.map(f=>{
  let left=f.booking.partySize
  const replacements=bookings.filter(p=>!counted.has(p.id)&&(p.status==='seated'||p.status==='completed')&&matches(f,p)).map(p=>{
   counted.add(p.id);const covers=Math.min(left,p.partySize);left-=covers
   return {bookingId:p.id,partySize:p.partySize,source:p.source,status:p.status,recoveredCovers:covers,seatedBy:'staff-recorded' as const}
  })
  return {bookingId:f.booking.id,status:f.booking.status,partySize:f.booking.partySize,tableIds:[...f.booking.tableIds],releasedAt:f.releasedAt,
   recoveredCovers:f.booking.partySize-left,replacements,notSeatedBookingIds:bookings.filter(p=>p.status==='booked'&&matches(f,p)).map(p=>p.id)}
 })
 const covers=(status?:string)=>rows.filter(r=>!status||r.status===status).reduce((n,r)=>n+r.recoveredCovers,0)
 return {definition:recoveryDefinition,covers:covers(),freedCovers:rows.reduce((n,r)=>n+r.partySize,0),
  replacementParties:rows.reduce((n,r)=>n+r.replacements.length,0),fromCancellations:covers('cancelled'),fromNoShows:covers('no-show'),
  bookingIds:rows.flatMap(r=>r.recoveredCovers?[r.bookingId,...r.replacements.map(p=>p.bookingId)]:[]),
  releaseNotRecorded:rows.filter(r=>!r.releasedAt).map(r=>r.bookingId),freed:rows}
}
export type RecoveryReport=ReturnType<typeof recoveryReport>
