import {accessTags,applyAssignment,assignmentSnapshot,validateAssignments} from './assignments'
import {assignmentFor,sameTables,tableArea} from './combinations'
import {Problem,fail,id,number,text,type Actor,type Booking,type Proposal,type Room,type State,type Table,type TableShape} from './model'
import {serviceSnapshot} from './service-status'

const plain=(value:unknown)=>JSON.stringify(value)
const fields=['label','seats','area','accessTags','x','y','shape'] as const
type Changes=Partial<Pick<Table,typeof fields[number]>>
type Replacement={bookingId:string;tableIds:string[]}
type Impact={bookingId:string;tableIds:string[];replacementTableIds?:string[];status:Booking['status'];locked:boolean;valid:boolean;issues:string[]}
export type FloorPlan={tableId:string;changes:Changes;retire:boolean;replacements:Replacement[];table:Table;impacts:Impact[];conflicts:Array<{bookingId?:string;message:string}>;approvable:boolean;disabledCombinationIds:string[];snapshot:ReturnType<typeof snapshot>}
const snapshot=(s:State)=>structuredClone({tables:s.tables,rooms:s.rooms??[],bookings:s.bookings,combinations:s.combinations??[],services:s.services,serviceEvents:s.serviceEvents??[],venue:s.venue})
const live=(b:Booking)=>b.status==='booked'||b.status==='seated'

