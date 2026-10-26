import {normalizeExperienceCart,type ExperienceCart} from './experience-cart'
import {experienceContext,type ExperienceCommitment} from './experience-fit'
import {bookingFit,instant,serviceBy} from './availability'
import {checkBookingRules} from './booking-rules'
import {searchTables} from './reservation-search'
import {servingFor} from './staffing-capacity'
import {fail,id,number,type CombinationSnapshot,type ServingAssignment} from './model'
import {hash,load} from './store'

/** An allocation commitment, never a booking or guest identity. Exclude from projections. */
export type HoldAllocation=Partial<ServingAssignment>&{
 experienceCart?:ExperienceCart;experience?:ExperienceCommitment;kind:'hold';id:string;serviceId:string;partySize:number;tableIds:string[];
 startAt:string;endAt:string;cleanupEndAt?:string;setupStartAt?:string;
 combination?:CombinationSnapshot;requiredArea?:string;requiredAccessTags:string[];expiresAt:string
}
type HoldRow={request_hash:string;id:string;token_hash:string;payload_hash:string;allocation:string;created_at:string;expires_at:string;state:'active'|'abandoned'|'completed';result:string|null;booking_id:string|null}
export type HoldInput={requestId:unknown;token:unknown;booking?:Record<string,unknown>;ttlSeconds?:unknown}
export type HoldCompletion={hold:HoldAllocation;requestHash:string;tokenHash:string;payloadHash:string;replay?:Record<string,unknown>}
const randomPattern=/^[a-f0-9]{64}$/
function canonical(value:unknown):string{
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value)
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}'
 return fail(400,'Checkout identity requires an exact JSON booking payload.')
}
async function identity(p:HoldInput,withPayload=false){
 if(typeof p.requestId!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(p.requestId)||typeof p.token!=='string'||!randomPattern.test(p.token))return fail(400,'Keep a stable checkout request identity and a random 32-byte capability.')
 if(withPayload&&(!p.booking||typeof p.booking!=='object'||Array.isArray(p.booking)))fail(400,'Send the exact booking payload reserved by this checkout.')
 return {requestHash:await hash(p.requestId),tokenHash:await hash(p.token),payloadHash:withPayload?await hash(p.token+':'+canonical(p.booking)):undefined}
}
async function find(db:D1Database,requestHash:string){return db.prepare('SELECT * FROM pm_booking_holds WHERE request_hash=?').bind(requestHash).first<HoldRow>()}
function authorize(row:HoldRow|null,tokenHash:string,payloadHash?:string):HoldRow{
 if(!row||row.token_hash!==tokenHash)return fail(404,'Checkout hold not found.')
 if(payloadHash!==undefined&&row.payload_hash!==payloadHash)fail(409,'This checkout identity already belongs to different booking details. Start a new checkout.')
 return row
}
async function protectCompleted(db:D1Database,row:HoldRow){
 if(row.state!=='completed')return row
 const retained=await db.prepare("SELECT 1 FROM pm_state s,json_each(s.data,'$.bookings') b JOIN pm_guests g ON g.id=json_extract(b.value,'$.guestId') WHERE s.id=1 AND json_extract(b.value,'$.id')=? AND COALESCE(json_extract(g.data,'$.erased'),0)=0").bind(row.booking_id).first()
 if(!retained)fail(404,'Checkout recovery is no longer available for this reservation.')
 return row
}
function view(row:HoldRow){
 return {hold:JSON.parse(row.allocation) as HoldAllocation,status:row.state==='active'&&row.expires_at<=new Date().toISOString()?'expired':row.state,...row.state==='completed'?{result:JSON.parse(row.result!) as Record<string,unknown>}:{}}
}
const stateFence=(db:D1Database,version:number)=>db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) THEN 1 ELSE 0 END').bind(version)
function conflict(error:unknown):never{
 if(/pm_assertions|UNIQUE constraint failed: pm_booking_holds/.test(String(error)))fail(409,'Availability or checkout changed. Recover this same request before trying another checkout.')
 throw error
}
/** Store.load attaches these to State.holds; allocators count them, read projections omit them. */
export async function readActiveHolds(db:D1Database):Promise<HoldAllocation[]>{
 const rows=await db.prepare("SELECT allocation FROM pm_booking_holds WHERE state='active' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY id").all<{allocation:string}>()
 return rows.results.map(row=>({...JSON.parse(row.allocation),kind:'hold' as const}))
}
/** Create/reload uses the same client-owned capability; only its digest is retained. */
export async function createHold(db:D1Database,p:HoldInput){
 const {requestHash,tokenHash,payloadHash}=await identity(p,true),previous=await find(db,requestHash)
 if(previous)return view(await protectCompleted(db,authorize(previous,tokenHash,payloadHash)))
 const {state:s,version}=await load(db),booking=p.booking!,service=serviceBy(s,booking.serviceId)
 if(service.status!=='published'||service.closedAt)fail(409,'Choose an open published service.')
 const partySize=number(booking.partySize,'Party size',1,500),startAt=instant(booking.startAt,'Arrival')
 if(Date.parse(startAt)<=Date.now())fail(409,'Choose a future arrival.')
 checkBookingRules(s,service,partySize,startAt,'online')
 const experience=experienceContext(s,service,booking,partySize)
 if(experience.experience&&booking.acknowledgedExperienceTerms!==true)fail(400,'Acknowledge the experience terms before reserving inventory.')
 const cart=normalizeExperienceCart(s,service.id,experience.experience,partySize,booking)
 const filtered=searchTables(experience.state,booking.area,booking.requiredAccessTags)
 const {tables,...slot}=bookingFit(filtered.state,experience.service,partySize,startAt,'online',booking.tableIds)
 const ttlSeconds=p.ttlSeconds===undefined?120:number(p.ttlSeconds,'Hold lifetime seconds',5,300)
 const createdAt=new Date().toISOString(),expiresAt=new Date(Math.min(Date.now()+ttlSeconds*1000,Date.parse(startAt))).toISOString()
 const allocation:HoldAllocation={...(cart?{experienceCart:{...cart,dietaryChoices:[]}}:{}),...(experience.experience?{experience:experience.experience}:{}),kind:'hold',id:id(),serviceId:service.id,partySize,...slot,tableIds:tables.map(t=>t.id),requiredAccessTags:filtered.requiredAccessTags,...filtered.requiredArea?{requiredArea:filtered.requiredArea}:{},...servingFor(s,service.id,tables.map(t=>t.id))??{},expiresAt}
 try{await db.batch([stateFence(db,version),db.prepare("INSERT INTO pm_booking_holds(request_hash,id,token_hash,payload_hash,allocation,created_at,expires_at,state) VALUES(?,?,?,?,?,?,?,'active')").bind(requestHash,allocation.id,tokenHash,payloadHash,JSON.stringify(allocation),createdAt,expiresAt),db.prepare('DELETE FROM pm_assertions'),db.prepare('UPDATE pm_state SET version=version+1 WHERE id=1 AND version=?').bind(version)])}
 catch(error){
  const raced=await find(db,requestHash)
  if(raced)return view(await protectCompleted(db,authorize(raced,tokenHash,payloadHash)))
  conflict(error)
 }
 return view((await find(db,requestHash))!)
}
export async function readHold(db:D1Database,p:HoldInput){
 const key=await identity(p)
 return view(await protectCompleted(db,authorize(await find(db,key.requestHash),key.tokenHash)))
}
export async function abandonHold(db:D1Database,p:HoldInput){
 const key=await identity(p),row=authorize(await find(db,key.requestHash),key.tokenHash)
 if(row.state!=='active')return view(await protectCompleted(db,row))
 const {version}=await load(db)
 try{await db.batch([stateFence(db,version),db.prepare("UPDATE pm_booking_holds SET state='abandoned' WHERE request_hash=? AND token_hash=? AND state='active'").bind(key.requestHash,key.tokenHash),db.prepare('DELETE FROM pm_assertions'),db.prepare('UPDATE pm_state SET version=version+1 WHERE id=1 AND version=?').bind(version)])}catch(error){conflict(error)}
 return view(await protectCompleted(db,authorize(await find(db,key.requestHash),key.tokenHash)))
}
/** Call before allocation. Return replay immediately; otherwise exclude this hold only,
 * pin its table IDs, revalidate its full slot, and atomically save the real booking. */
