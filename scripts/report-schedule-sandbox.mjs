// Held-key local journey: one real scheduled report, then current-authority refusal.
// Credentials, native sessions and received MIME stay in memory.
import assert from 'node:assert/strict'
import {reportGroup,firstDue} from '../tests/api/report-schedule-fixture.mjs'
import {normalizeInbound} from '../src/modules/mail/src/inbound/index.mjs'

for(const name of ['MAIL_API_KEY','MAIL_FROM','TEST_MAIL_TO','QA_INBOX_RECEIPT_TOKEN'])assert.ok(process.env[name],`Missing ${name}`)
const recipient=process.env.TEST_MAIL_TO,since=new Date().toISOString()
let submissions=0,providerMessageId
const f=await reportGroup({recipientEmail:recipient,bindings:{MAIL_PROVIDER:'sendgrid',MAIL_API_KEY:process.env.MAIL_API_KEY,MAIL_FROM:process.env.MAIL_FROM},reportMailEdge:async request=>{
 const url=new URL(request.url),body=await request.json()
 assert.equal(url.origin,'https://api.sendgrid.com');assert.equal(url.pathname,'/v3/mail/send');assert.equal(request.method,'POST')
 assert.equal(body.personalizations.length,1);assert.deepEqual(body.personalizations[0].to,[{email:recipient}])
 assert.ok(!body.personalizations[0].cc&&!body.personalizations[0].bcc&&!body.cc&&!body.bcc&&!body.attachments)
 assert.equal(body.subject,'Your weekly group cover report')
 assert.equal(++submissions,1,'This journey permits only one real provider submission, including uncertain outcomes')
 const response=await fetch(url,{method:'POST',headers:{authorization:request.headers.get('authorization'),'content-type':'application/json'},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(20000)})
 assert.equal(response.status,202,'SendGrid must accept the one controlled submission')
 providerMessageId=response.headers.get('x-message-id');assert.ok(providerMessageId)
 console.log(JSON.stringify({providerAccepted:true,providerMessageId}))
 return response
}})
let schedule
try{
 schedule=await f.approve()
 await f.tick()
 let deliveries=(await f.home.api('/api/report-schedules')).deliveries
 const attempt=deliveries.find(d=>d.schedule_id===schedule.id)
 assert.equal(attempt.state,'provider accepted');assert.equal(submissions,1)
 const inbox='https://rer-qa-inbox.runeditrun.workers.dev',headers={authorization:`Bearer ${process.env.QA_INBOX_RECEIPT_TOKEN}`}
 const query=new URLSearchParams({to:recipient,subject:'Your weekly group cover report',since,limit:'10'})
 let receipt,mail
 for(let poll=0;poll<18;poll++){
  const response=await fetch(inbox+'/receipts?'+query,{headers,signal:AbortSignal.timeout(10000)})
  assert.equal(response.status,200,'Controlled inbox lookup must succeed')
  for(const candidate of (await response.json()).receipts??[]){
   assert.equal(candidate.to,recipient);assert.match(candidate.rawUrl,/^\/receipts\/[a-zA-Z0-9_-]+\/raw$/)
   const raw=await fetch(inbox+candidate.rawUrl,{headers,signal:AbortSignal.timeout(10000)});assert.equal(raw.status,200)
   const bytes=new Uint8Array(await raw.arrayBuffer())
   const parsed=await normalizeInbound({provider:'cloudflare',message:{headers:new Headers(),from:candidate.from,to:recipient,rawSize:bytes.length,raw:new Blob([bytes]).stream()}},{maxRawBytes:1048576,maxBodyBytes:262144,maxAttachments:10,maxAttachmentBytes:1048576,maxTotalAttachmentBytes:1048576})
   if(parsed.text.includes('/api/report-deliveries/'+attempt.id+'.csv')){receipt=candidate;mail=parsed;break}
  }
  if(receipt)break
  await new Promise(resolve=>setTimeout(resolve,5000))
 }
 assert.ok(receipt,'The controlled inbox must receive this exact scheduled attempt')
 assert.equal(receipt.auth?.trusted,'authentication-results');assert.equal(receipt.auth?.dmarc,'pass')
 const link=new URL(mail.text.match(/https:\/\/[^\s]+\/api\/report-deliveries\/[^\s]+\.csv/)[0])
 assert.equal(link.origin,f.home.origin);assert.equal(link.search,'');assert.equal(link.hash,'')
 assert.ok(!mail.text.includes('bookedCovers')&&!mail.text.includes('guest0@example.test'),'Mail contains an authenticated link rather than a report snapshot')
 const csv=await f.home.request(link.pathname,{as:f.recipient});assert.equal(csv.status,200)
 const contents=await csv.text();assert.ok(contents.includes('Home Bistro')&&contents.includes('Tap Room'))
 for(const as of ['',f.other,f.home.cookie])await f.home.api(link.pathname,undefined,{as,status:as?403:401})
 await f.tick();assert.equal(submissions,1,'Replayed scheduled ticks never send again')
 await f.home.api('/api/group/admin/revoke',{operatorId:f.recipientId})
 await f.home.api(link.pathname,undefined,{as:f.recipient,status:403})
 const next=new Date(Date.parse(firstDue)+7*86400000).toISOString();await f.tick(next)
 deliveries=(await f.home.api('/api/report-schedules')).deliveries
 assert.ok(deliveries.some(d=>d.schedule_id===schedule.id&&d.due_at===next&&d.state==='blocked'))
 assert.equal(submissions,1,'Revoked authority blocks before the provider edge')
 const audit=(await f.home.api('/api/audit')).rows
 for(const action of ['report.recipient-approved','report.recheck-refused','report.link-refused'])assert.ok(audit.some(e=>e.action===action))
 console.log(JSON.stringify({journey:'REPORT-005 real scheduled SendGrid delivery',providerMessageId,receiptId:receipt.id,receivedAt:receipt.receivedAt,authentication:'DMARC pass',scheduledAttempt:attempt.id,authenticatedCsv:true,foreignIdentityDenied:true,replayedTickSuppressed:true,revokedLinkDenied:true,nextScheduledDelivery:'blocked',providerSubmissions:submissions}))
}finally{
 try{if(schedule)await f.home.api('/api/report-schedules/stop',{scheduleId:schedule.id})}finally{await f.close()}
}