export function tableShape(value:unknown):TableShape {
 if(!['round','square','rectangle','bar'].includes(value as string))fail(400,'Choose a round, square, rectangle or bar table.')
 return value as TableShape
}
export function saveRoom(s:State,p:any):Room {
 const current=p.id?s.rooms?.find(r=>r.id===p.id):undefined
 if(p.id&&!current)fail(404,'Room not found.')
 const name=text(p.name,'Room name',80)
 if(!['indoor','outdoor','bar'].includes(p.kind))fail(400,'Choose an indoor, outdoor or bar room.')
 if(s.rooms?.some(r=>r.id!==current?.id&&r.name.toLowerCase()===name.toLowerCase()))fail(409,'Room names must be distinct.')
 if(current&&current.kind!==p.kind&&s.tables.some(t=>tableArea(t)===current.name&&s.bookings.some(b=>b.tableIds.includes(t.id)&&(b.status==='booked'||b.status==='seated'))))fail(409,'This room has active commitments. Keep its room type until those commitments finish.')
 if(current&&current.name!==name&&(s.tables.some(t=>tableArea(t)===current.name)||s.bookings.some(b=>b.requiredArea===current.name||b.combination?.areas.includes(current.name))||s.services.some(v=>Object.hasOwn(v.turnPolicy?.areaTurns??{},current.name))))fail(409,'This room is referenced by tables, bookings or turn rules. Keep its name for those records.')
 if(!current&&(s.rooms?.length??0)>=40)fail(400,'This venue supports up to 40 rooms.')
 const room:Room={id:current?.id??id(),name,kind:p.kind}
 if(current)Object.assign(current,room);else(s.rooms??=[]).push(room)
 return room
}
function changesFor(raw:any):Changes {
 if(raw===undefined)return {}
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!fields.includes(k as typeof fields[number])))fail(400,'Choose supported table settings to change.')
 const changes:Changes={}
 if(raw.label!==undefined)changes.label=text(raw.label,'Table label',40)
 if(raw.seats!==undefined)changes.seats=number(raw.seats,'Seats',1,20)
 if(raw.area!==undefined)changes.area=text(raw.area,'Area',80)
 if(raw.accessTags!==undefined)changes.accessTags=accessTags(raw.accessTags,'Table access tags')
 if(raw.x!==undefined)changes.x=number(raw.x,'Floor X',0,100)
 if(raw.y!==undefined)changes.y=number(raw.y,'Floor Y',0,100)
 if(raw.shape!==undefined)changes.shape=tableShape(raw.shape)
 return changes
}
function replacementsFor(s:State,raw:any):Replacement[]{
 if(raw===undefined)return []
 if(!Array.isArray(raw)||raw.length>s.bookings.length)fail(400,'Choose a list of booking replacements.')
 const rows:Replacement[]=raw.map((r:any)=>{
  if(!r||typeof r!=='object')fail(400,'Each replacement needs a booking and distinct tables.')
  const bookingId=text(r.bookingId,'Replacement booking',100)
  if(!s.bookings.some(b=>b.id===bookingId&&live(b)))fail(409,'Only booked or seated commitments can receive replacement tables.')
  if(!Array.isArray(r.tableIds)||!r.tableIds.length||r.tableIds.some((v:unknown)=>typeof v!=='string')||new Set(r.tableIds).size!==r.tableIds.length)fail(400,'Each replacement needs distinct tables.')
  if(r.tableIds.some((id:string)=>!s.tables.some(t=>t.id===id)))fail(404,'Replacement table not found.')
  return {bookingId,tableIds:[...r.tableIds] as string[]}
 })
 if(new Set(rows.map(r=>r.bookingId)).size!==rows.length)fail(400,'Choose one replacement per booking.')
 return rows
}
/** A preview contains all commitments and refusals; preparation never changes the floor. */
export function prepareFloorChange(s:State,p:any,now:string):FloorPlan {
 const current=s.tables.find(t=>t.id===p.tableId)??fail(404,'Table not found.')
 if(current.retiredAt)fail(409,'A retired table remains in history and cannot be changed.')
 if(p.retire!==undefined&&typeof p.retire!=='boolean')fail(400,'Choose whether to retire this table.')
 const changes=changesFor(p.changes),retire=p.retire??false,replacements=replacementsFor(s,p.replacements)
 if(!retire&&!Object.keys(changes).length)fail(400,'Choose a table change or retirement.')
 const table:Table={...structuredClone(current),...changes,...retire?{retiredAt:now}:{}}
 if(s.tables.some(t=>t.id!==table.id&&t.label===table.label))fail(409,'Table labels must be distinct.')
 const staged=structuredClone(s),target=staged.tables.find(t=>t.id===current.id)!
 Object.assign(target,table)
 const disabledCombinationIds:string[]=[]
 for(const c of staged.combinations??[])if(c.enabled&&c.tableIds.includes(table.id)&&(retire||c.capacity>c.tableIds.reduce((n,id)=>n+(staged.tables.find(t=>t.id===id)?.seats??0),0)||c.accessTags.some(tag=>c.tableIds.some(id=>!staged.tables.find(t=>t.id===id)?.accessTags?.includes(tag))))){c.enabled=false;disabledCombinationIds.push(c.id)}
 const affected=s.bookings.filter(b=>b.tableIds.includes(table.id)||replacements.some(r=>r.bookingId===b.id))
 const impacts:Impact[]=affected.map(b=>({bookingId:b.id,tableIds:[...b.tableIds],...replacements.find(r=>r.bookingId===b.id)?{replacementTableIds:[...replacements.find(r=>r.bookingId===b.id)!.tableIds]}:{},status:b.status,locked:b.assignmentLocked??false,valid:true,issues:[]}))
 const conflicts:FloorPlan['conflicts']=[]
 const issue=(bookingId:string,message:string)=>{const impact=impacts.find(i=>i.bookingId===bookingId)!;if(!impact.issues.includes(message)){impact.valid=false;impact.issues.push(message);conflicts.push({bookingId,message})}}
 for(const b of affected){
  const replacement=replacements.find(r=>r.bookingId===b.id)
  if(retire&&b.tableIds.includes(table.id)&&(b.status==='seated'||b.needsBussing||serviceSnapshot(s,b).needsBussing||['arrived','partially-arrived'].includes(serviceSnapshot(s,b).status)))issue(b.id,'Resolve the seated, arrived or unbussed party before retiring its table.')
  if(!live(b))continue
  if(b.assignmentLocked&&(b.tableIds.includes(table.id)||replacement&&!sameTables(b.tableIds,replacement.tableIds)))issue(b.id,'Unlock this assignment before changing its table or replacement.')
  if(retire&&b.tableIds.includes(table.id)&&!replacement)issue(b.id,'This commitment needs an explicit approved replacement before its table can retire.')
  const destination=replacement?.tableIds??b.tableIds
  // Area is a promise even when the intake did not require a particular room.
  const oldAreas=[...new Set(b.tableIds.map(id=>tableArea(s.tables.find(t=>t.id===id)!)))].sort()
  const newAreas=[...new Set(destination.map(id=>tableArea(staged.tables.find(t=>t.id===id)!)))].sort()
  if(plain(oldAreas)!==plain(newAreas))issue(b.id,'Retain the commitment’s dining area when changing its table.')
 }
 try{
  const moves=replacements.map(r=>({booking:staged.bookings.find(b=>b.id===r.bookingId)!,tableIds:r.tableIds}))
  const destinations=validateAssignments(staged,moves,now)
  for(const destination of destinations)applyAssignment(destination.booking,destination)
 }catch(error){if(!(error instanceof Problem))throw error;for(const r of replacements)issue(r.bookingId,error.message)}
 // Frozen combination terms continue to protect unchanged assignments.
 for(const b of staged.bookings.filter(b=>live(b)&&b.tableIds.includes(table.id)&&!replacements.some(r=>r.bookingId===b.id))){
  try{const service=staged.services.find(v=>v.id===b.serviceId)??fail(404,'Service not found.');assignmentFor(staged,b.tableIds,b.partySize,b.startAt,service.startAt,b.requiredAccessTags??[],b.requiredArea,b)}catch(error){if(!(error instanceof Problem))throw error;issue(b.id,error.message)}
 }
 return {tableId:table.id,changes,retire,replacements,table,impacts,conflicts,approvable:conflicts.length===0,disabledCombinationIds,snapshot:snapshot(s)}
}

