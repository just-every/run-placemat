const bad=()=>Object.assign(new Error('Invalid fee history. Nothing was restored; correct the source records and download a fresh backup.'),{status:400})
const nonempty=v=>typeof v==='string'&&v.trim().length>0
const at=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
const cents=v=>Number.isSafeInteger(v)&&v>=0&&v<=99999999
function indexed(rows,key){const map=new Map();for(const r of rows){if(!r||!nonempty(r[key])||map.has(r[key]))throw bad();map.set(r[key],r)}return map}
/** Portable financial facts never restore the authority or credentials to charge a card. */
export async function validateFees(state,read,erasedIds=new Set()){
 const [policies,consents,assessments,events,disputes,previews]=await Promise.all(['pm_fee_policies','pm_fee_consents','pm_fee_assessments','pm_fee_events','pm_fee_disputes','pm_fee_previews'].map(read))
 const policyMap=indexed(policies,'id'),consentMap=indexed(consents,'id'),assessmentMap=indexed(assessments,'id'),bookings=new Map(state.bookings.map(b=>[b.id,b]))
 const previewMap=indexed(previews,'id')
 for(const p of previews)if(!bookings.has(p.booking_id)||!policyMap.has(p.policy_id)||p.consent_id!==null&&!consentMap.has(p.consent_id)||!nonempty(p.actor_id)||!at(p.created_at)||!at(p.expires_at)||!Number.isSafeInteger(p.floor_version)||typeof p.data!=='string')throw bad()
 const versions=new Set(),requests=new Set(),violations=new Set(),charges=new Set()
 for(const p of policies){let data;try{data=JSON.parse(p.data)}catch{throw bad()}if(!Number.isSafeInteger(p.version)||p.version<1||versions.has(p.version)||!nonempty(p.created_by)||!at(p.created_at)||!data||typeof data!=='object'||Array.isArray(data))throw bad();versions.add(p.version)}
 const consentBookings=new Set()
 for(const c of consents){let snapshot;try{snapshot=JSON.parse(c.booking_snapshot)}catch{throw bad()}if(!bookings.has(c.booking_id)||!policyMap.has(c.policy_id)||consentBookings.has(c.booking_id)||!nonempty(c.actor_id)||!at(c.accepted_at)||!at(c.recorded_at)||typeof c.evidence!=='string'||typeof c.review_text!=='string'||!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw bad();consentBookings.add(c.booking_id)}
 for(const f of assessments){const b=bookings.get(f.booking_id),c=consentMap.get(f.consent_id),v=JSON.stringify([f.booking_id,f.kind]);if(!b||b.serviceId!==f.service_id||f.consent_id!==null&&(!c||c.booking_id!==f.booking_id||c.policy_id!==f.policy_id)||!previewMap.has(f.preview_id)||!policyMap.has(f.policy_id)||!['late_cancel','no_show'].includes(f.kind)||violations.has(v)||!nonempty(f.request_id)||requests.has(f.request_id)||!nonempty(f.actor_id)||!['charge','waive'].includes(f.action)||!['pending','succeeded','failed','waived'].includes(f.status)||!cents(f.amount_cents)||typeof f.reason!=='string'||typeof f.evidence!=='string'||!at(f.created_at)||!at(f.updated_at)||Date.parse(f.updated_at)<Date.parse(f.created_at)||!Number.isSafeInteger(f.processing_until)||f.processing_until!==0||f.action==='waive'&&f.status!=='waived'||f.action==='charge'&&f.status==='waived')throw bad();if(f.charge_id){if(!nonempty(f.charge_id)||charges.has(f.charge_id))throw bad();charges.add(f.charge_id)}if(f.status==='succeeded'&&!nonempty(f.charge_id))throw bad();if(erasedIds.has(b.guestId)&&(f.reason!==''||f.evidence!==''))throw bad();violations.add(v);requests.add(f.request_id)}
 indexed(events,'id')
 for(const e of events)if(!nonempty(e.action)||!nonempty(e.subject_id)||e.booking_id!==null&&!bookings.has(e.booking_id)||!nonempty(e.actor_id)||!at(e.at)||typeof e.after_data!=='string'||e.before_data!==null&&typeof e.before_data!=='string')throw bad()
 for(const d of disputes)if(!assessmentMap.has(d.assessment_id)||!nonempty(d.actor_id)||!at(d.at)||typeof d.reason!=='string'||typeof d.evidence!=='string')throw bad()
}
