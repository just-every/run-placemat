import {checkStaffing} from './staffing-capacity'
import {active,overlaps} from './capacity'
import {fail,id,number,text,type Actor,type Booking,type Guest,type State} from './model'
import type {ServiceEvent} from './service-status'

type TimedBooking=Booking & {expectedEndAt?:string;serverId?:string}
type Audit=State['audit'][number] & {reason?:string;before?:unknown;after?:unknown;bookingIds?:string[]}
type ActualTimes={actualArrivalAt:string|null;actualSeatAt:string|null;actualDepartureAt:string|null;actualResetAt:string|null}
type TimelineParams=URLSearchParams|Record<string,unknown>

/** Corrections restore the observation's previous facts, including its timestamps. */
function observedTimes(booking:Booking,history:ServiceEvent[]):ActualTimes {
 let times:ActualTimes={actualArrivalAt:null,actualSeatAt:null,actualDepartureAt:null,actualResetAt:null}
 if(booking.source==='walk-in'||booking.source==='waitlist')times={...times,actualArrivalAt:booking.createdAt,actualSeatAt:booking.createdAt}
 const snapshots=new Map<string,ActualTimes>()
 for(const event of history){
  const before={...times}
  if(event.correctsEventId){
   const restored=snapshots.get(event.correctsEventId)
   if(restored)times={...restored}
  }else{
   if(['arrived','partially-arrived'].includes(event.after.status)&&!times.actualArrivalAt)times.actualArrivalAt=event.at
   if(event.after.bookingStatus==='seated'&&event.before.bookingStatus!=='seated'){
    times.actualSeatAt=event.at;times.actualArrivalAt??=event.at;times.actualDepartureAt=null;times.actualResetAt=null
   }
   if(event.after.bookingStatus==='completed'&&event.before.bookingStatus!=='completed')times.actualDepartureAt=event.at
   if(event.after.floorStatus==='ready'&&event.before.floorStatus!=='ready')times.actualResetAt=event.at
  }
  snapshots.set(event.id,before)
 }
 return times
}

function localDate(value:string,timezone:string):string {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value))
 return `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}-${parts.find(p=>p.type==='day')!.value}`
}
function param(params:TimelineParams,key:string):string|null {
 if(params instanceof URLSearchParams){
  if(params.getAll(key).length>1)fail(400,`${key} must be supplied only once.`)
  return params.get(key)||null
 }
 const value=params[key]
 if(value===undefined||value===null||value==='')return null
 if(typeof value!=='string'&&typeof value!=='number')fail(400,`${key} must be a single value.`)
 return String(value)
}
function dateParam(value:string):string {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000')||!Number.isFinite(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)fail(400,'Date must be a valid YYYY-MM-DD date.')
 return value
}
function auditFor(row:Audit,bookingId:string):boolean {
 if(row.subject===bookingId||row.bookingIds?.includes(bookingId))return true
 // Multi-party swaps retain a single audit row with both assignment snapshots.
 for(const value of [row.before,row.after]){
  if(Array.isArray(value)&&value.some(item=>item&&typeof item==='object'&&item.bookingId===bookingId))return true
  if(value&&typeof value==='object'&&!Array.isArray(value)){
   const record=value as Record<string,unknown>
   if(record.bookingId===bookingId||Object.hasOwn(record,bookingId))return true
  }
 }
 return false
}

