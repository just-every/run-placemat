// Opt-in Stripe test proof: the provider itself delivers signed events to the real Worker.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {installation,service,publicGuest} from '../tests/api/harness.mjs'

const secret=process.env.STRIPE_SECRET_KEY
assert.ok(secret?.startsWith('sk_test_'),'Only a held Stripe test secret may run this proof')
const proofRun='sx-placemat-c39-'+randomUUID(),deliveries=[]
let h,tunnel,endpoint,createdCharge
const stripe=async(path,body,method=body?'POST':'GET')=>{
 const response=await fetch('https://api.stripe.com/v1/'+path,{method,headers:{authorization:'Bearer '+secret,...body?{'content-type':'application/x-www-form-urlencoded'}:{}},body:body?.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)})
 assert.ok(response.ok,`Stripe test API status ${response.status}`)
 const value=await response.json();assert.notEqual(value.livemode,true);return value
}
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='POST'||req.url!=='/api/payments/refund-events'){res.writeHead(404).end();return}
  if(!h){res.writeHead(503).end();return}
  const chunks=[];let size=0
  for await(const chunk of req){size+=chunk.length;if(size>1048576){res.writeHead(413).end();return}chunks.push(chunk)}
  const bytes=Buffer.concat(chunks),response=await h.mf.dispatchFetch(h.origin+req.url,{method:'POST',headers:{'content-type':String(req.headers['content-type']??'application/json'),'stripe-signature':String(req.headers['stripe-signature']??'')},body:bytes})
  const body=await response.text();deliveries.push({bytes,status:response.status,signature:req.headers['stripe-signature']})
  res.writeHead(response.status,{'content-type':'application/json'}).end(body)
 }catch{res.writeHead(503).end()}
})
try{
 server.listen(0,'127.0.0.1');await once(server,'listening')
 tunnel=spawn('cloudflared',['tunnel','--config','/dev/null','--no-autoupdate','--url',`http://127.0.0.1:${server.address().port}`],{env:Object.fromEntries(['HOME','PATH','TMPDIR','LANG'].filter(key=>process.env[key]).map(key=>[key,process.env[key]])),stdio:['ignore','pipe','pipe']})
 let tunnelOutput=''
 for(const stream of [tunnel.stdout,tunnel.stderr])stream.on('data',chunk=>{tunnelOutput=(tunnelOutput+chunk.toString()).slice(-32768)})
 let tunnelUrl
 for(let i=0;i<120;i++){
  assert.equal(tunnel.exitCode,null,'The temporary tunnel must stay running')
  tunnelUrl=tunnelOutput.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0]
  if(tunnelUrl&&tunnelOutput.includes('Registered tunnel connection'))break
  await new Promise(resolve=>setTimeout(resolve,500))
 }
 assert.ok(tunnelUrl&&tunnelOutput.includes('Registered tunnel connection'),'Temporary provider-delivery tunnel did not become ready')
 endpoint=await stripe('webhook_endpoints',new URLSearchParams({url:tunnelUrl+'/api/payments/refund-events','enabled_events[0]':'refund.created','enabled_events[1]':'refund.updated','enabled_events[2]':'refund.failed','metadata[placemat_proof_run]':proofRun}))
 assert.ok(endpoint.secret,'Stripe supplies the endpoint signing secret only at creation')
 h=await installation({bindings:{STRIPE_SECRET_KEY:secret,STRIPE_WEBHOOK_SECRET:endpoint.secret},stripeEdge:async request=>{
  const url=new URL(request.url);assert.equal(url.hostname,'api.stripe.com');assert.match(url.pathname,/^\/v1\/(charges|refunds)(\/[^/]+)?$/)
  const headers=new Headers();for(const key of ['authorization','content-type','stripe-version','idempotency-key'])if(request.headers.has(key))headers.set(key,request.headers.get(key))
  const response=await fetch(request.url,{method:request.method,headers,body:request.method==='POST'?await request.text():undefined,redirect:'manual',signal:AbortSignal.timeout(20000)})
  assert.ok(response.ok,`Stripe test transport status ${response.status}`)
  return Response.json(await response.json(),{status:response.status})
 }})
 const f=await service(h),booking=(await h.api('/api/public/book',publicGuest(f.service,1),{as:'',status:201})).result
 const payment=await stripe('payment_intents',new URLSearchParams({amount:'10000',currency:'usd',payment_method:'pm_card_visa',confirm:'true','automatic_payment_methods[enabled]':'true','automatic_payment_methods[allow_redirects]':'never','metadata[placemat_booking_id]':booking.id,'metadata[placemat_proof_run]':proofRun}))
 assert.equal(payment.status,'succeeded');createdCharge=payment.latest_charge;assert.equal(typeof createdCharge,'string')
 await h.command('payment.charge-sync',{bookingId:booking.id,chargeId:createdCharge})
 const outcomes=[]
 for(const amountCents of [4000,6000]){
  const payload={bookingId:booking.id,chargeId:createdCharge,amountCents,requestId:randomUUID(),reason:'Controlled actual signed webhook proof'}
  const refund=await h.command('payment.refund',payload);assert.equal(refund.status,'succeeded')
  let eventId
  for(let i=0;i<72;i++){
   const exported=await h.request('/api/business-export/refund-webhooks.csv');assert.equal(exported.status,200)
   const row=(await exported.text()).split('\n').find(row=>row.includes(refund.id));eventId=row?.match(/evt_[A-Za-z0-9]+/)?.[0]
   if(eventId)break
   await new Promise(resolve=>setTimeout(resolve,5000))
  }
  assert.ok(eventId,'A real Stripe delivery must be committed and visible through the owner CSV')
  const event=await stripe('events/'+eventId);assert.equal(event.data.object.id,refund.processorId);assert.equal(event.data.object.amount,amountCents)
  const delivered=deliveries.find(delivery=>delivery.status===200&&JSON.parse(delivery.bytes.toString()).id===eventId);assert.ok(delivered,'Stripe must receive a successful HTTP acknowledgment')
  // Replay the exact provider-signed bytes; no signature is synthesized by this proof.
  const replay=await h.mf.dispatchFetch(h.origin+'/api/payments/refund-events',{method:'POST',headers:{'content-type':'application/json','stripe-signature':delivered.signature},body:delivered.bytes})
  assert.equal(replay.status,200);assert.equal((await replay.json()).duplicate,true)
  assert.equal((await h.command('payment.refund',payload)).id,refund.id)
  outcomes.push({refundReference:refund.processorId,eventReference:eventId,amountCents,signedDeliveryAcknowledged:true,exactReplayDeduplicated:true})
 }
 await h.command('payment.refund',{bookingId:booking.id,chargeId:createdCharge,amountCents:1,requestId:randomUUID(),reason:'Refused excess'},{status:409})
 assert.equal((await stripe('charges/'+createdCharge)).amount_refunded,10000)
 console.log(JSON.stringify({proof:'PAY-005 actual Stripe signed webhook delivery',at:new Date().toISOString(),proofRun,chargeReference:createdCharge,outcomes,furtherCentRefused:true}))
}finally{
 try{if(endpoint)await stripe('webhook_endpoints/'+endpoint.id,undefined,'DELETE')}
 finally{
  try{if(createdCharge){const charge=await stripe('charges/'+createdCharge),remaining=charge.amount_captured-charge.amount_refunded;if(remaining>0)await stripe('refunds',new URLSearchParams({charge:createdCharge,amount:String(remaining),'metadata[placemat_proof_run]':proofRun}))}}
  finally{
   if(tunnel&&tunnel.exitCode===null){const ended=once(tunnel,'exit');tunnel.kill('SIGTERM');await ended}
   server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await h?.close()
  }
 }
}
