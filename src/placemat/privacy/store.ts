import {fail,id,text,type Actor} from '../model'
import {hash,load} from '../store'
export const categories=['guestNotes','messageContent','imports','financialEvidence'] as const
export type Policy=Record<typeof categories[number],{days:number;ground:string}>
export function policyInput(p:any):Policy{
 const result={} as Policy
 for(const key of categories){const rule=p?.[key];if(!rule||!Number.isSafeInteger(rule.days)||rule.days<(key==='financialEvidence'?1:0)||rule.days>36500)fail(400,'Personal-content periods must be 0 to 36500 days; financial review must be at least one day.');result[key]={days:rule.days,ground:text(rule.ground,'Documented retention ground',500)}}
 return result
}
export const ownerFence=(db:D1Database,actor:Actor)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active') THEN 1 ELSE 0 END").bind(actor.id)
export const event=(db:D1Database,actor:Actor,requestId:string|null,action:string,details:unknown={})=>db.prepare('INSERT INTO pm_privacy_events(id,request_id,actor_id,action,at,details) VALUES(?,?,?,?,?,?)').bind(id(),requestId,actor.id,action,new Date().toISOString(),JSON.stringify(details))
export async function policy(db:D1Database){const row=await db.prepare('SELECT version,data,actor_id AS actorId,updated_at AS updatedAt FROM pm_privacy_policy WHERE id=1').first<any>();return row?{...row,rules:JSON.parse(row.data),data:undefined}:null}
export async function savePolicy(db:D1Database,actor:Actor,p:any){
 const rules=policyInput(p.rules),current=await policy(db),version=(current?.version??0)+1,at=new Date().toISOString()
 if(p.version!==(current?.version??0))fail(409,'Retention settings changed. Read them again before saving.')
 await db.batch([ownerFence(db,actor),db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN COALESCE((SELECT version FROM pm_privacy_policy WHERE id=1),0)=? THEN 1 ELSE 0 END').bind(version-1),db.prepare('INSERT INTO pm_privacy_policy(id,version,data,actor_id,updated_at) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data,actor_id=excluded.actor_id,updated_at=excluded.updated_at').bind(version,JSON.stringify(rules),actor.id,at),event(db,actor,null,'policy.changed',{version,rules}),db.prepare('DELETE FROM pm_assertions')])
 return policy(db)
}
export async function guestRow(db:D1Database,guestId:unknown){const row=await db.prepare('SELECT id,version,data FROM pm_guests WHERE id=?').bind(text(guestId,'Guest')).first<any>();if(!row)fail(404,'Guest not found.');return {...row,guest:JSON.parse(row.data)}}
export async function reviewRetention(db:D1Database){
 const current=await policy(db);if(!current)fail(409,'Record retention periods and grounds first.')
 const {state,version}=await load(db),rows=(await db.prepare('SELECT id,version,data FROM pm_guests ORDER BY id').all<any>()).results
 const days=Math.max(...categories.filter(k=>k!=='financialEvidence').map(k=>current.rules[k].days)),cutoff=new Date(Date.now()-days*86400000).toISOString(),now=new Date().toISOString()
 const guests=rows.filter(r=>!JSON.parse(r.data).erased&&!JSON.parse(r.data).mergedInto).map(r=>{
  const g=JSON.parse(r.data),bookings=state.bookings.filter(b=>b.guestId===r.id),queues=state.waitlist.filter(w=>w.guestId===r.id),inquiries=(state.inquiries??[]).filter(i=>i.guestId===r.id)
  const dates=[...Object.values(g.provenance??{}).map((p:any)=>p.at),...(g.notesHistory??[]).map((n:any)=>n.provenance?.at),...(g.history??[]).map((v:any)=>v.date),...bookings.flatMap(b=>[b.createdAt,b.endAt,...(b.needHistory??[]).map(e=>e.at)]),...queues.flatMap(w=>(w.history??[]).map(e=>e.at)),...inquiries.flatMap(i=>i.messages.map(m=>m.at))].filter(d=>typeof d==='string'&&Number.isFinite(Date.parse(d))).map(d=>new Date(d).toISOString()).sort()
  const lastAt=dates.at(-1)??null,active=bookings.some(b=>['booked','seated'].includes(b.status))||queues.some(w=>['waiting','queued','offered'].includes(w.status))||inquiries.some(i=>!['converted','closed'].includes(i.status))
  const undatedNotes=!!g.notes&&!g.provenance?.notes?.at
  const eligible=!active&&!undatedNotes&&!!lastAt&&lastAt<cutoff
  return {id:r.id,name:g.name,lastAt,eligible,reason:active?'Active service work':undatedNotes||!lastAt?'Original date not recorded':eligible?'All personal-content periods elapsed':'Retention period has not elapsed'}
 })
 const fingerprint=await hash(JSON.stringify({policyVersion:current.version,version,rows:rows.map(r=>[r.id,r.version]),guests:guests.map(g=>[g.id,g.eligible]),day:now.slice(0,10)}))
 return {policy:current,cutoff,guests,fingerprint,floorVersion:version,guestVersions:Object.fromEntries(rows.map(r=>[r.id,r.version])),notice:'Review only. An explicit run erases selected eligible identities and all associated personal content; financial references remain for the recorded ground. No processor request is sent.'}
}
