import test from 'node:test'
import assert from 'node:assert/strict'
import {installation,service,publicGuest} from './harness.mjs'
import {paymentEdge} from './payment-fixture.mjs'
import {makePart,ContentVerifier,ArchiveVerifier} from '../../src/modules/portability/format.mjs'

test('COST-001: owner plans known and unknown costs, sees real usage, budgets and records an honest invoice reconciliation',async()=>{
 const edge=paymentEdge(),h=await installation({stripeEdge:edge.edge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'}}),month=new Date().toISOString().slice(0,7)
 let restored
 try{
  const admin=await h.signIn('cost-manager@example.test','admin')
  await h.api('/api/costs?month='+month,undefined,{as:'',status:401})
  await h.api('/api/costs?month='+month,undefined,{as:admin,status:403})
  assert.equal((await h.request('/costs')).status,200)
  const p={month,reminders:1000,segments:1,covers:100,payments:1,grossCents:10000,carrier:null,cover:null,promotion:null,hosting:null}
  await h.api('/api/costs/preview',p,{headers:{origin:'https://other.example'},status:403})
  for(const changed of [{reminders:-1},{segments:0},{grossCents:1.5},{month:'2026-13'},{carrier:{micros:100,source:'Quote',date:'2026-02-30'}}])await h.api('/api/costs/preview',{...p,...changed},{status:400})
  const unknown=await h.api('/api/costs/preview',p)
  assert.equal(unknown.smsMicros,8300000);assert.equal(unknown.processorMicros,3200000);assert.ok(unknown.unknown.includes('Distribution quote'))
  const rate=micros=>({micros,source:'synthetic-placemat-2',date:new Date().toISOString().slice(0,10)})
  const preview=await h.api('/api/costs/preview',{...p,carrier:rate(5000),cover:rate(2000000),promotion:rate(50000000),hosting:rate(5000000)})
  assert.equal(preview.totalMicros,271500000)
  await h.api('/api/costs/budget',{month,amountCents:10000})
  let overview=await h.api('/api/costs?month='+month);assert.equal(overview.alert.forecastExceeded,true);assert.equal(overview.usage.approvedReminders,0)
  const {service:s}=await service(h),booking=(await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})).result
  const proposal=await h.command('proposal.prepare',{kind:'reminders',plan:{serviceId:s.id},reason:'Prepare the real guest reminder'})
  await h.command('proposal.approve',{proposalId:proposal.id});await h.request('/api/reminders.csv')
  const owner=(await h.api('/api/state')).actor
  const request=await h.command('payment.request',{bookingId:booking.id,amountCents:10000,dueAt:new Date(Date.now()+2*3600000).toISOString(),followupOwnerId:owner.id,reason:'Reservation deposit'})
  await h.command('payment.link',{requestId:request.requestId});edge.completeCheckout([...edge.sessions.keys()][0]);await h.command('payment.sync',{requestId:request.requestId})
  overview=await h.api('/api/costs?month='+month);assert.equal(overview.usage.approvedReminders,1);assert.equal(overview.usage.exportedReminders,1);assert.deepEqual(overview.usage.paidDeposits,{count:1,grossCents:10000})
  const invoice={previewId:preview.id,reference:'synthetic-placemat-3',provider:'synthetic-placemat-4',evidence:'synthetic-placemat-5',usageKind:'sms_segments',units:1000,unitLabel:'SMS segments plus 100 promoted covers',costCents:28000,processorFeeCents:320,acknowledge:true}
  await h.api('/api/costs/invoice',{...invoice,acknowledge:false},{status:400})
  await h.api('/api/costs/invoice',{...invoice,processorFeeCents:-1},{status:400})
  const recorded=await h.api('/api/costs/invoice',invoice);assert.equal(recorded.totalCents,28320);assert.equal(recorded.varianceMicros,11700000);assert.match(recorded.basis,/Owner-entered/);assert.equal(recorded.plannedUnits,1000);assert.equal(recorded.actualUnits,null)
  await h.api('/api/costs/invoice',invoice,{status:409})
  overview=await h.api('/api/costs?month='+month);assert.equal(overview.invoices.length,1);assert.equal(overview.alert.invoiceExceeded,true);assert.equal(overview.invoiceCents,28320)
  const archive=await h.api('/api/backup');restored=await installation()
  // Recompute integrity so these failures prove semantic validation, not checksums.
  for(const change of [d=>{d.processorFeeCents=-1},d=>{d.costCents=0.5},d=>{d.previewId='synthetic-placemat-6'}]){
   const invalid=structuredClone(archive),item=invalid.filter(p=>p.kind==='part').flatMap(p=>p.items).find(i=>i.table==='pm_cost_invoices'),data=JSON.parse(item.row.data)
   change(data);item.row.data=JSON.stringify(data)
   const content=new ContentVerifier(invalid[0]),integrity=new ArchiveVerifier(invalid[0])
   for(let index=1;index<invalid.length-1;index++){invalid[index]=await makePart(invalid[index].index,invalid[index].items);integrity.add(invalid[index]);for(const row of invalid[index].items)content.add(row)}
   invalid.at(-1).contentHash=content.digest();invalid.at(-1).archiveHash=integrity.digest()
   const refusal=await restored.api('/api/restore',{archive:invalid,confirm:'RESTORE'},{status:400});assert.match(refusal.error,/operating cost history/)
   const untouched=await restored.api('/api/costs?month='+month);assert.equal(untouched.previews.length,0);assert.equal(untouched.invoices.length,0);assert.equal(untouched.budget,null)
  }
  await restored.api('/api/restore',{archive,confirm:'RESTORE'})
  const restoredCosts=await restored.api('/api/costs?month='+month)
  for(const key of ['previews','invoices','budget','usage','invoiceCents','forecastMicros','alert'])assert.deepEqual(restoredCosts[key],overview[key],`Restored costs retain ${key}`)
  const otherMonth=month.endsWith('-01')?month.slice(0,4)+'-02':month.slice(0,4)+'-01';assert.equal((await h.api('/api/costs?month='+otherMonth)).invoices.length,0)
 }finally{if(restored)await restored.close();await h.close()}
})