export async function holdForCompletion(db:D1Database,p:HoldInput):Promise<HoldCompletion>{
 const key=await identity(p,true),row=authorize(await find(db,key.requestHash),key.tokenHash,key.payloadHash)
 if(row.state==='completed'){await protectCompleted(db,row);return {hold:JSON.parse(row.allocation),requestHash:key.requestHash,tokenHash:key.tokenHash,payloadHash:key.payloadHash!,replay:JSON.parse(row.result!)}}
 if(row.state!=='active'||row.expires_at<=new Date().toISOString())fail(409,'This checkout hold expired or was abandoned. No booking or payment was made by this request.')
 return {hold:JSON.parse(row.allocation),requestHash:key.requestHash,tokenHash:key.tokenHash,payloadHash:key.payloadHash!}
}
/** Append BEFORE store.save's state update, with its state-version fence in the same batch.
 * An expired/abandoned/consumed hold aborts guest inserts and booking persistence together. */
export function completionResult(result:Record<string,unknown>):Record<string,unknown>{
 // Guest-supplied requests and rendered request terms never enter recovery records.
 return Object.fromEntries(['experienceCart','experienceId','ticketClassId','experienceName','className','id','assignment','startAt','endAt','cleanupEndAt','partySize','area','requiredAccessTags','confirmation','timezone','preorders'].filter(key=>result[key]!==undefined).map(key=>[key,result[key]]))
}
export function completionStatements(db:D1Database,c:HoldCompletion,result:Record<string,unknown>,version:number):D1PreparedStatement[]{
 if(typeof result.id!=='string'||!result.id)fail(500,'A completed checkout requires its saved booking reference.')
 return [stateFence(db,version),db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_booking_holds WHERE request_hash=? AND token_hash=? AND payload_hash=? AND state='active' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) THEN 1 ELSE 0 END").bind(c.requestHash,c.tokenHash,c.payloadHash),db.prepare("UPDATE pm_booking_holds SET state='completed',booking_id=?,result=? WHERE request_hash=? AND token_hash=? AND state='active'").bind(result.id,JSON.stringify(completionResult(result)),c.requestHash,c.tokenHash)]
}
