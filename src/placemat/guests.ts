import { fail,id,text,type Actor,type Guest,type State,type GuestFieldProvenance } from './model'
import { guestIdentityHashes } from './import/index'
import type {MergeGuest} from './guest-merge-types'

/** Contact matching deliberately does not rewrite dots, plus tags or internal spaces. */
export const normalizedGuestEmail=(value:string)=>value.trim().toLowerCase()
export const normalizedGuestName=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim()
export function normalizedGuestPhone(value:string):string {
 const digits=value.replace(/\D/g,'')
 return digits.length===10?'+1'+digits:digits.length===11&&digits.startsWith('1')?'+'+digits:''
}
export async function guestFor(db:D1Database,p:any,actor?:Actor):Promise<{guest:Guest;fresh:boolean;hashes:string[]}>{
 const name=text(p.name,'Guest name',200),email=typeof p.email==='string'?normalizedGuestEmail(p.email):'',phone=typeof p.phone==='string'?p.phone.trim():''
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email.')
 if(email.length>254||phone.length>40)fail(400,'Contact details are too long.')
 const hashes=await guestIdentityHashes({email,phone})
 for(const key of hashes)if(await db.prepare('SELECT 1 FROM pm_erased WHERE identity_hash=?').bind(key).first())fail(409,'This guest identity was erased and cannot be reimported or rebooked without a new contact identity.')
 const matches=email?(await db.prepare("SELECT data FROM pm_guests WHERE lower(trim(json_extract(data,'$.email')))=? AND COALESCE(json_extract(data,'$.erased'),0)=0 ORDER BY id").bind(email).all<{data:string}>()).results:[]
 const resolved=new Map<string,MergeGuest>()
 for(const row of matches){
  let guest:MergeGuest=JSON.parse(row.data)
  const visited=new Set<string>()
  while(guest.mergedInto){
   if(visited.has(guest.id))fail(409,'This merged guest identity needs manager review.')
   visited.add(guest.id)
   const next=await db.prepare('SELECT data FROM pm_guests WHERE id=?').bind(guest.mergedInto).first<{data:string}>()
   if(!next)fail(409,'This merged guest identity needs manager review.')
   guest=JSON.parse(next!.data)
  }
  if(guest.erased)fail(409,'This guest identity was erased and cannot be rebooked without a new contact identity.')
  resolved.set(guest.id,guest)
 }
 if(resolved.size>1)fail(409,'This email belongs to separate guest profiles. A manager must review them before booking.')
 if(resolved.size)return {guest:[...resolved.values()][0],fresh:false,hashes}
 const origin:GuestFieldProvenance={source:actor?'staff-observed':'guest-supplied',actor:actor?.id??null,at:new Date().toISOString()}
 return {guest:{id:id(),name,email,phone,notes:'',provenance:{name:origin,...email?{email:origin}:{},...phone?{phone:origin}:{}}},fresh:true,hashes}
}
const phoneDigits=(value:string)=>{const digits=value.replace(/\D/g,'');return digits.length===11&&digits.startsWith('1')?digits.slice(1):digits}
/** Search is deliberately separate from the exact-email identity lookup above. */
export function searchGuests(guests:Guest[],query:string):Guest[]{
 const needle=normalizedGuestName(query),phoneQuery=/^[+()\d\s.-]+$/.test(query.trim())?phoneDigits(query):''
 return guests.filter(guest=>!guest.erased&&!(guest as MergeGuest).mergedInto&&(!needle||normalizedGuestName(guest.name).includes(needle)||normalizedGuestName(guest.email).includes(needle)||(phoneQuery.length>0&&phoneDigits(guest.phone).endsWith(phoneQuery))))
}
export function guestInsert(db:D1Database,g:Guest,version:number){return db.prepare('INSERT INTO pm_guests(id,version,data) SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(g.id,JSON.stringify(g),version)}

export function guestGuard(db:D1Database,entry:{guest:{id:string};fresh:boolean;hashes:string[]}){
 const placeholders=entry.hashes.map(()=>'?').join(',')
 const contact=entry.hashes.length?`NOT EXISTS(SELECT 1 FROM pm_erased WHERE identity_hash IN (${placeholders}))`:'1'
 const native=entry.fresh?'1':"EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND COALESCE(json_extract(data,'$.erased'),0)=0 AND json_extract(data,'$.mergedInto') IS NULL)"
 return db.prepare(`INSERT INTO pm_assertions(ok) SELECT CASE WHEN ${contact} AND ${native} THEN 1 ELSE 0 END`).bind(...entry.hashes,...(entry.fresh?[]:[entry.guest.id]))
}

/** Suggestions never establish identity or change contact permissions. */
export function duplicateReview(people:Guest[],state:State,guestId:string){
 const guest=people.find(g=>g.id===guestId&&!g.erased&&!(g as MergeGuest).mergedInto)??fail(404,'Guest not found.')
 const sameEmail=(g:Guest)=>!!normalizedGuestEmail(guest.email)&&normalizedGuestEmail(guest.email)===normalizedGuestEmail(g.email)
 const samePhone=(g:Guest)=>!!normalizedGuestPhone(guest.phone)&&normalizedGuestPhone(guest.phone)===normalizedGuestPhone(g.phone)
 const sameName=(g:Guest)=>!!normalizedGuestName(guest.name)&&normalizedGuestName(guest.name)===normalizedGuestName(g.name)
 const preview=(g:Guest)=>({guest:g,importedVisits:g.history??[],bookings:state.bookings.filter(b=>b.guestId===g.id).map(b=>({id:b.id,serviceId:b.serviceId,startAt:b.startAt,partySize:b.partySize,status:b.status,source:b.source})),queueContactPermissions:state.waitlist.filter(w=>w.guestId===g.id).map(w=>({entryId:w.id,serviceId:w.serviceId,contactConsent:w.contactConsent??null})),marketingPermission:'Not recorded',spend:null})
 const facts=(g:Guest)=>({name:g.name,email:g.email,phone:g.phone,notes:g.notes,tags:g.profile?.tags??[],vipLevel:g.profile?.vipLevel??'none',seatingPreference:g.profile?.seatingPreference??''})
 const others=people.filter(g=>g.id!==guest.id&&!g.erased&&!(g as MergeGuest).mergedInto)
 const candidates=others.filter(g=>!(samePhone(g)&&!sameName(g))&&(sameEmail(g)||samePhone(g)&&sameName(g))).map(other=>{
  const left=facts(guest),right=facts(other)
  const conflicts=(Object.keys(left) as Array<keyof typeof left>).filter(key=>JSON.stringify(left[key])!==JSON.stringify(right[key])).map(field=>({field,selected:left[field],candidate:right[field]}))
  return {...preview(other),reasons:[...sameEmail(other)?['Same normalized email']:[],...samePhone(other)&&sameName(other)?['Same normalized phone and name']:[]],conflicts}
 }).sort((a,b)=>a.guest.id.localeCompare(b.guest.id))
 const households=others.filter(g=>samePhone(g)&&!sameName(g)).map(g=>({...preview(g),reasons:['Shared phone with a different name; household, not a duplicate suggestion']}))
 return {selected:preview(guest),candidates,households,notice:'Suggestions only. Shared contacts do not establish identity. A manager must review and explicitly confirm each merge. Contact permissions are never inferred.'}
}
