import {makePart,ContentVerifier,ArchiveVerifier} from '../../src/modules/portability/format.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {installation,service,publicGuest} from './harness.mjs'

const secret='synthetic-placemat-2'
async function callback(h,event,status=200,valid=true){
 const raw=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000),signature=createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex')
 const response=await h.mf.dispatchFetch(h.origin+'/api/payments/ledger-events',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${valid?signature:'0'.repeat(64)}`},body:raw})
 assert.equal(response.status,status,await response.text())
}
const event=(id,type,object)=>({id,type,data:{object}})

test('Signed money facts reconcile refund-before-charge and duplicate callbacks, payout fees and appended unmatched attribution without editing history',async()=>{
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
  await h.api('/api/payments/ledger/adjustment',{payoutId:payout.id,transactionId:'synthetic-placemat-bt-3',bookingId:'synthetic-placemat-nonexistent'},{status:409})
  ledger=await h.api('/api/payments/ledger/adjustment',{payoutId:payout.id,transactionId:'synthetic-placemat-bt-3',bookingId:booking.id})
  assert.equal(ledger.adjustments.length,1);assert.equal(ledger.payouts[0].unmatched.length,0);assert.deepEqual(ledger.items,originalItems)
  const attributed=ledger.payouts[0],adjustment=ledger.adjustments[0]
  assert.deepEqual([attributed.grossCents,attributed.feeCents,attributed.netCents],[payout.grossCents,payout.feeCents,payout.netCents],'Human attribution changes no provider total')
  assert.deepEqual(attributed.items.map(({bookingId,adjustmentId,...source})=>source),payout.items.map(({bookingId,adjustmentId,...source})=>source),'Every original provider item remains inspectable after attribution')
  assert.equal(adjustment.booking_id,booking.id);assert.equal(adjustment.transaction_id,'synthetic-placemat-bt-3');assert.equal(adjustment.payout_id,payout.id)
  assert.equal(adjustment.actor_id,(await h.api('/api/state')).actor.id);assert.ok(Number.isFinite(Date.parse(adjustment.recorded_at)))
  const linked=attributed.items.find(i=>i.id===adjustment.transaction_id);assert.equal(linked.bookingId,booking.id);assert.equal(linked.adjustmentId,adjustment.id)
  await h.api('/api/payments/ledger/adjustment',{payoutId:payout.id,transactionId:'synthetic-placemat-bt-3',bookingId:booking.id},{status:409})
  assert.equal((await h.api('/api/payments/ledger/payout',{payoutId:payout.id})).payouts.length,1)
  payoutAmount=9500
  await h.api('/api/payments/ledger/payout',{payoutId:payout.id},{status:409})
  assert.deepEqual((await h.api('/api/payments/ledger')).payouts,ledger.payouts)
  for(const kind of ['money-items','money-receipts','money-payouts','money-adjustments']){const response=await h.request('/api/business-export/'+kind+'.csv');assert.equal(response.status,200);const csv=await response.text();assert.ok(csv.includes('synthetic-placemat-'));assert.ok(!csv.includes('guest0@example.test'))}
  const guest=(await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id).guestId
  await h.command('guest.erase',{guestId:guest,confirm:'ERASE'})
  assert.deepEqual(await h.api('/api/payments/ledger'),ledger,'Erasure retains only reference and amount facts; no guest content was copied into the ledger')
  const archive=await h.api('/api/backup'),restored=await installation()
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
  }finally{await restored.close()}
 }finally{await h.close()}
})
