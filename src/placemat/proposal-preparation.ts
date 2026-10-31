import {prepareClosure,prepareAmendment} from './service-changes'
import {prepareInventory} from './inventory-advisor'
import {prepareShiftAdjustment} from './shift-advisor'
import {prepareAllocation} from './allocation-advisor'
import {prepareFloorChange} from './floor-plan'
import {normalizeTurnPolicy,turnImpact} from './turn-policy'
import {validateAssignment} from './assignments'
import {serviceBy} from './availability'
import {fail,id,text,type State,type Actor} from './model'

/** The exact same read-only plan builder feeds native preparation and door classification. */
export function proposedPlan(s:State,actor:Actor,p:any,now:string){
  const kind=p.kind,plan=p.plan??{};let exact:any
  if(kind==='service.amend'){
   if(actor.agent||actor.deviceId)fail(403,'A personal owner or manager must prepare a service amendment.')
   exact=prepareAmendment(s,plan,now)
  }else if(kind==='service.closure'){
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
   const b=s.bookings.find(b=>b.id===plan.bookingId)??fail(404,'Booking not found.')
   if(!['booked','seated'].includes(b.status))fail(409,'Only active bookings can move tables.')
   if(b.assignmentLocked)fail(409,'Unlock this assignment before preparing a table change.')
   const tables=validateAssignment(s,b,plan.tableIds,now)
   exact={bookingId:b.id,booking:structuredClone(b),tableIds:tables.map(t=>t.id),combinations:structuredClone(s.combinations??[]),assignmentInputs:structuredClone({services:s.services,bookings:s.bookings,tables:s.tables,serviceEvents:s.serviceEvents??[]})}
  }else fail(400,'Unknown proposal kind.')
  return {id:id(),kind,plan:exact,status:'pending',preparedBy:actor.id,preparedAt:now,reason:text(p.reason,'Reason',1000)}
}
