import {experienceContext} from './experience-fit'
import {bookingFit} from './availability'
import {searchTables} from './reservation-search'
import {pacingViolations} from './pacing'
import {activeHolds} from './staffing-capacity'
import {fail,type State} from './model'

/** Configuration changes preserve the exact live checkout promise until release or expiry. */
export function assertHeldConfiguration(previous:State,next:State){
 const now=new Date().toISOString(),holds=activeHolds(next,now)
 if(!holds.length)return
 const changed=['services','tables','combinations','experiences'].some(key=>JSON.stringify(previous[key as keyof State])!==JSON.stringify(next[key as keyof State]))
 if(!changed)return
 for(const hold of holds){
  const service=next.services.find(s=>s.id===hold.serviceId)
  if(!service||service.status!=='published'||service.closedAt)return fail(409,'A live checkout holds this service. Wait for expiry or have the guest release it before changing its availability.')
  const available={...next,holds:holds.filter(h=>h.id!==hold.id)}
  if(hold.experience){const entry=next.experiences?.find(e=>e.id===hold.experience!.id);if(!entry||entry.status!=='published'||entry.version!==hold.experience.version)fail(409,'A live checkout holds this exact experience. Wait for expiry or release before editing or withdrawing it.')}
  const experience=experienceContext(available,service,{},hold.partySize,hold.experience),filtered=searchTables(experience.state,hold.requiredArea,hold.requiredAccessTags)
  const fit=bookingFit(filtered.state,experience.service,hold.partySize,hold.startAt,'online',hold.tableIds,true)
  for(const key of ['startAt','endAt','cleanupEndAt','setupStartAt'] as const)if((fit[key]??fit.startAt)!==(hold[key]??hold.startAt))fail(409,'A live checkout holds this exact turn and cleanup. Wait for expiry or release before changing those terms.')
  const oldService=previous.services.find(s=>s.id===hold.serviceId)
  const old=oldService?pacingViolations({...previous,holds:holds.filter(h=>h.id!==hold.id)},oldService,hold,now):[]
  const violations=pacingViolations(available,service,hold,now)
  if(violations.some(v=>!old.some(p=>p.kind===v.kind&&p.label===v.label&&p.excess>=v.excess)))fail(409,'A live checkout reserves this capacity. Wait for expiry or release before reducing its pacing allocation.')
 }
}
