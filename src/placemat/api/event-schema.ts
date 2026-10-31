import {Problem,type Booking} from '../model'

export type StoredEvent={id:string;type:string;schema_version:number;payload:string;created_at:string}
type Reservation=Pick<Booking,'id'|'serviceId'|'partySize'|'startAt'|'endAt'|'status'|'source'>
type Envelope={id:string;type:string;createdAt:string}&({schemaVersion:1;reservation:Reservation}|{schemaVersion:2;data:{reservation:Reservation}})
type Check={status:'compatible';envelope:Envelope}|{status:'unsupported'|'invalid';reason:string}
const eventTypes=['reservation.created','reservation.changed','reservation.cancelled']
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)
const exact=(value:Record<string,unknown>,fields:string[])=>Object.keys(value).length===fields.length&&fields.every(field=>Object.hasOwn(value,field))
const nonempty=(value:unknown):value is string=>typeof value==='string'&&value.length>0
const timestamp=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))

/** Validate the stored envelope without changing the bytes previously signed. */
export function inspectEvent(row:StoredEvent):Check{
 if(![1,2].includes(row.schema_version))return {status:'unsupported',reason:'Install an application release supporting this stored schema before reading or explicitly delivering this event. The event has not been rewritten.'}
 const invalid=():Check=>({status:'invalid',reason:'The stored event does not match its documented anonymous schema. Restore its original installation event record from a trusted source; do not infer missing facts or alter a delivered envelope.'})
 let envelope:unknown
 try{envelope=JSON.parse(row.payload)}catch{return invalid()}
 // The current writer emits compact JSON. Reject duplicate keys and hidden raw fields
 // rather than validating only the last value while transmitting the original bytes.
 if(JSON.stringify(envelope)!==row.payload)return invalid()
 if(!object(envelope)||!exact(envelope,['id','type','schemaVersion','createdAt',row.schema_version===1?'reservation':'data'])||envelope.schemaVersion!==row.schema_version||envelope.id!==row.id||envelope.type!==row.type||envelope.createdAt!==row.created_at||!eventTypes.includes(row.type)||!timestamp(envelope.createdAt))return invalid()
 if(row.schema_version===2&&(!object(envelope.data)||!exact(envelope.data,['reservation'])))return invalid()
 const reservation=row.schema_version===1?envelope.reservation:(envelope.data as Record<string,unknown>).reservation
 if(!object(reservation)||!exact(reservation,['id','serviceId','partySize','startAt','endAt','status','source'])||!nonempty(reservation.id)||!nonempty(reservation.serviceId)||!Number.isSafeInteger(reservation.partySize)||Number(reservation.partySize)<1||!timestamp(reservation.startAt)||!timestamp(reservation.endAt)||Date.parse(reservation.startAt)>=Date.parse(reservation.endAt)||typeof reservation.status!=='string'||!['booked','seated','completed','cancelled','no-show'].includes(reservation.status)||typeof reservation.source!=='string'||!['online','phone','walk-in','waitlist'].includes(reservation.source)||(row.type==='reservation.cancelled'&&reservation.status!=='cancelled'))return invalid()
 return {status:'compatible',envelope:envelope as Envelope}
}

export function checkedEvent(row:StoredEvent):Envelope{
 const result=inspectEvent(row)
 if(result.status!=='compatible')throw new Problem(409,`Event ${row.id} has ${result.status} stored schema ${row.schema_version}. ${result.reason} Inspect the owner subscription schema report.`)
 return result.envelope
}

export function successor(envelope:Extract<Envelope,{schemaVersion:1}>){
 return {id:envelope.id,type:envelope.type,schemaVersion:2 as const,createdAt:envelope.createdAt,data:{reservation:envelope.reservation}}
}

export function eventSchema(value:unknown=1):1|2{
 if(value!==1&&value!==2)throw new Problem(400,'Choose event schemaVersion 1 or 2.')
 return value
}

/** Both versions refer to one immutable logical event; neither may widen its facts. */
function representation(row:StoredEvent,version:1|2,payload?:string){
 const original=checkedEvent(row)
 if(original.schemaVersion!==1)throw new Problem(409,'The original event must retain its v1 schema and payload.')
 if(version===1)return {envelope:original,payload:row.payload}
 if(payload===undefined)throw new Problem(409,`Event ${row.id} lacks its installed successor schema. Inspect the owner subscription schema report.`)
 const envelope=checkedEvent({...row,schema_version:2,payload})
 if(payload!==JSON.stringify(successor(original)))throw new Problem(409,`Event ${row.id} has conflicting schema representations. No facts or signed history have been rewritten.`)
 return {envelope,payload}
}

export async function eventPayload(db:D1Database,row:StoredEvent,version:1|2){
 const stored=version===2?await db.prepare('SELECT payload FROM pm_integration_event_versions WHERE event_id=? AND schema_version=2').bind(row.id).first<{payload:string}>():null
 return representation(row,version,stored?.payload)
}

export async function eventPage(db:D1Database,rows:StoredEvent[],version:1|2){
 // Read a whole page with one query, including the documented 100-event page.
 const versions=version===2&&rows.length?(await db.prepare('SELECT event_id,payload FROM pm_integration_event_versions WHERE schema_version=2 AND event_id IN ('+rows.map(()=>'?').join(',')+')').bind(...rows.map(row=>row.id)).all<{event_id:string;payload:string}>()).results:[]
 const payloads=new Map(versions.map(row=>[row.event_id,row.payload]))
 return rows.map(row=>representation(row,version,payloads.get(row.id)).envelope)
}

export async function schemaReport(db:D1Database){
 const rows=(await db.prepare('SELECT id,type,schema_version,payload,created_at FROM pm_integration_events ORDER BY sequence').all<StoredEvent>()).results
 const versions=(await db.prepare('SELECT event_id,payload FROM pm_integration_event_versions WHERE schema_version=2').all<{event_id:string;payload:string}>()).results
 const payloads=new Map(versions.map(row=>[row.event_id,row.payload]))
 return {supportedSchemas:[1,2],events:rows.map(row=>{
  let result=inspectEvent(row)
  if(result.status==='compatible'&&row.schema_version!==1)result={status:'invalid',reason:'The original event must retain its v1 schema and payload.'}
  let successorStatus:{schemaVersion:number;status:string;reason?:string}={schemaVersion:2,status:'compatible'}
  try{representation(row,2,payloads.get(row.id))}catch{successorStatus={schemaVersion:2,status:'invalid',reason:'Restore the original installation records or finish the supported application upgrade. No raw payload is exposed.'}}
  return {id:row.id,schemaVersion:row.schema_version,status:result.status,...(result.status==='compatible'?{}:{reason:result.reason}),representations:[{schemaVersion:row.schema_version,status:result.status},successorStatus]}
 })}
}
