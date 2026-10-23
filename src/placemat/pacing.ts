import {fail,number,text,type Booking,type Service,type State} from './model'
import {activeHolds,concurrentCovers,diningActive,diningInterval,type DiningParty} from './staffing-capacity'

export type PacingPolicy={intervalMinutes:number;arrivalCovers:number;arrivalParties:number;concurrentCovers:number;areaArrivalCaps:Record<string,number>}
export type LimitViolation={kind:string;label:string;limit:number;current:number;projected:number;excess:number}
type Candidate=Omit<DiningParty,'serviceId'>
type PacingService=Service&{pacing?:PacingPolicy}
type OverrideBooking=Booking&{pacingOverride?:unknown}
type AreaReport={covers:number;heldCovers:number;limit:number;full:boolean}

export function normalizePacing(value:unknown):PacingPolicy{
 if(value===undefined)return {intervalMinutes:30,arrivalCovers:500,arrivalParties:500,concurrentCovers:500,areaArrivalCaps:{}}
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Send a pacing policy object.')
 const policy=value as Record<string,unknown>,caps=policy.areaArrivalCaps
 if(!caps||typeof caps!=='object'||Array.isArray(caps))fail(400,'Area arrival caps must be an object keyed by dining area.')
 const entries=Object.entries(caps as Record<string,unknown>).map(([area,cap])=>[text(area,'Dining area',200),number(cap,'Area arrival covers',1,500)] as const)
 if(new Set(entries.map(([area])=>area)).size!==entries.length)fail(400,'Choose each dining area only once.')
 return {
  intervalMinutes:number(policy.intervalMinutes,'Arrival interval minutes',5,120),
  arrivalCovers:number(policy.arrivalCovers,'Arrival covers',1,500),
  arrivalParties:number(policy.arrivalParties,'Arrival parties',1,500),
  concurrentCovers:number(policy.concurrentCovers,'Concurrent dining covers',1,500),
  areaArrivalCaps:Object.fromEntries(entries),
 }
}

const counted=(b:{status?:string;kind?:'hold'})=>diningActive(b)||b.status==='completed'
const covers=(bookings:Array<{partySize:number}>)=>bookings.reduce((sum,b)=>sum+b.partySize,0)
const policyFor=(service:Service)=>(service as PacingService).pacing
function areasFor(s:State,party:{tableIds:string[]}){
 const tables=s.allocationTables??s.tables
 return [...new Set(party.tableIds.map(id=>tables.find(t=>t.id===id)?.area??'Dining room'))]
}
function arrivalWindow(service:Service,policy:PacingPolicy,startAt:string){
 const duration=policy.intervalMinutes*60000,origin=Date.parse(service.startAt)
 const start=origin+Math.floor((Date.parse(startAt)-origin)/duration)*duration
 return {start,end:start+duration}
}
const inWindow=(b:{startAt:string},window:{start:number;end:number})=>Date.parse(b.startAt)>=window.start&&Date.parse(b.startAt)<window.end

/** Compare the proposed final booking against the ledger, excluding its previous version. */
export function pacingViolations(s:State,service:Service,candidate:Candidate,now:string):LimitViolation[]{
 const party:DiningParty={...candidate,serviceId:service.id,status:candidate.status??(candidate.kind==='hold'?undefined:'booked')}
 if(!counted(party))return []
 const bookings:DiningParty[]=[...s.bookings,...activeHolds(s,now)].filter(b=>b.serviceId===service.id&&(!candidate.id||b.id!==candidate.id)&&counted(b))
 const violations:LimitViolation[]=[]
 const check=(kind:string,label:string,limit:number,current:number,projected:number)=>{
  if(projected>limit)violations.push({kind,label,limit,current,projected,excess:projected-limit})
 }
 const total=covers(bookings)
 check('service-covers','Total service covers',service.coverLimit,total,total+party.partySize)
 for(const area of areasFor(s,party)){
  const cap=service.staffing?.kitchenAreaCaps[area]
  if(cap===undefined||!diningActive(party))continue
  const window=diningInterval(party,now),inArea=bookings.filter(b=>areasFor(s,b).includes(area)),current=concurrentCovers(inArea,now,window)
  check('area-concurrent-covers',`${area} kitchen concurrent cover cap`,cap,current,concurrentCovers([...inArea,party],now,window))
 }
 for(const inventory of s.inventories??[]){
  const units=new Set((s.allocationTables??s.tables).filter(t=>t.inventoryId===inventory.id).map(t=>t.id))
  if(!party.tableIds.some(id=>units.has(id)))continue
  const window=arrivalWindow(service,{...normalizePacing(undefined),intervalMinutes:inventory.intervalMinutes},party.startAt)
  const current=covers(bookings.filter(b=>b.tableIds.some(id=>units.has(id))&&inWindow(b,window)))
  check('inventory-arrival-covers',`${inventory.name} arrival covers`,inventory.arrivalCovers,current,current+party.partySize)
 }
 const policy=policyFor(service)
 if(!policy)return violations
 const window=arrivalWindow(service,policy,party.startAt),arrivals=bookings.filter(b=>inWindow(b,window)),arrivalCovers=covers(arrivals)
 check('arrival-covers','Arrival interval covers',policy.arrivalCovers,arrivalCovers,arrivalCovers+party.partySize)
 check('arrival-parties','Arrival interval parties',policy.arrivalParties,arrivals.length,arrivals.length+1)
 if(diningActive(party)){
  const dining=diningInterval(party,now),current=concurrentCovers(bookings,now,dining)
  check('concurrent-covers','Concurrent dining covers',policy.concurrentCovers,current,concurrentCovers([...bookings,party],now,dining))
 }
 for(const area of areasFor(s,party)){
  if(!Object.hasOwn(policy.areaArrivalCaps,area))continue
  const current=covers(arrivals.filter(b=>areasFor(s,b).includes(area)))
  check('area-arrival-covers',`${area} arrival covers`,policy.areaArrivalCaps[area],current,current+party.partySize)
 }
 return violations
}