export function approveFloorChange(s:State,actor:Actor,proposal:Proposal,now:string){
 if(actor.agent||!['owner','admin'].includes(actor.role))fail(403,'A venue manager must approve this exact floor change.')
 const plan=proposal.plan as FloorPlan
 if(plain(snapshot(s))!==plain(plan.snapshot))fail(409,'The floor, rooms, combinations or commitments changed. Prepare and review the floor change again.')
 const reviewed=prepareFloorChange(s,plan,now)
 if(!reviewed.approvable)fail(409,reviewed.conflicts.map(c=>c.message).join(' '))
 const staged=structuredClone(s)
 Object.assign(staged.tables.find(t=>t.id===plan.tableId)!,reviewed.table)
 for(const c of staged.combinations??[])if(reviewed.disabledCombinationIds.includes(c.id))c.enabled=false
 const destinations=validateAssignments(staged,reviewed.replacements.map(r=>({booking:staged.bookings.find(b=>b.id===r.bookingId)!,tableIds:r.tableIds})),now)
 const before=destinations.map(d=>assignmentSnapshot(s.bookings.find(b=>b.id===d.booking.id)!))
 for(const destination of destinations)applyAssignment(destination.booking,destination)
 // Copy the validated floor and assignments only after every check succeeds.
 s.tables=staged.tables;s.combinations=staged.combinations;s.bookings=staged.bookings
 for(const [index,destination] of destinations.entries())s.audit.push({id:id(),at:now,actor:actor.id,action:'table.assign',subject:destination.booking.id,before:[before[index]],after:[assignmentSnapshot(destination.booking)],reason:proposal.reason})
 s.audit.push({id:id(),at:now,actor:actor.id,action:'floor.change',subject:plan.tableId,reason:proposal.reason})
}
