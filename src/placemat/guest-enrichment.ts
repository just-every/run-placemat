import {fail,id,type Actor,type Guest,type GuestFieldProvenance,type State} from './model'
import {hash} from './store'
import {updateGuestProfile} from './profiles'

export type EnrichmentFact={reference:string;value:string;source:string;actor:string|null;at:string|null}
export type EnrichmentCandidate={tag:string;confidence:'high';explanation:string;facts:EnrichmentFact[]}
export type GuestEnrichment={id:string;guestId:string;status:'pending'|'approved'|'rejected'|'undone'|'erased'|'archived';preparedBy:string;preparedAt:string;archivedStatus?:'pending'|'approved'|'rejected'|'undone';inputHash?:string;identityHash?:string;review?:string;candidates?:EnrichmentCandidate[];unknown?:string[];decidedBy?:string;decidedAt?:string;addedTags?:string[];undoneBy?:string;undoneAt?:string;removedTags?:string[];preservedTags?:string[]}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
const reference=(proposal:GuestEnrichment)=>'guest-enrichment:'+proposal.id
const sensitive=/allerg|diet|gluten|celiac|coeliac|diabet|pregnan|religio|halal|kosher|vegan|vegetarian|medical|disab|wheelchair|peanut|shellfish|nut.free|health/i
const occasions=new Map([['anniversary','Occasion: anniversary'],['birthday','Occasion: birthday'],['graduation','Occasion: graduation']])
const preferences=new Map([['window','Preference: window'],['quiet','Preference: quiet'],['patio','Preference: patio']])
const normalized=(value:string)=>value.trim().toLowerCase()
async function currentGuest(db:D1Database,guestId:string){
 const row=await db.prepare('SELECT version,data FROM pm_guests WHERE id=?').bind(guestId).first<{version:number;data:string}>()
 if(!row)fail(404,'Guest not found.')
 const guest:Guest=JSON.parse(row!.data)
 if(guest.erased||guest.mergedInto)fail(409,'An erased or merged identity cannot be enriched.')
 return {row:row!,guest}
}
async function identityHash(db:D1Database,guestId:string){
 const rows=await db.prepare("SELECT id,version FROM pm_guest_merges WHERE json_extract(data,'$.guestId')=? OR json_extract(data,'$.duplicateId')=? ORDER BY id").bind(guestId,guestId).all()
 return hash(JSON.stringify(rows.results))
}
/** Only structured, allowlisted facts qualify. Free notes never establish a condition. */
async function describe(db:D1Database,s:State,guestId:string,now:string){
 const {row,guest}=await currentGuest(db,guestId),identity=await identityHash(db,guestId)
 const bookings=s.bookings.filter(b=>b.guestId===guestId)
 const events=(s.serviceEvents??[]).filter(e=>bookings.some(b=>b.id===e.bookingId))
 const attended=bookings.filter(b=>['seated','completed'].includes(b.status)&&b.startAt<=now&&events.some(e=>e.bookingId===b.id&&e.at<=now&&['seated','completed'].includes(e.after.bookingStatus)))
 const candidates:EnrichmentCandidate[]=[],unknown=[
  'Free notes are ambiguous and are never used to infer dietary, medical, religious or accessibility conditions.',
  'Spend and refunded spend are unknown. No connected spend records are available, so no spend segment is proposed.',
  'Tags grant no consent, group sharing, audience membership, outbound send or unattended execution authority.',
 ]
 const add=(tag:string,fact:EnrichmentFact,explanation:string)=>{
  if(sensitive.test(fact.value)||guest.profile?.tags.some(value=>normalized(value)===normalized(tag)))return
  const existing=candidates.find(c=>c.tag===tag)
  if(existing)existing.facts.push(fact)
  else candidates.push({tag,confidence:'high',explanation,facts:[fact]})
 }
 const pref=guest.profile?.seatingPreference??'',origin=guest.profile?.provenance.seatingPreference
 if(preferences.has(normalized(pref))&&origin)add(preferences.get(normalized(pref))!,{reference:'guest:'+guest.id+':seatingPreference',value:pref,source:origin.source,actor:origin.actor,at:origin.at},'Exact recorded seating preference; this is a preference, not a guarantee.')
 for(const b of attended){
  for(const [field,values] of [['occasion',occasions],['seatingPreference',preferences]] as const){
   const value=b.requests?.[field]??''
   if(values.has(normalized(value)))add(values.get(normalized(value))!,{reference:'booking:'+b.id+':'+field,value,source:'recorded booking request',actor:null,at:b.createdAt},'Exact structured request on a native attended visit; no inference from notes.')
  }
 }
 if(attended.length>=2&&!guest.profile?.tags.some(t=>normalized(t)==='repeat visitor'))candidates.push({tag:'Repeat visitor',confidence:'high',explanation:`${attended.length} native attended visits. Cancelled, no-show, future and imported visits do not establish attendance.`,facts:attended.map(b=>{
  const event=events.findLast(e=>e.bookingId===b.id&&e.at<=now&&['seated','completed'].includes(e.after.bookingStatus))!
  return {reference:'booking:'+b.id+':event:'+event.id,value:b.startAt,source:event.source,actor:event.actor,at:event.at}
 })})
 if(!candidates.length)unknown.push('No new supported tags. Unrecognized free text and missing provenance remain unknown.')
 const inputHash=await hash(JSON.stringify({guestVersion:row.version,guest,bookings,events,attended:attended.map(b=>b.id),identity}))
 return {guest,inputHash,identity,candidates,unknown}
}
/** Recheck live authority in the same atomic batch as every enrichment write. */
function authorityFence(db:D1Database,actor:Actor){
 if(actor.agent)return db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_agent_keys k JOIN oa_operators o ON o.id=k.created_by WHERE k.id=? AND k.revoked_at IS NULL AND o.role='owner' AND o.status='active') THEN 1 ELSE 0 END").bind(actor.id)
 return db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role=? AND role IN ('owner','admin') AND status='active') THEN 1 ELSE 0 END").bind(actor.id,actor.role)
}
export async function executeEnrichment(db:D1Database,s:State,actor:Actor,command:string,p:any,version:number,now:string){
 if(actor.deviceId||!actor.agent&&!['owner','admin'].includes(actor.role))fail(403,'A personal venue owner or administrator must review enrichment.')
 if(actor.agent&&command!=='guest.enrichment.prepare')fail(403,'Preparation keys cannot decide or undo enrichment.')
 const statements=[authorityFence(db,actor)]
 if(command!=='guest.enrichment.prepare'&&Object.keys(p).some(key=>!['proposalId','review','confirm'].includes(key)))fail(400,'Decide only the exact recorded proposal.')
 const rows=s.guestEnrichments??=[]
 let proposal:GuestEnrichment,change:import('./audit').AuditChange|undefined
 if(command==='guest.enrichment.prepare'){
  if(Object.keys(p).some(key=>key!=='guestId'))fail(400,'Preparation accepts only the guest identity; proposed tags come from recorded facts.')
  const details=await describe(db,s,p.guestId,now)
  const prepared=await currentGuest(db,p.guestId)
  statements.push(db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?) THEN 1 ELSE 0 END').bind(p.guestId,prepared.row.version,JSON.stringify(details.guest)))
  proposal={id:id(),guestId:p.guestId,status:'pending',preparedBy:actor.id,preparedAt:now,inputHash:details.inputHash,identityHash:details.identity,candidates:details.candidates,unknown:details.unknown}
  proposal.review=await hash(JSON.stringify(proposal))
  rows.push(proposal)
 }else{
  proposal=rows.find(row=>row.id===p.proposalId)??fail(404,'Enrichment proposal not found.')
  if(p.review!==proposal.review)fail(409,'Review the exact recorded proposal before deciding.')
  await currentGuest(db,proposal.guestId)
  if(command==='guest.enrichment.undo'){
   if(p.confirm!=='UNDO')fail(400,'Explicitly confirm UNDO for this enrichment.')
   if(proposal.status!=='approved')fail(409,'Only a currently approved enrichment can be undone once.')
   if(proposal.identityHash!==await identityHash(db,proposal.guestId))fail(409,'The reviewed identity changed. Enrichment cannot be replayed after a merge or reversal.')
   const {guest}=await currentGuest(db,proposal.guestId),profile=guest.profile
   const removed=(proposal.addedTags??[]).filter(tag=>profile?.tags.includes(tag)&&profile.tagProvenance?.[tag]?.reference===reference(proposal))
   const update=await updateGuestProfile(db,guest.id,{tags:(profile?.tags??[]).filter(tag=>!removed.includes(tag))},actor,version,now)
   statements.push(...update.statements);change={kind:'guests',id:guest.id,before:update.previous,after:structuredClone(update.guest)}
   proposal.status='undone';proposal.undoneBy=actor.id;proposal.undoneAt=now;proposal.removedTags=removed;proposal.preservedTags=(proposal.addedTags??[]).filter(tag=>!removed.includes(tag))
  }else{
   if(proposal.status!=='pending')fail(409,'This enrichment proposal has already been decided or archived.')
   const details=await describe(db,s,proposal.guestId,now)
   if(details.inputHash!==proposal.inputHash||!same(details.candidates,proposal.candidates))fail(409,'Guest facts or attendance changed. Prepare and review a new proposal.')
   if(command==='guest.enrichment.approve'){
    if(p.confirm!=='APPROVE')fail(400,'Explicitly confirm APPROVE for this exact proposal.')
    if(!proposal.candidates?.length)fail(409,'This proposal has no supported new tags.')
    const tags=[...(details.guest.profile?.tags??[]),...proposal.candidates!.map(c=>c.tag)]
    const update=await updateGuestProfile(db,proposal.guestId,{tags},actor,version,now)
    const provenance:GuestFieldProvenance={source:'staff-observed',actor:actor.id,at:now,reference:reference(proposal)}
    for(const candidate of proposal.candidates!)update.guest.profile!.tagProvenance![candidate.tag]=provenance
    // The existing profile helper owns validation and the guest version fence.
    update.statements[1]=db.prepare('UPDATE pm_guests SET data=?,version=version+1 WHERE id=?').bind(JSON.stringify(update.guest),update.guest.id)
    statements.push(...update.statements);change={kind:'guests',id:update.guest.id,before:update.previous,after:structuredClone(update.guest)}
    proposal.status='approved';proposal.addedTags=proposal.candidates!.map(c=>c.tag)
   }else if(command==='guest.enrichment.reject')proposal.status='rejected'
   else fail(400,'Unknown enrichment decision.')
   proposal.decidedBy=actor.id;proposal.decidedAt=now
  }
 }
 return {proposal,statements,change}
}
