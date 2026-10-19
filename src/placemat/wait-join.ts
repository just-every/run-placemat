import { fail,id,number,text,Problem,type Actor,type Service,type State } from './model'
import { instant,serviceBy } from './availability'
import { checkBookingRules } from './booking-rules'
import { guestFor,guestInsert,guestGuard } from './guests'
import { initializeQueue,executeQueue,type QueueEntry } from './queue'
import { hash,load,save } from './store'

export type IntakePreferences = {
 partySize:number; preferredAt?:string; preferredArea?:string;
 requiredAccessTags:string[]; contactConsent:boolean
}
export type ManagedQueueEntry = QueueEntry & Partial<IntakePreferences> & {
 source?:'staff'|'public'; managementTokenHash?:string
}
type IntakeService = Service & {publicQueuePaused?:boolean}
const guestActor:Actor={id:'guest',name:'Guest-supplied',role:'guest'}
const active=(row:QueueEntry)=>['queued','waiting','offered','accepted','arrived'].includes(row.status)
const status=(row:QueueEntry)=>row.status==='waiting'?'queued':row.status==='cancelled'?'declined':row.status

/** Exact guest identity comes from guestFor; phone/name similarity never merges parties. */
export function assertNoActiveDuplicate(s:State,guestId:string,serviceId:string):void {
 if(s.waitlist.some(row=>row.guestId===guestId&&row.serviceId===serviceId&&active(row)))fail(409,'An active queue entry already exists for this guest and service. Use its management link or ask the venue for help.')
}

/** Validate preferences without allocating a table or promising a reservation. */
export function normalizeIntake(s:State,p:any,current?:ManagedQueueEntry):IntakePreferences {
 const service=serviceBy(s,current?.serviceId??p.serviceId)
 const partySize=number(p.partySize===undefined?current?.partySize:p.partySize,'Party size',1,500)
 let preferredAt=current?.preferredAt,preferredArea=current?.preferredArea
 if(p.preferredAt!==undefined)preferredAt=p.preferredAt===null||p.preferredAt===''?undefined:instant(p.preferredAt,'Preferred time')
 if(preferredAt&&(Date.parse(preferredAt)<Date.parse(service.startAt)||Date.parse(preferredAt)>=Date.parse(service.endAt)))fail(400,'Choose a preferred time within this service.')
 if(p.preferredArea!==undefined)preferredArea=p.preferredArea===null||p.preferredArea===''?undefined:p.preferredArea
 if(preferredArea!==undefined&&(typeof preferredArea!=='string'||!s.tables.some(table=>(table.area??'Dining room')===preferredArea)))fail(400,'Choose an existing dining area.')
 const tags=p.requiredAccessTags===undefined?current?.requiredAccessTags??[]:p.requiredAccessTags
 if(!Array.isArray(tags)||tags.length>20)fail(400,'Record up to 20 declared access needs.')
 const normalizedTags=(tags as unknown[]).map(tag=>text(tag,'Declared access need',80))
 const contactConsent=p.contactConsent===undefined?current?.contactConsent??false:p.contactConsent
 if(typeof contactConsent!=='boolean')fail(400,'Choose whether the venue may contact this party about its queue entry.')
 return {partySize,preferredAt,preferredArea,requiredAccessTags:[...new Set<string>(normalizedTags)].sort(),contactConsent}
}

function openService(s:State,serviceId:unknown,now:string,intake=false):IntakeService {
 const service=serviceBy(s,serviceId) as IntakeService
 if(service.status!=='published'||service.closedAt||Date.parse(service.endAt)<=Date.parse(now))fail(409,'This service is not accepting queue requests. Contact the venue for help.')
 if(intake&&service.publicQueuePaused)fail(409,'Online queue joining is paused. Ask the venue about joining in person.')
 return service
}
function publicRules(s:State,service:Service,preferences:IntakePreferences,now:string):void {
 const requestedAt=preferences.preferredAt??new Date(Math.max(Date.parse(now),Date.parse(service.startAt))).toISOString()
 checkBookingRules(s,service,preferences.partySize,requestedAt,'waitlist')
}
function view(row:ManagedQueueEntry) {
 return {entry:{id:row.id,serviceId:row.serviceId,partySize:row.partySize,status:status(row),preferredAt:row.preferredAt??null,preferredArea:row.preferredArea??null,requiredAccessTags:row.requiredAccessTags??[],contactConsent:row.contactConsent??false}}
}
function append(row:ManagedQueueEntry,actor:Actor,now:string,action:string,reason:string,details?:unknown):void {
 const current=status(row)
 ;(row.history??=[]).push({at:now,actor:actor.id,action,from:current,to:current,reason,owner:row.owner??actor.id,...details===undefined?{}:{details}})
}
function audit(s:State,row:QueueEntry,now:string,action:string):void {
 s.audit.push({id:id(),at:now,actor:guestActor.id,action,subject:row.id})
}
function mutable(row:ManagedQueueEntry):void {
 if(!active(row))fail(409,'This queue entry is resolved. Contact the venue for help.')
}

