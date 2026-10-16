import { createPortability,readArchive,PortabilityError,type Manifest,type Part,type Closing } from '../modules/portability/index.mjs'
import policy from './archive-policy.mjs'
import { fail,Problem } from './model'
export const portability=(db:D1Database)=>createPortability({db,policy})
export async function backup(db:D1Database,actor:string){
 const service=await portability(db),id=await service.exports.create(actor)
 let status=await service.exports.advance(id,{maxParts:16})
 while(status.phase==='building')status=await service.exports.advance(id,{maxParts:16})
 if(status.phase!=='complete')fail(409,'Backup did not complete.')
 const lines=[];for await(const line of readArchive(await service.exports.download(id)))lines.push(line)
 return lines
}
const damaged='Nothing was restored. This backup file is damaged or was changed after it was downloaded, so its integrity check failed. Download a fresh backup from the original installation and try again.'
const erasedGuest='Nothing was restored. This backup was made before a guest was erased here, so restoring it would bring their personal details back. Use a backup made after the erasure.'
/** Plain-language refusals for the codes Base's portability module raises. */
function refusal(error:unknown):unknown{
 if(!(error instanceof PortabilityError))return error
 const {code,status}=error
 if(code.startsWith('target_not_empty:'))return new Problem(status,'Nothing was restored. This installation already holds venue data, and a backup only restores into an empty installation so it can never overwrite a venue in use. Start a fresh Placemat and finish its setup, then restore there.')
 if(code==='erasure_epoch'||code.startsWith('erased_row:'))return new Problem(status,erasedGuest)
 if(['part_checksum','content_checksum','archive_checksum','part_missing','parts_missing'].includes(code))return new Problem(status,damaged)
 if(code==='later_journal')return new Problem(status,'Nothing was restored. The later backup chosen for the erasure journal does not come from the same venue as this backup. Choose a newer backup downloaded from the installation that made it.')
 return error
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
 }catch(error){await service.imports.abort(id).catch(()=>{});throw refusal(error)}
}
export async function erasureCheckpoint(db:D1Database){const service=await portability(db);await db.batch([...await service.redactionStatements(),...await service.invalidateTransfersStatements()])}
