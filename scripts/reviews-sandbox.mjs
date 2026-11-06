// Held-key delivery journey. Addresses, private links and received content stay in memory.
import assert from 'node:assert/strict'
import {installation,service,publicGuest} from '../tests/api/harness.mjs'
import {feedbackTick,feedbackReviewUrl} from '../tests/api/feedback-fixture.mjs'
import {normalizeInbound} from '../src/modules/mail/src/inbound/index.mjs'
for(const name of ['MAIL_API_KEY','MAIL_FROM','TEST_MAIL_TO','QA_INBOX_RECEIPT_TOKEN'])assert.ok(process.env[name],`Missing ${name}`)
const recipient=process.env.TEST_MAIL_TO,since=new Date().toISOString(),submissions=[]
const h=await installation({bindings:{OWNER_EMAIL:['synthetic-placemat-owner','example.test'].join(String.fromCharCode(64)),MAIL_PROVIDER:'sendgrid',MAIL_FROM:process.env.MAIL_FROM,MAIL_API_KEY:process.env.MAIL_API_KEY},mailEdge:async request=>{
 const body=await request.json()
 assert.deepEqual(body.personalizations[0].to,[{email:recipient}]);assert.equal(body.personalizations.length,1)
 assert.ok(!body.attachments&&!body.cc&&!body.bcc&&!body.personalizations[0].cc&&!body.personalizations[0].bcc)
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:request.headers.get('authorization'),'content-type':'application/json'},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(20000)})
 assert.equal(response.status,202)
 submissions.push({subject:body.subject,text:body.content.find(p=>p.type==='text/plain').value,providerId:response.headers.get('x-message-id')})
 return response
}})
async function delivered(submission,contains){
 const inbox='https://rer-qa-inbox.runeditrun.workers.dev',headers={authorization:'Bearer '+process.env.QA_INBOX_RECEIPT_TOKEN},query=new URLSearchParams({to:recipient,subject:submission.subject,since,limit:'10'})
 for(let poll=0;poll<18;poll++){
  const response=await fetch(inbox+'/receipts?'+query,{headers,signal:AbortSignal.timeout(10000)});assert.equal(response.status,200)
  for(const candidate of (await response.json()).receipts??[]){
   assert.equal(candidate.to,recipient);assert.match(candidate.rawUrl,/^\/receipts\/[a-zA-Z0-9_-]+\/raw$/)
   const raw=await fetch(inbox+candidate.rawUrl,{headers,signal:AbortSignal.timeout(10000)});assert.equal(raw.status,200)
   const bytes=new Uint8Array(await raw.arrayBuffer()),mail=await normalizeInbound({provider:'cloudflare',message:{headers:new Headers(),from:candidate.from,to:recipient,rawSize:bytes.length,raw:new Blob([bytes]).stream()}},{maxRawBytes:1048576,maxBodyBytes:262144,maxAttachments:10,maxAttachmentBytes:1048576,maxTotalAttachmentBytes:1048576})
   if(!mail.text.includes(contains))continue
   assert.equal(candidate.auth?.dmarc,'pass');assert.equal(candidate.auth?.trusted,'authentication-results')
   console.log(JSON.stringify({kind:submission.subject==='Verify your diner account'?'booking contact proof':'review invitation',providerMessageId:submission.providerId,receiptId:candidate.id,receivedAt:candidate.receivedAt,authentication:'DMARC pass'}))
   return mail
  }
  await new Promise(resolve=>setTimeout(resolve,5000))
 }
 assert.fail('The exact feedback message did not reach the controlled inbox')
}
try{
 const f=await service(h)
 await h.api('/api/feedback/settings',{enabled:true,publicReviewUrl:feedbackReviewUrl})
 const b=(await h.api('/api/public/book',publicGuest(f.service,0,{email:recipient,feedbackEmailConsent:true}),{as:'',status:201})).result
 await h.command('booking.status',{bookingId:b.id,status:'seated'});await h.command('booking.status',{bookingId:b.id,status:'completed'})
 await feedbackTick(h);assert.equal(submissions.length,1)
 const invitationToken=submissions[0].text.match(/\/reviews#([a-f0-9]{64})/)[1]
 await delivered(submissions[0],invitationToken)
 // The held controlled mailbox proves booking identity independently of the invitation.
 await h.api('/api/public/diner/request',{bookingId:b.id,email:recipient,acknowledged:true},{as:'',status:202})
 assert.equal(submissions.length,2)
 const code=submissions[1].text.match(/\b[a-f0-9]{64}\b/)[0]
 await delivered(submissions[1],code)
 const proof=await h.api('/api/public/diner/verify',{code,acknowledged:true},{as:''})
 assert.equal((await h.api('/api/public/reviews',undefined,{as:''})).count,0)
 const published=await h.api('/api/public/reviews/submit',{token:proof.token,invitationToken,bookingId:b.id,rating:4,comment:'Controlled attended-visit review.',publish:true,notStaff:true},{as:''})
 assert.equal(published.reviews[0].rating,4);assert.ok(published.reviews[0].visitDate)
 await h.api('/api/public/reviews/submit',{token:proof.token,invitationToken,bookingId:b.id,rating:4,comment:'Duplicate',publish:true,notStaff:true},{as:'',status:409})
 await feedbackTick(h);assert.equal(submissions.length,2)
 console.log(JSON.stringify({invitationProviderAccepted:true,invitationMailboxDelivered:true,currentContactMailboxDelivered:true,actualGuestSubmission:true,rating:4,datedPublication:true,duplicateRefused:true,replaySuppressed:true,posMatchedProof:false}))
}finally{await h.close()}
