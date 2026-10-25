/** Retained collection facts have no restored card, connection or execution authority. */
export async function validateMerchantCollections(read,guests,floor){
 const rows=await read('pm_stripe_collections'),state=floor[0]?JSON.parse(floor[0].data):{bookings:[]},ids=new Set(),references=new Set()
 const string=v=>typeof v==='string'&&v.trim().length>0,instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
 for(const r of rows){
  if(!r||!string(r.id)||ids.has(r.id)||!state.bookings.some(b=>b.id===r.booking_id)||!string(r.account_id)||!string(r.created_by)||!instant(r.created_at)||!instant(r.expires_at)||Date.parse(r.expires_at)<=Date.parse(r.created_at)||!['pending','collected','expired'].includes(r.state)||r.provider_reference!==null&&(!string(r.provider_reference)||references.has(r.provider_reference))||r.verified_at!==null&&!instant(r.verified_at)||r.state==='collected'&&(!r.provider_reference||!r.verified_at))throw Object.assign(new Error('Invalid retained card collection. Nothing was restored.'),{status:400})
  ids.add(r.id);if(r.provider_reference)references.add(r.provider_reference)
 }
 const guarantees=await read('pm_card_guarantees'),policyIds=new Set((await read('pm_fee_policies')).map(p=>p.id)),seen=new Set()
 for(const g of guarantees){
  const booking=state.bookings.find(b=>b.id===g.booking_id),erased=booking&&guests.some(row=>row.id===booking.guestId&&JSON.parse(row.data).erased)
  if(!ids.has(g.id)||rows.find(r=>r.id===g.id)?.booking_id!==g.booking_id||seen.has(g.id)||!booking||!policyIds.has(g.policy_id)||!string(g.actor_id)||!instant(g.created_at)||!instant(g.expires_at)||Date.parse(g.expires_at)<=Date.parse(g.created_at)||g.accepted_at!==null&&(!instant(g.accepted_at)||Date.parse(g.accepted_at)<Date.parse(g.created_at))||g.ended_at!==null&&!instant(g.ended_at)||g.recollection_requested_at!==null&&!instant(g.recollection_requested_at)||!Number.isSafeInteger(g.max_fee_cents)||g.max_fee_cents<50||g.max_fee_cents>99999999||typeof g.review_text!=='string'||typeof g.booking_snapshot!=='string'||erased&&(g.review_text!==''||g.booking_snapshot!=='{}'))throw Object.assign(new Error('Invalid retained guest fee agreement. Nothing was restored.'),{status:400})
  let snapshot;try{snapshot=JSON.parse(g.booking_snapshot)}catch{throw Error('Invalid guest fee agreement snapshot')}
  if(!erased&&snapshot.bookingId!==g.booking_id)throw Error('Invalid guest fee agreement booking')
  seen.add(g.id)
 }
 for(const assessment of await read('pm_fee_assessments'))if(assessment.guest_consent_id){const g=guarantees.find(g=>g.id===assessment.guest_consent_id);if(!g||g.booking_id!==assessment.booking_id||g.policy_id!==assessment.policy_id||assessment.consent_id!==null)throw Error('Invalid guest fee assessment relationship')}

}
