import { fail,type Actor,type Guest,type GuestFieldProvenance,type GuestProfile } from './model'

export type GuestProfileUpdate = { profileRevision?:string; tags?:string[]; vipLevel?:GuestProfile['vipLevel']; seatingPreference?:string; notes?:string }

/** Personal hosts maintain explicit profile facts; note authority stays with managers. */
export async function updateGuestProfile(db:D1Database,guestId:string,payload:GuestProfileUpdate,actor:Actor,version:number,now:string):Promise<{guest:Guest;previous:Guest;statements:D1PreparedStatement[]}>{
 if(actor.agent||actor.deviceId||!['owner','admin','host'].includes(actor.role))fail(403,'Use an authorized personal profile session.')
 const host=actor.role==='host'
 if(!payload||typeof payload!=='object'||Array.isArray(payload))fail(400,'Guest profile fields are required.')
 const allowed=host?['guestId','profileRevision','tags','vipLevel','seatingPreference']:['guestId','profileRevision','tags','vipLevel','seatingPreference','notes']
 if(Object.keys(payload).some(key=>!allowed.includes(key)))fail(host?403:400,host?'Hosts may change only tags, VIP level and seating preference.':'Unsupported guest profile field.')
 const row=await db.prepare('SELECT version,data FROM pm_guests WHERE id=?').bind(guestId).first<{version:number;data:string}>()
 if(!row)fail(404,'Guest not found.')
 const guest:Guest=JSON.parse(row!.data)
 if(guest.erased||guest.mergedInto)fail(409,'An erased or merged guest cannot be edited.')
 if((host||Object.hasOwn(payload,'profileRevision'))&&payload.profileRevision!==JSON.stringify(guest.profile??null))fail(409,'The guest profile changed. Refresh and review before saving.')
 const origin:GuestFieldProvenance={source:'staff-observed',actor:actor.id,at:now}
 const profile:GuestProfile=guest.profile??{tags:[],vipLevel:'none',seatingPreference:'',provenance:{}}
 let profileSupplied=false
 if(Object.hasOwn(payload,'tags')){
  if(!Array.isArray(payload.tags)||payload.tags.length>20||payload.tags.some(tag=>typeof tag!=='string'||!tag.trim()||tag.trim().length>40))fail(400,'Use up to 20 unique tags of 1–40 characters.')
  const tags=payload.tags!.map(tag=>tag.trim())
  if(new Set(tags.map(tag=>tag.toLowerCase())).size!==tags.length)fail(400,'Tags must be unique.')
  if(JSON.stringify(tags)!==JSON.stringify(profile.tags)){profile.tags=tags;profile.provenance.tags=origin}
  profileSupplied=true
 }
 if(Object.hasOwn(payload,'vipLevel')){
  if(!['none','regular','vip'].includes(payload.vipLevel as string))fail(400,'Choose none, regular or vip.')
  if(profile.vipLevel!==payload.vipLevel){profile.vipLevel=payload.vipLevel!;profile.provenance.vipLevel=origin}
  profileSupplied=true
 }
 if(Object.hasOwn(payload,'seatingPreference')){
  if(typeof payload.seatingPreference!=='string'||payload.seatingPreference.length>500)fail(400,'Seating preference must be at most 500 characters.')
  if(profile.seatingPreference!==payload.seatingPreference){profile.seatingPreference=payload.seatingPreference!;profile.provenance.seatingPreference=origin}
  profileSupplied=true
 }
 if(profileSupplied)guest.profile=profile
 if(Object.hasOwn(payload,'notes')){
  if(typeof payload.notes!=='string'||payload.notes.length>4000)fail(400,'Notes must be at most 4000 characters.')
  if(guest.notes!==payload.notes){
   // Preserve a dated prior note if it predates the history mechanism. Unknown
   // legacy sources remain unknown rather than acquiring today's timestamp.
   const previous=guest.provenance?.notes
   const history=guest.notesHistory??[]
   if(previous?.at&&!history.some(entry=>entry.notes===guest.notes&&entry.provenance.at===previous.at&&entry.provenance.actor===previous.actor))history.push({notes:guest.notes,provenance:previous})
   guest.notes=payload.notes!
   guest.provenance={...guest.provenance,notes:origin}
   history.push({notes:guest.notes,provenance:origin})
   guest.notesHistory=history
  }
 }
 const statements=[
  db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=? AND o.status='active' AND ((?=0 AND o.role IN ('owner','admin')) OR (?=1 AND o.role='member' AND EXISTS(SELECT 1 FROM pm_state s,json_each(s.data,'$.hostIds') h WHERE s.id=1 AND s.version=? AND h.value=o.id)))) THEN 1 ELSE 0 END").bind(actor.id,host?1:0,host?1:0,version),
  db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?) AND EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) THEN 1 ELSE 0 END').bind(guest.id,row!.version,row!.data,version),
  db.prepare('UPDATE pm_guests SET data=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(JSON.stringify(guest),guest.id,row!.version,version),
 ]
 return {guest,previous:JSON.parse(row!.data),statements}
}