/** Arrival buckets are elapsed-time intervals anchored to the service start, including across DST. */
export function pacingReport(s:State,serviceId:string,now:string){
 const service=s.services.find(v=>v.id===serviceId)??fail(404,'Service not found.')
 const policy=policyFor(service)??normalizePacing(undefined)
 const serviceBookings=s.bookings.filter(b=>b.serviceId===service.id)
 const bookings=serviceBookings.filter(counted),holds=activeHolds(s,now).filter(h=>h.serviceId===service.id)
 const intervals:Array<{startAt:string;endAt:string;covers:number;parties:number;heldCovers:number;heldParties:number;limit:number;partyLimit:number;full:boolean;bookingIds:string[];areas:Record<string,AreaReport>}>=[]
 const end=Date.parse(service.endAt),duration=policy.intervalMinutes*60000
 for(let start=Date.parse(service.startAt);start<end;start+=duration){
  const window={start,end:Math.min(start+duration,end)},arrivals=bookings.filter(b=>inWindow(b,window)),held=holds.filter(h=>inWindow(h,window)),arrivalCovers=covers(arrivals),heldCovers=covers(held)
  const areas:Record<string,AreaReport>=Object.fromEntries(Object.entries(policy.areaArrivalCaps).map(([area,limit])=>{
   const areaCovers=covers(arrivals.filter(b=>areasFor(s,b).includes(area))),heldCovers=covers(held.filter(h=>areasFor(s,h).includes(area)))
   return [area,{covers:areaCovers,heldCovers,limit,full:areaCovers+heldCovers>=limit}]
  }))
  intervals.push({startAt:new Date(start).toISOString(),endAt:new Date(window.end).toISOString(),covers:arrivalCovers,parties:arrivals.length,heldCovers,heldParties:held.length,limit:policy.arrivalCovers,partyLimit:policy.arrivalParties,full:arrivalCovers+heldCovers>=policy.arrivalCovers||arrivals.length+held.length>=policy.arrivalParties||Object.values(areas).some(area=>area.full),bookingIds:arrivals.map(b=>b.id),areas})
 }
 const overrideBookingIds=serviceBookings.filter(b=>Boolean((b as OverrideBooking).pacingOverride)).map(b=>b.id)
 return {generatedAt:now,policy,kitchenConcurrentCaps:service.staffing?.kitchenAreaCaps??{},totalCovers:covers(bookings),heldCovers:covers(holds),full:covers(bookings)+covers(holds)>=service.coverLimit,limit:service.coverLimit,intervals,overrideCount:overrideBookingIds.length,overrideBookingIds}
}

/** An existing authorized exception may move without increasing any exceeded limit. */
export function assertPacing(s:State,service:Service,candidate:Candidate,now:string,priorState:State=s){
 const violations=pacingViolations(s,service,candidate,now)
 const previous=candidate.id?priorState.bookings.find(b=>b.id===candidate.id):undefined
 const prior=previous&&['booked','seated'].includes(previous.status)?pacingViolations(priorState,service,previous,now):[]
 const excess=violations.filter(v=>!prior.some(old=>old.kind===v.kind&&old.label===v.label&&old.excess>=v.excess))
 if(excess.length)fail(409,excess.map(v=>`${v.label}: limit ${v.limit}, projected ${v.projected}, excess ${v.excess}.`).join(' '))
}
