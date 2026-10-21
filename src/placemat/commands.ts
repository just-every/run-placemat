import {deviceFence} from './shared-device'
import {executeHandover} from './handover'
import {createInventory} from './seat-inventory'
import {saveOnboarding} from './onboarding'
import {serviceInput} from './service-input'
import {executeServiceNotes,normalizePreorders} from './service-notes'
import {prepareCloseReport} from './service-close-report'
import {prepareClosure,approveClosure,followupChange} from './service-changes'
import {normalizeBookingRequests,requestTerms} from './booking-requests'
import {executeInquiry} from './inquiries'
import {prepareInventory,approveInventory} from './inventory-advisor'
import {prepareShiftAdjustment,approveShiftAdjustment} from './shift-advisor'
import {prepareAllocation,approveAllocation} from './allocation-advisor'
import {decideRisk} from './no-show'
import {normalizePacing} from './pacing'
import {seatingPreview,approvePacing,mayPace} from './pacing-review'
import {normalizeIntake,assertNoActiveDuplicate,issueQueueToken,executeIntake} from './wait-join'
import {extendTurn} from './timeline'
import {executeAssignment,validateAssignment,validateAssignments,applyAssignment,assignmentSnapshot,accessTags} from './assignments'
import {executeServiceStatus} from './service-status'
import {executeSchedule,approveSchedule} from './schedules'
import {initializeQueue,queueCanSeat,markQueueSeated,executeQueue} from './queue'
import {normalizeTurnPolicy,turnImpact} from './turn-policy'
import {normalizeRules,checkBookingRules} from './booking-rules'
import {setEmbedOrigins,bookingAttribution} from './embed'
import {setAnalytics,removeAnalyticsKey,savedKeys} from './analytics'
import { fail,id,text,number,type State,type Actor,type Booking } from './model'
import { instant,bookingFit,serviceBy } from './availability'
import { guestFor,guestInsert,guestGuard } from './guests'
import { load,save,guests } from './store'
import { updateGuestProfile } from './profiles'
import {mergeGuests,unmergeGuests} from './guest-merge'
import {searchTables} from './reservation-search'
import {saveCombination} from './combinations'
import {executeStaffing} from './staffing'
import {checkStaffing,recordServing,servingFor} from './staffing-capacity'
import {approveFloorChange,prepareFloorChange,saveRoom,tableShape} from './floor-plan'

