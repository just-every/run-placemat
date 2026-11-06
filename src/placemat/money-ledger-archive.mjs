/** Attribution and financial agreement are independent views of immutable source facts. */
export function moneySettlements(facts,payouts,adjustments,bookingIds){
 const bookings=new Set(bookingIds)
 const bookingFor=fact=>{
  const booking=fact?.booking_id??facts.find(c=>c.kind==='charge'&&c.source_id===fact?.charge_id)?.booking_id
  return booking&&bookings.has(booking)?booking:null
 }
 return payouts.map(p=>{
  const rows=JSON.parse(p.items).map(item=>{
   const fact=facts.find(f=>f.source_id===item.source),correction=adjustments.find(c=>c.payout_id===p.id&&c.transaction_id===item.id)
   const signedAmount=fact?(fact.kind==='refund'?-fact.amount_cents:fact.amount_cents):null
   const differenceCents=signedAmount===null?null:item.amount-signedAmount
   return {...item,signedFact:fact?{sourceId:fact.source_id,kind:fact.kind,chargeId:fact.charge_id,bookingId:fact.booking_id,amountCents:signedAmount,currency:fact.currency,recordedAt:fact.recorded_at}:null,differenceCents,bookingId:correction?.booking_id??(differenceCents===0?bookingFor(fact):null),adjustmentId:correction?.id??null}
  })
  return {id:p.id,amountCents:p.amount_cents,currency:p.currency,actorId:p.actor_id,recordedAt:p.recorded_at,items:rows,grossCents:rows.reduce((n,r)=>n+r.amount,0),feeCents:rows.reduce((n,r)=>n+r.fee,0),netCents:rows.reduce((n,r)=>n+r.net,0),unmatched:rows.filter(r=>!r.bookingId).map(r=>r.id),discrepancies:rows.filter(r=>r.differenceCents!==null&&r.differenceCents!==0).map(r=>r.id),unverified:rows.filter(r=>!r.signedFact).map(r=>r.id)}
 })
}

/** Restored ledger facts confer no provider authority and contain no guest contact or free text. */
export async function validateMoneyLedger(read,floor){
 const [items,receipts,payouts,adjustments]=await Promise.all(['pm_money_items','pm_money_receipts','pm_money_payouts','pm_money_adjustments'].map(read))
 const bad=()=>{throw Object.assign(new Error('Invalid immutable money ledger. Nothing was restored.'),{status:400})}
 const string=v=>typeof v==='string'&&v.length>0&&v.length<=255,instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v)),cents=v=>Number.isSafeInteger(v)&&Math.abs(v)<=99999999
 const unique=(rows,key)=>{const ids=new Set();for(const r of rows){if(!string(r[key])||ids.has(r[key]))bad();ids.add(r[key])}return ids}
 const ids=unique(items,'source_id'),eventIds=unique(receipts,'event_id'),payoutIds=unique(payouts,'id'),adjustmentIds=unique(adjustments,'id')
 const bookings=new Set((floor[0]?JSON.parse(floor[0].data).bookings:[]).map(b=>b.id)),transactions=new Map()
 for(const r of items)if(!['charge','refund'].includes(r.kind)||!string(r.charge_id)||r.kind==='charge'&&r.charge_id!==r.source_id||r.booking_id!==null&&!string(r.booking_id)||!cents(r.amount_cents)||r.amount_cents<=0||r.currency!=='usd'||!instant(r.recorded_at))bad()
 for(const r of receipts)if(!ids.has(r.source_id)||!instant(r.received_at))bad()
 for(const r of payouts){
  if(!cents(r.amount_cents)||r.amount_cents<=0||r.currency!=='usd'||!string(r.actor_id)||!instant(r.recorded_at))bad()
  const rows=JSON.parse(r.items);if(!Array.isArray(rows)||rows.length>2000)bad()
  const seen=new Set();let net=0
  for(const t of rows){if(!string(t.id)||seen.has(t.id)||!string(t.source)||t.currency!=='usd'||!cents(t.amount)||!cents(t.fee)||t.fee<0||!cents(t.net)||t.net!==t.amount-t.fee||Object.keys(t).some(k=>!['id','source','amount','fee','net','currency'].includes(k)))bad();seen.add(t.id);net+=t.net}
  if(net!==r.amount_cents)bad();transactions.set(r.id,seen)
 }
 const corrected=new Set()
 for(const r of adjustments){const key=JSON.stringify([r.payout_id,r.transaction_id]);if(!payoutIds.has(r.payout_id)||!transactions.get(r.payout_id).has(r.transaction_id)||corrected.has(key)||!bookings.has(r.booking_id)||!string(r.actor_id)||!instant(r.recorded_at))bad();corrected.add(key)}
}
