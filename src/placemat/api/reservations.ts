import type {Bindings} from '../../auth.server'
import {actorFor,jsonBody,originCheck,person} from '../access'
import {instant} from '../availability'
import {execute} from '../commands'
import {fail,text,type Actor,type Booking} from '../model'

const headers={'cache-control':'no-store','x-content-type-options':'nosniff','x-placemat-api-version':'1'}
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)
const projection=(booking:Booking)=>({id:booking.id,serviceId:booking.serviceId,partySize:booking.partySize,startAt:booking.startAt,endAt:booking.endAt,status:booking.status,source:booking.source})
type Saved={request_hash:string;response:string}
const canonical=(value:unknown):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':object(value)?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value)??fail(400,'Send JSON reservation values.')
async function identity(secret:string,value:unknown){
 const encode=new TextEncoder(),key=await crypto.subtle.importKey('raw',encode.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encode.encode(canonical(value)))),n=>n.toString(16).padStart(2,'0')).join('')
}
async function owner(request:Request,env:Bindings){
 if(request.headers.has('authorization'))fail(401,'Use a native personal owner session; scoped integration keys cannot write reservations.')
 const actor=await actorFor(request,env)??fail(401,'Sign in with a personal owner session.')
 person(actor,true)
 if(actor.deviceId)fail(403,'Use a personal owner session.')
 return actor
}
const ownerFence=(db:D1Database,actor:Actor)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active') THEN 1 ELSE 0 END").bind(actor.id)

function input(body:Record<string,unknown>){
 if(Object.keys(body).some(key=>!['requestId','action','payload'].includes(key)))fail(400,'Send only requestId, action and payload.')
 if(typeof body.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId))return fail(400,'Use a stable UUID requestId for this owner action.')
 if(!['create','change','cancel'].includes(String(body.action))||typeof body.action!=='string'||!object(body.payload))return fail(400,'Choose create, change or cancel with a reservation payload.')
 const action=body.action,p={...body.payload}
 const allowed=action==='cancel'?['bookingId','status','reason']:action==='change'?['bookingId','startAt','partySize','version']:['serviceId','startAt','partySize','guestId','name','email','phone','staffIntake','requests','requestsAcknowledged','area','requiredAccessTags','tableIds']
 if(Object.keys(p).some(key=>!allowed.includes(key)))fail(400,'This owner reservation action contains unsupported fields. Use the existing venue workflow for reviewed exceptions.')
 if(action==='cancel'){
  if(p.status!==undefined&&p.status!=='cancelled')fail(400,'The cancel action can only set status to cancelled.')
  p.bookingId=text(p.bookingId,'Reservation',100);p.status='cancelled'
  if(p.reason!==undefined)p.reason=typeof p.reason==='string'&&!p.reason.trim()?'':text(p.reason,'Cancellation reason',1000)
 }else{
  p.startAt=instant(p.startAt,'Arrival time');p.partySize=Number(p.partySize)
  if(!Number.isInteger(p.partySize)||Number(p.partySize)<1||Number(p.partySize)>500)fail(400,'Party size must be 1–500.')
  if(action==='change'){
   p.bookingId=text(p.bookingId,'Reservation',100)
   if(!Number.isSafeInteger(p.version)||Number(p.version)<0)fail(400,'Use the current integer floor version for a change.')
  }else{
   p.serviceId=text(p.serviceId,'Service',100)
   if(p.guestId!==undefined)p.guestId=text(p.guestId,'Returning guest',100)
   if(p.name!==undefined)p.name=text(p.name,'Guest name',200)
   for(const key of ['phone','email'])if(typeof p[key]==='string')p[key]=(p[key] as string).trim()
   if(typeof p.email==='string')p.email=p.email.toLowerCase()
  }
 }
 return {requestId:body.requestId.toLowerCase(),action,payload:p}
}

/** Native owner mutations reuse command authority and commit their replay receipt atomically. */
export async function ownerReservationResponse(request:Request,env:Bindings):Promise<Response>{
 const actor=await owner(request,env)
 if(request.method!=='POST')return Response.json({version:'1',error:'Use POST for a native personal-owner reservation action.'},{status:405,headers})
 originCheck(request,env)
 const normalized=input(await jsonBody(request)),digest=await identity(env.SESSION_SECRET,{action:normalized.action,payload:normalized.payload})
 const lookup=()=>env.DB.prepare('SELECT request_hash,response FROM pm_reservation_requests WHERE actor_id=? AND request_id=?').bind(actor.id,normalized.requestId).first<Saved>()
 const replay=async(saved:Saved)=>{
  await owner(request,env)
  if(saved.request_hash!==digest)fail(409,'This owner request ID already names another reservation action. Keep the original request or explicitly use a new ID.')
  return Response.json({version:'1',result:JSON.parse(saved.response),replayed:true},{headers})
 }
 const prior=await lookup()
 if(prior)return replay(prior)
 const command=normalized.action==='create'?'booking.phone':normalized.action==='change'?'booking.phone.change':'booking.status'
 let result:Booking
 try{
  result=await execute(env.DB,actor,command,normalized.payload,env.SESSION_SECRET,(booking:Booking)=>[
   ownerFence(env.DB,actor),
   env.DB.prepare('INSERT INTO pm_reservation_requests(actor_id,request_id,request_hash,response,created_at) VALUES(?,?,?,?,?)').bind(actor.id,normalized.requestId,digest,JSON.stringify(projection(booking)),new Date().toISOString()),
  ])
 }catch(error){
  // Another identical request may have committed while this command read the old floor.
  // Inspect its durable outcome once; never reexecute the mutation automatically.
  const saved=await lookup()
  if(saved)return replay(saved)
  throw error
 }
 await owner(request,env)
 return Response.json({version:'1',result:projection(result),replayed:false},{headers})
}
