import { fail, number, type State, type Service, type Table, type Booking } from './model'
// Adapted from Dial's UTC-first engine: half-open intervals and duration-fit
// checks are pure. Placemat adds venue cover limits and table combinations.
export const overlaps=(a:{startAt:string;endAt:string},b:{startAt:string;endAt:string})=>a.startAt<b.endAt&&a.endAt>b.startAt
export const active=(b:Booking)=>b.status==='booked'||b.status==='seated'
export function instant(value:unknown,label:string) {
 if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value))) fail(400,`${label} requires a timestamp with a UTC offset.`)
 return new Date(value as string).toISOString()
}
export function serviceBy(s:State,id:unknown):Service {return s.services.find(x=>x.id===id)??fail(404,'Service not found.')}
export function interval(service:Service,value:unknown){
 const startAt=instant(value,'Start'),endAt=new Date(Date.parse(startAt)+service.turnMinutes*60000).toISOString()
 if(startAt<service.startAt||endAt>service.endAt||(Date.parse(startAt)-Date.parse(service.startAt))%900000!==0)fail(400,'Choose a 15-minute start that fits the full turn within the service.')
 return {startAt,endAt}
}
export function allocation(s:State,service:Service,partySize:number,slot:{startAt:string;endAt:string},requested?:unknown,except?:string):Table[] {
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
export function slots(s:State,service:Service,size:unknown){
 const partySize=number(size,'Party size',1,20),result:{startAt:string;endAt:string}[]=[]
 for(let t=Date.parse(service.startAt);t+service.turnMinutes*60000<=Date.parse(service.endAt);t+=900000){
  if(t<Date.now())continue
  const slot={startAt:new Date(t).toISOString(),endAt:new Date(t+service.turnMinutes*60000).toISOString()}
  try{allocation(s,service,partySize,slot);result.push(slot)}catch(error){if(!(error instanceof Error)||!('status' in error)||error.status!==409)throw error}
 }
 return result
}
