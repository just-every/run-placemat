import {DEVICE_COOKIE} from './shared-device-cookie'
import {operatorAuth,type Bindings} from '../auth.server'
import {actorFor,person,originCheck,jsonBody} from './access'
import {execute} from './commands'
import {load,guests,hash} from './store'
import {fail,id,text,type Actor} from './model'
import {floorStage} from './service-status'
import {sharedDevicePage} from './shared-device-view'
export const DEVICE_IDLE_MS=120000
const WINDOW=15*60000
const safeHeaders={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
const json=(data:any,status=200)=>Response.json(data,{status,headers:safeHeaders})
const randomHex=(bytes=32)=>Array.from(crypto.getRandomValues(new Uint8Array(bytes)),n=>n.toString(16).padStart(2,'0')).join('')
const cookie=(token:string)=>`${DEVICE_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`
function deviceToken(request:Request){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(DEVICE_COOKIE+'='))?.slice(DEVICE_COOKIE.length+1)??''}
async function digestPin(pin:string,salt:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits'])
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256)
 return Array.from(new Uint8Array(bits),n=>n.toString(16).padStart(2,'0')).join('')
}
function equalDigest(a:string,b:string){let different=a.length^b.length;for(let i=0;i<64;i++)different|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return different===0}
type Device={id:string;label:string;expires_at:number;revoked_at:number|null;operator_id:string|null;operator_version:number|null;pin_version:number|null;last_action_at:number;generation:number;failures:number;failure_window_at:number;blocked_until:number}
async function device(request:Request,db:D1Database,now:number){
 const token=deviceToken(request)
 if(!/^[a-f0-9]{64}$/.test(token))fail(401,'Register this host stand with an owner-issued code.')
 const row=await db.prepare('SELECT * FROM pm_host_devices WHERE lease_digest=?').bind(await hash(token)).first<Device>()
 if(!row)return fail(401,'Register this host stand with an owner-issued code.')
 if(row.revoked_at||row.expires_at<=now)fail(403,'This host stand was revoked or expired. Ask the owner to register it again.')
 return row
}
async function event(db:D1Database,action:string,now:number,deviceId:string|null,operatorId:string|null){await db.prepare('INSERT INTO pm_host_security_events(id,device_id,operator_id,action,at) VALUES(?,?,?,?,?)').bind(id(),deviceId,operatorId,action,now).run()}
async function lock(db:D1Database,row:Device,now:number,action='locked'){
 await db.prepare('UPDATE pm_host_devices SET operator_id=NULL,operator_version=NULL,pin_version=NULL,generation=generation+1 WHERE id=? AND generation=?').bind(row.id,row.generation).run()
 await event(db,action,now,row.id,row.operator_id)
}
async function currentActor(db:D1Database,row:Device,now:number):Promise<Actor|null>{
 if(!row.operator_id)return null
 const operator=await db.prepare("SELECT o.id,o.display_name,o.version,p.version AS pin_version FROM oa_operators o JOIN pm_host_pins p ON p.operator_id=o.id WHERE o.id=? AND o.status='active' AND o.role='member' AND o.version=p.operator_version").bind(row.operator_id).first<{id:string;display_name:string;version:number;pin_version:number}>()
 if(now-row.last_action_at>=DEVICE_IDLE_MS||!operator||operator.version!==row.operator_version||operator.pin_version!==row.pin_version||!(await load(db)).state.hostIds?.includes(operator.id)){
  await lock(db,row,now,'authorization-locked');return null
 }
 return {id:operator.id,name:operator.display_name,role:'host',deviceId:row.id,deviceGeneration:row.generation}
}
/** Rechecked inside the same D1 transaction that records the business operation. */
export function deviceFence(db:D1Database,actor:Actor,now:number){
 return db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_host_devices d JOIN oa_operators o ON o.id=d.operator_id JOIN pm_host_pins p ON p.operator_id=o.id WHERE d.id=? AND d.generation=? AND d.operator_id=? AND d.revoked_at IS NULL AND d.expires_at>? AND d.last_action_at>? AND o.status='active' AND o.role='member' AND o.version=d.operator_version AND p.operator_version=o.version AND p.version=d.pin_version AND EXISTS(SELECT 1 FROM pm_state s,json_each(s.data,'$.hostIds') h WHERE s.id=1 AND h.value=o.id)) THEN 1 ELSE 0 END").bind(actor.deviceId,actor.deviceGeneration,actor.id,now,now-DEVICE_IDLE_MS)
}
const allowedCommands=new Set(['booking.stage','booking.move','booking.swap','booking.lock'])
const allowedStages=new Set(['confirmed','reconfirmed','arrived','partially-arrived','late','seated','ordering','clearing','completed','ready','needs-bussing','mains','dessert'])
async function floor(db:D1Database,row:Device,actor:Actor){
 const {state,version}=await load(db),people=await guests(db),now=new Date().toISOString()
 return {actor:{id:actor.id,name:actor.name},device:{id:row.id,label:row.label},generation:row.generation,lockAt:row.last_action_at+DEVICE_IDLE_MS,version,venue:{name:state.venue.name,timezone:state.venue.timezone},services:state.services.map(s=>({id:s.id,name:s.name})),tables:state.tables.filter(t=>!t.retiredAt&&t.inventoryKind!=='pool').map(t=>({id:t.id,label:t.label,seats:t.seats})),bookings:state.bookings.filter(b=>['booked','seated'].includes(b.status)||b.needsBussing).map(b=>{const stage=floorStage(state,b,now);return {id:b.id,serviceId:b.serviceId,name:people.find(g=>g.id===b.guestId)?.name??'Erased guest',partySize:b.partySize,startAt:b.startAt,endAt:b.endAt,tableIds:b.tableIds,status:stage.serviceStatus==='paid'?'seated':stage.serviceStatus,nextStages:[...new Set([...stage.nextStages,...stage.nextFloorStages])].filter(s=>allowedStages.has(s))}})}
}
export async function sharedDeviceResponse(request:Request,env:Bindings):Promise<Response|null>{
 const path=new URL(request.url).pathname,now=Date.now(),db=env.DB
 if(path==='/hoststand')return ['GET','HEAD'].includes(request.method)?sharedDevicePage(request):json({error:'Method not allowed'},405)
 if(!path.startsWith('/api/hoststand/'))return null
 if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405)
 if(request.method==='POST')originCheck(request,env)
 if(path==='/api/hoststand/devices'){
  const actor=await actorFor(request,env)??fail(401,'Use your full personal session.');person(actor,true)
  if(request.method==='GET')return json({devices:(await db.prepare('SELECT id,label,created_at,expires_at,revoked_at FROM pm_host_devices ORDER BY created_at DESC').all()).results,events:(await db.prepare('SELECT id,device_id,operator_id,action,at FROM pm_host_security_events ORDER BY at DESC LIMIT 100').all()).results})
  const p=await jsonBody(request),claimCode=randomHex(),deviceId=id(),label=text(p.label,'Host stand name',80)
  await db.prepare('INSERT INTO pm_host_devices(id,label,created_by,created_at,expires_at,claim_digest,claim_expires_at) VALUES(?,?,?,?,?,?,?)').bind(deviceId,label,actor.id,now,now+30*86400000,await hash(claimCode),now+10*60000).run()
  await event(db,'registered',now,deviceId,actor.id);return json({id:deviceId,label,claimCode,claimExpiresAt:now+10*60000},201)
 }
 if(path==='/api/hoststand/revoke'){
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  const actor=await actorFor(request,env)??fail(401,'Use your full personal session.');person(actor,true)
  const p=await jsonBody(request),deviceId=text(p.deviceId,'Host stand',100)
  await db.prepare('UPDATE pm_host_devices SET revoked_at=COALESCE(revoked_at,?),operator_id=NULL,claim_digest=NULL,generation=generation+1 WHERE id=?').bind(now,deviceId).run();await event(db,'revoked',now,deviceId,actor.id);return json({revoked:true})
 }
 if(path==='/api/hoststand/pin'){
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  const actor=await actorFor(request,env)??fail(401,'Use your full personal session.')
  if(actor.agent||actor.role!=='host')fail(403,'Only an active owner-granted host can set a personal PIN.')
  const p=await jsonBody(request);if(typeof p.pin!=='string'||!/^\d{6,12}$/.test(p.pin))fail(400,'Choose a personal PIN of 6–12 digits.')
  const salt=randomHex(16),digest=await digestPin(p.pin,salt),operator=await db.prepare("SELECT version FROM oa_operators WHERE id=? AND role='member' AND status='active'").bind(actor.id).first<{version:number}>()??fail(403,'Host access changed.')
  await db.batch([db.prepare('INSERT INTO pm_host_pins(operator_id,operator_version,salt,digest) VALUES(?,?,?,?) ON CONFLICT(operator_id) DO UPDATE SET operator_version=excluded.operator_version,salt=excluded.salt,digest=excluded.digest,version=pm_host_pins.version+1,failures=0,failure_window_at=0,blocked_until=0').bind(actor.id,operator.version,salt,digest),db.prepare('UPDATE pm_host_devices SET operator_id=NULL,generation=generation+1 WHERE operator_id=?').bind(actor.id)])
  await event(db,'pin-replaced',now,null,actor.id);return json({saved:true})
 }
 if(path==='/api/hoststand/claim'){
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  const bucket=await hash((request.headers.get('cf-connecting-ip')??'local')+':hoststand-claim:'+Math.floor(now/60000)),limit=await db.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>();if(limit!.count>20)fail(429,'Wait a minute before registering this host stand again.')
  const p=await jsonBody(request),token=randomHex(),code=text(p.claimCode,'Owner-issued code',64)
  const row=await db.prepare('UPDATE pm_host_devices SET lease_digest=?,claim_digest=NULL,operator_id=NULL,generation=generation+1 WHERE claim_digest=? AND claim_expires_at>? AND expires_at>? AND revoked_at IS NULL RETURNING id').bind(await hash(token),await hash(code),now,now).first<{id:string}>()
  if(!row)return fail(409,'That registration code is invalid, expired or already used.')
  // An owner or manager must not leave their full session behind on a shared tablet.
  const signedOut=await operatorAuth(env).signOut(request),response=json({registered:true});response.headers.append('set-cookie',signedOut.cookie);response.headers.append('set-cookie',cookie(token));await event(db,'claimed',now,row.id,null);return response
 }
 const row=await device(request,db,now)
 if(path==='/api/hoststand/lock'&&request.method==='POST'){await lock(db,row,now);const signedOut=await operatorAuth(env).signOut(request),response=json({locked:true});response.headers.append('set-cookie',signedOut.cookie);return response}
 if(path==='/api/hoststand/unlock'&&request.method==='POST'){
  await lock(db,row,now,'staff-switch');const generation=row.generation+1,signedOut=await operatorAuth(env).signOut(request)
  if(row.blocked_until>now)fail(429,'PIN attempts are temporarily throttled. Try again later.')
  const bucket=await hash(row.id+':pin:'+Math.floor(now/60000)),limit=await db.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>();if(limit!.count>20)fail(429,'PIN attempts are temporarily throttled. Try again later.')
  const p=await jsonBody(request),email=typeof p.email==='string'&&p.email.length<=200?p.email.trim().toLowerCase():'',pin=typeof p.pin==='string'&&/^\d{6,12}$/.test(p.pin)?p.pin:'synthetic-placemat-invalid'
  const staff=await db.prepare('SELECT o.id,o.display_name,o.role,o.status,o.version AS operator_version,p.salt,p.digest,p.version,p.operator_version AS pinned_operator_version,p.failures,p.blocked_until FROM oa_operators o JOIN pm_host_pins p ON p.operator_id=o.id WHERE o.email=?').bind(email).first<{id:string;display_name:string;role:string;status:string;operator_version:number;pinned_operator_version:number;salt:string;digest:string;version:number;failures:number;blocked_until:number}>()
  if(staff&&staff.blocked_until>now)fail(429,'PIN attempts are temporarily throttled. Try again later.')
  const candidate=await digestPin(pin,staff?.salt??'synthetic-placemat-unknown-salt'),valid=staff&&equalDigest(candidate,staff.digest)&&staff.status==='active'&&staff.role==='member'&&staff.operator_version===staff.pinned_operator_version&&(await load(db)).state.hostIds?.includes(staff.id)
  if(!valid){
   const failure=await db.prepare('UPDATE pm_host_devices SET failures=CASE WHEN failure_window_at<=? THEN 1 ELSE failures+1 END,failure_window_at=CASE WHEN failure_window_at<=? THEN ? ELSE failure_window_at END,blocked_until=CASE WHEN failure_window_at>? AND failures+1>=10 THEN ? ELSE 0 END WHERE id=? RETURNING failures').bind(now-WINDOW,now-WINDOW,now,now-WINDOW,now+WINDOW,row.id).first<{failures:number}>()
   const staffFailure=staff?await db.prepare('UPDATE pm_host_pins SET failures=CASE WHEN failure_window_at<=? THEN 1 ELSE failures+1 END,failure_window_at=CASE WHEN failure_window_at<=? THEN ? ELSE failure_window_at END,blocked_until=CASE WHEN failure_window_at>? AND failures+1>=5 THEN ? ELSE 0 END WHERE operator_id=? RETURNING failures').bind(now-WINDOW,now-WINDOW,now,now-WINDOW,now+WINDOW,staff.id).first<{failures:number}>():null
   await event(db,'pin-refused',now,row.id,null);if((failure?.failures??0)>=10||(staffFailure?.failures??0)>=5)fail(429,'PIN attempts are temporarily throttled. Try again later.');fail(401,'Staff sign-in could not be verified.')
  }
  if(!staff)return fail(401,'Staff sign-in could not be verified.')
  const accepted=await db.prepare("UPDATE pm_host_devices SET operator_id=?,operator_version=?,pin_version=?,last_action_at=? WHERE id=? AND generation=? AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM oa_operators o JOIN pm_host_pins p ON p.operator_id=o.id WHERE o.id=? AND o.status='active' AND o.role='member' AND o.version=? AND p.operator_version=o.version AND p.version=?) AND EXISTS(SELECT 1 FROM pm_state s,json_each(s.data,'$.hostIds') h WHERE s.id=1 AND h.value=?)").bind(staff.id,staff.operator_version,staff.version,now,row.id,generation,now,staff.id,staff.operator_version,staff.version,staff.id).run()
  if(accepted.meta.changes!==1)fail(409,'Host stand authorization changed. Unlock again.')
  await db.prepare('UPDATE pm_host_pins SET failures=0,failure_window_at=0,blocked_until=0 WHERE operator_id=? AND version=?').bind(staff.id,staff.version).run();await event(db,'unlocked',now,row.id,staff.id);const response=json({unlocked:true});response.headers.append('set-cookie',signedOut.cookie);return response
 }
 const actor=await currentActor(db,row,now)
 if(path==='/api/hoststand/status'&&request.method==='GET')return json({registered:true,locked:!actor,...actor?{name:actor.name,lockAt:row.last_action_at+DEVICE_IDLE_MS}:{}})
 if(!actor)return fail(423,'Host stand locked. Unlock with your personal PIN.')
 if(path==='/api/hoststand/floor'&&request.method==='GET')return json(await floor(db,row,actor))
 if(path==='/api/hoststand/commands'&&request.method==='POST'){
  const p=await jsonBody(request)
  if(p.generation!==row.generation)fail(409,'Staff changed. Unlock or refresh before recording an action.')
  if(!allowedCommands.has(p.command)||p.command==='booking.stage'&&(!allowedStages.has(p.payload?.stage)||p.payload?.correctsEventId!==undefined))fail(403,'Use your full personal session for that action.')
  if(!p.payload||typeof p.payload!=='object'||Array.isArray(p.payload))fail(400,'Send an operation payload.')
  const touched=await db.prepare('UPDATE pm_host_devices SET last_action_at=? WHERE id=? AND generation=? AND operator_id=? AND revoked_at IS NULL').bind(now,row.id,row.generation,actor.id).run();if(touched.meta.changes!==1)fail(409,'Staff changed. Unlock again.')
  await execute(db,actor,p.command,p.payload,env.SESSION_SECRET);return json({saved:true})
 }
 return json({error:'Host stand action not available'},403)
}