/** The approved reminder text a venue exports for its own sender. */
export const reminderMessage=(s:State,b:Booking)=>`Your table at ${s.venue.name} is booked for ${new Intl.DateTimeFormat('en-US',{timeZone:s.venue.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(b.startAt))} (${s.venue.timezone}), party of ${b.partySize}.`
function booking(s:State,bookingId:unknown){return s.bookings.find(b=>b.id===bookingId)??fail(404,'Booking not found.')}
const plain=(v:any)=>JSON.stringify(v)
export async function execute(db:D1Database,actor:Actor,command:string,p:any,pacingSecret?:string){
 const {state:s,version}=await load(db),now=new Date().toISOString(),before:D1PreparedStatement[]=[]
 const priorAuditIds=new Set(s.audit.map(e=>e.id))
 if(actor.deviceId)before.push(deviceFence(db,actor,Date.parse(now)))
 if(actor.agent&&command!=='proposal.prepare')fail(403,'Agents prepare proposals; a person must approve them.')
 const hostCommands=['booking.handover.complete','booking.move','booking.swap','booking.lock','booking.stage','booking.status','booking.extend','waitlist.add','waitlist.party']
 if(!actor.agent&&!['owner','admin'].includes(actor.role)&&!(actor.role==='host'&&s.hostIds?.includes(actor.id)&&(hostCommands.includes(command)||['booking.walkin','waitlist.seat'].includes(command)&&mayPace(s,actor))))fail(403,'A venue manager is required.')
 let result:any,guestChange:import('./audit').AuditChange|undefined,mergeChanges:import('./audit').AuditChange[]=[]
 switch(command){
 case 'booking.handover':case 'booking.handover.assign':case 'booking.handover.complete':{result=await executeHandover(db,s,actor,command,p,now);break}
 case 'service.note':case 'service.preorder-item':case 'service.preorder-active':case 'service.preorder-count':{result=executeServiceNotes(s,actor,command,p,now);break}
 case 'embed.origins':{result=setEmbedOrigins(s,actor,p,now);break}
 case 'analytics.settings':{const change=setAnalytics(db,s,actor,p,await savedKeys(db),version,now);before.push(...change.statements);result=change.result;break}
 case 'analytics.remove-key':{const change=removeAnalyticsKey(db,s,actor,p,await savedKeys(db),version,now);before.push(...change.statements);result=change.result;break}
 case 'service.followup':{result=followupChange(s,actor,p,now);break}
 case 'inquiry.assign':case 'inquiry.reply':case 'inquiry.convert':case 'inquiry.close':{
  result=await executeInquiry(s,actor,command,p,now,db);if(result.before){before.push(...result.before);delete result.before}break
 }
 case 'risk.decide':case 'risk.complete':{result=decideRisk(s,await guests(db),actor,command,p,now);break}
 case 'booking.move':case 'booking.swap':case 'booking.lock':{
  result=executeAssignment(s,actor,p,command,version,now);break
 }
 case 'waitlist.intake-pause':case 'waitlist.party':{
  result=executeIntake(s,actor,p,command,now);break
 }
 case 'booking.extend':{
  result=extendTurn(s,actor,p,now);break
 }
 case 'team.pacing':case 'team.host':{
  if(actor.agent||actor.role!=='owner')fail(403,'The venue owner must grant host access.')
  if(typeof p.enabled!=='boolean')fail(400,'Choose whether host access is enabled.')
  const operatorId=text(p.operatorId,'Team member',100)
  const operator=await db.prepare("SELECT id,role,status FROM oa_operators WHERE id=?").bind(operatorId).first<{id:string;role:string;status:string}>()
  if(!operator||operator.role!=='member'||operator.status!=='active')fail(409,'Choose an active native team member for host access.')
  if(command==='team.pacing'){
   if(!s.hostIds?.includes(operatorId))fail(409,'Grant host access before granting pacing overrides.')
   s.pacingHostIds=[...new Set([...(s.pacingHostIds??[]).filter(id=>id!==operatorId),...(p.enabled?[operatorId]:[])])]
  }else{
   s.hostIds=[...new Set([...(s.hostIds??[]).filter(id=>id!==operatorId),...(p.enabled?[operatorId]:[])])]
   if(!p.enabled){s.pacingHostIds=s.pacingHostIds?.filter(id=>id!==operatorId);before.push(db.prepare('DELETE FROM pm_host_pins WHERE operator_id=?').bind(operatorId),db.prepare('UPDATE pm_host_devices SET operator_id=NULL,generation=generation+1 WHERE operator_id=?').bind(operatorId))}
  }
  result={id:operatorId,operatorId,enabled:p.enabled};break
 }
 case 'schedule.save':case 'schedule.preview':case 'schedule.publish':{
  result=executeSchedule(s,actor,p,command,now);break
 }
 case 'venue.onboard':{result=saveOnboarding(s,actor,p,now);break}
 case 'venue.update':{
  const name=text(p.name,'Venue name',120),timezone=text(p.timezone,'Timezone',80)
  try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format()}catch{fail(400,'Use an IANA timezone such as America/New_York.')}
  if(s.services.length&&timezone!==s.venue.timezone)fail(409,'Keep the venue timezone after creating a service; existing services retain their instants.')
  result=s.venue={...s.venue,name,timezone};break
 }
 case 'server.save':case 'server.break':case 'section.save':case 'kitchen.save':{result=executeStaffing(s,actor,command,p,now);break}
 case 'inventory.create':{result=createInventory(s,p);break}
 case 'room.save':{result=saveRoom(s,p);break}
 case 'combination.save':{result=saveCombination(s,p);break}
 case 'table.save':{
  const current=p.id?s.tables.find(t=>t.id===p.id):null
  if(p.id&&!current)fail(404,'Table not found.')
  if(current?.inventoryId)fail(409,'Inventory units keep their reviewed configuration.')
  if(current?.retiredAt)fail(409,'A retired table is retained unchanged for history.')
  if(current&&s.combinations?.some(c=>c.tableIds.includes(current.id)))fail(409,'Remove this table from approved combinations before changing its settings.')
  if(current&&s.bookings.some(b=>b.tableIds.includes(current.id)))fail(409,'A table with booking history is kept unchanged. Add a new table instead.')
  if(!current&&s.tables.filter(t=>!t.retiredAt&&!t.inventoryId).length>=40)fail(400,'This release supports up to 40 tables.')
  const table={id:current?.id??id(),shape:tableShape(p.shape??current?.shape??'rectangle'),label:text(p.label,'Table label',40),area:p.area===undefined?(current?.area??'Dining room'):text(p.area,'Area',80),seats:number(p.seats,'Seats',1,20),accessTags:accessTags(p.accessTags??current?.accessTags,'Table access tags'),x:number(p.x,'Floor X',0,100),y:number(p.y,'Floor Y',0,100)}
  if(s.tables.some(t=>t.id!==table.id&&t.label===table.label))fail(409,'Table labels must be distinct.')
  if(current)Object.assign(current,table);else s.tables.push(table)
  result=table;break
 }
 case 'service.pacing':{
  const service=serviceBy(s,p.serviceId)
  if(service.closedAt)fail(409,'A closed service keeps its pacing policy.')
  service.pacing=normalizePacing(p.pacing);service.version++;result=service;break
 }
 case 'service.save':{
  const current=p.id?serviceBy(s,p.id):null
  if(current?.status==='published')fail(409,'Published services keep their exact settings. Create another service for a different sitting.')
  const service={id:current?.id??id(),...serviceInput(s,p,current),status:'draft' as const,version:(current?.version??0)+1}
  if(current)Object.assign(current,service);else s.services.push(service)
  result=service;break
 }
 case 'proposal.prepare':{
  const kind=p.kind,plan=p.plan??{};let exact:any
  if(kind==='service.closure'){
   exact=prepareClosure(s,plan,now)
  }else if(kind==='inventory.protect'){
   exact=prepareInventory(s,plan,now)
  }else if(kind==='service.adjust'){
   exact=prepareShiftAdjustment(s,plan,now)
  }else if(kind==='allocation.improve'){
   exact=prepareAllocation(s,plan,now)
  }else if(kind==='floor.change'){
   exact=prepareFloorChange(s,plan,now)
  }else if(kind==='service.publish'){
   const service=serviceBy(s,plan.serviceId)
   if(service.status!=='draft'||!s.tables.length)fail(409,'Create tables and a draft service first.')
   exact={serviceId:service.id,service:structuredClone(service),tables:structuredClone(s.tables),combinations:structuredClone(s.combinations??[]),venue:structuredClone(s.venue)}
  }else if(kind==='service.turns'){
   const service=serviceBy(s,plan.serviceId),policy=normalizeTurnPolicy(plan.turnPolicy,s,service)
   exact={serviceId:service.id,service:structuredClone(service),turnPolicy:policy,bookings:structuredClone(s.bookings),tables:structuredClone(s.tables),combinations:structuredClone(s.combinations??[]),impacts:turnImpact(s,service,policy)}
  }else if(kind==='reminders'){
   const service=serviceBy(s,plan.serviceId)
   const rows=s.bookings.filter(b=>b.serviceId===service.id&&b.status==='booked'&&!s.reminders.some(r=>r.bookingId===b.id))
   if(!rows.length)fail(409,'There are no new booked guests to remind.')
   exact={serviceId:service.id,bookings:structuredClone(rows),venue:structuredClone(s.venue)}
  }else if(kind==='table.assign'){
   if(!actor.agent)fail(403,'Use Change assignment for a direct human move. Preparation keys prepare table proposals.')
   const b=booking(s,plan.bookingId)
   if(!['booked','seated'].includes(b.status))fail(409,'Only active bookings can move tables.')
   if(b.assignmentLocked)fail(409,'Unlock this assignment before preparing a table change.')
   const tables=validateAssignment(s,b,plan.tableIds,now)
   exact={bookingId:b.id,booking:structuredClone(b),tableIds:tables.map(t=>t.id),combinations:structuredClone(s.combinations??[]),assignmentInputs:structuredClone({services:s.services,bookings:s.bookings,tables:s.tables,serviceEvents:s.serviceEvents??[]})}
  }else fail(400,'Unknown proposal kind.')
  result={id:id(),kind,plan:exact,status:'pending',preparedBy:actor.id,preparedAt:now,reason:text(p.reason,'Reason',1000)}
  s.proposals.push(result);break
 }
 case 'proposal.approve':case 'proposal.decline':{
  const proposal=s.proposals.find(x=>x.id===p.proposalId)??fail(404,'Proposal not found.')
  if(proposal.status!=='pending')fail(409,'This proposal has already been decided.')
  if(command==='proposal.decline'){proposal.status='declined';proposal.approvedBy=actor.id;proposal.approvedAt=now;result=proposal;break}
  const plan=proposal.plan
  if(proposal.kind==='service.closure'){
   approveClosure(s,actor,proposal,now)
  }else if(proposal.kind==='inventory.protect'){
   approveInventory(s,actor,proposal,now)
  }else if(proposal.kind==='service.adjust'){
   approveShiftAdjustment(s,actor,proposal,now)
  }else if(proposal.kind==='allocation.improve'){
   approveAllocation(s,actor,proposal,now)
  }else if(proposal.kind==='floor.change'){
   approveFloorChange(s,actor,proposal,now)
  }else if(proposal.kind==='schedule.publish'){
   approveSchedule(s,actor,proposal,now)
  }else if(proposal.kind==='service.publish'){
   const service=serviceBy(s,plan.serviceId)
   if(plain(service)!==plain(plan.service)||plain(s.tables)!==plain(plan.tables)||plain(s.combinations??[])!==plain(plan.combinations??[])||plain(s.venue)!==plain(plan.venue))fail(409,'This draft changed. Prepare and review the service again.')
   service.status='published';service.version++
  }else if(proposal.kind==='service.turns'){
   const service=serviceBy(s,plan.serviceId)
   if(plain(service)!==plain(plan.service)||plain(s.bookings)!==plain(plan.bookings)||plain(s.tables)!==plain(plan.tables)||plain(s.combinations??[])!==plain(plan.combinations??[]))fail(409,'The service or bookings changed. Review the turn policy again.')
   service.turnPolicy=plan.turnPolicy;service.version++
  }else if(proposal.kind==='reminders'){
   const rows=s.bookings.filter(b=>b.serviceId===plan.serviceId&&b.status==='booked'&&!s.reminders.some(r=>r.bookingId===b.id))
   if(plain(rows)!==plain(plan.bookings)||plain(s.venue)!==plain(plan.venue))fail(409,'Bookings changed. Prepare and review the reminders again.')
   for(const b of rows)s.reminders.push({id:id(),bookingId:b.id,guestId:b.guestId,message:reminderMessage(s,b),status:'approved',approvedBy:actor.id,approvedAt:now})
  }else{
   const b=booking(s,plan.bookingId)
   if(plan.assignmentInputs&&plain({services:s.services,bookings:s.bookings,tables:s.tables,serviceEvents:s.serviceEvents??[]})!==plain(plan.assignmentInputs))fail(409,'Shift staffing, kitchen limits, floor or commitments changed. Prepare a new assignment.')
   if(!plan.assignmentInputs&&s.services.find(v=>v.id===b.serviceId)?.staffing)fail(409,'Review a new assignment with the current shift staffing.')
   if(plain(s.combinations??[])!==plain(plan.combinations??[]))fail(409,'Approved combinations changed. Prepare a new table assignment.')
   if(plain(b)!==plain(plan.booking))fail(409,'This booking changed. Prepare a new table assignment.')
   if(b.assignmentLocked)fail(409,'Unlock this assignment before approving a table change.')
   const before=assignmentSnapshot(b),destination=validateAssignments(s,[{booking:b,tableIds:plan.tableIds}],now)[0]
   applyAssignment(b,destination,{actor:actor.id,at:now,action:'table.assign',reason:proposal.reason})
   s.audit.push({id:id(),at:now,actor:actor.id,action:'table.assign',subject:b.id,before:[before],after:[assignmentSnapshot(b)],reason:proposal.reason})
  }
  proposal.status='approved';proposal.approvedBy=actor.id;proposal.approvedAt=now;result=proposal;break
 }
 case 'booking.walkin':case 'waitlist.seat':{
  const preview=seatingPreview(s,actor,command,p,now),{waiting,service,partySize,requiredArea,requiredAccessTags,ruleOverride,violations,fit}=preview
  const pacingOverride=await approvePacing(pacingSecret,actor,command,p,version,now,violations),{tables,...slot}=fit
  const entry=waiting?{guest:{id:waiting.guestId},fresh:false,hashes:[]}:await guestFor(db,p,actor)
  before.push(guestGuard(db,entry))
  if(entry.fresh)before.push(guestInsert(db,entry.guest as any,version))
  result={id:id(),serviceId:service.id,guestId:entry.guest.id,partySize,requiredAccessTags,...(requiredArea?{requiredArea}:{}),...slot,tableIds:tables.map(t=>t.id),status:'seated',source:waiting?'waitlist':'walk-in',createdAt:now,...(pacingOverride?{pacingOverride}:{}),...(ruleOverride?{ruleOverride}:{})} satisfies Booking
  checkStaffing(s,[result],now,new Set(),Boolean(pacingOverride))
  recordServing(result,servingFor(s,service.id,result.tableIds),actor.id,now,command)
  if(pacingOverride)s.audit.push({id:id(),at:now,actor:actor.id,action:'booking.pacing-override',subject:result.id,pacing:pacingOverride})
  s.bookings.push(result);executeServiceStatus(s,actor,{bookingId:result.id,stage:'seated'},now);if(ruleOverride)s.audit.push({id:id(),at:now,actor:actor.id,action:'booking.rule-override',subject:result.id});if(waiting)markQueueSeated(waiting,actor,now,result.id);break
 }
 case 'waitlist.add':{
  const service=serviceBy(s,p.serviceId);if(service.status!=='published')fail(409,'Publish the service first.');if(service.closedAt)fail(409,'This service is closed. Choose an open service.')
  const partySize=number(p.partySize,'Party size',1,500),entry=await guestFor(db,p,actor)
  before.push(guestGuard(db,entry))
  if(entry.fresh)before.push(guestInsert(db,entry.guest,version))
  assertNoActiveDuplicate(s,entry.guest.id,service.id)
  const row=initializeQueue({id:id(),serviceId:service.id,guestId:entry.guest.id,partySize,status:'queued'},actor,{...p,phone:entry.guest.phone},now)
  Object.assign(row,normalizeIntake(s,p),{source:'staff'})
  const token=await issueQueueToken(row);s.waitlist.push(row);result={...row,token};break
 }
 case 'waitlist.status':case 'waitlist.priority':case 'waitlist.quote':case 'waitlist.followup':case 'service.close':{
  result=executeQueue(s,actor,p,command,now);
  if(command==='service.close'){const report=prepareCloseReport(db,s,actor,result.id,version,now);before.push(report.statement);result={...result,closeSnapshotId:report.snapshotId}}
  break
 }
 case 'booking.stage':case 'booking.status':{
  const changed=executeServiceStatus(s,actor,{...p,stage:p.stage??p.status},now);result=command==='booking.status'?changed.booking:changed;break
 }
 case 'guest.merge':case 'guest.unmerge':{
  const change=await (command==='guest.merge'?mergeGuests:unmergeGuests)(db,s,version,actor,p,now)
  before.push(...change.statements);result=change.result;mergeChanges=change.changes;break
 }
 case 'guest.update':case 'guest.profile':{
  const update=await updateGuestProfile(db,p.guestId,p,actor,version,now)
  before.push(...update.statements);result=update.guest;guestChange={kind:'guests',id:result.id,before:update.previous,after:structuredClone(result)};break
 }
 default:fail(400,'Unknown command.')
 }
 if(command!=='booking.extend')s.audit.push(['booking.move','booking.swap','booking.lock','embed.origins','analytics.settings','analytics.remove-key'].includes(command)?result.audit:{id:id(),at:now,actor:actor.id,action:command,subject:result?.id??result?.booking?.id??'venue'})
 for(const entry of s.audit)if(entry.at===now&&entry.actor===actor.id){entry.source=actor.agent?'preparation-key':'person';if(actor.deviceId&&!priorAuditIds.has(entry.id))entry.deviceId=actor.deviceId}
 if(guestChange)s.audit.at(-1)!.changes=[guestChange]
 if(mergeChanges.length)s.audit.at(-1)!.changes=mergeChanges
 try{await save(db,s,version,before)}catch(error){if(actor.deviceId&&String(error).includes('CHECK constraint failed'))fail(409,'Host stand authorization changed. Unlock again.');throw error}
 return result
}
export async function onlineBook(db:D1Database,p:any){
 const {state:s,version}=await load(db),service=serviceBy(s,p.serviceId)
 if(service.status!=='published')fail(404,'This service is not open for bookings.')
 if(service.closedAt)fail(409,'This service is closed. Choose an open service; no booking has been made.')
 const partySize=number(p.partySize,'Party size',1,500),attribution=bookingAttribution(s,p.embedOrigin)
 checkBookingRules(s,service,partySize,instant(p.startAt,'Start'),'online')
 const {state:filtered,requiredArea,requiredAccessTags}=searchTables(s,p.area,p.requiredAccessTags)
 const fit=bookingFit(filtered,service,partySize,p.startAt,'online',p.tableIds),{tables,...slot}=fit
 if(Date.parse(slot.startAt)<Date.now())fail(409,'Choose a future booking time.')
 if(!p.email)fail(400,'Email is required for an online booking.')
 if(p.requests!==undefined&&p.requestsAcknowledged!==true)fail(400,'Acknowledge required guarantees and requested preferences before booking.')
 const requests=p.requests===undefined?undefined:normalizeBookingRequests(p)
 const preorders=normalizePreorders(service,p.preorders)
 const entry=await guestFor(db,p)
 if(s.bookings.some(b=>b.guestId===entry.guest.id&&b.startAt===slot.startAt&&!['cancelled','no-show'].includes(b.status)))fail(409,'A booking already exists for this guest at that time.')
 const b:Booking={preorders,...requests?{requests,requestsAcknowledgedAt:new Date().toISOString()}:{},id:id(),serviceId:service.id,guestId:entry.guest.id,partySize,requiredAccessTags,...(requiredArea&&!tables[0].inventoryId?{requiredArea}:{}),...slot,tableIds:tables.map(t=>t.id),status:'booked',source:'online',attribution,createdAt:new Date().toISOString()}
 recordServing(b,servingFor(s,service.id,b.tableIds),'guest',b.createdAt,'booking.online')
 s.bookings.push(b);s.audit.push({id:id(),at:b.createdAt,actor:'guest',action:'booking.online',subject:b.id})
 await save(db,s,version,[guestGuard(db,entry),...(entry.fresh?[guestInsert(db,entry.guest,version)]:[])])
 return {assignment:tables.map(t=>t.label).join(', '),id:b.id,startAt:b.startAt,endAt:b.endAt,cleanupEndAt:b.cleanupEndAt,partySize,preorders,area:requiredArea??null,requiredAccessTags,...requests?{requests,requestTerms:requestTerms(requests)}:{},confirmation:tables[0].inventoryKind==='pool'?`Your unassigned pool covers at ${s.venue.name} are reserved. Physical seats are assigned by the host on arrival.`:`Your table at ${s.venue.name} is booked.`,timezone:s.venue.timezone}
}
