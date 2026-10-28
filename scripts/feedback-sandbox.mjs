// Held-key delivery journey. Addresses, private links and received content stay in memory.
import assert from 'node:assert/strict'
import {installation,service,publicGuest} from '../tests/api/harness.mjs'
import {feedbackTick,feedbackReviewUrl} from '../tests/api/feedback-fixture.mjs'
import {normalizeInbound} from '../src/modules/mail/src/inbound/index.mjs'
for(const name of ['MAIL_API_KEY','MAIL_FROM','TEST_MAIL_TO','QA_INBOX_RECEIPT_TOKEN'])assert.ok(process.env[name],`Missing ${name}`)
const recipient=process.env.TEST_MAIL_TO,since=new Date().toISOString(),submissions=[]
const h=await installation({bindings:{OWNER_EMAIL:recipient,MAIL_PROVIDER:'sendgrid',MAIL_FROM:process.env.MAIL_FROM,MAIL_API_KEY:process.env.MAIL_API_KEY},mailEdge:async request=>{
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
   console.log(JSON.stringify({kind:submissions.indexOf(submission)<2?'visit survey':'manager recovery reply',providerMessageId:submission.providerId,receiptId:candidate.id,receivedAt:candidate.receivedAt,authentication:'DMARC pass'}))
   return mail
  }
  await new Promise(resolve=>setTimeout(resolve,5000))
 }
 assert.fail('The exact feedback message did not reach the controlled inbox')
}
try{
 const f=await service(h),bookings=[]
 await h.api('/api/feedback/settings',{enabled:true,publicReviewUrl:feedbackReviewUrl})
 for(let i=0;i<2;i++){
  const b=(await h.api('/api/public/book',publicGuest(f.service,0,{email:recipient,startAt:new Date(Date.parse(f.service.startAt)+i*7200000).toISOString(),feedbackEmailConsent:true}),{as:'',status:201})).result
  bookings.push(b);await h.command('booking.status',{bookingId:b.id,status:'seated'});await h.command('booking.status',{bookingId:b.id,status:'completed'});await h.command('booking.stage',{bookingId:b.id,floorStage:'ready'})
 }
 await feedbackTick(h);assert.equal(submissions.length,2)
 const tokens=[]
 for(const submission of submissions){
  const token=submission.text.match(/\/feedback#([a-f0-9]{64})/)[1],mail=await delivered(submission,token)
  assert.ok(mail.text.includes(feedbackReviewUrl));tokens.push(token)
 }
 for(let i=0;i<2;i++)await h.api('/api/public/feedback/submit',{token:tokens[i],rating:i?5:1,comment:i?'Lovely service':'We waited too long for the main course'},{as:''})
 const low=await h.api('/api/public/feedback/status',{token:tokens[0]},{as:''}),positive=await h.api('/api/public/feedback/status',{token:tokens[1]},{as:''})
 assert.equal(low.publicReviewUrl,positive.publicReviewUrl);assert.ok(low.case&&!positive.case)
 await h.api('/api/public/feedback/reply',{token:tokens[0],message:'Please let the manager know about the delay.'},{as:''})
 const visit=(await h.api('/api/feedback')).visits.find(v=>v.bookingId===low.bookingId),reply='We are sorry about the delay. Our manager reviewed the kitchen handover and will follow up with the team.'
 await h.api('/api/feedback/reply',{visitId:visit.id,message:reply,requestId:crypto.randomUUID()})
 assert.equal(submissions.length,3);await delivered(submissions[2],reply)
 await h.api('/api/feedback/close',{visitId:visit.id,outcome:'Manager replied, acknowledged the delay and recorded the kitchen handover action.'})
 assert.equal((await h.api('/api/public/feedback/status',{token:tokens[0]},{as:''})).case.state,'closed')
 await feedbackTick(h);assert.equal(submissions.length,3)
 console.log(JSON.stringify({surveysDelivered:2,recoveryReplyDelivered:1,oppositeRatings:true,equalPublicInvitation:true,closedOutcome:true,replaySuppressed:true}))
}finally{await h.close()}
