import { fail,id,text,type Guest } from './model'
import { guestIdentityHashes } from './import/index'
export async function guestFor(db:D1Database,p:any):Promise<{guest:Guest;fresh:boolean;hashes:string[]}>{
 const name=text(p.name,'Guest name',200),email=typeof p.email==='string'?p.email.trim().toLowerCase():'',phone=typeof p.phone==='string'?p.phone.trim():''
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email.')
 if(email.length>254||phone.length>40)fail(400,'Contact details are too long.')
 const hashes=await guestIdentityHashes({email,phone})
 for(const key of hashes)if(await db.prepare('SELECT 1 FROM pm_erased WHERE identity_hash=?').bind(key).first())fail(409,'This guest identity was erased and cannot be reimported or rebooked without a new contact identity.')
 const row=email?await db.prepare("SELECT data FROM pm_guests WHERE lower(json_extract(data,'$.email'))=? AND COALESCE(json_extract(data,'$.erased'),0)=0").bind(email).first<{data:string}>():null
 if(row)return {guest:JSON.parse(row.data),fresh:false,hashes}
 return {guest:{id:id(),name,email,phone,notes:''},fresh:true,hashes}
}
export function guestInsert(db:D1Database,g:Guest,version:number){return db.prepare('INSERT INTO pm_guests(id,version,data) SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(g.id,JSON.stringify(g),version)}

export function guestGuard(db:D1Database,entry:{guest:{id:string};fresh:boolean;hashes:string[]}){
 const placeholders=entry.hashes.map(()=>'?').join(',')
 const contact=entry.hashes.length?`NOT EXISTS(SELECT 1 FROM pm_erased WHERE identity_hash IN (${placeholders}))`:'1'
 const native=entry.fresh?'1':"EXISTS(SELECT 1 FROM pm_guests WHERE id=? AND COALESCE(json_extract(data,'$.erased'),0)=0)"
 return db.prepare(`INSERT INTO pm_assertions(ok) SELECT CASE WHEN ${contact} AND ${native} THEN 1 ELSE 0 END`).bind(...entry.hashes,...(entry.fresh?[]:[entry.guest.id]))
}
