const bad=()=>{throw Object.assign(new Error('Invalid guest retention history. Nothing was restored; download a fresh backup after correcting the source records.'),{status:400})}
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const string=(v,max=200)=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const instant=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,19)===v.slice(0,19)
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max
const keys=(v,allowed,required=allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(v,k))
const parse=v=>{try{const p=JSON.parse(v);if(object(p))return p}catch{}bad()}
const monthDay=v=>{if(v===null)return true;if(typeof v!=='string'||!/^\d\d-\d\d$/.test(v))return false;const d=new Date('2000-'+v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(5,10)===v}
const clock=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v)
function index(rows,key,fields){const out=new Map();for(const r of rows){if(!keys(r,fields)||!string(r[key])||out.has(r[key]))bad();out.set(r[key],r)}return out}
const workflowFields=['id','data','status','preview_hash','preview_data','created_at','updated_at']
const factFields=['guest_id','created_at','birthday','anniversary','provenance','updated_at']
const deliveryFields=['id','workflow_id','guest_id','occurrence','offer_data','email_hash','state','created_at','accepted_at','cap_until','provider_id']
const attributionFields=['booking_id','delivery_id','guest_id','created_at']
const configFields=['name','trigger','offer','delayDays','lapsedDays','experienceId','capDays','quietStart','quietEnd','expiresAt']
function validateConfig(data){
 const c=parse(data)
 if(!keys(c,configFields,configFields.filter(k=>k!=='experienceId'))||!string(c.name,150)||!string(c.offer,4000)||!['welcome','birthday','anniversary','first-to-second','lapsed','experience'].includes(c.trigger)||!integer(c.delayDays,0,365)||!integer(c.lapsedDays,1,730)||!integer(c.capDays,1,365)||!clock(c.quietStart)||!clock(c.quietEnd)||c.quietStart===c.quietEnd||!instant(c.expiresAt)||c.trigger==='experience'&&!string(c.experienceId,100)||c.trigger!=='experience'&&c.experienceId!==undefined)bad()
 return c
}
/** Free-text source references and exact recipient previews are installation-local. */
export function portableRetentionRow(table,row){
 if(table==='pm_retention_facts'){
  const provenance=parse(row.provenance)
  return {...row,provenance:JSON.stringify(Object.fromEntries(Object.entries(provenance).map(([field,p])=>[field,{source:p.source,actor:p.actor,at:p.at}])))}
 }
 if(table==='pm_retention_workflows')return {...row,status:'stopped',preview_hash:null,preview_data:null}
 if(table==='pm_retention_deliveries')return {...row,email_hash:'',state:row.state==='claimed'?'cancelled':row.state}
 return row
}
/** Archives carry history only: no grant, identity-bound consent or executable approval survives. */
export async function validateRetention(read,stateRows,guestRows){
 const [facts,workflows,deliveries,attributions]=await Promise.all(['pm_retention_facts','pm_retention_workflows','pm_retention_deliveries','pm_retention_attributions'].map(read))
 if(!stateRows.length&&(workflows.length||deliveries.length||attributions.length))bad()
 const guests=new Map(guestRows.map(r=>[r.id,parse(r.data)])),state=stateRows.length?parse(stateRows[0].data):{},bookings=new Map((state.bookings??[]).map(b=>[b.id,b]))
 const live=id=>guests.has(id)&&!guests.get(id).erased
 // Merging changes booking ownership, while an accepted delivery retains its historical subject.
 // Follow only actual aliases; the archive cannot use this relationship to revive consent.
 const identity=id=>{const seen=new Set();while(guests.get(id)?.mergedInto){if(seen.has(id))bad();seen.add(id);id=guests.get(id).mergedInto}return id}
 const sameGuest=(a,b)=>live(a)&&live(b)&&live(identity(a))&&identity(a)===identity(b)
 index(facts,'guest_id',factFields)
 const ws=index(workflows,'id',workflowFields),ds=index(deliveries,'id',deliveryFields)
 index(attributions,'booking_id',attributionFields)
 for(const f of facts){
  if(!live(f.guest_id)||!instant(f.created_at)||!instant(f.updated_at)||Date.parse(f.updated_at)<Date.parse(f.created_at)||!monthDay(f.birthday)||!monthDay(f.anniversary))bad()
  const p=parse(f.provenance)
  if(!keys(p,['birthday','anniversary'],[]))bad()
  for(const field of Object.keys(p)){const source=p[field];if(!keys(source,['source','actor','at'])||source.source!=='staff-observed'||!string(source.actor)||!instant(source.at)||Date.parse(source.at)>Date.parse(f.updated_at))bad()}
  for(const field of ['birthday','anniversary'])if(f[field]!==null&&!p[field])bad()
 }
 for(const w of workflows){
  if(w.status!=='stopped'||w.preview_hash!==null||w.preview_data!==null||!instant(w.created_at)||!instant(w.updated_at)||Date.parse(w.updated_at)<Date.parse(w.created_at))bad()
  validateConfig(w.data)
 }
 const occurrences=new Set()
 for(const d of deliveries){
  const occurrence=JSON.stringify([d.workflow_id,d.guest_id,d.occurrence])
  if(!ws.has(d.workflow_id)||!live(d.guest_id)||!string(d.occurrence,300)||occurrences.has(occurrence)||d.email_hash!==''||!['accepted','unconfirmed','suppressed','cancelled'].includes(d.state)||!instant(d.created_at)||!instant(d.cap_until)||Date.parse(d.cap_until)<Date.parse(d.created_at)||d.provider_id!==null&&!string(d.provider_id,300))bad()
  if(d.state==='accepted'? !instant(d.accepted_at)||Date.parse(d.accepted_at)<Date.parse(d.created_at) : d.accepted_at!==null)bad()
  const config=validateConfig(d.offer_data),prefix={'first-to-second':'first',lapsed:'lapsed',birthday:'birthday',anniversary:'anniversary',experience:'experience'}[config.trigger]
  if(config.trigger==='welcome'?d.occurrence!=='welcome':!d.occurrence.startsWith(prefix+':'))bad()
  if(config.trigger==='experience'&&!d.occurrence.startsWith('experience:'+config.experienceId+':'))bad()
  if(Date.parse(config.expiresAt)<Date.parse(d.created_at))bad()
  if(!/^(welcome|(?:birthday|anniversary):\d{4}|experience:.+:\d+|(?:first|lapsed):.+)$/.test(d.occurrence))bad()
  if(/^(first|lapsed):/.test(d.occurrence)){const b=bookings.get(d.occurrence.slice(d.occurrence.indexOf(':')+1));if(!b||!sameGuest(b.guestId,d.guest_id))bad()}
  occurrences.add(occurrence)
 }
 for(const a of attributions){const b=bookings.get(a.booking_id),d=ds.get(a.delivery_id);if(!b||!sameGuest(b.guestId,a.guest_id)||!d||d.guest_id!==a.guest_id||d.state!=='accepted'||!instant(a.created_at)||Date.parse(a.created_at)<Date.parse(d.accepted_at)||!instant(b.createdAt)||Date.parse(b.createdAt)<Date.parse(d.accepted_at))bad()}
}
