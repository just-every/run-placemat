import {Problem,type Booking} from '../model'

export type StoredEvent={id:string;type:string;schema_version:number;payload:string;created_at:string}
type Envelope={id:string;type:string;schemaVersion:1;createdAt:string;reservation:Pick<Booking,'id'|'serviceId'|'partySize'|'startAt'|'endAt'|'status'|'source'>}
type Check={status:'compatible';envelope:Envelope}|{status:'unsupported'|'invalid';reason:string}
const eventTypes=['reservation.created','reservation.changed','reservation.cancelled']
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)
const exact=(value:Record<string,unknown>,fields:string[])=>Object.keys(value).length===fields.length&&fields.every(field=>Object.hasOwn(value,field))
const nonempty=(value:unknown):value is string=>typeof value==='string'&&value.length>0
const timestamp=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))

/** Validate the stored envelope without changing the bytes previously signed. */
export function inspectEvent(row:StoredEvent):Check{
 if(row.schema_version!==1)return {status:'unsupported',reason:'Install an application release supporting this stored schema before reading or explicitly delivering this event. The event has not been rewritten.'}
 const invalid=():Check=>({status:'invalid',reason:'The stored event does not match its documented anonymous schema. Restore its original installation event record from a trusted source; do not infer missing facts or alter a delivered envelope.'})
 let envelope:unknown
 try{envelope=JSON.parse(row.payload)}catch{return invalid()}
 // The current writer emits compact JSON. Reject duplicate keys and hidden raw fields
 // rather than validating only the last value while transmitting the original bytes.
 if(JSON.stringify(envelope)!==row.payload)return invalid()
 if(!object(envelope)||!exact(envelope,['id','type','schemaVersion','createdAt','reservation'])||envelope.schemaVersion!==1||envelope.id!==row.id||envelope.type!==row.type||envelope.createdAt!==row.created_at||!eventTypes.includes(row.type)||!timestamp(envelope.createdAt))return invalid()
 const reservation=envelope.reservation
 if(!object(reservation)||!exact(reservation,['id','serviceId','partySize','startAt','endAt','status','source'])||!nonempty(reservation.id)||!nonempty(reservation.serviceId)||!Number.isSafeInteger(reservation.partySize)||Number(reservation.partySize)<1||!timestamp(reservation.startAt)||!timestamp(reservation.endAt)||Date.parse(reservation.startAt)>=Date.parse(reservation.endAt)||typeof reservation.status!=='string'||!['booked','seated','completed','cancelled','no-show'].includes(reservation.status)||typeof reservation.source!=='string'||!['online','phone','walk-in','waitlist'].includes(reservation.source)||(row.type==='reservation.cancelled'&&reservation.status!=='cancelled'))return invalid()
 return {status:'compatible',envelope:envelope as Envelope}
}

export function checkedEvent(row:StoredEvent):Envelope{
 const result=inspectEvent(row)
 if(result.status!=='compatible')throw new Problem(409,`Event ${row.id} has ${result.status} stored schema ${row.schema_version}. ${result.reason} Inspect the owner subscription schema report.`)
 return result.envelope
}

export async function schemaReport(db:D1Database){
 const rows=(await db.prepare('SELECT id,type,schema_version,payload,created_at FROM pm_integration_events ORDER BY sequence').all<StoredEvent>()).results
 return {supportedSchemas:[1],events:rows.map(row=>{
  const result=inspectEvent(row)
  return {id:row.id,schemaVersion:row.schema_version,status:result.status,...(result.status==='compatible'?{}:{reason:result.reason})}
 })}
}
