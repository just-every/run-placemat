import { guestIdentityHashes } from './identity'
import { canonicalJson, type D1TargetAdapter, type TargetRow, type D1Sql } from './kit'

export const DESTINATION='placemat'
export const NAMESPACE='tablein-documented-csv'
export const MAPPING_VERSION='tablein-guests-history-v1'
const sql=(sql:string,...params:any[]):D1Sql=>({sql,params})
const revisionSql="CASE WHEN r.native_version=g.version THEN r.revision ELSE 'native:'||g.version END"
export const normalizedPhoneSql="(WITH RECURSIVE digits(rest,out) AS (SELECT coalesce(json_extract(data,'$.phone'),''),'' UNION ALL SELECT substr(rest,2),out||CASE WHEN substr(rest,1,1) GLOB '[0-9]' THEN substr(rest,1,1) ELSE '' END FROM digits WHERE length(rest)>0) SELECT out FROM digits WHERE rest='' LIMIT 1)"
const nativeVersion=(revision:string)=>revision.startsWith('native:')?Number(revision.slice(7)):parseInt(revision.slice(0,12),16)
function check(destination:string,kind:string){if(destination!==DESTINATION||kind!=='guest')throw new Error('IMPORT_TARGET_SCOPE')}
function decode(row:any):TargetRow{return {destination:DESTINATION,targetKind:'guest',targetId:row.id,revision:row.revision,value:JSON.parse(row.data)}}

export const guestTargets:D1TargetAdapter={
 async read(db,destination,kind,id){check(destination,kind);const row=await db.prepare(`SELECT g.id,g.data,${revisionSql} AS revision FROM pm_guests g LEFT JOIN pm_import_guest_revisions r ON r.guest_id=g.id WHERE g.id=? AND coalesce(json_extract(g.data,'$.erased'),0)!=1`).bind(id).first();return row?decode(row):undefined},
 matches(row,destination,kind,id){
  check(destination,kind)
  if(!row)return sql("NOT EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND coalesce(json_extract(data,'$.erased'),0)!=1) AND NOT EXISTS(SELECT 1 FROM pm_import_guest_revisions WHERE guest_id=?)",id,id)
  // json_tree compares every field and array position regardless of object key order.
  const value=canonicalJson(row.value)
  return sql(`EXISTS(SELECT 1 FROM pm_guests g LEFT JOIN pm_import_guest_revisions r ON r.guest_id=g.id WHERE g.id=? AND g.version=? AND ${revisionSql}=? AND NOT EXISTS(SELECT fullkey,type,atom FROM json_tree(g.data) EXCEPT SELECT fullkey,type,atom FROM json_tree(?)) AND NOT EXISTS(SELECT fullkey,type,atom FROM json_tree(?) EXCEPT SELECT fullkey,type,atom FROM json_tree(g.data)))`,id,nativeVersion(row.revision),row.revision,value,value)
 },
 matchesCount(count,destination){check(destination,'guest');return sql("(SELECT COUNT(*) FROM pm_guests WHERE coalesce(json_extract(data,'$.erased'),0)!=1)=?",count)},
 write(row){
  check(row.destination,row.targetKind)
  const version=nativeVersion(row.revision),guest=row.value as any,hashes=guestIdentityHashes(guest)
  const allowed="NOT EXISTS(SELECT 1 FROM pm_erased WHERE identity_hash IN (SELECT value FROM json_each(?))) AND NOT EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND coalesce(json_extract(data,'$.erased'),0)=1)"
  return [sql(`INSERT INTO pm_guests(id,version,data) SELECT ?,?,? WHERE CASE WHEN (${allowed}) THEN 1 ELSE json('IMPORT_CONTACT_OR_ERASURE_CONFLICT') END ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data`,row.targetId,version,canonicalJson(row.value),JSON.stringify(hashes),row.targetId),sql('INSERT INTO pm_import_guest_revisions(guest_id,revision,native_version) VALUES(?,?,?) ON CONFLICT(guest_id) DO UPDATE SET revision=excluded.revision,native_version=excluded.native_version',row.targetId,row.revision,version)]
 },
 remove(destination,kind,id){check(destination,kind);return [sql('DELETE FROM pm_import_guest_revisions WHERE guest_id=?',id),sql('DELETE FROM pm_guests WHERE id=?',id)]},
 async list(db,destination){check(destination,'guest');const {results}=await db.prepare(`SELECT g.id,g.data,${revisionSql} AS revision FROM pm_guests g LEFT JOIN pm_import_guest_revisions r ON r.guest_id=g.id WHERE coalesce(json_extract(g.data,'$.erased'),0)!=1`).all();return results.map(decode)}
}