export function timeline(state:State,guests:Guest[],params:TimelineParams,now=new Date().toISOString()) {
 if(!Number.isFinite(Date.parse(now)))fail(400,'A valid timeline time is required.')
 now=new Date(now).toISOString()
 const today=localDate(now,state.venue.timezone),date=dateParam(param(params,'date')??param(params,'day')??today)
 const serviceId=param(params,'serviceId'),search=(param(params,'search')??'').trim(),area=param(params,'area')??param(params,'room'),serverId=param(params,'serverId')??param(params,'server')
 const zoom=number(param(params,'zoom')??30,'Timeline zoom',15,240),nextMinutes=number(param(params,'nextMinutes')??30,'Next window minutes',0,1440)
 if(serviceId&&!state.services.some(service=>service.id===serviceId))fail(404,'Service not found.')
 const guestById=new Map(guests.map(guest=>[guest.id,guest])),tableById=new Map(state.tables.map(table=>[table.id,table]))
 const serviceById=new Map(state.services.map(service=>[service.id,service])),nowMs=Date.parse(now)
 const allRows=state.bookings.map((booking:TimedBooking)=>{
  const guest=guestById.get(booking.guestId),tables=booking.tableIds.map(tableId=>tableById.get(tableId)??fail(500,'A reservation references a missing table.'))
  const service=serviceById.get(booking.serviceId)??fail(500,'A reservation references a missing service.')
  const serviceHistory=(state.serviceEvents??[]).filter(event=>event.bookingId===booking.id)
  const actual=observedTimes(booking,serviceHistory),expectedDepartureAt=booking.expectedEndAt??booking.endAt
  const reset=Math.max(0,Date.parse(booking.cleanupEndAt??booking.endAt)-Date.parse(booking.endAt))
  const lateAt=actual.actualArrivalAt??(booking.status==='booked'?now:null)
  const lateMinutes=lateAt?Math.max(0,(Date.parse(lateAt)-Date.parse(booking.startAt))/60000):0
  const overdueMinutes=booking.status==='seated'?Math.max(0,(nowMs-Date.parse(expectedDepartureAt))/60000):0
  const history=(state.audit as Audit[]).filter(event=>auditFor(event,booking.id))
  return {...booking,bookingId:booking.id,serviceName:service.name,serviceDate:localDate(service.startAt,state.venue.timezone),guestName:guest?.name??'Erased guest',
   tableNames:tables.map(table=>table.label),areas:[...new Set(tables.map(table=>table.area||'Dining room'))],serverId:booking.serverId??null,serverName:booking.serverName??null,sectionName:booking.sectionName??null,servingHistory:booking.servingHistory??[],
   expectedSeatAt:booking.startAt,expectedDepartureAt,expectedResetAt:new Date(Date.parse(expectedDepartureAt)+reset).toISOString(),...actual,
   lateMinutes,late:lateMinutes>0,overdueMinutes,overdue:overdueMinutes>0,
   collisionIds:active(booking)?state.bookings.filter(other=>other.id!==booking.id&&active(other)&&other.tableIds.some(tableId=>booking.tableIds.includes(tableId))&&overlaps(booking,other,now)).map(other=>other.id):[],
   assignmentHistory:history.filter(event=>['booking.move','booking.swap','booking.lock','table.assign','proposal.approve'].includes(event.action)),
   serviceHistory,turnHistory:history.filter(event=>event.action==='booking.extend')}
 })
 const needle=search.toLocaleLowerCase()
 const matches=(row:typeof allRows[number])=>{
  if(serviceId&&row.serviceId!==serviceId||area&&!row.areas.includes(area)||serverId&&row.serverId!==serverId)return false
  const guest=guestById.get(row.guestId)
  return !needle||[row.id,row.guestName,guest?.phone??'',guest?.email??'',row.serviceName,...row.tableNames].join(' ').toLocaleLowerCase().includes(needle)
 }
 const scoped=allRows.filter(matches),rows=scoped.filter(row=>row.serviceDate===date).sort((a,b)=>a.startAt.localeCompare(b.startAt)||a.id.localeCompare(b.id))
 const seated=rows.filter(row=>row.status==='seated'&&(!row.actualSeatAt||Date.parse(row.actualSeatAt)<=nowMs))
 const dueUntil=new Date(nowMs+nextMinutes*60000).toISOString()
 const due=rows.filter(row=>row.status==='booked'&&Date.parse(row.startAt)>=nowMs&&Date.parse(row.startAt)<=Date.parse(dueUntil))
 const completed=rows.filter(row=>row.status==='completed'&&row.actualSeatAt&&row.actualDepartureAt&&localDate(row.actualDepartureAt,state.venue.timezone)===today&&Date.parse(row.actualDepartureAt)<=nowMs&&Date.parse(row.actualDepartureAt)>=Date.parse(row.actualSeatAt))
 const coverMetric=(parties:typeof rows)=>({covers:parties.reduce((sum,row)=>sum+row.partySize,0),bookingIds:parties.map(row=>row.id)})
 const services=state.services.filter(service=>(!serviceId||service.id===serviceId)&&localDate(service.startAt,state.venue.timezone)===date)
 const starts=services.map(service=>service.startAt).concat(rows.map(row=>row.expectedSeatAt)).sort()
 const ends=services.map(service=>service.endAt).concat(rows.map(row=>row.expectedResetAt)).sort()
 return {date,timezone:state.venue.timezone,serviceId,search,area,serverId,zoom,nextMinutes,now,rows,
  window:{startAt:starts[0]??null,endAt:ends.at(-1)??null},
  filters:{serverNames:Object.fromEntries(state.services.flatMap(s=>(s.staffing?.servers??[]).map(server=>[server.id,server.name]))),areas:[...new Set(state.tables.map(table=>table.area||'Dining room'))].sort(),servers:[...new Set([...state.services.flatMap(s=>(s.staffing?.servers??[]).map(server=>server.id)),...state.bookings.flatMap((booking:TimedBooking)=>booking.serverId?[booking.serverId]:[])])].sort()},
  header:{seatedCovers:coverMetric(seated),dueCovers:{...coverMetric(due),fromAt:now,toAt:dueUntil},averageActualTurn:{
   minutes:completed.length?completed.reduce((sum,row)=>sum+(Date.parse(row.actualDepartureAt!)-Date.parse(row.actualSeatAt!))/60000,0)/completed.length:null,
   bookingIds:completed.map(row=>row.id)}}}
}

