// Held test-mode providers only. Approval is local; no response is submitted by the application.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {installation,service,publicGuest} from '../tests/api/harness.mjs'
import {feePolicyInput,feeApi} from '../tests/api/fee-fixture.mjs'
const secret=process.env.STRIPE_SECRET_KEY
assert.ok(secret?.startsWith('sk_test_'),'Use a held Stripe test binding')
const qbo=JSON.parse(await readFile(process.env.PLACEMAT_QBO_TOKEN_FILE,'utf8'))
async function stripe(path,body){const r=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+secret,'stripe-version':'2026-09-30.endive',...body?{'content-type':'application/x-www-form-urlencoded'}:{}},...body?{body:new URLSearchParams(body)}:{}});const v=await r.json();assert.ok(r.ok,'Stripe rejected the sandbox operation: '+(v.error?.code??v.error?.type??r.status)+' parameter '+(v.error?.param??'none'));return v}
async function accounting(path,body){const r=await fetch('https://sandbox-quickbooks.api.intuit.com/v3/company/'+qbo.QBO_REALM_ID+'/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+qbo.QBO_ACCESS_TOKEN,accept:'application/json','content-type':'application/json'},...body?{body:JSON.stringify(body)}:{}});const v=await r.json();assert.ok(r.ok&&!v.Fault,'QuickBooks sandbox operation refused');return v}
const accounts=(await accounting('query?query='+encodeURIComponent('select * from Account where Active = true MAXRESULTS 1000'))).QueryResponse.Account
const select=type=>accounts.find(a=>a.AccountType===type)?.Id
const mapping={clearing:select('Bank'),revenue:select('Income'),disputes:select('Other Current Asset')}
assert.ok(Object.values(mapping).every(Boolean),'Sandbox needs distinct active clearing, revenue and asset accounts')
const network=async request=>{
 const outgoing=new Headers(request.headers);for(const name of ['host','content-length','transfer-encoding','connection'])outgoing.delete(name)
 try{const r=await fetch(request.url,{method:request.method,headers:outgoing,...(request.method==='GET'?{}:{body:await request.text()}),redirect:'manual',signal:AbortSignal.timeout(20000)}),headers=new Headers(r.headers);headers.delete('content-encoding');headers.delete('content-length');if(new URL(request.url).hostname.includes('intuit.com'))console.log(JSON.stringify({transport:'QuickBooks',status:r.status,trace:headers.get('intuit_tid')}));return new Response(await r.arrayBuffer(),{status:r.status,headers})}catch(error){console.error('Sandbox transport failure',error.name,error.cause?.code??'no-code');throw error}
}
const h=await installation({bindings:{STRIPE_SECRET_KEY:secret,...qbo},stripeEdge:network,accountingEdge:network})
const customers=[],disputes=[],charges=[],journals=[]
try{
 const {service:s}=await service(h),policy=await feeApi(h,'fee-policy',feePolicyInput()),results=[]
 for(let i=0;i<2;i++){
  const made=await h.api('/api/public/inquiries/create',{...publicGuest(s,i),requestedStartAt:s.startAt,message:'We agree to an indoor table for two.'},{as:'',status:201}),offer=await h.command('inquiry.reply',{inquiryId:made.id,serviceId:s.id,startAt:s.startAt,message:'An indoor table is offered for two.'})
  await h.api('/api/public/inquiries/reply',{token:made.token,message:'We accept the exact offer.',acceptOfferVersion:offer.offer.version},{as:''})
  const converted=await h.command('inquiry.convert',{inquiryId:made.id}),booking=converted.booking??converted
  const customer=await stripe('customers',{description:'Placemat isolated PAY-009 sandbox'});customers.push(customer.id)
  const setup=await stripe('setup_intents',{customer:customer.id,payment_method:'pm_card_visa','allowed_payment_method_types[0]':'card',return_url:'https://example.test/payment-setup-return',usage:'off_session',confirm:'true','metadata[placemat_booking_id]':booking.id,'metadata[placemat_policy_id]':policy.id})
  assert.equal(setup.status,'succeeded')
  await feeApi(h,'fee-consent',{bookingId:booking.id,policyId:policy.id,reviewedPolicyVersion:policy.version,reviewedPolicyText:policy.reviewText,acceptedAt:new Date().toISOString(),attest:true,evidence:'Synthetic sandbox guest accepts exact booking policy for this journey.',setupIntentId:setup.id})
  const payment=await stripe('payment_intents',{amount:'1000',currency:'usd',payment_method:'pm_card_createDispute',confirm:'true','allowed_payment_method_types[0]':'card',return_url:'https://example.test/payment-dispute-return','metadata[placemat_booking_id]':booking.id,description:'Placemat isolated PAY-009 dispute test'});assert.equal(payment.livemode,false);assert.equal(payment.status,'succeeded');const charge=await stripe('charges/'+payment.latest_charge);charges.push(charge.id)
  const list=await stripe('disputes?charge='+encodeURIComponent(charge.id)),dispute=list.data.find(d=>d.charge===charge.id);assert.ok(dispute,'Stripe generated the test dispute');disputes.push(dispute.id)
  const api=async(name,p)=>(await h.api('/api/payments/operations/'+name,p)).result
  const opened=await api('open',{bookingId:booking.id,disputeId:dispute.id}),review=await api('assemble',{caseId:dispute.id}),e=JSON.parse(review.evidence)
  assert.equal(e.policies[0].id,policy.id);assert.equal(e.messages.inquiries[0].messages.length,3)
  const approved=await api('approve',{reviewId:review.id,digest:review.digest,response:'The synthetic booking, immutable policy and exact guest conversation are attached for review.',acknowledged:true});assert.ok(approved.approved_at)
  const sent=await api('export',{caseId:opened.id,reviewId:review.id,accounts:i?{...mapping,revenue:'999999999'}:mapping,acknowledged:true})
  console.log(JSON.stringify({caseId:opened.id,exportId:sent.id,state:sent.state,code:sent.code,providerId:sent.provider_id,traceId:sent.trace_id}));assert.equal(sent.state,i?'rejected':'accepted');assert.equal((await api('export',{caseId:opened.id,reviewId:review.id,accounts:mapping,acknowledged:true})).id,sent.id)
  const work=await h.api('/api/payments/operations'),task=work.tasks.find(t=>t.id==='accounting-'+sent.id);assert.ok(task?.ownerId);assert.equal(task.dueAt,sent.created_at)
  if(sent.provider_id){journals.push({Id:sent.provider_id,SyncToken:'0'});const entry=(await accounting('journalentry/'+sent.provider_id)).JournalEntry;assert.equal(entry.Line.length,4);journals[journals.length-1]=entry;assert.equal(entry.Line[0].Amount,10)}
  results.push({disputeId:dispute.id,chargeId:charge.id,reviewId:review.id,exportId:sent.id,state:sent.state,providerId:sent.provider_id,code:sent.code,traceId:sent.trace_id,ownedTask:task.id})
 }
 console.log(JSON.stringify({journey:'PAY-009 live dispute evidence approval and QuickBooks sandbox handoff',at:new Date().toISOString(),results,applicationResponsesSent:0,applicationChargesMade:0}))
}catch(error){console.error('Sandbox journey failure:',error.message);throw error}finally{
 const cleanup=[]
 const clean=async(kind,reference,action)=>{try{await action()}catch{cleanup.push({kind,reference})}}
 for(const entry of journals)await clean('journal',entry.Id,()=>accounting('journalentry?operation=delete',{Id:entry.Id,SyncToken:entry.SyncToken}))
 for(const disputeId of disputes)await clean('dispute',disputeId,async()=>{const current=await stripe('disputes/'+disputeId);if(!['won','lost'].includes(current.status))await stripe('disputes/'+disputeId+'/close',{})})
 for(const customer of customers)await clean('customer',customer,async()=>{const r=await fetch('https://api.stripe.com/v1/customers/'+customer,{method:'DELETE',headers:{authorization:'Bearer '+secret}});assert.ok(r.ok)})
 await h.close()
 if(cleanup.length){console.error('Owned sandbox cleanup needs attention:',JSON.stringify(cleanup));process.exitCode=1}else console.log('Sandbox journals deleted, isolated test disputes closed and customers deleted. Disputed principal remains processor history.')
}
