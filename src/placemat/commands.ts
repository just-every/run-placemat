import { fail,id,text,number,type State,type Actor,type Booking } from './model'
import { allocation,instant,interval,serviceBy } from './availability'
import { guestFor,guestInsert,guestGuard } from './guests'
import { load,save } from './store'

function booking(s:State,bookingId:unknown){return s.bookings.find(b=>b.id===bookingId)??fail(404,'Booking not found.')}
const plain=(v:any)=>JSON.stringify(v)
export async function execute(db:D1Database,actor:Actor,command:string,p:any){
 const {state:s,version}=await load(db),now=new Date().toISOString(),before:D1PreparedStatement[]=[]
 if(actor.agent&&command!=='proposal.prepare')fail(403,'Agents prepare proposals; a person must approve them.')
 if(!actor.agent&&!['owner','admin'].includes(actor.role))fail(403,'A venue manager is required.')
 let result:any
 switch(command){
 case 'venue.update':{
  const name=text(p.name,'Venue name',120),timezone=text(p.timezone,'Timezone',80)
  try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format()}catch{fail(400,'Use an IANA timezone such as America/New_York.')}
  if(s.services.length&&timezone!==s.venue.timezone)fail(409,'Keep the venue timezone after creating a service; existing services retain their instants.')
  result=s.venue={name,timezone};break
 }
 case 'table.save':{
  const current=p.id?s.tables.find(t=>t.id===p.id):null
  if(p.id&&!current)fail(404,'Table not found.')
  if(current&&s.bookings.some(b=>b.tableIds.includes(current.id)))fail(409,'A table with booking history is kept unchanged. Add a new table instead.')
  if(!current&&s.tables.length>=40)fail(400,'This release supports up to 40 tables.')
  const table={id:current?.id??id(),label:text(p.label,'Table label',40),seats:number(p.seats,'Seats',1,20),x:number(p.x,'Floor X',0,100),y:number(p.y,'Floor Y',0,100)}
  if(s.tables.some(t=>t.id!==table.id&&t.label===table.label))fail(409,'Table labels must be distinct.')
  if(current)Object.assign(current,table);else s.tables.push(table)
  result=table;break
 }
 case 'service.save':{
  const current=p.id?serviceBy(s,p.id):null
  if(current?.status==='published')fail(409,'Published services keep their exact settings. Create another service for a different sitting.')
  const startAt=instant(p.startAt,'Service start'),endAt=instant(p.endAt,'Service end'),turnMinutes=number(p.turnMinutes,'Turn minutes',15,360)
  const duration=(Date.parse(endAt)-Date.parse(startAt))/60000
  if(duration<turnMinutes||duration>1440)fail(400,'Service duration must fit a turn and be no more than 24 hours.')
  const service={id:current?.id??id(),name:text(p.name,'Service name',120),startAt,endAt,turnMinutes,coverLimit:number(p.coverLimit,'Cover limit',1,500),status:'draft' as const,version:(current?.version??0)+1}
  if(current)Object.assign(current,service);else s.services.push(service)
  result=service;break
 }
 case 'proposal.prepare':{
  const kind=p.kind,plan=p.plan??{};let exact:any
  if(kind==='service.publish'){
   const service=serviceBy(s,plan.serviceId)
   if(service.status!=='draft'||!s.tables.length)fail(409,'Create tables and a draft service first.')
   exact={serviceId:service.id,service:structuredClone(service),tables:structuredClone(s.tables),venue:structuredClone(s.venue)}
  }else if(kind==='reminders'){
   const service=serviceBy(s,plan.serviceId)
   const rows=s.bookings.filter(b=>b.serviceId===service.id&&b.status==='booked'&&!s.reminders.some(r=>r.bookingId===b.id))
   if(!rows.length)fail(409,'There are no new booked guests to remind.')
   exact={serviceId:service.id,bookings:structuredClone(rows),venue:structuredClone(s.venue)}
  }else if(kind==='table.assign'){
   const b=booking(s,plan.bookingId)
   if(!['booked','seated'].includes(b.status))fail(409,'Only active bookings can move tables.')
   const service=serviceBy(s,b.serviceId)
   const tables=allocation(s,service,b.partySize,b,plan.tableIds,b.id)
   exact={bookingId:b.id,booking:structuredClone(b),tableIds:tables.map(t=>t.id)}
  }else fail(400,'Unknown proposal kind.')
  result={id:id(),kind,plan:exact,status:'pending',preparedBy:actor.id,preparedAt:now,reason:text(p.reason,'Reason',1000)}
  s.proposals.push(result);break
 }
 case 'proposal.approve':case 'proposal.decline':{
  const proposal=s.proposals.find(x=>x.id===p.proposalId)??fail(404,'Proposal not found.')
  if(proposal.status!=='pending')fail(409,'This proposal has already been decided.')
  if(command==='proposal.decline'){proposal.status='declined';proposal.approvedBy=actor.id;proposal.approvedAt=now;result=proposal;break}
  const plan=proposal.plan
  if(proposal.kind==='service.publish'){
   const service=serviceBy(s,plan.serviceId)
   if(plain(service)!==plain(plan.service)||plain(s.tables)!==plain(plan.tables)||plain(s.venue)!==plain(plan.venue))fail(409,'This draft changed. Prepare and review the service again.')
   service.status='published';service.version++
  }else if(proposal.kind==='reminders'){
   const rows=s.bookings.filter(b=>b.serviceId===plan.serviceId&&b.status==='booked'&&!s.reminders.some(r=>r.bookingId===b.id))
   if(plain(rows)!==plain(plan.bookings)||plain(s.venue)!==plain(plan.venue))fail(409,'Bookings changed. Prepare and review the reminders again.')
   for(const b of rows)s.reminders.push({id:id(),bookingId:b.id,guestId:b.guestId,message:`Your table at ${s.venue.name} is booked for ${new Intl.DateTimeFormat('en-US',{timeZone:s.venue.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(b.startAt))} (${s.venue.timezone}), party of ${b.partySize}.`,status:'approved',approvedBy:actor.id,approvedAt:now})
  }else{
   const b=booking(s,plan.bookingId)
   if(plain(b)!==plain(plan.booking))fail(409,'This booking changed. Prepare a new table assignment.')
   const tables=allocation(s,serviceBy(s,b.serviceId),b.partySize,b,plan.tableIds,b.id)
   b.tableIds=tables.map(t=>t.id)
  }
  proposal.status='approved';proposal.approvedBy=actor.id;proposal.approvedAt=now;result=proposal;break
 }
 case 'booking.walkin':case 'waitlist.seat':{
  const waiting=command==='waitlist.seat'?(s.waitlist.find(w=>w.id===p.waitlistId)??fail(404,'Waitlist entry not found.')):null
  if(waiting&&waiting.status!=='waiting')fail(409,'This party is no longer waiting.')
  const service=serviceBy(s,waiting?.serviceId??p.serviceId)
  if(service.status!=='published')fail(409,'Publish this service first.')
  const partySize=waiting?.partySize??number(p.partySize,'Party size',1,20),slot=interval(service,p.startAt),tables=allocation(s,service,partySize,slot,p.tableIds)
  const entry=waiting?{guest:{id:waiting.guestId},fresh:false,hashes:[]}:await guestFor(db,p)
  before.push(guestGuard(db,entry))
  if(entry.fresh)before.push(guestInsert(db,entry.guest as any,version))
  result={id:id(),serviceId:service.id,guestId:entry.guest.id,partySize,...slot,tableIds:tables.map(t=>t.id),status:'seated',source:waiting?'waitlist':'walk-in',createdAt:now} satisfies Booking
  s.bookings.push(result);if(waiting)waiting.status='seated';break
 }
 case 'waitlist.add':{
  const service=serviceBy(s,p.serviceId);if(service.status!=='published')fail(409,'Publish the service first.')
  const partySize=number(p.partySize,'Party size',1,20),entry=await guestFor(db,p)
  before.push(guestGuard(db,entry))
  if(entry.fresh)before.push(guestInsert(db,entry.guest,version))
  result={id:id(),serviceId:service.id,guestId:entry.guest.id,partySize,status:'waiting'};s.waitlist.push(result);break
 }
 case 'booking.status':{
  const b=booking(s,p.bookingId),next=p.status
  const allowed:Record<string,string[]>={booked:['seated','cancelled','no-show'],seated:['completed'],completed:[],cancelled:[],'no-show':[]}
  if(!allowed[b.status].includes(next))fail(409,'That status transition is not available for this booking.')
  b.status=next;result=b;break
 }
 case 'guest.update':{
  const row=await db.prepare('SELECT version,data FROM pm_guests WHERE id=?').bind(p.guestId).first<{version:number;data:string}>()
  if(!row)fail(404,'Guest not found.')
  const guest=JSON.parse(row!.data);if(guest.erased)fail(409,'An erased guest cannot be edited.')
  guest.notes=typeof p.notes==='string'&&p.notes.length<=4000?p.notes:fail(400,'Notes must be at most 4000 characters.')
  before.push(db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?) THEN 1 ELSE 0 END').bind(guest.id,row!.version,row!.data))
  before.push(db.prepare('UPDATE pm_guests SET data=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(JSON.stringify(guest),guest.id,row!.version,version));result=guest;break
 }
 default:fail(400,'Unknown command.')
 }
 s.audit.push({id:id(),at:now,actor:actor.id,action:command,subject:result?.id??'venue'})
 await save(db,s,version,before)
 return result
}
export async function onlineBook(db:D1Database,p:any){
 const {state:s,version}=await load(db),service=serviceBy(s,p.serviceId)
 if(service.status!=='published')fail(404,'This service is not open for bookings.')
 const partySize=number(p.partySize,'Party size',1,20),slot=interval(service,p.startAt)
 if(Date.parse(slot.startAt)<Date.now())fail(409,'Choose a future booking time.')
 if(!p.email)fail(400,'Email is required for an online booking.')
 const tables=allocation(s,service,partySize,slot),entry=await guestFor(db,p)
 if(s.bookings.some(b=>b.guestId===entry.guest.id&&b.startAt===slot.startAt&&!['cancelled','no-show'].includes(b.status)))fail(409,'A booking already exists for this guest at that time.')
 const b:Booking={id:id(),serviceId:service.id,guestId:entry.guest.id,partySize,...slot,tableIds:tables.map(t=>t.id),status:'booked',source:'online',createdAt:new Date().toISOString()}
 s.bookings.push(b);s.audit.push({id:id(),at:b.createdAt,actor:'guest',action:'booking.online',subject:b.id})
 await save(db,s,version,[guestGuard(db,entry),...(entry.fresh?[guestInsert(db,entry.guest,version)]:[])])
 return {id:b.id,startAt:b.startAt,endAt:b.endAt,partySize,confirmation:`Your table at ${s.venue.name} is booked.`,timezone:s.venue.timezone}
}
