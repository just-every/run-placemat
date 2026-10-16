import type { D1Database } from './kit'

/** Plain-language refusal for an undo blocked by a later edit. Names only the
 * guests this import added and staff have since edited; never ids or hashes. */
export async function editedAfterImport(db:D1Database,jobId:string):Promise<string>{
 const {results}=await db.prepare("SELECT json_extract(g.data,'$.name') AS name FROM ik_provenance p JOIN pm_guests g ON g.id=p.target_id JOIN pm_import_guest_revisions r ON r.guest_id=g.id WHERE p.job_id=? AND p.target_kind='guest' AND p.reversed=0 AND r.native_version<>g.version AND coalesce(json_extract(g.data,'$.erased'),0)=0 ORDER BY name LIMIT 20").bind(jobId).all<{name:string}>()
 const names=results.map(r=>`“${r.name}”`)
 const who=names.length===0?'An imported guest':names.length===1?names[0]:`${names.length} imported guests (${names.slice(0,2).join(', ')}${names.length>2?` and ${names.length-2} more`:''})`
 return `Nothing was undone. ${who} ${names.length>1?'were':'was'} edited after this import, so undoing it would lose ${names.length>1?'those edits':'that edit'}. The edit${names.length>1?'s have':' has'} been kept and the imported guests are unchanged. Leave the import as it is, or erase the guest from Guests if their details should go.`
}
