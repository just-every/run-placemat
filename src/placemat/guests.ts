import { fail,id,text,type Actor,type Guest,type State,type GuestFieldProvenance } from './model'
import { guestIdentityHashes } from './import/index'
export async function guestFor(db:D1Database,p:any,actor?:Actor):Promise<{guest:Guest;fresh:boolean;hashes:string[]}>{
 const name=text(p.name,'Guest name',200),email=typeof p.email==='string'?p.email.trim().toLowerCase():'',phone=typeof p.phone==='string'?p.phone.trim():''
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email.')
 if(email.length>254||phone.length>40)fail(400,'Contact details are too long.')
 const hashes=await guestIdentityHashes({email,phone})
 for(const key of hashes)if(await db.prepare('SELECT 1 FROM pm_erased WHERE identity_hash=?').bind(key).first())fail(409,'This guest identity was erased and cannot be reimported or rebooked without a new contact identity.')
 const row=email?await db.prepare("SELECT data FROM pm_guests WHERE lower(json_extract(data,'$.email'))=? AND COALESCE(json_extract(data,'$.erased'),0)=0").bind(email).first<{data:string}>():null
 if(row)return {guest:JSON.parse(row.data),fresh:false,hashes}
 const origin:GuestFieldProvenance={source:actor?'staff-observed':'guest-supplied',actor:actor?.id??null,at:new Date().toISOString()}
 return {guest:{id:id(),name,email,phone,notes:'',provenance:{name:origin,...email?{email:origin}:{},...phone?{phone:origin}:{}}},fresh:true,hashes}
}
const normalized=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()
const phoneDigits=(value:string)=>{const digits=value.replace(/\D/g,'');return digits.length===11&&digits.startsWith('1')?digits.slice(1):digits}
/** Search is deliberately separate from the exact-email identity lookup above. */
export function searchGuests(guests:Guest[],query:string):Guest[]{
 const needle=normalized(query.trim()),phoneQuery=/^[+()\d\s.-]+$/.test(query.trim())?phoneDigits(query):''
 return guests.filter(guest=>!guest.erased&&(!needle||normalized(guest.name).includes(needle)||normalized(guest.email).includes(needle)||(phoneQuery.length>0&&phoneDigits(guest.phone).endsWith(phoneQuery))))
}
export function guestInsert(db:D1Database,g:Guest,version:number){return db.prepare('INSERT INTO pm_guests(id,version,data) SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(g.id,JSON.stringify(g),version)}

export function guestGuard(db:D1Database,entry:{guest:{id:string};fresh:boolean;hashes:string[]}){
 const placeholders=entry.hashes.map(()=>'?').join(',')
 const contact=entry.hashes.length?`NOT EXISTS(SELECT 1 FROM pm_erased WHERE identity_hash IN (${placeholders}))`:'1'
 const native=entry.fresh?'1':"EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND COALESCE(json_extract(data,'$.erased'),0)=0)"
 return db.prepare(`INSERT INTO pm_assertions(ok) SELECT CASE WHEN ${contact} AND ${native} THEN 1 ELSE 0 END`).bind(...entry.hashes,...(entry.fresh?[]:[entry.guest.id]))
}

/** GUEST-004 review only: matching evidence never changes identity or permission. */
export function duplicateReview(people:Guest[],state:State,guestId:string){
 const guest=people.find(g=>g.id===guestId&&!g.erased)??fail(404,'Guest not found.')
 const name=(value:string)=>normalized(value).trim().replace(/\s+/g,' ')
 const email=(value:string)=>value.trim().toLowerCase()
 const reasons=(other:Guest)=>[
  ...(email(guest.email)&&email(guest.email)===email(other.email)?['Same normalized email']:[]),
  ...(phoneDigits(guest.phone).length>=7&&phoneDigits(guest.phone)===phoneDigits(other.phone)?['Shared phone; may be a household']:[]),
  ...(name(guest.name)&&name(guest.name)===name(other.name)?['Same normalized name']:[])
 ]
 const preview=(g:Guest)=>({
  guest:g,
  importedVisits:g.history??[],
  bookings:state.bookings.filter(b=>b.guestId===g.id).map(b=>({id:b.id,serviceId:b.serviceId,startAt:b.startAt,partySize:b.partySize,status:b.status,source:b.source})),
  queueContactPermissions:state.waitlist.filter(w=>w.guestId===g.id).map(w=>({entryId:w.id,serviceId:w.serviceId,contactConsent:w.contactConsent??null})),
  marketingPermission:'Not recorded',spend:null
 })
 const facts=(g:Guest)=>({name:g.name,email:g.email,phone:g.phone,notes:g.notes,tags:g.profile?.tags??[],vipLevel:g.profile?.vipLevel??'none',seatingPreference:g.profile?.seatingPreference??''})
 const candidates=people.filter(g=>g.id!==guest.id&&!g.erased&&reasons(g).length).map(other=>{
  const evidence=reasons(other),left=facts(guest),right=facts(other)
  const conflicts=(Object.keys(left) as Array<keyof typeof left>).filter(key=>JSON.stringify(left[key])!==JSON.stringify(right[key])).map(field=>({field,selected:left[field],candidate:right[field]}))
  return {...preview(other),reasons:evidence,conflicts}
 }).sort((a,b)=>a.guest.id.localeCompare(b.guest.id))
 return {selected:preview(guest),candidates,notice:'Suggestions only. Shared contacts do not establish identity. Profiles, visits and permissions stay separate. Merge and reversal are not available.'}
}
