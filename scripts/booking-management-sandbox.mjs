// Controlled SendGrid + receiver proof. Run only through the named-key OD-08 helper.
// All capability URLs and provider credentials remain in memory.
import assert from 'node:assert/strict'
import {installation,service,publicGuest} from '../tests/api/harness.mjs'
import {normalizeInbound} from '../src/modules/mail/src/inbound/index.mjs'
for(const key of ['MAIL_API_KEY','MAIL_FROM','QA_INBOX_RECEIPT_TOKEN','QA_MAIL_TO'])assert.ok(process.env[key],`Missing ${key}`)
const recipient=process.env.QA_MAIL_TO,since=new Date().toISOString()
const h=await installation({bindings:{MAIL_PROVIDER:'sendgrid',MAIL_FROM:process.env.MAIL_FROM,MAIL_API_KEY:process.env.MAIL_API_KEY},mailEdge:async request=>{
 console.log('Controlled mail edge reached',request.method,new URL(request.url).pathname);assert.equal(new URL(request.url).hostname,'api.sendgrid.com');assert.equal(new URL(request.url).pathname,'/v3/mail/send')
 const wire=await request.text(),body=JSON.parse(wire);assert.equal(body.personalizations.length,1);assert.equal(body.personalizations[0].to.length,1);assert.equal(body.personalizations[0].to[0].email,recipient)
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:request.method,headers:{authorization:request.headers.get('authorization'),'content-type':request.headers.get('content-type')},body:wire,signal:AbortSignal.timeout(20000)});console.log('Controlled SendGrid HTTP status',response.status);return response
}})
try{
 const f=await service(h,{tables:1,seats:4,covers:8}),booking=(await h.api('/api/public/book',publicGuest(f.service,1,{name:'Amelia Chen',email:recipient}),{as:'',status:201})).result
 const issued=await h.command('booking.management.send',{bookingId:booking.id,acknowledged:true});assert.equal(issued.status,'accepted');assert.equal(issued.token,undefined)
 const origin='https://rer-qa-inbox.runeditrun.workers.dev',headers={authorization:`Bearer ${process.env.QA_INBOX_RECEIPT_TOKEN}`},query=new URLSearchParams({to:recipient,subject:booking.id,since,limit:'1'})
 let receipt
 for(let attempt=0;attempt<18;attempt++){
  const response=await fetch(origin+'/receipts?'+query,{headers,signal:AbortSignal.timeout(10000)});assert.equal(response.status,200)
  receipt=(await response.json()).receipts?.[0];if(receipt)break
  await new Promise(resolve=>setTimeout(resolve,5000))
 }
 assert.ok(receipt,'The controlled mailbox must confirm receipt')
 assert.equal(receipt.to,recipient);assert.equal(receipt.auth?.trusted,'authentication-results');assert.equal(receipt.auth?.dmarc,'pass')
 assert.match(receipt.rawUrl,/^\/receipts\/[a-zA-Z0-9_-]+\/raw$/)
 const raw=await fetch(origin+receipt.rawUrl,{headers,signal:AbortSignal.timeout(10000)});assert.equal(raw.status,200)
 const bytes=new Uint8Array(await raw.arrayBuffer()),mail=await normalizeInbound({provider:'cloudflare',message:{headers:new Headers(),from:receipt.from,to:recipient,rawSize:bytes.length,raw:new Blob([bytes]).stream()}},{})
 const link=new URL(mail.text.match(/https:\/\/[^\s]+\/manage-booking#[^\s]+/)[0]);let token=new URLSearchParams(link.hash.slice(1)).get('token')
 const api=(action,p={},status=200)=>h.api('/api/public/booking-management/'+action,{token,...p},{as:'',status})
 assert.equal((await api('status')).booking.id,booking.id)
 let preview=await api('preview',{action:'change',partySize:4}),result=await api('commit',{previewId:preview.previewId,acknowledged:true});assert.equal(result.booking.partySize,4)
 const old=token;token=result.token;await api('status',{token:old},404)
 await api('preview',{action:'change',partySize:5},409);assert.equal((await api('status')).booking.partySize,4)
 preview=await api('preview',{action:'cancel'});assert.equal(preview.consequences.feeCents,0);assert.equal(preview.consequences.refundCents,0)
 result=await api('commit',{previewId:preview.previewId,acknowledged:true});assert.equal(result.booking.status,'cancelled')
 console.log(JSON.stringify({proof:'BOOK-004 delivered-link zero-money journey',receiptId:receipt.id,receivedAt:receipt.receivedAt,authentication:'DMARC pass',recipient,providerAccepted:true,twoToFour:true,unavailablePreserved:true,acknowledgedCancellation:true,replayRefused:true}))
}finally{await h.close()}
