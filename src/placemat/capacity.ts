import {fail,type State,type Service,type Table,type Booking} from './model'
export const overlaps=(a:{startAt:string;endAt:string;cleanupEndAt?:string},b:{startAt:string;endAt:string;cleanupEndAt?:string})=>a.startAt<(b.cleanupEndAt??b.endAt)&&(a.cleanupEndAt??a.endAt)>b.startAt
export const active=(b:Booking)=>b.status==='booked'||b.status==='seated'||b.status==='completed'&&!!b.cleanupEndAt&&b.cleanupEndAt>b.endAt
export function allocation(s:State,service:Service,partySize:number,slot:{startAt:string;endAt:string;cleanupEndAt?:string},requested?:unknown,except?:string):Table[] {
 const bookings=s.bookings.filter(b=>b.id!==except&&b.serviceId===service.id)
 const covers=bookings.filter(b=>!['cancelled','no-show'].includes(b.status)).reduce((n,b)=>n+b.partySize,0)
 if(covers+partySize>service.coverLimit)fail(409,'This service has reached its cover limit.')
 const occupied=new Set(bookings.filter(b=>active(b)&&overlaps(b,slot)).flatMap(b=>b.tableIds))
 // A physical table is shared by overlapping services, too.
 for(const b of s.bookings.filter(b=>b.id!==except&&active(b)&&overlaps(b,slot)))for(const id of b.tableIds)occupied.add(id)
 const free=s.tables.filter(t=>!occupied.has(t.id))
 if(requested!==undefined){
  if(!Array.isArray(requested)||!requested.length||new Set(requested).size!==requested.length)fail(400,'Choose distinct tables.')
  const tables=(requested as string[]).map(id=>s.tables.find(t=>t.id===id)??fail(404,'Table not found.'))
  if(tables.some(t=>occupied.has(t.id)))fail(409,'A selected table is already occupied. Review the current floor; clashes cannot be overridden.')
  if(tables.reduce((n,t)=>n+t.seats,0)<partySize)fail(409,'The selected tables do not have enough seats.')
  return tables
 }
 // Bounded subset-sum chooses the smallest fitting table combination.
 const choices=new Map<number,Table[]>([[0,[]]])
 for(const table of free)for(const [seats,tables] of [...choices]){
  const total=seats+table.seats,current=choices.get(total),next=[...tables,table]
  if(!current||next.length<current.length)choices.set(total,next)
 }
 const fit=[...choices].filter(([seats])=>seats>=partySize).sort((a,b)=>a[0]-b[0]||a[1].length-b[1].length)[0]
 return fit?.[1]??fail(409,'No table combination fits this party at that time. Try another time or join the waitlist with staff.')
}