/** Only the digest is persisted; callers return the newly issued bearer once. */
export async function issueQueueToken(row:ManagedQueueEntry):Promise<string> {
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
 row.managementTokenHash=await hash(token)
 return token
}
async function byToken(s:State,token:unknown):Promise<ManagedQueueEntry> {
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail(404,'Queue entry unavailable. Use your current management link or contact the venue.')
 const digest=await hash(token as string)
 return (s.waitlist as ManagedQueueEntry[]).find(row=>row.managementTokenHash===digest)??fail(404,'Queue entry unavailable. Use your current management link or contact the venue.')
}

export async function publicJoin(db:D1Database,p:any,now=new Date().toISOString()) {
 const {state:s,version}=await load(db),service=openService(s,p.serviceId,now,true)
 if(typeof p.email!=='string'||!p.email.trim())fail(400,'Email is required to join the queue online.')
 if(typeof p.contactConsent!=='boolean')fail(400,'Choose whether the venue may contact this party about its queue entry.')
 const preferences=normalizeIntake(s,p)
 publicRules(s,service,preferences,now)
 const owner=await db.prepare("SELECT id FROM oa_operators WHERE role='owner' AND status='active' ORDER BY id LIMIT 1").first<{id:string}>()
 if(!owner)fail(409,'Online queue joining is unavailable. Contact the venue for help.')
 let entry:Awaited<ReturnType<typeof guestFor>>
 try{entry=await guestFor(db,p);assertNoActiveDuplicate(s,entry.guest.id,service.id)}catch(error){if(error instanceof Problem&&[400,409].includes(error.status))fail(409,'Unable to join. An active entry may already exist; use your private link, check your details or ask the host.');throw error}
 const row:ManagedQueueEntry=initializeQueue({id:id(),serviceId:service.id,guestId:entry.guest.id,partySize:preferences.partySize,status:'queued'},{id:owner!.id,name:'Venue owner',role:'owner'},{phone:entry.guest.phone},now)
 Object.assign(row,preferences,{source:'public'})
 const joined=row.history!.find(event=>event.action==='joined')!
 joined.actor=guestActor.id;joined.reason='Public intake';joined.details={source:'public',contactConsent:preferences.contactConsent}
 const token=await issueQueueToken(row)
 s.waitlist.push(row);audit(s,row,now,'waitlist.public-join')
 await save(db,s,version,[guestGuard(db,entry),...(entry.fresh?[guestInsert(db,entry.guest,version)]:[])])
 return {...view(row),token}
}

export async function publicQueue(db:D1Database,token:unknown) {
 const {state:s}=await load(db)
 return view(await byToken(s,token))
}

export async function publicQueueUpdate(db:D1Database,p:any) {
 const {state:s,version}=await load(db),row=await byToken(s,p.token),now=new Date().toISOString()
 mutable(row)
 if(p.action==='leave'||p.leave===true) {
  executeQueue(s,guestActor,{waitlistId:row.id,status:'declined',reason:'Guest-supplied request to leave the queue'},'waitlist.status',now)
  audit(s,row,now,'waitlist.public-leave')
 } else {
  if(p.action!==undefined&&p.action!=='update')fail(400,'Choose update or leave.')
  const service=openService(s,row.serviceId,now),preferences=normalizeIntake(s,p,row)
  publicRules(s,service,preferences,now)
  Object.assign(row,preferences)
  append(row,guestActor,now,'party-updated','Guest-supplied party update',preferences)
  audit(s,row,now,'waitlist.public-update')
 }
 await save(db,s,version)
 return view(row)
}

export async function publicQueueRotate(db:D1Database,p:any) {
 const {state:s,version}=await load(db),row=await byToken(s,p.token),now=new Date().toISOString()
 mutable(row)
 const token=await issueQueueToken(row)
 append(row,guestActor,now,'management-link-rotated','Guest-supplied management link rotation')
 audit(s,row,now,'waitlist.public-rotate')
 await save(db,s,version)
 return {...view(row),token}
}

/** The command dispatcher performs its existing atomic save and audit afterward. */
export function executeIntake(s:State,actor:Actor,p:any,command:string,now:string) {
 if(actor.agent||!['owner','admin','host'].includes(actor.role))fail(403,'A host or venue manager is required.')
 if(command==='waitlist.intake-pause') {
  if(!['owner','admin'].includes(actor.role))fail(403,'A venue manager must control online intake.')
  const service=serviceBy(s,p.serviceId) as IntakeService
  if(service.status!=='published'||service.closedAt)fail(409,'Choose an open published service.')
  if(typeof p.paused!=='boolean')fail(400,'Choose whether online queue joining is paused.')
  service.publicQueuePaused=p.paused
  return service
 }
 if(command!=='waitlist.party')fail(400,'Unknown intake command.')
 const row=(s.waitlist.find(entry=>entry.id===p.waitlistId)??fail(404,'Waitlist entry not found.')) as ManagedQueueEntry
 mutable(row!)
 const service=serviceBy(s,row!.serviceId)
 if(service.closedAt)fail(409,'This service is closed. Complete any assigned follow-up instead.')
 const preferences=normalizeIntake(s,p,row)
 Object.assign(row!,preferences)
 append(row!,actor,now,'party-updated','Staff-recorded party update',preferences)
 return row!
}
