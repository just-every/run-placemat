import { Buffer } from 'node:buffer'
import { parseCsv } from './csv'
import { canonicalJson, sha256, planD1Import, type D1ImportContext, type Diagnostic, type SourceBundle, type Json } from './kit'
import { NAMESPACE, MAPPING_VERSION, normalizedPhoneSql } from './adapter'
import { importedGuestId, guestIdentityHashes } from './identity'
import type { Guest, GuestFieldProvenance } from '../model'

const statuses=new Set(['booked','seated','completed','cancelled','no-show'])
export async function reviewCsv(csv:string,context:D1ImportContext){
 const rows=parseCsv(csv), diagnostics:Diagnostic[]=[], groups=new Map<string,{guest:Guest;row:number;sourceId:string}>(), artifactHash=sha256(csv)
 const diagnostic=(severity:'warning'|'error',code:string,message:string,row?:number)=>diagnostics.push({severity,code,message,...row?{location:{artifact:'tablein-guests.csv',row}}:{}})
 diagnostic('warning','SHAPE_ONLY','This kit supports the documented fixture shape only; it has not been verified against a real Tablein customer export.')
 if(!rows.length)diagnostic('error','EMPTY_CSV','CSV contains no guest rows.')
 for(const [index,cells] of rows.entries()){
  const line=index+2
  if(cells.length!==8){diagnostic('error','COLUMN_COUNT','Every data row must have eight fields.',line);continue}
  const [sourceId,name,emailRaw,phoneRaw,notes,date,partyRaw,status]=cells.map(v=>v.trim()), email=emailRaw.toLowerCase(),phone=phoneRaw
  if(!sourceId||sourceId.length>100||!name||name.length>200||email.length>254||phone.length>80||notes.length>4000){diagnostic('error','INVALID_GUEST','Guest ID/name is missing or a guest field exceeds its documented limit.',line);continue}
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){diagnostic('error','INVALID_EMAIL','Email has an invalid shape.',line);continue}
  if(phone&&!/^[+()\d\s.-]+$/.test(phone)){diagnostic('error','INVALID_PHONE','Phone must contain a dialable number.',line);continue}
  const provenance:GuestFieldProvenance={source:'imported',actor:null,at:null,reference:artifactHash+':'+sourceId}
  const guest:Guest={id:importedGuestId(sourceId),name,email,phone,notes,history:[],provenance:{name:provenance,...email?{email:provenance}:{},...phone?{phone:provenance}:{},...notes?{notes:provenance}:{}}}
  const prior=groups.get(sourceId)
  if(prior){const {history:_,...a}=prior.guest,{history:__,...b}=guest;if(canonicalJson(a)!==canonicalJson(b)){diagnostic('error','CONFLICTING_GUEST','Repeated guest_id has different contact details or notes.',line);continue}}
  const group=prior??{guest,row:line,sourceId};groups.set(sourceId,group)
  if(!email&&!phone&&!prior)diagnostic('warning','NO_CONTACT','Guest has no email or phone; future matching uses its guest_id only.',line)
  if(date||partyRaw||status){
   const partySize=Number(partyRaw)
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||!Number.isInteger(partySize)||partySize<1||partySize>100||!statuses.has(status)){diagnostic('error','INVALID_HISTORY','History requires a valid YYYY-MM-DD date, party size 1–100 and supported status.',line);continue}
   const visit={date,partySize,status}
   if(group.guest.history!.some(v=>canonicalJson(v)===canonicalJson(visit)))diagnostic('warning','DUPLICATE_VISIT','Identical history row was consolidated.',line)
   else group.guest.history!.push(visit)
  }
 }
 const contacts=new Map<string,string>()
 const bundle:SourceBundle={diagnostics,artifacts:[{name:'tablein-guests.csv',sha256:artifactHash,size:Buffer.byteLength(csv),original:{status:'available',base64:Buffer.from(csv).toString('base64')}}],records:[]}
 for(const {guest,row,sourceId} of groups.values()){
  guest.history!.sort((a,b)=>a.date.localeCompare(b.date)||a.partySize-b.partySize||a.status.localeCompare(b.status))
  const hashes=guestIdentityHashes(guest)
  for(const hash of hashes){const prior=contacts.get(hash);if(prior&&prior!==guest.id)diagnostic('error','DUPLICATE_CONTACT','Different guest IDs share a contact detail; consolidate them before importing.',row);contacts.set(hash,guest.id)}
  if(hashes.length){const erased=await context.storage.database.prepare('SELECT identity_hash FROM pm_erased WHERE identity_hash IN (SELECT value FROM json_each(?)) LIMIT 1').bind(JSON.stringify(hashes)).first();if(erased)diagnostic('error','ERASED_IDENTITY','An erased contact cannot be reimported.',row)}
  const current=await context.storage.targets.read(context.storage.database,context.destination,'guest',guest.id)
  const recordId=artifactHash+':'+sourceId
  if(current){
   const identity=sha256(canonicalJson([context.destination,NAMESPACE,'guest',recordId]))
   const claim=await context.storage.database.prepare('SELECT identity FROM ik_sources WHERE identity=?').bind(identity).first()
   if(!claim||canonicalJson(current.value)!==canonicalJson(guest))diagnostic('error','EXISTING_GUEST','This guest already exists or was edited. Move-in never overwrites an existing guest.',row)
  }
  // Contact collisions with another native guest are fenced again by the adapter.
  if(guest.email||guest.phone){const native=await context.storage.database.prepare(`SELECT id FROM pm_guests WHERE id!=? AND ((?!='' AND lower(trim(json_extract(data,'$.email')))=?) OR (?!='' AND ${normalizedPhoneSql}=?)) LIMIT 1`).bind(guest.id,guest.email,guest.email,guest.phone.replace(/\D/g,''),guest.phone.replace(/\D/g,'')).first();if(native)diagnostic('error','EXISTING_CONTACT','Another native guest already has this email or phone.',row)}
  bundle.records.push({namespace:NAMESPACE,kind:'guest',sourceId:recordId,payload:guest as unknown as Json,payloadHash:sha256(canonicalJson(guest)),artifactHash,location:{artifact:'tablein-guests.csv',row}})
 }
 const plan=await planD1Import(bundle,{version:MAPPING_VERSION,map:record=>({effects:[{targetKind:'guest',targetId:(record.payload as any).id,value:record.payload}]})},context)
 return {plan,preview:[...groups.values()].map(g=>g.guest),canApply:!plan.diagnostics.some(d=>d.severity==='error')}
}
