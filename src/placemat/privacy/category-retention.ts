import {fail,id,type Actor,type Guest,type GuestFieldProvenance,type State} from '../model'
import {hash,load,save} from '../store'
import {portability} from '../backup'
import {expireGuestNotes,type DatedGuestNote} from '../profiles'
import {expireGuestNoteAudit} from '../audit'
import {event,guestRow,policy} from './store'

const dated=(p:GuestFieldProvenance|undefined)=>p?.source==='staff-observed'&&!!p.actor&&typeof p.at==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(p.at)&&Number.isFinite(Date.parse(p.at))
function entries(guest:Guest){
 const notes=(guest.notesHistory??[]).flatMap((n,index)=>n.notes?[{key:'history-'+index,...n,current:false}]:[])
 if(guest.notes){
  const current=notes.findLast(n=>n.notes===guest.notes&&n.provenance?.at===guest.provenance?.notes?.at&&n.provenance?.actor===guest.provenance?.notes?.actor&&n.provenance?.source===guest.provenance?.notes?.source)
  if(current)current.current=true
  else notes.push({key:'current',notes:guest.notes,provenance:guest.provenance?.notes!,current:true})
 }
 return notes
}
function activeWork(state:State,guestId:string){
 const bookings=state.bookings.filter(b=>b.guestId===guestId),ids=new Set(bookings.map(b=>b.id))
 return bookings.some(b=>['booked','seated'].includes(b.status)||(b.handover??[]).some(t=>!t.history.some(e=>e.action==='completed')))||state.waitlist.some(w=>w.guestId===guestId&&(['waiting','queued','offered','accepted','arrived'].includes(w.status)||(w.followUps??[]).some(t=>t.status!=='completed')))||(state.inquiries??[]).some(i=>i.guestId===guestId&&!['converted','closed'].includes(i.status))||(state.riskDecisions??[]).some(d=>ids.has(d.bookingId)&&d.decision==='accepted'&&!d.completedAt)||(state.serviceChanges??[]).some(c=>c.tasks.some(t=>ids.has(t.bookingId)&&t.status!=='resolved'))
}
async function noteReview(db:D1Database,guestId:unknown){
 const current=await policy(db);if(!current)fail(409,'Record retention periods and grounds first.')
 const row=await guestRow(db,guestId),guest:Guest=row.guest,{state,version}=await load(db)
 const imported=await db.prepare("SELECT 1 FROM pm_import_guest_revisions WHERE guest_id=? UNION SELECT 1 FROM ik_provenance WHERE target_kind='guest' AND target_id=? LIMIT 1").bind(row.id,row.id).first()
 const merges=(await db.prepare('SELECT id,version,data FROM pm_guest_merges ORDER BY id').all<{id:string;version:number;data:string}>()).results.filter(r=>{const j=JSON.parse(r.data);return j.guestId===row.id||j.duplicateId===row.id})
 const hasImport=(v:unknown):boolean=>!!v&&typeof v==='object'&&((v as {source?:unknown}).source==='imported'||Object.values(v).some(hasImport))
 const blocked=guest.erased?'Guest is erased':guest.mergedInto||merges.length||(guest.contacts??[]).some(c=>c.sourceGuestId!==guest.id)?'Import or merge lineage requires separate review':imported||hasImport(guest)?'Import or merge lineage requires separate review':activeWork(state,row.id)?'Active service work':null
 const now=Date.now(),cutoff=new Date(now-current.rules.guestNotes.days*86400000).toISOString()
 const notes=entries(guest).map(n=>{const known=dated(n.provenance),expired=known&&Date.parse(n.provenance.at!)<=Date.parse(cutoff);return {...n,eligible:!blocked&&!!expired,reason:blocked??(!known?'Original native date not recorded':expired?'Guest-note period elapsed':'Guest-note period has not elapsed')}})
 const fingerprint=await hash(JSON.stringify({category:'guestNotes',policyVersion:current.version,floorVersion:version,guestVersion:row.version,data:row.data,merges,imported:!!imported,notes:notes.map(n=>[n.key,n.eligible]),day:new Date(now).toISOString().slice(0,10)}))
 return {row,state,review:{guestId:row.id,name:guest.name,policyVersion:current.version,guestVersion:row.version,floorVersion:version,days:current.rules.guestNotes.days,ground:current.rules.guestNotes.ground,cutoff,notes,fingerprint,notice:'Only selected expired native notes are removed, including their history and audit copies. Identity, contacts, consent, other content and money remain. No provider request is sent.'}}
}
export async function reviewNoteRetention(db:D1Database,guestId:unknown){return (await noteReview(db,guestId)).review}

/** The content change, attribution, restore fence and transfer invalidation are one transaction. */
export async function runNoteRetention(db:D1Database,actor:Actor,p:any){
 if(p.confirm!=='EXPIRE'||!Array.isArray(p.noteKeys)||!p.noteKeys.length||new Set(p.noteKeys).size!==p.noteKeys.length)fail(400,'Select reviewed notes and type EXPIRE.')
 const {row,state,review}=await noteReview(db,p.guestId)
 if(p.fingerprint!==review.fingerprint)fail(409,'Guest, service work or retention review changed. Review again.')
 const selected=review.notes.filter(n=>p.noteKeys.includes(n.key))
 if(selected.length!==p.noteKeys.length||selected.some(n=>!n.eligible))fail(409,'Every selected note must have an expired original native date and no active work or import or merge lineage.')
 const owner=await db.prepare("SELECT version FROM oa_operators WHERE id=? AND role='owner' AND status='active'").bind(actor.id).first<{version:number}>()??fail(403,'Use an active personal owner session.')
 if(actor.agent||actor.deviceId)fail(403,'Use an active personal owner session.')
 const guest:Guest=structuredClone(row.guest),expired:DatedGuestNote[]=selected.map(n=>({notes:n.notes,provenance:n.provenance})),at=new Date().toISOString(),receipt=id()
 expireGuestNotes(guest,expired);expireGuestNoteAudit(state,row.id,expired)
 const details={guestId:row.id,category:'guestNotes',policyVersion:review.policyVersion,guestVersion:review.guestVersion,expired: selected.map(n=>({key:n.key,at:n.provenance.at,actor:n.provenance.actor,source:n.provenance.source,current:n.current}))}
 state.audit.push({id:receipt,at,actor:actor.id,source:'person',action:'privacy.notes-expired',subject:row.id,changes:[{kind:'guest-note-expiry',id:receipt,before:null,after:details}]})
 const transfer=await portability(db)
 await save(db,state,review.floorVersion,[
  db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active' AND version=?) AND EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?) AND EXISTS(SELECT 1 FROM pm_privacy_policy WHERE id=1 AND version=?) THEN 1 ELSE 0 END").bind(actor.id,owner.version,row.id,review.guestVersion,row.data,review.policyVersion),
  db.prepare('UPDATE pm_guests SET version=version+1,data=? WHERE id=?').bind(JSON.stringify(guest),row.id),
  event(db,actor,null,'notes.expired',details),
  ...await transfer.redactionStatements(),...await transfer.invalidateTransfersStatements(),
 ])
 return {completed:true,receipt,expired:selected.length,guestId:row.id}
}
