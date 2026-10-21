import {fail,type ServingAssignment,type State} from './model'
import {pacingReport} from './pacing'
import {timeline} from './timeline'

type Sample={id:string;value:number|null}
type TimelineRow=ReturnType<typeof timeline>['rows'][number]
const minutes=(from:string|null|undefined,to:string|null|undefined):number|null=>{
 if(!from||!to)return null
 const value=(Date.parse(to)-Date.parse(from))/60000
 return Number.isFinite(value)&&value>=0?value:null
}
function distribution(samples:Sample[]){
 const values=samples.filter((s):s is {id:string;value:number}=>s.value!==null&&Number.isFinite(s.value))
 const sorted=values.map(s=>s.value).sort((a,b)=>a-b),n=sorted.length
 return {sampleSize:n,missing:samples.length-n,mean:n?sorted.reduce((a,b)=>a+b,0)/n:null,
  median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null,
  p90:n?sorted[Math.ceil(n*.9)-1]:null,min:n?sorted[0]:null,max:n?sorted[n-1]:null,values}
}
function localDate(at:string,timezone:string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at))
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-')
}
const assignment=(v:ServingAssignment|null)=>v?{serverId:v.serverId,serverName:v.serverName,sectionId:v.sectionId,sectionName:v.sectionName}:null
function seatingOwner(row:TimelineRow){
 if(!row.actualSeatAt)return null
 return assignment(row.servingHistory.findLast(e=>e.action==='seated'&&Date.parse(e.at)===Date.parse(row.actualSeatAt!))?.to??null)
}
function bookingRow(row:TimelineRow){
 const expectedTurnMinutes=minutes(row.startAt,row.endAt)
 const actualTurnMinutes=row.status==='completed'?minutes(row.actualSeatAt,row.actualDepartureAt):null
 const arrival=minutes(row.startAt,row.actualArrivalAt)
 const owner=seatingOwner(row)
 return {bookingId:row.id,partySize:row.partySize,status:row.status,source:row.source,
  tableIds:[...row.tableIds],tableNames:[...row.tableNames],serverId:row.serverId,serverName:row.serverName,
  sectionId:row.sectionId??null,sectionName:row.sectionName,
  expectedSeatAt:row.startAt,confirmedDepartureAt:row.endAt,expectedDepartureAt:row.expectedDepartureAt,
  actualArrivalAt:row.actualArrivalAt,actualSeatAt:row.actualSeatAt,actualDepartureAt:row.actualDepartureAt,actualResetAt:row.actualResetAt,
  expectedTurnMinutes,actualTurnMinutes,arrivalLatenessMinutes:row.actualArrivalAt?(arrival??(Date.parse(row.actualArrivalAt)<Date.parse(row.startAt)?0:null)):null,
  overrunMinutes:actualTurnMinutes===null||expectedTurnMinutes===null?null:Math.max(0,actualTurnMinutes-expectedTurnMinutes),
  extended:row.turnHistory.length>0,seatingAssignment:owner,
  seatingHistoryStatus:!row.actualSeatAt?'seating-time-not-recorded':owner?'recorded':'seating-assignment-not-recorded',
  serviceHistory:row.serviceHistory.map(e=>({id:e.id,actor:e.actor,at:e.at,source:e.source,
   before:{status:e.before.status,floorStatus:e.before.floorStatus,bookingStatus:e.before.bookingStatus,needsBussing:e.before.needsBussing},
   after:{status:e.after.status,floorStatus:e.after.floorStatus,bookingStatus:e.after.bookingStatus,needsBussing:e.after.needsBussing},correctsEventId:e.correctsEventId??null})),
  turnHistory:row.turnHistory.map(e=>{
   const before=e.before&&!Array.isArray(e.before)&&'expectedEndAt'in e.before?e.before.expectedEndAt:null
   const after=e.after&&!Array.isArray(e.after)&&'expectedEndAt'in e.after?e.after.expectedEndAt:null
   return {id:e.id,actor:e.actor,at:e.at,before:{expectedEndAt:before},after:{expectedEndAt:after},extensionMinutes:minutes(before,after)}
  }),
  servingHistory:row.servingHistory.map(e=>({id:e.id,actor:e.actor,at:e.at,action:e.action,from:assignment(e.from),to:assignment(e.to)}))}
}
function queueReport(state:State,serviceId:string){
 const rows=state.waitlist.filter(w=>w.serviceId===serviceId).map(w=>{
  const status=w.status==='waiting'?'queued':w.status==='cancelled'?'declined':w.status
  const quotedWaitMin=w.quote?.minMinutes??null,quotedWaitMax=w.quote?.maxMinutes??null
  const actualWaitMinutes=minutes(w.createdAt,status==='seated'?w.seatedAt:w.resolvedAt)
  const quoteDeviationMinutes=actualWaitMinutes===null||quotedWaitMin===null||quotedWaitMax===null?null:
   actualWaitMinutes<quotedWaitMin?actualWaitMinutes-quotedWaitMin:actualWaitMinutes>quotedWaitMax?actualWaitMinutes-quotedWaitMax:0
  return {queueId:w.id,bookingId:w.bookingId??null,partySize:w.partySize,status,intakeSource:w.source??null,
   observationSource:'staff-recorded',createdAt:w.createdAt??null,seatedAt:w.seatedAt??null,resolvedAt:w.resolvedAt??null,
   quotedWaitMin,quotedWaitMax,quoteAt:w.quote?.at??null,quoteActor:w.quote?.actor??null,quoteSource:w.quote?'staff-recorded':null,
   actualWaitMinutes,quoteDeviationMinutes,
   history:(w.history??[]).map(e=>({at:e.at,actor:e.actor,action:e.action,from:e.from,to:e.to}))}
 })
 const metric=(statuses:string[])=>{const matched=rows.filter(r=>statuses.includes(r.status));return {count:matched.length,covers:matched.reduce((n,r)=>n+r.partySize,0),queueIds:matched.map(r=>r.queueId)}}
 return {rows,waiting:metric(['queued','offered','accepted','arrived']),seated:metric(['seated']),abandoned:metric(['abandoned']),
  dispositions:Object.fromEntries(['queued','offered','accepted','arrived','seated','declined','expired','abandoned'].map(status=>[status,metric([status])]))}
}
function staffingReport(state:State,serviceId:string,rows:TimelineRow[]){
 const service=state.services.find(s=>s.id===serviceId)!
 const attended=rows.filter(r=>['seated','completed'].includes(r.status)&&r.actualSeatAt)
 function group(kind:'server'|'section'){
  const idKey=kind==='server'?'serverId':'sectionId',nameKey=kind==='server'?'serverName':'sectionName'
  const names=new Map<string,string>((kind==='server'?service.staffing?.servers:service.staffing?.sections)?.map(v=>[v.id,v.name])??[])
  for(const row of rows){if(row[idKey])names.set(row[idKey]!,row[nameKey]??row[idKey]!);for(const event of row.servingHistory)for(const value of [event.from,event.to])if(value)names.set(value[idKey],value[nameKey])}
  const metric=(selected:TimelineRow[])=>({covers:selected.reduce((n,r)=>n+r.partySize,0),bookingIds:selected.map(r=>r.id)})
  return [...names].map(([id,name])=>{
   const expected=rows.filter(r=>['booked','seated','completed'].includes(r.status)&&r[idKey]===id)
   const historical=attended.filter(r=>seatingOwner(r)?.[idKey]===id)
   return {id,name,assignedExpected:metric(expected),attended:metric(historical),seated:metric(historical.filter(r=>r.status==='seated')),completed:metric(historical.filter(r=>r.status==='completed'))}
  })
 }
 const missing=rows.filter(r=>['seated','completed'].includes(r.status)&&!seatingOwner(r))
 return {servers:group('server'),sections:group('section'),missingSeatingHistory:{sampleSize:missing.length,covers:missing.reduce((n,r)=>n+r.partySize,0),bookingIds:missing.map(r=>r.id)}}
}
type Span={start:number;end:number;bookingId:string;completed:boolean}
/** Replay direct assignment changes backwards from the current physical assignment. */
function tableSpans(row:TimelineRow,start:number,end:number){
 let tableIds=[...row.tableIds],cursor=end
 const result:Array<Span&{tableIds:string[]}>=[]
 const history=row.assignmentHistory.flatMap(e=>{
  const before=Array.isArray(e.before)?e.before.find(v=>v.bookingId===row.id):null
  const after=Array.isArray(e.after)?e.after.find(v=>v.bookingId===row.id):null
  return before&&after?[{at:Date.parse(e.at),before:before.tableIds}]:[]
 }).sort((a,b)=>b.at-a.at)
 for(const event of history){
  if(event.at<=start)break
  if(event.at<cursor){result.push({start:event.at,end:cursor,tableIds,bookingId:row.id,completed:row.status==='completed'});cursor=event.at}
  tableIds=[...event.before]
 }
 if(cursor>start)result.push({start,end:cursor,tableIds,bookingId:row.id,completed:row.status==='completed'})
 return result
}
function unionMinutes(spans:Span[]){
 let total=0,end=-Infinity
 for(const span of [...spans].sort((a,b)=>a.start-b.start)){total+=Math.max(0,span.end-Math.max(end,span.start));end=Math.max(end,span.end)}
 return total/60000
}
function utilizationReport(state:State,serviceId:string,rows:TimelineRow[],now:string){
 const service=state.services.find(s=>s.id===serviceId)!,start=Date.parse(service.startAt),end=Date.parse(service.endAt)
 const tables=[...new Map(state.tables.map(t=>[t.id,t])).values()]
 const spans=new Map<string,Span[]>(),known:string[]=[],missing:string[]=[],ongoing:string[]=[]
 for(const row of rows.filter(r=>['seated','completed'].includes(r.status))){
  const until=row.status==='completed'?row.actualDepartureAt:now
  if(minutes(row.actualSeatAt,until)===null){missing.push(row.id);continue}
  known.push(row.id);if(row.status==='seated')ongoing.push(row.id)
  const from=Math.max(start,Date.parse(row.actualSeatAt!)),to=Math.min(end,Date.parse(until!))
  if(from>=to)continue
  for(const span of tableSpans(row,from,to))for(const tableId of new Set(span.tableIds))spans.set(tableId,[...spans.get(tableId)??[],span])
 }
 const tableRows=tables.map(table=>{
  const availableEnd=Math.min(end,table.retiredAt?Date.parse(table.retiredAt):end)
  const observed=(spans.get(table.id)??[]).map(span=>({...span,end:Math.min(span.end,availableEnd)})).filter(span=>span.end>span.start)
  const observedSeatMinutes=unionMinutes(observed)*table.seats
  const availableSeatMinutes=Math.max(0,availableEnd-start)/60000*table.seats
  return {tableId:table.id,inventoryKind:table.inventoryKind??null,seats:table.seats,observedSeatMinutes,completedSeatMinutes:unionMinutes(observed.filter(v=>v.completed))*table.seats,availableSeatMinutes,
   bookingIds:[...new Set(observed.map(v=>v.bookingId))]}
 })
 const poolRows=tableRows.filter(t=>t.inventoryKind==='pool'),physicalRows=tableRows.filter(t=>t.inventoryKind!=='pool')
 const observedSeatMinutes=physicalRows.reduce((n,t)=>n+t.observedSeatMinutes,0),availableSeatMinutes=physicalRows.reduce((n,t)=>n+t.availableSeatMinutes,0)
 return {pool:{observedCoverMinutes:poolRows.reduce((n,t)=>n+t.observedSeatMinutes,0),availableCoverMinutes:poolRows.reduce((n,t)=>n+t.availableSeatMinutes,0),covers:poolRows},observedSeatMinutes,completedSeatMinutes:physicalRows.reduce((n,t)=>n+t.completedSeatMinutes,0),availableSeatMinutes,
  ratio:availableSeatMinutes?observedSeatMinutes/availableSeatMinutes:null,sampleSize:known.length,missing:missing.length,
  bookingIds:known,missingBookingIds:missing,ongoingBookingIds:ongoing,tables:physicalRows}
}

