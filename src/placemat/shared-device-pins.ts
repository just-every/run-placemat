import type {Bindings} from '../auth.server'
import {operatorAuth} from '../auth.server'
import {jsonBody} from './access'
import {hashPin,verifyPin,PinPolicyError,PinCryptoUnavailableError,type PinDigest} from './pin-crypto'
import {load,hash} from './store'
import {fail,id,type Actor} from './model'

export function pinConfig(env:Bindings){
 let peppers:Record<string,string|undefined>={v1:env.HOST_PIN_PEPPER_V1}
 if(env.HOST_PIN_PEPPERS){try{peppers=JSON.parse(env.HOST_PIN_PEPPERS)}catch{throw new PinCryptoUnavailableError()}}
 return {currentVersion:env.HOST_PIN_PEPPER_VERSION??'v1',peppers}
}
async function securityEvent(db:D1Database,action:string,now:number,deviceId:string|null,operatorId:string|null){await db.prepare('INSERT INTO pm_host_security_events(id,device_id,operator_id,action,at) VALUES(?,?,?,?,?)').bind(id(),deviceId,operatorId,action,now).run()}
export async function roster(db:D1Database){
 const {state}=await load(db),rows=await db.prepare("SELECT o.id,o.display_name AS name FROM oa_operators o JOIN pm_host_pins p ON p.operator_id=o.id WHERE o.role='member' AND o.status='active' AND p.operator_version=o.version AND p.pepper_version IS NOT NULL AND p.disabled_at IS NULL ORDER BY o.display_name,o.id").all<{id:string;name:string}>()
 return rows.results.filter(r=>state.hostIds?.includes(r.id))
}
export async function savePersonalPin(env:Bindings,actor:Actor,p:any,now:number){
 if(actor.agent||actor.role!=='host')fail(403,'Only an active owner-granted host can set a personal PIN.')
 try{
  const record=await hashPin(p.pin,pinConfig(env)),operator=await env.DB.prepare("SELECT version FROM oa_operators WHERE id=? AND role='member' AND status='active'").bind(actor.id).first<{version:number}>()??fail(403,'Host access changed.')
  await env.DB.batch([env.DB.prepare('INSERT INTO pm_host_pins(operator_id,operator_version,salt,digest,pepper_version,iterations) VALUES(?,?,?,?,?,?) ON CONFLICT(operator_id) DO UPDATE SET operator_version=excluded.operator_version,salt=excluded.salt,digest=excluded.digest,pepper_version=excluded.pepper_version,iterations=excluded.iterations,disabled_at=NULL,version=pm_host_pins.version+1,failures=0,failure_window_at=0,blocked_until=0').bind(actor.id,operator.version,record.salt,record.digest,record.pepperVersion,record.iterations),env.DB.prepare('UPDATE pm_host_devices SET operator_id=NULL,generation=generation+1 WHERE operator_id=?').bind(actor.id)])
  await securityEvent(env.DB,'pin-full-session-reset',now,null,actor.id)
 }catch(error){if(error instanceof PinPolicyError)fail(400,error.message);if(error instanceof PinCryptoUnavailableError)fail(503,error.message);throw error}
}
export async function unlockPin(request:Request,env:Bindings,row:{id:string;generation:number;blocked_until:number},now:number){
 const db=env.DB,generation=row.generation+1
 await db.prepare('UPDATE pm_host_devices SET operator_id=NULL,operator_version=NULL,pin_version=NULL,generation=generation+1 WHERE id=? AND generation=?').bind(row.id,row.generation).run()
 await securityEvent(db,'staff-switch',now,row.id,null)
 const signedOut=await operatorAuth(env).signOut(request)
 if(row.blocked_until>now)fail(429,'PIN attempts are temporarily throttled. Try again later.')
 const bucket=await hash(row.id+':pin:'+Math.floor(now/60000)),limit=await db.prepare('INSERT INTO pm_public_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first<{count:number}>();if(limit!.count>40)fail(429,'PIN attempts are temporarily throttled. Try again later.')
 const p=await jsonBody(request),operatorId=typeof p.operatorId==='string'&&p.operatorId.length<=100?p.operatorId:''
 type Staff={id:string;display_name:string;role:string;status:string;operator_version:number;pinned_operator_version:number;salt:string;digest:string;pepper_version:string;iterations:number;version:number;failures:number;disabled_at:number|null}
 const staff=await db.prepare('SELECT o.id,o.display_name,o.role,o.status,o.version AS operator_version,p.salt,p.digest,p.pepper_version,p.iterations,p.version,p.operator_version AS pinned_operator_version,p.failures,p.disabled_at FROM oa_operators o JOIN pm_host_pins p ON p.operator_id=o.id WHERE o.id=?').bind(operatorId).first<Staff>()
 if(staff?.disabled_at)fail(429,'This PIN is disabled. Reset it in a full personal session; a security event is available to managers.')
 let verified:{valid:false}|{valid:true;upgrade?:PinDigest}={valid:false}
 if(staff?.pepper_version){try{verified=await verifyPin(p.pin,{...staff,pepperVersion:staff.pepper_version},pinConfig(env))}catch(error){if(error instanceof PinCryptoUnavailableError)fail(503,error.message);throw error}}
 const valid=staff&&verified.valid&&staff.status==='active'&&staff.role==='member'&&staff.operator_version===staff.pinned_operator_version&&(await load(db)).state.hostIds?.includes(staff.id)
 if(!valid){
  const failure=!staff?await db.prepare('UPDATE pm_host_devices SET failures=CASE WHEN failure_window_at<=? THEN 1 ELSE failures+1 END,failure_window_at=CASE WHEN failure_window_at<=? THEN ? ELSE failure_window_at END,blocked_until=CASE WHEN failure_window_at>? AND failures+1>=10 THEN ? ELSE 0 END WHERE id=? RETURNING failures').bind(now-900000,now-900000,now,now-900000,now+900000,row.id).first<{failures:number}>():null
  const staffFailure=staff?await db.prepare('UPDATE pm_host_pins SET failures=failures+1,disabled_at=CASE WHEN failures+1>=10 THEN ? ELSE disabled_at END WHERE operator_id=? AND version=? RETURNING failures').bind(now,staff.id,staff.version).first<{failures:number}>():null
  if((staffFailure?.failures??0)>=10){await db.prepare('UPDATE pm_host_devices SET operator_id=NULL,generation=generation+1 WHERE operator_id=?').bind(staff!.id).run();await securityEvent(db,'pin-disabled-ten-failures',now,row.id,staff!.id);fail(429,'This PIN is disabled. Reset it in a full personal session; a security event is available to managers.')}
  await securityEvent(db,'pin-refused',now,row.id,null)
  if((failure?.failures??0)>=10)fail(429,'PIN attempts are temporarily throttled. Try again later.')
  fail(401,'Staff sign-in could not be verified.')
 }
 if(!staff||!verified.valid)return fail(401,'Staff sign-in could not be verified.')
 const upgrade=verified.upgrade
 // A successful unlock resets consecutive failures and migrates only a verified digest.
 const statements: D1PreparedStatement[]=[]
 if(upgrade)statements.push(db.prepare('UPDATE pm_host_pins SET salt=?,digest=?,pepper_version=?,iterations=? WHERE operator_id=? AND version=? AND digest=? AND disabled_at IS NULL').bind(upgrade.salt,upgrade.digest,upgrade.pepperVersion,upgrade.iterations,staff.id,staff.version,staff.digest))
 statements.push(db.prepare("UPDATE pm_host_devices SET operator_id=?,operator_version=?,pin_version=?,last_action_at=? WHERE id=? AND generation=? AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM oa_operators o JOIN pm_host_pins p ON p.operator_id=o.id WHERE o.id=? AND o.status='active' AND o.role='member' AND o.version=? AND p.operator_version=o.version AND p.version=? AND p.disabled_at IS NULL) AND EXISTS(SELECT 1 FROM pm_state s,json_each(s.data,'$.hostIds') h WHERE s.id=1 AND h.value=?)").bind(staff.id,staff.operator_version,staff.version,now,row.id,generation,now,staff.id,staff.operator_version,staff.version,staff.id),db.prepare('UPDATE pm_host_pins SET failures=0 WHERE operator_id=? AND version=? AND disabled_at IS NULL').bind(staff.id,staff.version))
 const results=await db.batch(statements)
 if(results[upgrade?1:0].meta.changes!==1)fail(409,'Host stand authorization changed. Unlock again.')
 await securityEvent(db,'unlocked',now,row.id,staff.id)
 return signedOut.cookie
}
