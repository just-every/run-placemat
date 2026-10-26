/** Portable payment history contains no accounting access token or executable approval custody. */
export async function validatePaymentOperations(read,floor,guests){
 const [cases,reviews,exports]=await Promise.all(['pm_payment_cases','pm_payment_reviews','pm_accounting_exports'].map(read))
 const bad=()=>{throw Object.assign(new Error('Invalid payment operations history. Nothing was restored.'),{status:400})}
 const str=v=>typeof v==='string'&&v.length>0&&v.length<=255,at=v=>typeof v==='string'&&Number.isFinite(Date.parse(v)),cents=v=>Number.isSafeInteger(v)&&v>0&&v<=99999999
 const unique=(rows)=>{const m=new Map();for(const r of rows){if(!str(r.id)||m.has(r.id))bad();m.set(r.id,r)}return m}
 const cs=unique(cases),rs=unique(reviews);unique(exports)
 const state=floor[0]?JSON.parse(floor[0].data):{bookings:[]},bookings=new Map(state.bookings.map(b=>[b.id,b])),erased=new Set(guests.filter(g=>JSON.parse(g.data).erased).map(g=>g.id))
 const ledger=(raw)=>{let v;try{v=JSON.parse(raw)}catch{bad()}if(!Array.isArray(v)||!v.length||v.length>2000||new Set(v.map(r=>r.id)).size!==v.length)bad();for(const r of v)if(!str(r.id)||!['charge','refund','dispute'].includes(r.kind)||!cents(r.amountCents)||!at(r.at)||Object.keys(r).some(k=>!['id','kind','amountCents','at'].includes(k)))bad();return v}
 for(const c of cases){const items=ledger(c.ledger);if(!bookings.has(c.booking_id)||!str(c.charge_id)||!cents(c.amount_cents)||c.currency!=='usd'||!str(c.reason)||!str(c.status)||!at(c.due_at)||!str(c.opened_by)||!at(c.opened_at)||items.filter(i=>i.kind==='charge').length!==1||items[0].id!==c.charge_id||items[0].kind!=='charge'||items.filter(i=>i.kind==='dispute').reduce((n,i)=>n+i.amountCents,0)!==c.amount_cents)bad()}
 for(const r of reviews){
  const c=cs.get(r.case_id);if(!c||!str(r.created_by)||!at(r.created_at)||typeof r.evidence!=='string'||typeof r.response!=='string'||r.response.length>8000||!/^[a-f0-9]{64}$/.test(r.digest)||r.approved_by===null&&r.approved_at!==null||r.approved_by!==null&&(!str(r.approved_by)||!at(r.approved_at)))bad()
  let e;try{e=JSON.parse(r.evidence)}catch{bad()}
  if(erased.has(bookings.get(c.booking_id).guestId)){if(JSON.stringify(e)!=='{"erased":true}'||r.response!=='')bad();continue}
  if(!e||e.booking?.id!==c.booking_id||!Array.isArray(e.policies)||!Array.isArray(e.consents)||!Array.isArray(e.guestAgreements)||!Array.isArray(e.attendance)||!Array.isArray(e.fees)||!Array.isArray(e.refunds)||!Array.isArray(e.messages?.inquiries)||!Array.isArray(e.messages?.reminders)||!Array.isArray(e.messages?.refundNotices)||!Array.isArray(e.limitations)||Object.keys(e).some(k=>!['booking','policies','consents','guestAgreements','attendance','fees','refunds','messages','limitations'].includes(k)))bad()
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(r.evidence))),n=>n.toString(16).padStart(2,'0')).join('');if(digest!==r.digest)bad()
 }
 const exported=new Set()
 for(const e of exports){
  const c=cs.get(e.case_id),r=rs.get(e.review_id);if(!c||!r||r.case_id!==c.id||!r.approved_at||exported.has(c.id)||!str(e.actor_id)||!at(e.created_at)||!at(e.updated_at)||!['reserved','accepted','rejected','unconfirmed'].includes(e.state)||!str(e.code)||e.provider_id!==null&&!/^\d{1,50}$/.test(e.provider_id)||e.state==='accepted'&&!e.provider_id||e.trace_id!==null&&!/^[a-zA-Z0-9_-]{1,128}$/.test(e.trace_id)||e.ledger!==c.ledger)bad();exported.add(c.id)
  const items=ledger(e.ledger);let j;try{j=JSON.parse(e.journal)}catch{bad()}
  if(!j||j.CurrencyRef?.value!=='USD'||!Array.isArray(j.Line)||j.Line.length!==items.length*2||Object.keys(j).some(k=>!['TxnDate','PrivateNote','CurrencyRef','Line'].includes(k)))bad()
  const accounts={}
  items.forEach((item,i)=>{const [debit,credit]=j.Line.slice(i*2,i*2+2);for(const [line,posting] of [[debit,'Debit'],[credit,'Credit']])if(!line||line.Amount!==item.amountCents/100||line.Description!==item.kind+' '+item.id||line.DetailType!=='JournalEntryLineDetail'||line.JournalEntryLineDetail?.PostingType!==posting||!/^\d+$/.test(line.JournalEntryLineDetail?.AccountRef?.value??'')||Object.keys(line).some(k=>!['Amount','Description','DetailType','JournalEntryLineDetail'].includes(k)))bad();const a=debit.JournalEntryLineDetail.AccountRef.value,b=credit.JournalEntryLineDetail.AccountRef.value;if(a===b)bad();const set=(k,v)=>{if(accounts[k]&&accounts[k]!==v)bad();accounts[k]=v};if(item.kind==='charge'){set('clearing',a);set('revenue',b)}else{set(item.kind==='refund'?'revenue':'disputes',a);set('clearing',b)}})
  if(new Set(Object.values(accounts)).size!==3)bad()
 }
}