/** Change only the occupied party's forecast. A collision requires a separate host decision. */
export function extendTurn(state:State,actor:Actor,p:Record<string,unknown>,now=new Date().toISOString()) {
 if(actor.agent||!['host','owner','admin'].includes(actor.role))fail(403,'A host or venue manager must extend a turn.')
 if(!Number.isFinite(Date.parse(now)))fail(400,'A valid turn extension time is required.')
 now=new Date(now).toISOString()
 const booking=(state.bookings.find(row=>row.id===p.bookingId)??fail(404,'Booking not found.')) as TimedBooking
 if(booking.status!=='seated')fail(409,'Only a seated party can have its actual turn extended.')
 const reason=text(p.reason,'Turn extension reason',1000)
 if(typeof p.expectedEndAt!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(p.expectedEndAt)||!Number.isFinite(Date.parse(p.expectedEndAt)))fail(400,'Expected departure requires a timestamp with a UTC offset.')
 const expectedEndAt=new Date(p.expectedEndAt as string).toISOString(),before=booking.expectedEndAt??booking.endAt
 const history=(state.serviceEvents??[]).filter(event=>event.bookingId===booking.id),actual=observedTimes(booking,history)
 if(Date.parse(expectedEndAt)<=Date.parse(now)||Date.parse(expectedEndAt)<=Date.parse(before)||actual.actualSeatAt&&Date.parse(expectedEndAt)<=Date.parse(actual.actualSeatAt))fail(400,'Extend the expected departure beyond now, the current departure and the actual seating time.')
 const latest=(state.audit as Audit[]).findLast(event=>event.subject===booking.id&&event.action==='booking.extend')
 if(latest&&Date.parse(now)<Date.parse(latest.at)||history.at(-1)&&Date.parse(now)<Date.parse(history.at(-1)!.at))fail(409,'An extension cannot precede the latest party observation.')
 const event:Audit={id:id(),at:now,actor:actor.id,action:'booking.extend',subject:booking.id,reason,before:{expectedEndAt:before},after:{expectedEndAt}}
 checkStaffing(state,[{...booking,expectedEndAt}],now,new Set([booking.id]))
 booking.expectedEndAt=expectedEndAt;state.audit.push(event)
 return {id:booking.id,booking,event}
}
