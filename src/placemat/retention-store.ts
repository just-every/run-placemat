import {fail,Problem,type Guest} from './model'
import {hash,load} from './store'
export {ownerAuthority,ownerFence} from './feedback-store'
export const purpose='venue-email-marketing'
export type Config={name:string;trigger:'welcome'|'birthday'|'anniversary'|'first-to-second'|'lapsed'|'experience';offer:string;delayDays:number;lapsedDays:number;experienceId?:string;capDays:number;quietStart:string;quietEnd:string;expiresAt:string}
export type Workflow={id:string;data:string;status:string;preview_hash:string|null;preview_data:string|null;created_at:string;updated_at:string}
export type Settings={enabled:number;owner_id:string;revision:string;updated_at:string}
export type Facts={guest_id:string;created_at:string;birthday:string|null;anniversary:string|null;provenance:string;updated_at:string}
export type Consent={guest_id:string;id:string;email_hash:string;identity_data:string;purpose:string;venue_scope:string;confirmed_at:string}
export type GuestRow={id:string;version:number;data:string}
export type Recipient={guestId:string;name:string;email:string;emailHash:string;identityData:string;consentId:string;occurrence:string;factsRevision:string|null}
export type Preview={offer:string;config:Config;recipients:Recipient[];preparedAt:string;expiresAt:string}
export type Token={token_hash:string;kind:string;guest_id:string;email_hash:string;identity_data:string;consent_id:string|null;message_id:string|null;venue_scope:string;created_at:string;expires_at:string}
export const settingsRow=(db:D1Database)=>db.prepare('SELECT * FROM pm_retention_settings WHERE id=1').first<Settings>()
export const workflowRow=(db:D1Database,id:string)=>db.prepare('SELECT * FROM pm_retention_workflows WHERE id=?').bind(id).first<Workflow>()
export const factsRow=(db:D1Database,id:string)=>db.prepare('SELECT * FROM pm_retention_facts WHERE guest_id=?').bind(id).first<Facts>()
export const consentRow=(db:D1Database,id:string)=>db.prepare('SELECT * FROM pm_retention_consents WHERE guest_id=?').bind(id).first<Consent>()
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
export const unavailable=():never=>fail(404,'This marketing link is unavailable or has expired.')
export async function atomic(db:D1Database,statements:D1PreparedStatement[]){try{await db.batch([...statements,db.prepare('DELETE FROM pm_assertions')])}catch(e){if(e instanceof Problem)throw e;if(/CHECK constraint|UNIQUE constraint|pm_assertions/.test(String(e)))fail(409,'Marketing authority or eligibility changed. Refresh and review again.');throw e}}
export const assertion=(db:D1Database,condition:string,...args:any[])=>db.prepare(`INSERT INTO pm_assertions(ok) SELECT CASE WHEN ${condition} THEN 1 ELSE 0 END`).bind(...args)
export async function contact(db:D1Database,guestId:string){
 const row=await db.prepare('SELECT id,version,data FROM pm_guests WHERE id=?').bind(guestId).first<GuestRow>()
 if(!row)return null
 const guest:Guest=JSON.parse(row.data),email=guest.email?.trim().toLowerCase()
 if(guest.erased||guest.mergedInto||!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null
 return {row,guest,email,emailHash:await hash(email),identityData:JSON.stringify({name:guest.name,email})}
}
export const guestFence=(db:D1Database,c:NonNullable<Awaited<ReturnType<typeof contact>>>)=>assertion(db,'EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND version=? AND data=?)',c.row.id,c.row.version,c.row.data)
export async function activeGrant(db:D1Database){const s=await settingsRow(db);return s?.enabled&&await db.prepare("SELECT id FROM oa_operators WHERE id=? AND role='owner' AND status='active'").bind(s.owner_id).first()?s:null}
export async function tokenContext(db:D1Database,p:any,kind?:string,now=Date.now()){
 if(typeof p?.token!=='string'||!/^[a-f0-9]{64}$/.test(p.token))unavailable()
 const row=await db.prepare('SELECT * FROM pm_retention_tokens WHERE token_hash=?').bind(await hash(p.token)).first<Token>()
 if(!row||kind&&row.kind!==kind||!Number.isFinite(Date.parse(row.expires_at))||Date.parse(row.expires_at)<=now)unavailable()
 const c=await contact(db,row!.guest_id)
 if(!c||c.identityData!==row!.identity_data||c.emailHash!==row!.email_hash)unavailable()
 return {token:row!,contact:c!}
}
export async function venueScope(db:D1Database){const {state}=await load(db);return state.venue.name}
export const tokenFence=(db:D1Database,t:Token,at:string)=>assertion(db,'EXISTS(SELECT 1 FROM pm_retention_tokens WHERE token_hash=? AND expires_at>?)',t.token_hash,at)
export const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
