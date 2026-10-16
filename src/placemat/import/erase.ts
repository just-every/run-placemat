import { canonicalJson,eraseD1ImportTarget,upgradeD1ImportErasureIndex, type D1Database,type D1Sql } from './kit'
import { contextWithAuthority,requireOwner } from './context'
import { guestIdentityHashes, importedGuestId } from './identity'
import { Problem,type Actor,type Guest } from '../model'

/** Caller authorizes the native request; current operator authority is fenced in SQL. */
export async function eraseImportedGuest(db:D1Database,guestId:string,actor:Actor,extraStatements:D1Sql[]=[]){
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
 const statements:D1Sql[]=[guard,...hashes.map(hash=>({sql:'INSERT OR IGNORE INTO pm_erased(identity_hash,erased_at) VALUES(?,?)',params:[hash,at]})),{sql:'UPDATE pm_guests SET version=version+1,data=? WHERE id=?',params:[canonicalJson(erased),guestId]},{sql:'DELETE FROM pm_import_guest_revisions WHERE guest_id=?',params:[guestId]},...extraStatements]
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
