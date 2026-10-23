const bad=()=>Object.assign(new Error('Invalid operating cost history. Nothing was restored; correct the source records and download a fresh backup.'),{status:400})
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)
const string=(v,max=1000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const unsigned=(v,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=0&&v<=max
const signed=v=>Number.isSafeInteger(v)
const month=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(v)
const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
const day=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&instant(v+'T00:00:00Z')&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
function parse(value){try{const data=JSON.parse(value);if(object(data))return data}catch{}throw bad()}
function indexed(rows,key){const map=new Map();for(const r of rows){if(!object(r)||!string(r[key])||map.has(r[key]))throw bad();map.set(r[key],r)}return map}
function quote(v,created){return v===null||object(v)&&unsigned(v.micros,100000000000)&&string(v.source,300)&&day(v.date)&&v.date<=created.slice(0,10)}
function source(v){if(!object(v)||!string(v.name)||!string(v.note,4000)||!day(v.checked))return false;try{const u=new URL(v.url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash}catch{return false}}
/** Validate historical snapshots and their arithmetic, never today's published rates.
 * Actual usage in an invoice is a snapshot: later payments must not invalidate it. */
export async function validateCosts(read){
 const [previews,budgets,invoices]=await Promise.all(['pm_cost_previews','pm_cost_budgets','pm_cost_invoices'].map(read))
 const previewMap=indexed(previews,'id');indexed(budgets,'month');indexed(invoices,'id');indexed(invoices,'reference')
 for(const row of previews){
  if(!month(row.month)||!string(row.actor_id)||!instant(row.created_at))throw bad()
  const p=parse(row.data),i=p.input
  if(!object(i)||i.month!==row.month||!unsigned(i.reminders,1000000)||!unsigned(i.segments,100)||i.reminders>0&&i.segments===0||!unsigned(i.covers,1000000)||!unsigned(i.payments,1000000)||!unsigned(i.grossCents,100000000000)||(i.payments===0)!==(i.grossCents===0)||['carrier','cover','promotion','hosting'].some(k=>!quote(i[k],row.created_at)))throw bad()
  if(p.currency!=='usd'||!string(p.basis,4000)||!Array.isArray(p.unknown)||p.unknown.some(v=>!string(v,4000))||!Array.isArray(p.sources)||!p.sources.length||p.sources.some(s=>!source(s)||s.checked>row.created_at.slice(0,10)))throw bad()
  if(['smsMicros','distributionMicros','processorMicros','totalMicros'].some(k=>!unsigned(p[k])))throw bad()
  const segments=i.reminders*i.segments,carrier=(i.carrier?.micros??0)*segments
  if(!Number.isSafeInteger(carrier)||p.smsMicros<carrier||segments===0&&p.smsMicros!==0||segments>0&&p.smsMicros<=carrier||p.distributionMicros!==(i.cover?.micros??0)*i.covers||i.payments===0&&p.processorMicros!==0||i.payments>0&&p.processorMicros===0)throw bad()
  const sum=p.smsMicros+p.distributionMicros+p.processorMicros+(i.promotion?.micros??0)+(i.hosting?.micros??0)
  if(!Number.isSafeInteger(sum)||sum!==p.totalMicros)throw bad()
 }
 for(const row of budgets)if(!month(row.month)||!unsigned(row.amount_cents,100000000000)||!string(row.actor_id)||!instant(row.updated_at))throw bad()
 for(const row of invoices){
  const preview=previewMap.get(row.preview_id)
  if(!preview||!string(row.reference,160)||!string(row.actor_id)||!instant(row.created_at)||Date.parse(row.created_at)<Date.parse(preview.created_at))throw bad()
  const p=parse(preview.data),d=parse(row.data),i=p.input
  if(d.previewId!==row.preview_id||!string(d.provider,100)||!string(d.evidence,1000)||!string(d.unitLabel,100)||!string(d.usageBasis,4000)||!string(d.basis,4000)||!unsigned(d.units,100000000)||!['sms_segments','promoted_covers','card_payments','other'].includes(d.usageKind))throw bad()
  if(!unsigned(d.costCents,100000000000)||!unsigned(d.processorFeeCents,100000000000)||!unsigned(d.totalCents,200000000000)||d.totalCents!==d.costCents+d.processorFeeCents||d.estimateMicros!==p.totalMicros||!signed(d.varianceMicros)||d.varianceMicros!==d.totalCents*10000-p.totalMicros)throw bad()
  const planned=d.usageKind==='sms_segments'?i.reminders*i.segments:d.usageKind==='promoted_covers'?i.covers:d.usageKind==='card_payments'?i.payments:null
  if(d.plannedUnits!==planned)throw bad()
  if(d.usageKind==='card_payments'){if(!unsigned(d.actualUnits)||!signed(d.usageVariance)||d.usageVariance!==d.units-d.actualUnits)throw bad()}
  else if(d.actualUnits!==null||d.usageVariance!==null)throw bad()
 }
}
