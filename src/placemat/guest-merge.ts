import {fail,id,type Actor,type State} from './model'
import type {AuditChange} from './audit'
import {canonicalJson} from './import/kit'
import {hash} from './store'
import type {GuestContact,GuestMergeJournal,GuestMergeLaterRecord,GuestMergePayload,GuestUnmergePayload,MergeGuest,MergeRecord,MergeRecordKind} from './guest-merge-types'
import {normalizedGuestPhone,normalizedGuestEmail,normalizedGuestName} from './guests'

const kinds:MergeRecordKind[]=['bookings','waitlist','reminders','inquiries']
type Row={version:number;data:string}
type GuestRow=Row&{guest:MergeGuest}
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b)
const records=(state:State,kind:MergeRecordKind):MergeRecord[]=>(state[kind]??[]) as MergeRecord[]
const linked=(state:State,ids:string[])=>kinds.flatMap(kind=>records(state,kind).filter(row=>ids.includes(row.guestId)).map(row=>({kind,id:row.id,record:structuredClone(row)})))
async function guestRow(db:D1Database,guestId:string):Promise<GuestRow>{
 const row=await db.prepare('SELECT version,data FROM pm_guests WHERE id=?').bind(guestId).first<Row>()
 if(!row)fail(404,'Guest not found.')
 return {...row!,guest:JSON.parse(row!.data)}
}
function active(row:GuestRow){
 if(row.guest.erased)fail(409,'An erased guest cannot be merged.')
 if(row.guest.mergedInto)fail(409,'Choose the active guest profile, not a merged alias.')
}
async function pair(db:D1Database,guestId:string,duplicateId:string){
 if(typeof guestId!=='string'||typeof duplicateId!=='string'||guestId===duplicateId)fail(400,'Choose two different guest profiles.')
 const [survivor,duplicate]=await Promise.all([guestRow(db,guestId),guestRow(db,duplicateId)])
 active(survivor);active(duplicate)
 const a=survivor.guest,b=duplicate.guest,phone=normalizedGuestPhone(a.phone),sharedPhone=!!phone&&phone===normalizedGuestPhone(b.phone),sameName=normalizedGuestName(a.name)===normalizedGuestName(b.name),sharedEmail=!!normalizedGuestEmail(a.email)&&normalizedGuestEmail(a.email)===normalizedGuestEmail(b.email)
 if(sharedPhone&&!sameName||!sharedEmail&&!(sharedPhone&&sameName))fail(409,'These profiles are not a duplicate suggestion. Shared household contacts never authorize a merge.')
 return {survivor,duplicate}
}
async function manager(db:D1Database,actor:Actor){
 if(actor.agent||!['owner','admin'].includes(actor.role))fail(403,'A venue manager is required.')
 const row=await db.prepare("SELECT version FROM oa_operators WHERE id=? AND role IN ('owner','admin') AND status='active'").bind(actor.id).first<{version:number}>()
 if(!row)fail(403,'An active venue manager is required.')
 return row!.version
}
function guard(db:D1Database,stateVersion:number,actor:Actor,actorVersion:number,rows:GuestRow[],journal?:Row&{id:string}){
 const conditions=["EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role IN ('owner','admin') AND status='active')",'EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)',...rows.map(()=> 'EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?)')]
 const values:unknown[]=[actor.id,actorVersion,stateVersion,...rows.flatMap(row=>[row.guest.id,row.version,row.data])]
 if(journal){conditions.push('EXISTS(SELECT 1 FROM pm_guest_merges WHERE id=? AND version=? AND data=?)');values.push(journal.id,journal.version,journal.data)}
 return db.prepare(`INSERT INTO pm_assertions(ok) SELECT CASE WHEN ${conditions.join(' AND ')} THEN 1 ELSE 0 END`).bind(...values)
}
function guestWrite(db:D1Database,guest:MergeGuest,row:GuestRow,version:number){
 return db.prepare('UPDATE pm_guests SET data=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(JSON.stringify(guest),guest.id,row.version,version)
}
const phoneKey=(value:string)=>normalizedGuestPhone(value)||value.trim()
/** Consent remains scoped to the original queue contact, never the survivor's phone. */
function permissionPlan(state:State,survivor:MergeGuest,duplicate:MergeGuest){
 const people=new Map([[survivor.id,survivor],[duplicate.id,duplicate]])
 const rows=state.waitlist.filter(row=>people.has(row.guestId)).map(row=>({row,phone:(row as typeof row&{contactPhone?:string}).contactPhone??people.get(row.guestId)!.phone}))
 return rows.map(({row,phone})=>{
  const shared=rows.filter(other=>phoneKey(phone)&&phoneKey(other.phone)===phoneKey(phone))
  const afterConsent=!phoneKey(phone)?undefined:shared.some(other=>other.row.contactConsent===false)?false:shared.every(other=>other.row.contactConsent===true)?true:undefined
  return {entryId:row.id,phone,contactConsent:row.contactConsent??null,afterConsent:afterConsent??null}
 })
}
function counts(state:State,ids:string[]){return Object.fromEntries(kinds.map(kind=>[kind,records(state,kind).filter(row=>ids.includes(row.guestId)).length])) as Record<MergeRecordKind,number>}
function conflicts(a:MergeGuest,b:MergeGuest){
 const facts=(g:MergeGuest)=>({name:g.name,email:g.email,phone:g.phone,notes:g.notes,tags:g.profile?.tags??[],vipLevel:g.profile?.vipLevel??'none',seatingPreference:g.profile?.seatingPreference??''})
 const left=facts(a),right=facts(b)
 return (Object.keys(left) as Array<keyof typeof left>).filter(field=>!same(left[field],right[field])).map(field=>({field,selected:left[field],candidate:right[field]}))
}
async function mergeToken(state:State,survivor:GuestRow,duplicate:GuestRow){
 return hash(canonicalJson({survivor:{version:survivor.version,guest:survivor.guest},duplicate:{version:duplicate.version,guest:duplicate.guest},records:linked(state,[survivor.guest.id,duplicate.guest.id])}))
}
export async function mergeReview(db:D1Database,state:State,guestId:string,duplicateId:string){
 const {survivor,duplicate}=await pair(db,guestId,duplicateId)
 return {guestId,duplicateId,review:await mergeToken(state,survivor,duplicate),survivor:survivor.guest,duplicate:duplicate.guest,conflicts:conflicts(survivor.guest,duplicate.guest),linkedCounts:counts(state,[guestId,duplicateId]),permissions:permissionPlan(state,survivor.guest,duplicate.guest),notice:'Selected profile values stay selected. Both originals, notes, provenance and history are retained in the private merge journal. Contact permissions stay with their original contact; restrictive or unrecorded consent is never promoted. No message is sent.'}
}
function contacts(guest:MergeGuest):GuestContact[]{
 const entries:GuestContact[]=[...(guest.contacts??[]),...(['email','phone'] as const).filter(kind=>!!guest[kind]).map(kind=>({kind,value:guest[kind],sourceGuestId:guest.id,...guest.provenance?.[kind]?{provenance:guest.provenance[kind]}:{}}))]
 return [...new Map(entries.map(entry=>[canonicalJson(entry),entry])).values()]
}
/** Prepares only; the caller commits these statements with its fenced state save. */
export async function mergeGuests(db:D1Database,state:State,version:number,actor:Actor,payload:GuestMergePayload,now:string){
 const actorVersion=await manager(db,actor)
 if(payload?.confirm!=='MERGE')fail(400,'Explicitly confirm MERGE after reviewing both profiles.')
 const {survivor,duplicate}=await pair(db,payload.guestId,payload.duplicateId)
 if(payload.review!==await mergeToken(state,survivor,duplicate))fail(409,'A guest or linked record changed. Review the merge again.')
 const beforeSurvivor=survivor.guest,beforeDuplicate=duplicate.guest
 const afterSurvivor:MergeGuest={...structuredClone(beforeSurvivor),contacts:[...contacts(beforeSurvivor),...contacts(beforeDuplicate)],history:[...(beforeSurvivor.history??[]),...(beforeDuplicate.history??[])]}
 const afterDuplicate:MergeGuest={...structuredClone(beforeDuplicate),mergedInto:beforeSurvivor.id}
 const permissions=permissionPlan(state,beforeSurvivor,beforeDuplicate)
 const snapshots:NonNullable<GuestMergeJournal['snapshots']>={guests:{survivor:{before:beforeSurvivor,after:afterSurvivor,afterVersion:survivor.version+1},duplicate:{before:beforeDuplicate,after:afterDuplicate,afterVersion:duplicate.version+1}},records:[],auditIds:state.audit.map(row=>row.id)}
 for(const row of linked(state,[beforeSurvivor.id,beforeDuplicate.id])){
  const after=structuredClone(row.record)
  after.guestId=beforeSurvivor.id
  if(row.kind==='reminders'){
   const original=row.record.guestId===beforeSurvivor.id?beforeSurvivor:beforeDuplicate
   const reminder=after as State['reminders'][number]&{contactName?:string;contactEmail?:string;contactPhone?:string}
   reminder.contactName??=original.name;reminder.contactEmail??=original.email;reminder.contactPhone??=original.phone
  }
  if(row.kind==='waitlist'){
   const permission=permissions.find(item=>item.entryId===row.id)!
   const waiting=after as State['waitlist'][number]&{contactPhone?:string}
   waiting.contactPhone=permission.phone
   if(permission.afterConsent===null)delete waiting.contactConsent
   else waiting.contactConsent=permission.afterConsent
  }
  snapshots.records.push({kind:row.kind,id:row.id,before:row.record,after})
  const collection=records(state,row.kind),index=collection.findIndex(item=>item.id===row.id)
  collection[index]=after
 }
 const journal:GuestMergeJournal={id:id(),guestId:beforeSurvivor.id,duplicateId:beforeDuplicate.id,status:'merged',createdAt:now,createdBy:actor.id,snapshots}
 const statements=[guard(db,version,actor,actorVersion,[survivor,duplicate]),guestWrite(db,afterSurvivor,survivor,version),guestWrite(db,afterDuplicate,duplicate,version),db.prepare('INSERT INTO pm_guest_merges(id,version,data) SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(journal.id,JSON.stringify(journal),version)]
 const changes:AuditChange[]=[{kind:'guests',id:beforeSurvivor.id,before:beforeSurvivor,after:afterSurvivor},{kind:'guests',id:beforeDuplicate.id,before:beforeDuplicate,after:afterDuplicate},{kind:'guestMerges',id:journal.id,before:null,after:{id:journal.id,guestId:journal.guestId,duplicateId:journal.duplicateId,status:journal.status}}]
 return {result:{id:journal.id,guestId:journal.guestId,duplicateId:journal.duplicateId,status:journal.status,linkedCounts:counts(state,[journal.guestId])},statements,changes}
}
async function journalRow(db:D1Database,mergeId:string){
 if(typeof mergeId!=='string'||!mergeId)fail(400,'Choose a merge journal entry.')
 const row=await db.prepare('SELECT version,data FROM pm_guest_merges WHERE id=?').bind(mergeId).first<Row>()
 if(!row)fail(404,'Merge journal entry not found.')
 const journal:GuestMergeJournal=JSON.parse(row!.data)
 if(journal.status==='erased'||!journal.snapshots)fail(409,'Erasure removed the merge snapshots. This merge cannot be reversed.')
 if(journal.status!=='merged')fail(409,'This merge has already been reversed.')
 return {...row!,id:mergeId,journal}
}
function planUnmerge(state:State,journal:GuestMergeJournal,survivor:GuestRow,duplicate:GuestRow){
 const snapshots=journal.snapshots!,laterRecords:GuestMergeLaterRecord[]=[],restorable:Array<{kind:MergeRecordKind|'guests';id:string}>=[]
 const baseline=new Set(snapshots.auditIds)
 const laterEvents=state.audit.filter(event=>!baseline.has(event.id)&&!(event.action==='guest.merge'&&event.subject===journal.id))
 const edited=(kind:string,id:string)=>laterEvents.some(event=>event.changes?.some(change=>change.kind===kind&&change.id===id))
 for(const [key,row] of [['survivor',survivor],['duplicate',duplicate]] as const){
  const snapshot=snapshots.guests[key]
  if(row.version===snapshot.afterVersion&&same(row.guest,snapshot.after))restorable.push({kind:'guests',id:row.guest.id})
  else laterRecords.push({kind:'guests',id:row.guest.id,reason:'edited'})
 }
 for(const snapshot of snapshots.records){
  const current=records(state,snapshot.kind).find(row=>row.id===snapshot.id)
  if(!current)laterRecords.push({kind:snapshot.kind,id:snapshot.id,reason:'missing'})
  else if(!same(current,snapshot.after)||edited(snapshot.kind,snapshot.id))laterRecords.push({kind:snapshot.kind,id:snapshot.id,reason:'edited'})
  else restorable.push({kind:snapshot.kind,id:snapshot.id})
 }
 const known=new Set(snapshots.records.map(row=>row.kind+':'+row.id))
 for(const row of linked(state,[journal.guestId,journal.duplicateId]))if(!known.has(row.kind+':'+row.id))laterRecords.push({kind:row.kind,id:row.id,reason:'created'})
 return {restorable,laterRecords,laterEvents}
}
async function unmergeContext(db:D1Database,state:State,mergeId:string){
 const row=await journalRow(db,mergeId),journal=row.journal
 const [survivor,duplicate]=await Promise.all([guestRow(db,journal.guestId),guestRow(db,journal.duplicateId)])
 if(survivor.guest.erased||duplicate.guest.erased)fail(409,'An erased guest prevents reversal of this merge.')
 if(survivor.guest.mergedInto||duplicate.guest.mergedInto!==survivor.guest.id)fail(409,'A later merge changed these identities. Reverse the later merge first.')
 const plan=planUnmerge(state,journal,survivor,duplicate)
 const review=await hash(canonicalJson({journal:{version:row.version,data:journal},survivor,duplicate,records:linked(state,[journal.guestId,journal.duplicateId]),laterEvents:plan.laterEvents}))
 return {row,journal,survivor,duplicate,plan,review}
}
export async function unmergeReview(db:D1Database,state:State,mergeId:string){
 const {journal,plan,review}=await unmergeContext(db,state,mergeId)
 return {mergeId,guestId:journal.guestId,duplicateId:journal.duplicateId,review,restorable:plan.restorable,laterRecords:plan.laterRecords,notice:'Only records unchanged since the merge are restored. Later edits and new records stay as they are and require manual assignment. Restrictive or unrecorded queue contact permissions remain restrictive. No message is sent.'}
}
export async function unmergeGuests(db:D1Database,state:State,version:number,actor:Actor,payload:GuestUnmergePayload,now:string){
 const actorVersion=await manager(db,actor)
 if(payload?.confirm!=='UNMERGE')fail(400,'Explicitly confirm UNMERGE after reviewing the reversal.')
 const {row,journal,survivor,duplicate,plan,review}=await unmergeContext(db,state,payload.mergeId)
 if(payload.review!==review)fail(409,'The guest, journal or linked records changed. Review the reversal again.')
 const statements=[guard(db,version,actor,actorVersion,[survivor,duplicate],row)],changes:AuditChange[]=[]
 for(const [key,current] of [['survivor',survivor],['duplicate',duplicate]] as const)if(plan.restorable.some(item=>item.kind==='guests'&&item.id===current.guest.id)){
  const restored=structuredClone(journal.snapshots!.guests[key].before)
  statements.push(guestWrite(db,restored,current,version))
  changes.push({kind:'guests',id:current.guest.id,before:current.guest,after:restored})
 }
 for(const snapshot of journal.snapshots!.records)if(plan.restorable.some(item=>item.kind===snapshot.kind&&item.id===snapshot.id)){
  const restored=structuredClone(snapshot.before)
  if(snapshot.kind==='reminders'){
   const after=snapshot.after as State['reminders'][number]&{contactName?:string;contactEmail?:string;contactPhone?:string}
   const reminder=restored as typeof after
   reminder.contactName=after.contactName;reminder.contactEmail=after.contactEmail;reminder.contactPhone=after.contactPhone
  }
  if(snapshot.kind==='waitlist'){
   const after=snapshot.after as State['waitlist'][number]&{contactPhone?:string},waiting=restored as typeof after
   waiting.contactPhone=after.contactPhone
   // Reversal of identity is never a reversal of a restrictive permission decision.
   if(after.contactConsent===false)waiting.contactConsent=false
   else if(after.contactConsent!==true)delete waiting.contactConsent
  }
  const collection=records(state,snapshot.kind),index=collection.findIndex(item=>item.id===snapshot.id)
  collection[index]=restored
 }
 journal.status='unmerged';journal.unmergedAt=now;journal.unmergedBy=actor.id;journal.pendingAssignment=plan.laterRecords
 statements.push(db.prepare('UPDATE pm_guest_merges SET version=version+1,data=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(JSON.stringify(journal),journal.id,row.version,version))
 changes.push({kind:'guestMerges',id:journal.id,before:{status:'merged'},after:{status:'unmerged',pendingAssignment:plan.laterRecords}})
 return {result:{id:journal.id,guestId:journal.guestId,duplicateId:journal.duplicateId,status:journal.status,restored:plan.restorable.length,laterRecords:plan.laterRecords},statements,changes}
}
