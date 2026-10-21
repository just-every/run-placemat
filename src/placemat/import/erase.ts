import {guestStateErasure} from '../guest-state-erasure'
import { canonicalJson,eraseD1ImportTarget,upgradeD1ImportErasureIndex, type D1Database,type D1Sql } from './kit'
import { contextWithAuthority,requireOwner } from './context'
import { guestIdentityHashes, importedGuestId } from './identity'
import { Problem,type Actor,type Guest } from '../model'

/** An active merge represents one reviewed identity; erase all its aliases together.
 * Reversed profiles remain separate. Their shared historical snapshots are purged.
 */
export async function eraseImportedGuest(db:D1Database,guestId:string,actor:Actor){
 requireOwner(actor)
 const floor=await db.prepare('SELECT version FROM pm_state WHERE id=1').first()
 const rows=(await db.prepare('SELECT id,version,data FROM pm_guest_merges').all()).results as Array<{id:string;version:number;data:string}>
 const journals=rows.map(row=>({...row,journal:JSON.parse(row.data)}))
 const ids=new Set([guestId])
 const people=(await db.prepare('SELECT data FROM pm_guests').all()).results.map(row=>JSON.parse(row.data) as Guest)
 for(let changed=true;changed;){
  changed=false
  for(const {journal:j} of journals)if(j.status==='merged'&&(ids.has(j.guestId)||ids.has(j.duplicateId)))for(const id of [j.guestId,j.duplicateId])if(!ids.has(id)){ids.add(id);changed=true}
  // A later-edited survivor can still hold a reviewed identity after reversal.
  // Its contact provenance identifies that unresolved joint profile explicitly.
  for(const g of people)if(!g.erased&&(ids.has(g.id)||(g.contacts??[]).some(c=>ids.has(c.sourceGuestId))))for(const id of [g.id,...(g.contacts??[]).map(c=>c.sourceGuestId)])if(!ids.has(id)){ids.add(id);changed=true}
 }
 const related=journals.filter(({journal:j})=>ids.has(j.guestId)||ids.has(j.duplicateId))
 const floorGuard:D1Sql={sql:'INSERT INTO ik_d1_assertions(ok) SELECT CASE WHEN '+(floor?'EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)':'NOT EXISTS(SELECT 1 FROM pm_state WHERE id=1)')+' THEN 1 ELSE 0 END',params:floor?[floor.version]:[]}
 const purge:D1Sql[]=[floorGuard,...related.flatMap(row=>{
  const j={id:row.id,guestId:row.journal.guestId,duplicateId:row.journal.duplicateId,status:'erased',createdAt:row.journal.createdAt,createdBy:row.journal.createdBy,purgedAt:new Date().toISOString()}
  return [{sql:'INSERT INTO ik_d1_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_guest_merges WHERE id=? AND version=?) THEN 1 ELSE 0 END',params:[row.id,row.version]},
   {sql:'UPDATE pm_guest_merges SET version=version+1,data=? WHERE id=? AND version=?',params:[canonicalJson(j),row.id,row.version]}]
 })]
 let result={erasedRecords:0,identityHashes:[] as string[]}
 // First erase the survivor, making every active merge immediately irreversible.
 const ordered=[...ids].sort((a,b)=>Number(journals.some(({journal:j})=>j.status==='merged'&&j.duplicateId===a))-Number(journals.some(({journal:j})=>j.status==='merged'&&j.duplicateId===b)))
 for(const [index,id] of ordered.entries()){
  const erased=await eraseSingleGuest(db,id,actor,index===0?purge:[])
  result={erasedRecords:result.erasedRecords+erased.erasedRecords,identityHashes:[...new Set([...result.identityHashes,...erased.identityHashes])]}
 }
 return result
}

/** Caller authorizes the native request; current operator authority is fenced in SQL. */
async function eraseSingleGuest(db:D1Database,guestId:string,actor:Actor,extraStatements:D1Sql[]=[]){
 requireOwner(actor)
 const owner=await db.prepare("SELECT version FROM oa_operators WHERE id=? AND role='owner' AND status='active'").bind(actor.id).first()
 if(!owner)throw new Problem(403,'An active owner is required.')
 const native=await db.prepare('SELECT version,data FROM pm_guests WHERE id=?').bind(guestId).first()
 if(!native)throw new Problem(404,'Guest not found.')
 const guest=JSON.parse(native.data) as Guest,hashes=guestIdentityHashes(guest),at=new Date().toISOString()
 const context=contextWithAuthority(db,actor.id,()=>({sql:"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active' AND version=?)",params:[actor.id,owner.version]}))
 context.originalErasurePolicy='withdraw-affected-artifacts'
 const erased:Guest={id:guestId,name:'Erased guest',email:'',phone:'',notes:'',history:[],erased:true}
 const guard:D1Sql={sql:'INSERT INTO ik_d1_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?) THEN 1 ELSE 0 END',params:[guestId,native.version,native.data]}
 const statements:D1Sql[]=[guard,...extraStatements,...await guestStateErasure(db,guestId),...hashes.map(hash=>({sql:'INSERT OR IGNORE INTO pm_erased(identity_hash,erased_at) VALUES(?,?)',params:[hash,at]})),{sql:'UPDATE pm_guests SET version=version+1,data=? WHERE id=?',params:[canonicalJson(erased),guestId]},{sql:'DELETE FROM pm_import_guest_revisions WHERE guest_id=?',params:[guestId]}]
 const selected=new Set([guest.id,guest.email,guest.phone].filter(Boolean))
 const related={source:(record:any)=>{const payload=record.payload;return payload&&typeof payload==='object'&&(!Array.isArray(payload))&&(payload.id===guest.id||guestIdentityHashes(payload).some(hash=>hashes.includes(hash)))},original:(bytes:Uint8Array)=>{try{return parseOriginal(bytes,selected,hashes)}catch{return false}}}
 // Erasing older installations left some jobs unindexed; index them before this erasure.
 for(let page=await upgradeD1ImportErasureIndex(context);!page.complete;page=await upgradeD1ImportErasureIndex(context));
 const result=await eraseD1ImportTarget('guest',guestId,statements,context,related)
 return {erasedRecords:result.erasedRecords,identityHashes:hashes}
}

function parseOriginal(bytes:Uint8Array,selected:Set<string>,hashes:string[]){
 // Original artifacts are whole CSV exports. Withdraw the entire artifact when a row
 // contains this person, including exports whose source row was rejected.
 const rows=parseCsv(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
 return rows.some(row=>selected.has(importedGuestId(row[0]))||guestIdentityHashes({email:row[2],phone:row[3]}).some(hash=>hashes.includes(hash)))
}
import { parseCsv } from './csv'