/** Private, guest-free calculated data; callers own immutable snapshot persistence. */
export function performanceReport(state:State,serviceId:string,now=new Date().toISOString()){
 const service=state.services.find(s=>s.id===serviceId)??fail(404,'Service not found.')
 if(!Number.isFinite(Date.parse(now)))fail(400,'A valid report time is required.')
 now=new Date(now).toISOString()
 const date=localDate(service.startAt,state.venue.timezone),observed=timeline(state,[],{serviceId,date},now).rows
 const rows=observed.map(row=>({...bookingRow(row),departureDelayMinutes:row.actualDepartureAt||row.status==='seated'?
  Math.max(0,(Date.parse(row.actualDepartureAt??now)-Date.parse(row.endAt))/60000):null}))
 const queue=queueReport(state,serviceId)
 const bookingSamples=(key:'expectedTurnMinutes'|'actualTurnMinutes'|'arrivalLatenessMinutes')=>distribution(rows.map(r=>({id:r.bookingId,value:r[key]})))
 const queueSamples=(key:'quotedWaitMin'|'quotedWaitMax'|'actualWaitMinutes'|'quoteDeviationMinutes')=>distribution(queue.rows.map(r=>({id:r.queueId,value:r[key]})))
 return {serviceId,serviceName:service.name,date,timezone:state.venue.timezone,startAt:service.startAt,endAt:service.endAt,generatedAt:now,
  observationSource:'staff-recorded',rows,queue,
  distributions:{expectedTurns:bookingSamples('expectedTurnMinutes'),actualTurns:bookingSamples('actualTurnMinutes'),arrivalLateness:bookingSamples('arrivalLatenessMinutes'),
   quotedWaitMin:queueSamples('quotedWaitMin'),quotedWaitMax:queueSamples('quotedWaitMax'),actualWait:queueSamples('actualWaitMinutes'),quoteDeviation:queueSamples('quoteDeviationMinutes')},
  abandoned:queue.abandoned,...staffingReport(state,serviceId,observed),utilization:utilizationReport(state,serviceId,observed,now),pacing:structuredClone(pacingReport(state,serviceId,now)),
  definitions:{units:'Durations use raw elapsed minutes; timestamps are ISO instants. No rounding is applied.',
   distributions:'Sample size counts finite recorded values. Missing observations are excluded, never replaced with zero. Median averages the middle pair; p90 uses nearest rank ceil(0.9 × sampleSize). Expected turns include every reservation, including cancelled and no-show reservations.',
   turns:'Expected turn is original confirmed departure minus confirmed arrival. Actual turn requires corrected observed seating and completion. Overrun is max(0, actual turn − expected turn). Departure delay compares observed completion, or now for an ongoing seated party, with original confirmed departure. Extensions preserve the original promise.',
   arrival:'Only a corrected recorded arrival contributes lateness; early arrivals contribute zero. A staff seating observation also records arrival when no earlier arrival exists.',
   waits:'Quotes are staff-recorded ranges, not provider estimates. Actual wait requires recorded intake and seating or terminal disposition. Quote deviation is actual wait minus the nearest quoted bound, zero inside the range; negative is earlier, positive later.',
   staffing:'Assigned expected covers use current assignments of booked, seated and completed reservations. Attended covers use the serving event at the corrected actual seating instant, never a later assignment. Each party contributes once per server and section; seated and completed split attended covers. Missing seating assignment history is reported separately.',
   utilization:'Counter seats count individually. Anonymous pool covers are excluded from physical-seat utilization and have separate cover-minute totals. Occupied physical table seats × observed dining minutes / available physical table seats × service minutes. This measures table seating capacity occupied, not estimated guest distribution within joined tables. Each table is counted once; overlapping observed intervals are unioned per physical table. Corrected completed observations and explicitly identified ongoing observations with known seat times contribute, clipped to service bounds and recorded table retirement. Assignment audits restore historical tables; missing times are excluded and counted. Setup and cleanup are excluded.',
   corrections:'Service histories retain original and correction event ids, actors, receipt times, and before/after facts. Reasons, guest names, contacts and notes are excluded. Published snapshots are retained by the caller; this calculation does not rewrite them.'}}
}

export type PerformanceReport=ReturnType<typeof performanceReport>
