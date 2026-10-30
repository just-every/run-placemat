import {makePart,ContentVerifier,ArchiveVerifier} from '../../src/modules/portability/format.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {csvRecords} from './business-fixture.mjs'
import {installation,service,publicGuest} from './harness.mjs'

const secret='synthetic-placemat-2'
async function callback(h,event,status=200,valid=true){
 const raw=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000),signature=createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex')
 const response=await h.mf.dispatchFetch(h.origin+'/api/payments/ledger-events',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${valid?signature:'0'.repeat(64)}`},body:raw})
 assert.equal(response.status,status,await response.text())
}
const event=(id,type,object)=>({id,type,data:{object}})

test('Signed money facts reconcile refund-before-charge and duplicate callbacks, payout fees and appended unmatched attribution without editing history',async()=>{
 for(const conflicting of [false,true]){
 let payoutAmount=9400,netMismatch=false
 const calls=[],edge=async request=>{
  const url=new URL(request.url);calls.push({method:request.method,url})
  assert.equal(request.method,'GET','Ledger reconciliation never sends a charge, refund or payout')
  if(url.pathname==='/v1/payouts/synthetic-placemat-payout-1')return Response.json({object:'payout',id:'synthetic-placemat-payout-1',currency:'usd',status:'paid',amount:payoutAmount})
  assert.equal(url.pathname,'/v1/balance_transactions');assert.equal(url.searchParams.get('payout'),'synthetic-placemat-payout-1')
  if(!url.searchParams.has('starting_after'))return Response.json({object:'list',has_more:true,data:[{object:'balance_transaction',id:'synthetic-placemat-bt-1',source:'synthetic-placemat-charge-1',amount:10000,fee:300,net:9700,currency:'usd'}]})
  assert.equal(url.searchParams.get('starting_after'),'synthetic-placemat-bt-1')
  return Response.json({object:'list',has_more:false,data:[{object:'balance_transaction',id:'synthetic-placemat-bt-2',source:'synthetic-placemat-refund-1',amount:-500,fee:0,net:netMismatch?-400:-500,currency:'usd'},{object:'balance_transaction',id:'synthetic-placemat-bt-3',source:'synthetic-placemat-unmatched-1',amount:200,fee:0,net:200,currency:'usd'}]})
 }
 const h=await installation({stripeEdge:edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1',STRIPE_WEBHOOK_SECRET:secret}})
 try{
  const {service:s}=await service(h),booking=(await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})).result
  const refund={object:'refund',id:'synthetic-placemat-refund-1',charge:'synthetic-placemat-charge-1',amount:500,currency:'usd',status:'succeeded',metadata:{}},charge={object:'charge',id:'synthetic-placemat-charge-1',amount_captured:10000,currency:'usd',paid:true,captured:true,metadata:{placemat_booking_id:booking.id}}
  await callback(h,event('synthetic-placemat-event-1','refund.created',refund),400,false)
  assert.equal((await h.api('/api/payments/ledger')).items.length,0)
  await callback(h,event('synthetic-placemat-event-1','refund.created',refund))
  assert.equal((await h.api('/api/payments/ledger')).items[0].resolvedBookingId,null)
  await callback(h,event('synthetic-placemat-event-2','charge.succeeded',charge))
  await callback(h,event('synthetic-placemat-event-1','refund.created',refund))
  await callback(h,event('synthetic-placemat-event-2','charge.succeeded',charge))
  await callback(h,event('synthetic-placemat-event-3','refund.updated',refund))
  await callback(h,event('synthetic-placemat-event-4','charge.succeeded',{...charge,amount_captured:11000}),409)
  await callback(h,event('synthetic-placemat-event-2','refund.created',{...refund,id:'synthetic-placemat-refund-2'}),409)
  let ledger=await h.api('/api/payments/ledger');assert.equal(ledger.items.length,2);assert.ok(ledger.items.every(i=>i.resolvedBookingId===booking.id))
  // Controlled Stripe-edge fixtures prove native behavior, not a live provider receipt.
  const sourceBooking=conflicting?(await h.api('/api/public/book',publicGuest(s,1),{as:'',status:201})).result:null
  const conflictingCharge={...charge,id:'synthetic-placemat-unmatched-1',amount_captured:500,metadata:sourceBooking?{placemat_booking_id:sourceBooking.id}:{}}
  if(conflicting)await callback(h,event('synthetic-placemat-event-5','charge.succeeded',conflictingCharge))
  ledger=await h.api('/api/payments/ledger')
  const originalItems=ledger.items
  const manager=await h.signIn('synthetic-placemat-manager@example.test','admin'),member=await h.signIn('synthetic-placemat-member@example.test')
  for(const as of ['',manager,member]){
   await h.api('/api/payments/ledger',undefined,{as,status:as?403:401})
   await h.api('/api/payments/ledger/payout',{payoutId:'synthetic-placemat-payout-1'},{as,status:as?403:401})
   await h.api('/api/payments/ledger/adjustment',{payoutId:'synthetic-placemat-payout-1',transactionId:'synthetic-placemat-bt-3',bookingId:booking.id},{as,status:as?403:401})
  }
  assert.equal(calls.length,0)
  netMismatch=true
  await h.api('/api/payments/ledger/payout',{payoutId:'synthetic-placemat-payout-1'},{status:409});assert.equal((await h.api('/api/payments/ledger')).payouts.length,0)
  netMismatch=false
  ledger=await h.api('/api/payments/ledger/payout',{payoutId:'synthetic-placemat-payout-1'})
  const payout=ledger.payouts[0];assert.equal(payout.grossCents,9700);assert.equal(payout.feeCents,300);assert.equal(payout.netCents,9400);assert.deepEqual(payout.unmatched,['synthetic-placemat-bt-3']);assert.ok(payout.items.slice(0,2).every(i=>i.bookingId===booking.id))
  const conflict=payout.items.find(i=>i.id==='synthetic-placemat-bt-3')
  assert.equal(conflict.amount,200);assert.equal(conflict.source,'synthetic-placemat-unmatched-1')
  if(conflicting){
   assert.equal(conflict.signedFact.sourceId,conflict.source);assert.equal(conflict.signedFact.chargeId,conflict.source)
   assert.equal(conflict.signedFact.bookingId,sourceBooking.id,'The original signed booking remains distinct from a later human attribution')
   assert.equal(conflict.signedFact.amountCents,500);assert.equal(conflict.differenceCents,-300)
  }else{assert.equal(conflict.signedFact,null);assert.equal(conflict.differenceCents,null)}
  const discrepancies=conflicting?[conflict.id]:[]
  assert.deepEqual(payout.discrepancies,discrepancies);assert.deepEqual(payout.unverified,conflicting?[]:[conflict.id])
  const payoutCsv=async target=>csvRecords(await (await target.request('/api/business-export/money-payouts.csv')).text())[0]
  const beforeCsv=await payoutCsv(h)
  const financialCsv=async(target,kind)=>csvRecords(await (await target.request('/api/business-export/'+kind+'.csv')).text())
  const originalFacts=await financialCsv(h,'money-items'),originalReceipts=await financialCsv(h,'money-receipts')
  assert.equal(JSON.parse(beforeCsv.items_json)[2].differenceCents,conflicting?-300:null)
  assert.deepEqual(JSON.parse(beforeCsv.discrepancies_json),discrepancies)
  await h.api('/api/payments/ledger/adjustment',{payoutId:payout.id,transactionId:conflict.id,bookingId:'synthetic-placemat-nonexistent'},{status:409})
  const attribution={payoutId:payout.id,transactionId:conflict.id,bookingId:booking.id,reason:'Alex Rowan reviewed attribution only; the amount remains disputed.'}
  const raced=await Promise.all([h.request('/api/payments/ledger/adjustment',{method:'POST',body:attribution}),h.request('/api/payments/ledger/adjustment',{method:'POST',body:attribution})])
  assert.deepEqual(raced.map(r=>r.status).sort(),[200,409],'Concurrent attribution has exactly one winner')
  ledger=await h.api('/api/payments/ledger')
  assert.equal(ledger.adjustments.length,1);assert.equal(ledger.payouts[0].unmatched.length,0);assert.deepEqual(ledger.items,originalItems)
  const attributed=ledger.payouts[0],adjustment=ledger.adjustments[0]
  assert.deepEqual([attributed.grossCents,attributed.feeCents,attributed.netCents],[payout.grossCents,payout.feeCents,payout.netCents],'Human attribution changes no provider total')
  assert.deepEqual(attributed.items.map(({bookingId,adjustmentId,...source})=>source),payout.items.map(({bookingId,adjustmentId,...source})=>source),'Every original provider item remains inspectable after attribution')
  assert.equal(adjustment.booking_id,booking.id);assert.equal(adjustment.transaction_id,'synthetic-placemat-bt-3');assert.equal(adjustment.payout_id,payout.id)
  assert.equal(adjustment.actor_id,(await h.api('/api/state')).actor.id);assert.ok(Number.isFinite(Date.parse(adjustment.recorded_at)))
  const linked=attributed.items.find(i=>i.id===adjustment.transaction_id);assert.equal(linked.bookingId,booking.id);assert.equal(linked.adjustmentId,adjustment.id)
  assert.equal(linked.differenceCents,conflicting?-300:null);assert.deepEqual(linked.signedFact,conflict.signedFact)
  assert.deepEqual(attributed.discrepancies,discrepancies,'Attribution cannot resolve the financial difference')
  if(conflicting)assert.notEqual(linked.bookingId,linked.signedFact.bookingId,'Human attribution never rewrites the signed booking reference')
  assert.deepEqual(await financialCsv(h,'money-items'),originalFacts)
  assert.deepEqual(await financialCsv(h,'money-receipts'),originalReceipts,'Attribution changes no signed-event history')
  const audit=(await h.api('/api/audit?action=payment.ledger-attribution')).rows
  assert.equal(audit.length,1);assert.equal(audit[0].actor,adjustment.actor_id);assert.equal(audit[0].at,adjustment.recorded_at)
  assert.equal(audit[0].source,'person');assert.equal(audit[0].reason,attribution.reason);assert.equal(audit[0].subject,booking.id)
  assert.deepEqual(audit[0].changes,[{kind:'money-attribution',id:adjustment.id,before:{payoutId:payout.id,...conflict},after:{payoutId:payout.id,...linked}}])
  for(const as of [manager,member]){
   const sharedState=await h.api('/api/state',undefined,{as})
   assert.equal(sharedState.state.audit.filter(e=>e.action==='payment.ledger-attribution').length,0,'Non-owners cannot read settlement facts through shared state')
   const sharedAudit=await h.api('/api/audit',undefined,{as})
   assert.equal(sharedAudit.rows.filter(e=>e.action==='payment.ledger-attribution').length,0,'Non-owners cannot read settlement facts through change history')
   assert.equal((await h.request('/api/business-export/money-payouts.csv',{as})).status,403)
  }
  const auditCsv=csvRecords(await (await h.request('/api/business-export/audit.csv')).text()).find(r=>r.action==='payment.ledger-attribution')
  assert.deepEqual(JSON.parse(auditCsv.changes_json),audit[0].changes)
  const afterCsv=await payoutCsv(h)
  assert.deepEqual(JSON.parse(afterCsv.items_json),attributed.items);assert.deepEqual(JSON.parse(afterCsv.discrepancies_json),discrepancies)
  assert.equal(afterCsv.grossCents,'9700');assert.equal(afterCsv.feeCents,'300');assert.equal(afterCsv.netCents,'9400')
  const intact=await installation({bindings:{STRIPE_WEBHOOK_SECRET:secret}})
  try{
   await intact.api('/api/restore',{archive:await h.api('/api/backup'),confirm:'RESTORE'})
   assert.deepEqual(await intact.api('/api/payments/ledger'),ledger,'An intact restore keeps both financial sources and the separate attribution')
   assert.deepEqual((await intact.api('/api/audit?action=payment.ledger-attribution')).rows,audit,'An intact restore retains exact attribution actor, time, source, reason and before and after')
   for(const kind of ['money-items','money-receipts','money-payouts','money-adjustments'])assert.deepEqual(await financialCsv(intact,kind),await financialCsv(h,kind))
   await intact.api('/api/payments/ledger/adjustment',attribution,{status:409})
   await callback(intact,event('synthetic-placemat-event-1','refund.created',refund))
   if(conflicting)await callback(intact,event('synthetic-placemat-event-5','charge.succeeded',conflictingCharge))
   assert.deepEqual(await intact.api('/api/payments/ledger'),ledger,'Restored callback and attribution replay cannot replace either source')
   assert.deepEqual(await financialCsv(intact,'money-receipts'),originalReceipts)
   assert.deepEqual((await intact.api('/api/audit?action=payment.ledger-attribution')).rows,audit)
  }finally{await intact.close()}
  await h.api('/api/payments/ledger/adjustment',attribution,{status:409})
  assert.deepEqual((await h.api('/api/audit?action=payment.ledger-attribution')).rows,audit,'Replay appends neither adjustment nor audit')
  assert.equal((await h.api('/api/payments/ledger/payout',{payoutId:payout.id})).payouts.length,1)
  payoutAmount=9500
  await h.api('/api/payments/ledger/payout',{payoutId:payout.id},{status:409})
  assert.deepEqual((await h.api('/api/payments/ledger')).payouts,ledger.payouts)
  for(const kind of ['money-items','money-receipts','money-payouts','money-adjustments']){const response=await h.request('/api/business-export/'+kind+'.csv');assert.equal(response.status,200);const csv=await response.text();assert.ok(csv.includes('synthetic-placemat-'));assert.ok(!csv.includes('guest0@example.test'))}
  const guest=(await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id).guestId
  await h.command('guest.erase',{guestId:guest,confirm:'ERASE'})
  assert.deepEqual(await h.api('/api/payments/ledger'),ledger,'Erasure retains only reference and amount facts; no guest content was copied into the ledger')
  const erasedAudit=(await h.api('/api/audit?action=payment.ledger-attribution')).rows
  assert.equal(erasedAudit[0].reason,'');assert.deepEqual(erasedAudit[0].changes[0].before,{redacted:true});assert.deepEqual(erasedAudit[0].changes[0].after,{redacted:true})
  assert.deepEqual(JSON.parse((await payoutCsv(h)).items_json),attributed.items)
  assert.deepEqual(await financialCsv(h,'money-items'),originalFacts)
  assert.deepEqual(await financialCsv(h,'money-receipts'),originalReceipts)
  await h.api('/api/payments/ledger/adjustment',attribution,{status:409})
  const archive=await h.api('/api/backup'),restored=await installation({bindings:{STRIPE_WEBHOOK_SECRET:secret}})
  assert.ok(!JSON.stringify(archive).includes(attribution.reason),'Erasure removes copied attribution reasons from archives')
  try{
   const invalid=structuredClone(archive)
   const adjustment=invalid.filter(p=>p.kind==='part').flatMap(p=>p.items).find(i=>i.table==='pm_money_adjustments')
   adjustment.row.booking_id='synthetic-placemat-absent'
   const content=new ContentVerifier(invalid[0]),integrity=new ArchiveVerifier(invalid[0])
   for(let i=1;i<invalid.length-1;i++){invalid[i]=await makePart(invalid[i].index,invalid[i].items);integrity.add(invalid[i]);for(const item of invalid[i].items)content.add(item)}
   invalid.at(-1).contentHash=content.digest();invalid.at(-1).archiveHash=integrity.digest()
   await restored.api('/api/restore',{archive:invalid,confirm:'RESTORE'},{status:400})
   assert.equal((await restored.api('/api/payments/ledger')).items.length,0,'Invalid restore writes no money fact')
   await restored.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual(await restored.api('/api/payments/ledger'),ledger)
   assert.deepEqual(JSON.parse((await payoutCsv(restored)).items_json),attributed.items)
   assert.deepEqual((await restored.api('/api/audit?action=payment.ledger-attribution')).rows,erasedAudit)
   await restored.api('/api/payments/ledger/adjustment',attribution,{status:409})
   if(conflicting)await callback(restored,event('synthetic-placemat-event-5','charge.succeeded',{...conflictingCharge,amount_captured:501}),409)
   assert.deepEqual(await restored.api('/api/payments/ledger'),ledger)
  }finally{await restored.close()}
  const signedOut=await h.request('/auth/signout',{method:'POST',body:{}})
  assert.equal(signedOut.status,204)
  assert.equal((await h.request('/api/payments/ledger')).status,401)
  assert.equal((await h.request('/api/payments/ledger/adjustment',{method:'POST',body:attribution})).status,401)
 }finally{await h.close()}
 }
})

import {operationClock,operationApi,operationEdge,operationBooking,operationBindings,operationAccounts} from './payment-operations-fixture.mjs'

test('A dispute response preserves exact booking, policy and message evidence, and a rejected accounting handoff remains owned without automatic retry',async()=>{
 const edge=operationEdge(),h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>operationClock,bindings:operationBindings,stripeEdge:edge.stripe,accountingEdge:edge.accounting})
 try{
  const {booking,policy,disputeId}=await operationBooking(h,edge),owner=(await h.api('/api/state')).actor.id,manager=await h.signIn('synthetic-placemat-operations@example.test','admin')
  for(const path of ['/payment-operations','/api/payments/operations','/api/payments/operations/bundle?reviewId=absent','/api/payments/operations/journal?exportId=absent'])for(const as of ['',manager])assert.equal((await h.request(path,{as})).status,as?403:401)
  for(const action of ['open','assemble','approve','export'])await operationApi(h,action,{}, {as:manager,status:403})
  assert.equal(edge.accountingCalls.length,0)
  await operationApi(h,'open',{bookingId:'synthetic-placemat-other',disputeId},{status:409})
  const c=(await operationApi(h,'open',{bookingId:booking.id,disputeId})).result
  assert.equal(c.charge_id,'synthetic-placemat-charge-1');assert.equal(c.amount_cents,9000)
  assert.deepEqual((await operationApi(h,'open',{bookingId:booking.id,disputeId})).result,c)
  let view=await operationApi(h,'');assert.equal(view.tasks.length,1);assert.equal(view.tasks[0].ownerId,owner);assert.equal(view.tasks[0].dueAt,c.due_at)
  const review=(await operationApi(h,'assemble',{caseId:c.id})).result,evidence=JSON.parse(review.evidence)
  assert.equal(evidence.attendance[0].status,'arrived');assert.equal(evidence.attendance[0].source,'staff-recorded');assert.equal(evidence.booking.id,booking.id);assert.equal(evidence.booking.status,'booked');assert.equal(evidence.policies[0].id,policy.id);assert.equal(evidence.consents[0].review_text,policy.reviewText)
  assert.equal(evidence.messages.inquiries[0].messages.length,3);assert.equal(evidence.messages.inquiries[0].messages[2].message,'We accept this exact table offer.')
  const approval={reviewId:review.id,digest:review.digest,response:'The reservation and exact agreed terms are attached with the guest conversation.',acknowledged:true}
  await operationApi(h,'approve',{...approval,acknowledged:false},{status:400});await operationApi(h,'approve',{...approval,digest:'changed'},{status:409})
  await operationApi(h,'export',{caseId:c.id,reviewId:review.id,accounts:operationAccounts,acknowledged:true},{status:409})
  const approved=(await operationApi(h,'approve',approval)).result;assert.equal(approved.approved_by,owner);assert.equal(approved.evidence,review.evidence)
  await operationApi(h,'approve',{...approval,response:'Changed after approval'},{status:409})
  const response=await h.request('/api/payments/operations/bundle?reviewId='+review.id);assert.equal(response.status,200);assert.deepEqual((await response.json()).review.response,approval.response)
  const send={caseId:c.id,reviewId:review.id,accounts:operationAccounts,acknowledged:true}
  await operationApi(h,'export',{...send,acknowledged:false},{status:400})
  const rejected=(await operationApi(h,'export',send)).result;assert.equal(rejected.state,'rejected');assert.equal(rejected.code,'2500');assert.equal(rejected.trace_id,'synthetic-placemat-trace-1')
  assert.deepEqual((await operationApi(h,'export',send)).result,rejected);assert.equal(edge.accountingCalls.length,1)
  const sent=edge.accountingCalls[0];assert.equal(sent.url.searchParams.get('requestid'),rejected.id);assert.equal(sent.body.Line.length,6)
  const total=posting=>sent.body.Line.filter(l=>l.JournalEntryLineDetail.PostingType===posting).reduce((n,l)=>n+Math.round(l.Amount*100),0)
  assert.equal(total('Debit'),20000);assert.equal(total('Credit'),20000);assert.ok(!JSON.stringify(sent.body).includes('Alex Rowan'))
  view=await operationApi(h,'');const task=view.tasks.find(t=>t.id==='accounting-'+rejected.id);assert.equal(task.ownerId,owner);assert.equal(task.dueAt,rejected.created_at);assert.ok(task.text.includes(rejected.id));assert.ok(!JSON.stringify(view).includes('synthetic secret body'))
  await h.command('booking.handover.complete',{bookingId:booking.id,taskId:task.id,outcome:'Provider rejected the mapped account; accountant owns a manual correction.'})
  await operationApi(h,'export',send);assert.ok((await operationApi(h,'')).tasks.find(t=>t.id===task.id).history.some(e=>e.action==='completed'))
  for(const kind of ['payment-cases','payment-reviews','accounting-exports'])assert.equal((await h.request('/api/business-export/'+kind+'.csv')).status,200)
  const audit=(await h.api('/api/audit')).rows;assert.ok(audit.some(r=>r.action==='payment.dispute-approve'));assert.ok(audit.some(r=>r.action==='payment.accounting-result'))
  const archive=await h.api('/api/backup'),copy=await installation()
  try{
   const invalid=structuredClone(archive),item=invalid.filter(p=>p.kind==='part').flatMap(p=>p.items).find(i=>i.table==='pm_accounting_exports');item.row.review_id='synthetic-placemat-absent'
   const content=new ContentVerifier(invalid[0]),integrity=new ArchiveVerifier(invalid[0]);for(let i=1;i<invalid.length-1;i++){invalid[i]=await makePart(invalid[i].index,invalid[i].items);integrity.add(invalid[i]);for(const row of invalid[i].items)content.add(row)}invalid.at(-1).contentHash=content.digest();invalid.at(-1).archiveHash=integrity.digest()
   await copy.api('/api/restore',{archive:invalid,confirm:'RESTORE'},{status:400});assert.equal((await operationApi(copy,'')).cases.length,0)
   await copy.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual((await operationApi(copy,'')).cases,view.cases);assert.equal((await operationApi(copy,'export',send)).result.id,rejected.id)}finally{await copy.close()}
  const guestId=(await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id).guestId
  await h.command('guest.erase',{guestId,confirm:'ERASE'})
  view=await operationApi(h,'');assert.deepEqual(JSON.parse(view.reviews[0].evidence),{erased:true});assert.equal(view.reviews[0].response,'');assert.equal(view.tasks.length,0);assert.equal(view.exports[0].state,'rejected')
  const erasedCopy=await installation();try{await erasedCopy.api('/api/restore',{archive:await h.api('/api/backup'),confirm:'RESTORE'});assert.deepEqual(JSON.parse((await operationApi(erasedCopy,'')).reviews[0].evidence),{erased:true})}finally{await erasedCopy.close()}
  await operationApi(h,'assemble',{caseId:c.id},{status:409});assert.equal(edge.accountingCalls.length,1);assert.ok(edge.stripeCalls.every(call=>call.method==='GET'))
 }finally{await h.close()}
})

test('An accepted or uncertain accounting attempt is never repeated and historical approvals cannot send after restore',async()=>{
 for(const outcome of ['accepted','unconfirmed']){
  const edge=operationEdge();edge.setAccountingState(outcome)
  const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>operationClock,bindings:operationBindings,stripeEdge:edge.stripe,accountingEdge:edge.accounting})
  try{
   const {booking,disputeId}=await operationBooking(h,edge)
   await operationApi(h,'open',{bookingId:booking.id,disputeId});const review=(await operationApi(h,'assemble',{caseId:disputeId})).result
   await operationApi(h,'approve',{reviewId:review.id,digest:review.digest,response:'Reviewed exact evidence.',acknowledged:true})
   const p={caseId:disputeId,reviewId:review.id,accounts:operationAccounts,acknowledged:true},copy=await installation()
   try{await copy.api('/api/restore',{archive:await h.api('/api/backup'),confirm:'RESTORE'});await operationApi(copy,'export',p,{status:409})}finally{await copy.close()}
   await operationApi(h,'export',{...p,accounts:{...operationAccounts,revenue:operationAccounts.clearing}},{status:400});assert.equal(edge.accountingCalls.length,0)
   await Promise.all([operationApi(h,'export',p),operationApi(h,'export',p)])
   const first=await operationApi(h,'export',p);assert.equal(first.result.state,outcome);await operationApi(h,'export',p);assert.equal(edge.accountingCalls.length,1)
   const view=await operationApi(h,'');assert.equal(view.exports.length,1);assert.ok(view.tasks.some(t=>t.id==='accounting-'+first.result.id))
   if(outcome==='accepted')assert.equal(first.result.provider_id,'12345')
   const download=await h.request('/api/payments/operations/journal?exportId='+first.result.id);assert.equal(download.status,200);assert.equal((await download.json()).ledger.length,3)
  }finally{await h.close()}
 }
})
