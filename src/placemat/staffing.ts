import {fail,id,number,text,type Actor,type Service,type State,type Staffing} from './model'
import {assertStaffingEdit,diningActive,servingFor} from './staffing-capacity'
import {candidateSets} from './combinations'
import {fitAt} from './turn-fit'

const empty=():Staffing=>({servers:[],sections:[],kitchenAreaCaps:{}})
export function executeStaffing(s:State,actor:Actor,command:string,p:any,now:string){
 if(actor.agent||!['owner','admin'].includes(actor.role))fail(403,'A venue manager must configure shift staffing.')
 const service=s.services.find(v=>v.id===p.serviceId)??fail(404,'Service not found.')
 const proposed=structuredClone(service),staffing=proposed.staffing??=empty()
 let result:any
 if(command==='server.save'){
  const current=p.id?staffing.servers.find(v=>v.id===p.id):undefined
  if(p.id&&!current)fail(404,'Shift server not found.')
  const name=text(p.name,'Server name',80)
  if(staffing.servers.some(v=>v.id!==current?.id&&v.name.toLowerCase()===name.toLowerCase()))fail(409,'Server names must be distinct within this shift.')
  if(!current&&staffing.servers.length>=40)fail(400,'Use up to 40 servers per shift.')
  result={id:current?.id??id(),name,coverCap:number(p.coverCap,'Concurrent server covers',1,500),onBreak:current?.onBreak??false}
  if(current)Object.assign(current,result);else staffing.servers.push(result)
 }else if(command==='server.break'){
  const server=staffing.servers.find(v=>v.id===p.serverId)??fail(404,'Shift server not found.')
  if(typeof p.onBreak!=='boolean')fail(400,'Choose whether this server is on break.')
  text(p.reason,'Break reason',1000);server.onBreak=p.onBreak;result=server
 }else if(command==='section.save'){
  const current=p.id?staffing.sections.find(v=>v.id===p.id):undefined
  if(p.id&&!current)fail(404,'Section not found.')
  if(!staffing.servers.some(v=>v.id===p.serverId))fail(404,'Choose a server from this shift.')
  if(!Array.isArray(p.tableIds)||new Set(p.tableIds).size!==p.tableIds.length||p.tableIds.some((id:unknown)=>typeof id!=='string'||!s.tables.some(t=>t.id===id&&!t.retiredAt)))fail(400,'Choose distinct active tables for this section.')
  if(staffing.sections.some(v=>v.id!==current?.id&&v.tableIds.some(id=>p.tableIds.includes(id))))fail(409,'A table can belong to only one section in this shift.')
  const name=text(p.name,'Section name',80)
  if(staffing.sections.some(v=>v.id!==current?.id&&v.name.toLowerCase()===name.toLowerCase()))fail(409,'Section names must be distinct within this shift.')
  if(!current&&staffing.sections.length>=40)fail(400,'Use up to 40 sections per shift.')
  result={id:current?.id??id(),name,serverId:p.serverId,tableIds:[...p.tableIds]}
  if(current)Object.assign(current,result);else staffing.sections.push(result)
 }else if(command==='kitchen.save'){
  const area=text(p.area,'Kitchen area',80)
  if(!s.tables.some(t=>(t.area??'Dining room')===area&&!t.retiredAt))fail(400,'Choose an active dining area for its kitchen cap.')
  const coverCap=number(p.coverCap,'Concurrent kitchen covers',1,500)
  staffing.kitchenAreaCaps[area]=coverCap;result={id:service.id,area,coverCap}
 }else fail(400,'Unknown staffing command.')
 const preview={...s,services:s.services.map(v=>v.id===service.id?proposed:v)}
 assertStaffingEdit(preview,proposed,now)
 service.staffing=staffing;service.version++
 if(command==='server.break')s.audit.push({id:id(),at:now,actor:actor.id,action:command,subject:result.id,reason:text(p.reason,'Break reason',1000)})
 return result
}
function lastSeating(s:State,service:Service,serverId:string){
 const times=s.bookings.filter(b=>b.serviceId===service.id).flatMap(b=>{
  const history=(s.serviceEvents??[]).filter(e=>e.bookingId===b.id),snapshots=new Map<string,string|null>()
  let seatedAt:string|null=b.source==='walk-in'||b.source==='waitlist'?b.createdAt:null
  for(const event of history){
   const before=seatedAt
   if(event.correctsEventId)seatedAt=snapshots.get(event.correctsEventId)??null
   else if(event.after.bookingStatus==='seated'&&event.before.bookingStatus!=='seated')seatedAt=event.at
   snapshots.set(event.id,before)
  }
  if(!history.length&&b.status==='seated')seatedAt=b.createdAt
  if(!seatedAt)return []
  const owner=b.servingHistory?.find(e=>e.action==='seated'&&e.at===seatedAt)?.to?.serverId??b.serverId
  return owner===serverId?[seatedAt]:[]
 })
 return times.sort().at(-1)??null
}
export function sectionsDashboard(s:State,params:URLSearchParams,now=new Date().toISOString()){
 const service=s.services.find(v=>v.id===params.get('serviceId'))??fail(404,'Choose a service for its sections.')
 const partySize=number(params.get('partySize')??2,'Party size',1,500),staffing=service.staffing??empty()
 const raw=params.get('startAt'),start=raw?Date.parse(raw):Math.max(Date.parse(service.startAt),Date.parse(now))
 if(!Number.isFinite(start))fail(400,'Choose a valid rotation arrival time.')
 const startAt=new Date(start).toISOString(),parties=s.bookings.filter(b=>b.serviceId===service.id&&diningActive(b))
 const servers=staffing.servers.map(server=>{
  const assigned=parties.filter(b=>b.serverId===server.id),seated=assigned.filter(b=>b.status==='seated'),tableIds=staffing.sections.filter(v=>v.serverId===server.id).flatMap(v=>v.tableIds)
  let eligible=false;const issues:string[]=[]
  if(server.onBreak)issues.push('On break')
  else for(const ids of candidateSets(s)){
   try{if(servingFor(s,service.id,ids)?.serverId!==server.id)continue;fitAt(s,service,partySize,startAt,ids);eligible=true;break}catch(error){if(error instanceof Error&&'status'in error){issues.push(error.message);continue}throw error}
  }
  if(!eligible&&!issues.length)issues.push('No fitting, available table in this server’s section.')
  return {...server,tableIds,seatedCovers:seated.reduce((n,b)=>n+b.partySize,0),expectedCovers:assigned.reduce((n,b)=>n+b.partySize,0),seatedBookingIds:seated.map(b=>b.id),expectedBookingIds:assigned.map(b=>b.id),lastSeatedAt:lastSeating(s,service,server.id),eligible,issues:eligible?[]:[...new Set(issues)]}
 })
 const rotation=servers.filter(v=>v.eligible).sort((a,b)=>a.seatedCovers-b.seatedCovers||(a.lastSeatedAt??'').localeCompare(b.lastSeatedAt??'')||a.id.localeCompare(b.id)).map(v=>v.id)
 return {serviceId:service.id,now,startAt,partySize,servers,sections:staffing.sections.map(section=>{const assigned=parties.filter(b=>b.sectionId===section.id),seated=assigned.filter(b=>b.status==='seated');return {...section,expectedCovers:assigned.reduce((n,b)=>n+b.partySize,0),seatedCovers:seated.reduce((n,b)=>n+b.partySize,0),expectedBookingIds:assigned.map(b=>b.id),seatedBookingIds:seated.map(b=>b.id)}}),kitchenAreaCaps:staffing.kitchenAreaCaps,rotation,definitions:{seatedCovers:'Currently seated parties in this shift, including ongoing parties past forecast departure.',expectedCovers:'All booked and seated covers in this shift; excludes completed, cancelled and no-show parties.',coverCap:'Maximum overlapping booked or seated dining covers in half-open [arrival, forecast departure) intervals. Ongoing seated parties remain counted. Setup and cleanup occupy tables only.',kitchen:'Each party counts in every dining area used by its tables; limits are concurrent dining covers for this shift.',rotation:'Eligible fitting sections ordered by seated covers, then oldest last seating (never seated first), then stable server id. Breaks and server, kitchen and table capacity exclude a section.'}}
}
