import {fail,id,type Actor} from './model'
import {hash,load,save} from './store'
import {bookingContact,contactFence} from './diner-accounts'
import {groupIntrospect,venueRights} from './group-access'
import {groupSecret,parseRights} from './group-store'
import {groupToken} from './group'
import {erasureCheckpoint} from './backup'

type Consent={account_id:string;profile_id:string;group_origin:string;binding:string;preferences:number;visits:number;rebooking:number;updated_at:string}
type Diner={account:{id:string;email:string};digest:string;bookings:{id:string}[]}
const purposes=['preferences','visits','rebooking'] as const
const denied=():never=>fail(403,'Group guest access is not active. Check current venue grants and guest choices.')
async function membership(db:D1Database,origin:string){
 const member=await db.prepare('SELECT home_origin,link_id,secret FROM pm_group_home').first<{home_origin:string;link_id:string;secret:string}>()
 if(member)return {origin:member.home_origin,binding:member.link_id,member}
 const links=(await db.prepare('SELECT id,name,origin FROM pm_group_links WHERE revoked_at IS NULL ORDER BY id').all<{id:string;name:string;origin:string}>()).results
 return links.length?{origin,binding:'home',links}:null
}
async function current(db:D1Database,profileId:string){
 const row=await db.prepare('SELECT g.*,a.email,a.preferences AS saved_preferences FROM pm_group_guests g JOIN pm_diner_accounts a ON a.id=g.account_id WHERE g.profile_id=?').bind(profileId).first<Consent&{email:string;saved_preferences:string}>()
 if(!row||!purposes.some(p=>row[p]===1))return null
 const member=await db.prepare('SELECT home_origin,link_id FROM pm_group_home').first<{home_origin:string;link_id:string}>()
 if(member?(row.binding!==member.link_id||row.group_origin!==member.home_origin):row.binding!=='home')return null
 // A portable account, equal mailbox or venue membership is never booking proof.
 const links=(await db.prepare('SELECT booking_id,guest_id FROM pm_diner_bookings WHERE account_id=?').bind(row.account_id).all<{booking_id:string;guest_id:string}>()).results
 const bookings=[]
 for(const link of links){
  const c=await bookingContact(db,link.booking_id)
  if(c&&c.guest.id===link.guest_id&&c.contact.email.trim().toLowerCase()===row.email)bookings.push(c.booking)
 }
 return bookings.length?{row,bookings}:null
}
async function peer(db:D1Database,header:string|null){
 const [linkId,secret]=String(header??'').split('.')
 const link=await db.prepare('SELECT id,secret_hash,ceiling FROM pm_group_links WHERE id=? AND revoked_at IS NULL').bind(linkId??'').first<{id:string;secret_hash:string;ceiling:string}>()
 return link&&secret&&link.secret_hash===await hash(secret)&&parseRights(link.ceiling).includes('guestbook.read')?link:null
}
export async function groupGuestRedeem(db:D1Database,header:string|null,p:any){
 const link=await peer(db,header);if(!link)return denied()
 const digest=await hash(String(p.code??'')),code=await db.prepare('SELECT * FROM pm_group_guest_codes WHERE digest=? AND link_id=? AND expires_at>?').bind(digest,link.id,Date.now()).first<{account_id:string;profile_id:string}>()
 if(!code||!(await current(db,code.profile_id)))return denied()
 // DELETE RETURNING claims the one-use code atomically, including concurrent requests.
 const claimed=await db.prepare('DELETE FROM pm_group_guest_codes WHERE digest=? AND expires_at>? RETURNING profile_id').bind(digest,Date.now()).first<{profile_id:string}>()
 if(!claimed)return denied()
 return {profileId:claimed.profile_id}
}
export async function groupGuestCheck(db:D1Database,header:string|null,p:any){
 const link=await peer(db,header),grant=await groupIntrospect(db,header,p.token)
 if(!link||!grant.active||!grant.rights.includes('guestbook.read'))return {active:false}
 const homeRights=await venueRights(db,p.token,fetch).catch(()=>null)
 if(!homeRights?.rights.includes('guestbook.read'))return {active:false}
 const batch=Array.isArray(p.profileIds),ids=batch?p.profileIds:[String(p.profileId??'')],profiles=[]
 for(const profileId of ids){
  if(typeof profileId!=='string')return {active:false}
  const c=await current(db,profileId)
  if(c)profiles.push({profileId,purposes:Object.fromEntries(purposes.map(p=>[p,!!c.row[p]]))})
 }
 return batch?{active:true,profiles}:{active:profiles.length===1,purposes:profiles[0]?.purposes??null}
}
export async function dinerGroup(db:D1Database,origin:string,action:string,p:any,s:Diner,fetcher:typeof fetch=fetch){
 const group=await membership(db,origin)
 if(!group)return {connected:false}
 const existing=await db.prepare('SELECT * FROM pm_group_guests WHERE account_id=?').bind(s.account.id).first<Consent>()
 const same=existing?.binding===group.binding&&existing?.group_origin===group.origin
 if(action==='group')return {connected:true,homeOrigin:group.origin,member:!!group.member,venues:group.links??[],profileId:same?existing?.profile_id:null,purposes:Object.fromEntries(purposes.map(p=>[p,same&&existing?.[p]===1]))}
 if(p.acknowledged!==true)fail(400,'Confirm these separate group choices. Restaurant preferences alone do not authorize sharing.')
 const first=await bookingContact(db,s.bookings[0].id);if(!first)return denied()
 const fences=[...contactFence(db,first),db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_diner_sessions WHERE digest=? AND account_id=? AND expires_at>?) THEN 1 ELSE 0 END').bind(s.digest,s.account.id,Date.now())]
 const {state,version}=await load(db),at=new Date().toISOString()
 if(action==='group-code'){
  if(group.member||!same||!purposes.some(p=>existing![p]===1))return denied()
  if(!group.links?.some(l=>l.id===p.venueId))return denied()
  const code=groupSecret('gg_')
  await db.batch([...fences,db.prepare('DELETE FROM pm_group_guest_codes WHERE account_id=? OR expires_at<=?').bind(s.account.id,Date.now()),db.prepare('INSERT INTO pm_group_guest_codes(digest,account_id,profile_id,link_id,expires_at) VALUES(?,?,?,?,?)').bind(await hash(code),s.account.id,existing!.profile_id,p.venueId,Date.now()+15*60000)])
  return {code,expiresAt:new Date(Date.now()+15*60000).toISOString()}
 }
 if(!['group-consent','group-link'].includes(action))fail(404,'Not found')
 if(purposes.some(k=>typeof p[k]!=='boolean'))fail(400,'Choose each group purpose separately.')
 let profileId=same?existing!.profile_id:id()
 if(action==='group-link'){
  if(!group.member)return denied()
  let answer:any
  try{
   const r=await fetcher(group.origin+'/api/group/guest-redeem',{method:'POST',redirect:'manual',headers:{'content-type':'application/json','x-group-link':group.member.link_id+'.'+group.member.secret},body:JSON.stringify({code:p.code}),signal:AbortSignal.timeout(5000)})
   answer=r.ok?await r.json():null
  }catch{return denied()}
  if(typeof answer?.profileId!=='string')return denied()
  profileId=answer.profileId
 }else if(group.member&&!same)fail(409,'First link your separately verified booking with a one-use code from the home venue.')
 await erasureCheckpoint(db)
 // Consent audit records purposes, never a copy of private preferences or cross-venue contacts.
 state.audit.push({id:id(),at,actor:'guest',action:'group.guest.consent',subject:'venue',source:'guest-supplied',changes:[{kind:'groupConsent',id:s.account.id,before:same?Object.fromEntries(purposes.map(k=>[k,!!existing![k]])):null,after:Object.fromEntries(purposes.map(k=>[k,p[k]]))}]})
 await save(db,state,version,[...fences,db.prepare('DELETE FROM pm_group_guest_codes WHERE account_id=?').bind(s.account.id),db.prepare('INSERT INTO pm_group_guests(account_id,profile_id,group_origin,binding,preferences,visits,rebooking,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET profile_id=excluded.profile_id,group_origin=excluded.group_origin,binding=excluded.binding,preferences=excluded.preferences,visits=excluded.visits,rebooking=excluded.rebooking,updated_at=excluded.updated_at').bind(s.account.id,profileId,group.origin,group.binding,p.preferences?1:0,p.visits?1:0,p.rebooking?1:0,at)])
 await erasureCheckpoint(db)
 return {saved:true,profileId,purposes:Object.fromEntries(purposes.map(k=>[k,p[k]]))}
}
export async function groupGuestRead(db:D1Database,request:Request,url:URL,fetcher:typeof fetch=fetch){
 if(request.method!=='GET')fail(405,'Group guest access is read-only.')
 const bearer=request.headers.get('authorization');if(!bearer?.startsWith('Bearer gt_'))fail(401,'Send a group token.')
 const token=bearer!.slice(7),rights=await venueRights(db,token,fetcher)
 if(!rights.rights.includes('guestbook.read'))return denied()
 const batch=url.searchParams.get('directory')==='1',ids=url.searchParams.getAll('profileId')
 if(!batch&&ids.length!==1)return denied()
 const profiles=[]
 for(const profileId of ids){
  const c=await current(db,profileId)
  if(!c){
   // An unlinked diner has no record here. An invalid existing relationship still fails closed.
   if(batch&&!await db.prepare('SELECT profile_id FROM pm_group_guests WHERE profile_id=?').bind(profileId).first())continue
   return denied()
  }
  profiles.push({profileId,c,allowed:Object.fromEntries(purposes.map(p=>[p,!!c.row[p]]))})
 }
 const member=await db.prepare('SELECT home_origin,link_id,secret FROM pm_group_home').first<{home_origin:string;link_id:string;secret:string}>()
 if(member&&profiles.length){
  let answer:any
  try{const r=await fetcher(member.home_origin+'/api/group/guest-check',{method:'POST',redirect:'manual',headers:{'content-type':'application/json','x-group-link':member.link_id+'.'+member.secret},body:JSON.stringify(batch?{token,profileIds:profiles.map(p=>p.profileId)}:{token,profileId:profiles[0].profileId}),signal:AbortSignal.timeout(5000)});answer=r.ok?await r.json():null}catch{return denied()}
  if(answer?.active!==true||batch&&!Array.isArray(answer.profiles))return denied()
  for(const profile of profiles){
   const home=batch?answer.profiles.find((p:any)=>p.profileId===profile.profileId):answer
   if(!home)return denied()
   profile.allowed=Object.fromEntries(purposes.map(p=>[p,profile.allowed[p]&&home.purposes?.[p]===true]))
  }
 }
 const {state}=await load(db)
 const rows=profiles.map(({profileId,c,allowed})=>({venue:state.venue.name,profileId,preferences:allowed.preferences?c.row.saved_preferences:null,visits:allowed.visits?c.bookings.filter(b=>['seated','completed'].includes(b.status)).map(b=>({startAt:b.startAt,partySize:b.partySize,status:b.status})):[],rebookUrl:allowed.rebooking?'/book':null,purposes:allowed}))
 return batch?{profiles:rows}:rows[0]
}
/** Home native reader directory. Remote reads go through each live venue door, with no cached personal projection. */
export async function groupGuestDirectory(db:D1Database,actor:Actor,fetcher:typeof fetch=fetch){
 const {token}=await groupToken(db,actor),rights=await venueRights(db,token,fetcher)
 if(!rights.rights.includes('guestbook.read'))return denied()
 const links=(await db.prepare('SELECT l.id,l.name,l.origin,a.rights FROM pm_group_links l JOIN pm_group_admins a ON a.venue_id=l.id WHERE a.operator_id=? AND l.revoked_at IS NULL').bind(actor.id).all<{id:string;name:string;origin:string;rights:string}>()).results.filter(l=>parseRights(l.rights).includes('guestbook.read'))
 const profiles=(await db.prepare("SELECT profile_id FROM pm_group_guests WHERE binding='home' AND (preferences=1 OR visits=1 OR rebooking=1)").all<{profile_id:string}>()).results
 const search=new URLSearchParams({directory:'1'})
 for(const {profile_id} of profiles)if(await current(db,profile_id))search.append('profileId',profile_id)
 const url=new URL('https://local.invalid/api/group/guestbook?'+search)
 const local=await groupGuestRead(db,new Request(url,{headers:{authorization:'Bearer '+token}}),url,fetcher)
 if(!('profiles' in local))return denied()
 const rows=local.profiles.map(profile=>({profileId:profile.profileId,venues:[profile]}))
 // One authenticated batch per venue keeps a refresh independent of diner count at the group limiter.
 for(const link of links){
  const response=await fetcher(link.origin+'/api/group/guestbook?'+search,{redirect:'manual',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)}).catch(()=>null)
  if(!response||!response.ok)return denied()
  const data:any=await response.json()
  if(!Array.isArray(data?.profiles))return denied()
  for(const row of rows){
   const remote=data.profiles.find((p:any)=>p.profileId===row.profileId)
   if(remote)row.venues.push({...remote,rebookUrl:remote.rebookUrl?link.origin+'/book':null})
  }
 }
 return {profiles:rows}
}
