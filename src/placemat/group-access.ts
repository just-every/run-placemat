import {actorNames} from './people'
import {fail,type Actor} from './model'
import {guests,hash,load} from './store'
import {preshift,serviceDate} from './preshift'
import {reservationReport} from './reports'
import {parseRights,type GroupRight} from './group-store'

const inactive={active:false as const}
/** Home venue, called by a member venue: is this token live, and what may its holder read at that venue? Any failure is the same answer. */
export async function groupIntrospect(db:D1Database,linkHeader:string|null,token:unknown){
 const [linkId,secret]=String(linkHeader??'').split('.')
 if(!linkId||!secret||typeof token!=='string')return inactive
 const link=await db.prepare('SELECT secret_hash,ceiling FROM pm_group_links WHERE id=? AND revoked_at IS NULL').bind(linkId).first<{secret_hash:string;ceiling:string}>()
 if(!link||link.secret_hash!==await hash(secret))return inactive
 const holder=await tokenHolder(db,token)
 if(!holder)return inactive
 const grant=await db.prepare('SELECT rights FROM pm_group_admins WHERE operator_id=? AND venue_id=?').bind(holder.id,linkId).first<{rights:string}>()
 const ceiling=parseRights(link.ceiling),rights=grant?parseRights(grant.rights).filter(r=>ceiling.includes(r)):[]
 return rights.length?{active:true as const,rights,name:holder.name}:inactive
}
async function tokenHolder(db:D1Database,token:string){
 const row=await db.prepare("SELECT t.operator_id AS id,o.display_name AS name FROM pm_group_tokens t JOIN oa_operators o ON o.id=t.operator_id WHERE t.token_hash=? AND t.expires_at>? AND o.status='active' AND o.role='member'").bind(await hash(token),new Date().toISOString()).first<{id:string;name:string}>()
 return row??null
}

/** What this token may read at this venue: the home venue checks locally, a member venue asks its home with its own link secret. */
async function venueRights(db:D1Database,token:string,fetcher:typeof fetch):Promise<{rights:GroupRight[];holder:Actor}>{
 const home=await db.prepare('SELECT home_origin,link_id,secret,ceiling FROM pm_group_home').first<{home_origin:string;link_id:string;secret:string;ceiling:string}>()
 if(!home){
  const holder=await tokenHolder(db,token),grant=holder?await db.prepare("SELECT rights FROM pm_group_admins WHERE operator_id=? AND venue_id='home'").bind(holder.id).first<{rights:string}>():null
  if(!holder||!grant)return fail(403,'Group access is not active at this venue.')
  return {rights:parseRights(grant.rights),holder:{id:holder.id,name:holder.name,role:'host'}}
 }
 let answer:any
 try{
  const response=await fetcher(home.home_origin+'/api/group/introspect',{method:'POST',redirect:'manual',headers:{'content-type':'application/json','x-group-link':home.link_id+'.'+home.secret},body:JSON.stringify({token}),signal:AbortSignal.timeout(5000)})
  answer=response.ok?await response.json():null
 }catch{answer=null}
 if(answer?.active!==true||!Array.isArray(answer.rights))return fail(403,'Group access is not active at this venue.')
 const ceiling=parseRights(home.ceiling)
 return {rights:(answer.rights as GroupRight[]).filter(r=>ceiling.includes(r)),holder:{id:'group-admin',name:String(answer.name??'Group admin'),role:'host'}}
}

/** Read-only group doors. Each returns the venue's existing reservation report or host pre-shift projection, never contact details, notes, exports or writes. */
export async function groupRead(db:D1Database,request:Request,url:URL,fetcher:typeof fetch=fetch){
 if(request.method!=='GET')return fail(405,'Group access is read-only.')
 const bearer=request.headers.get('authorization')
 if(!bearer?.startsWith('Bearer gt_'))return fail(401,'Send a group token.')
 const need:GroupRight=url.pathname==='/api/group/reports/reservations'?'reports.read':'preshift.read'
 const {rights,holder}=await venueRights(db,bearer.slice(7),fetcher)
 if(!rights.includes(need))return fail(403,'This group access does not include that right at this venue.')
 const {state}=await load(db)
 if(need==='reports.read')return reservationReport(state,url.searchParams)
 const date=url.searchParams.get('date')??serviceDate(new Date().toISOString(),state.venue.timezone)
 return preshift(state,await guests(db),holder,date,undefined,await actorNames(db,state))
}
