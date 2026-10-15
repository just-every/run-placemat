import { createPortability,readArchive,type Manifest,type Part,type Closing } from '../modules/portability/index.mjs'
import policy from './archive-policy.mjs'
import { fail } from './model'
export const portability=(db:D1Database)=>createPortability({db,policy})
export async function backup(db:D1Database,actor:string){
 const service=await portability(db),id=await service.exports.create(actor)
 let status=await service.exports.advance(id,{maxParts:16})
 while(status.phase==='building')status=await service.exports.advance(id,{maxParts:16})
 if(status.phase!=='complete')fail(409,'Backup did not complete.')
 const lines=[];for await(const line of readArchive(await service.exports.download(id)))lines.push(line)
 return lines
}
export async function restore(db:D1Database,archive:any,actor:string,journal?:any){
 if(!Array.isArray(archive)||archive.length<2||archive[0]?.product!=='hospitality/placemat')fail(400,'Choose a Placemat backup array.')
 // A staff read may have created an empty state row. Remove only that empty
 // product row; actual product rows and every erasure fence remain untouched.
 await db.prepare("DELETE FROM pm_state WHERE json_array_length(data,'$.tables')=0 AND json_array_length(data,'$.services')=0 AND json_array_length(data,'$.bookings')=0 AND json_array_length(data,'$.proposals')=0 AND json_array_length(data,'$.waitlist')=0 AND json_array_length(data,'$.audit')=0").run()
 const service=await portability(db),manifest=archive[0] as Manifest,closing=archive.at(-1) as Closing
 const later=journal?.[0]
 if(journal!==undefined&&(!Array.isArray(journal)||later?.product!=='hospitality/placemat'||later?.kind!=='manifest'))fail(400,'Choose a trusted later Placemat backup for the erasure journal.')
 const id=await service.imports.create(manifest,actor)
 try{
  for(const part of archive.slice(1,-1) as Part[])await service.imports.uploadPart(id,part.index,part)
  return await service.imports.finalize(id,{archiveHash:closing.archiveHash,contentHash:closing.contentHash,...(later?{laterJournal:{sourceIdentity:later.sourceIdentity,epoch:later.epoch,journal:later.journal}}:{})})
 }catch(error){await service.imports.abort(id).catch(()=>{});throw error}
}
export async function erasureCheckpoint(db:D1Database){const service=await portability(db);await db.batch([...await service.redactionStatements(),...await service.invalidateTransfersStatements()])}
