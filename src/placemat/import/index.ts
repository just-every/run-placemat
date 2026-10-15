import type { Bindings } from '../../auth.server'
import { Problem,type Actor } from '../model'
import { requestContext } from './context'
import { reviewCsv } from './plan'
import { applyD1ImportBatches,createD1ImportJob,readD1ImportJob,undoD1Import,rollbackD1Import,sha256,type D1ImportContext } from './kit'
export { eraseImportedGuest } from './erase'
export { guestIdentityHashes } from './identity'

const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
const response=(result:unknown,status=200)=>new Response(JSON.stringify({result}),{status,headers})
async function body(request:Request):Promise<Record<string,unknown>>{
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Problem(415,'Use application/json.')
 const reader=request.body?.getReader();if(!reader)throw new Problem(400,'JSON body is required.')
 const chunks:Uint8Array[]=[];let size=0
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>100*1024){await reader.cancel();throw new Problem(413,'Request exceeds 100 KiB.')}chunks.push(value)}}finally{reader.releaseLock()}
 const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all))}catch{throw new Problem(400,'Invalid JSON body.')}
 if(!value||Array.isArray(value)||typeof value!=='object')throw new Problem(400,'JSON body must be an object.')
 return value
}
function required(value:unknown,name:string,max=256):string{if(typeof value!=='string'||!value||value.length>max)throw new Problem(400,name+' is required.');return value}
async function journal(context:D1ImportContext){
 const predicate=context.authorization.predicate('read',context.destination)
 const {results}=await context.storage.database.prepare(`SELECT id FROM ik_jobs WHERE destination=? AND namespace=? AND principal_id=? AND (${predicate.sql}) ORDER BY rowid DESC LIMIT 30`).bind(context.destination,context.namespace,context.authorization.principalId,...predicate.params??[]).all()
 const jobs=[];for(const row of results)jobs.push(await readD1ImportJob(row.id,context))
 return {jobs}
}

/** Caller authenticates first. Defense here independently checks owner, session and Origin. */
export async function importResponse(request:Request,env:Bindings,actor:Actor):Promise<Response|null>{
 const path=new URL(request.url).pathname
 if(path!=='/api/import'&&!path.startsWith('/api/import/'))return null
 try{
  if(!['GET','POST'].includes(request.method))throw new Problem(405,'Method not allowed.')
  if(request.method==='POST'&&request.headers.get('Origin')!==env.AUTH_ORIGIN)throw new Problem(403,'Exact same-origin request required.')
  const context=await requestContext(request,env,actor)
  if(request.method==='GET'){
   if(path==='/api/import/journal')return response(await journal(context))
   const match=/^\/api\/import\/journal\/([a-zA-Z0-9-]+)$/.exec(path)
   if(match)return response({job:await readD1ImportJob(match[1],context)})
   throw new Problem(404,'Move-in endpoint not found.')
  }
  const input=await body(request)
  if(path==='/api/import/dry-run'||path==='/api/import/apply'){
   const csv=required(input.csv,'csv',64*1024),review=await reviewCsv(csv,context),{plan}=review
   if(path.endsWith('/dry-run'))return response({fingerprint:plan.fingerprint,counts:plan.counts,diagnostics:plan.diagnostics,preview:review.preview,canApply:review.canApply})
   if(input.confirm!==plan.fingerprint)throw new Problem(409,'Plan confirmation differs. Run dry-run again and confirm its exact fingerprint.')
   if(!review.canApply)throw new Problem(422,'Resolve every dry-run error before applying.')
   context.reviewedFingerprint=plan.fingerprint;context.operationKey=sha256('placemat-move-in:'+plan.fingerprint)
   const job=await createD1ImportJob(plan,context)
   return response({job:await applyD1ImportBatches(job.id,context)})
  }
  if(path==='/api/import/undo'){
   if(input.confirm!=='UNDO')throw new Problem(400,'Confirm undo with UNDO.')
   const jobId=required(input.jobId,'jobId'),fingerprint=required(input.fingerprint,'fingerprint')
   context.reviewedFingerprint=fingerprint
   const job=await readD1ImportJob(jobId,context)
   return response({job:await (['queued','applying','failed','rolling_back','rolled_back'].includes(job.state)?rollbackD1Import(jobId,context):undoD1Import(jobId,context))})
  }
  throw new Problem(404,'Move-in endpoint not found.')
 }catch(error){
  const message=error instanceof Error?error.message:'Move-in failed.'
  const status=error instanceof Problem?error.status:message==='IMPORT_JOB_NOT_FOUND'?404:/AUTHORIZATION|ATOMIC_GUARD/.test(message)?409:409
  return new Response(JSON.stringify({error:message}),{status,headers})
 }
}
