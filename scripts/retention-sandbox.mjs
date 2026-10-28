// Controlled SendGrid delivery and the real guest page; addresses and private links remain in memory.
import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {installation,service,publicGuest} from '../tests/api/harness.mjs'
import {browserServer} from '../tests/browser-server.mjs'
import {normalizeInbound} from '../src/modules/mail/src/inbound/index.mjs'
for(const key of ['MAIL_API_KEY','MAIL_FROM','TEST_MAIL_TO','QA_INBOX_RECEIPT_TOKEN'])assert.ok(process.env[key],`Missing ${key}`)
const recipient=process.env.TEST_MAIL_TO,since=new Date().toISOString(),submissions=[]
let now=Date.now()
const h=await installation({entry:'tests/api/retention-worker.ts',clock:()=>now,bindings:{OWNER_EMAIL:recipient,MAIL_PROVIDER:'sendgrid',MAIL_FROM:process.env.MAIL_FROM,MAIL_API_KEY:process.env.MAIL_API_KEY},mailEdge:async request=>{
 const message=await request.json();assert.deepEqual(message.personalizations[0].to,[{email:recipient}]);assert.equal(message.personalizations.length,1)
 assert.ok(!message.attachments&&!message.cc&&!message.bcc&&!message.personalizations[0].cc&&!message.personalizations[0].bcc)
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:request.headers.get('authorization'),'content-type':'application/json'},body:JSON.stringify(message),redirect:'manual',signal:AbortSignal.timeout(20000)})
 assert.equal(response.status,202)
 submissions.push({subject:message.subject,text:message.content.find(c=>c.type==='text/plain').value,providerId:response.headers.get('x-message-id')});return response
}})
async function delivered(submission,contains,kind){
 const inbox='https://rer-qa-inbox.runeditrun.workers.dev',headers={authorization:'Bearer '+process.env.QA_INBOX_RECEIPT_TOKEN},query=new URLSearchParams({to:recipient,subject:submission.subject,since,limit:'10'})
 for(let poll=0;poll<18;poll++){
  const result=await fetch(inbox+'/receipts?'+query,{headers,signal:AbortSignal.timeout(10000)});assert.equal(result.status,200)
  for(const receipt of (await result.json()).receipts??[]){
   assert.equal(receipt.to,recipient);assert.match(receipt.rawUrl,/^\/receipts\/[A-Za-z0-9_-]+\/raw$/)
   const response=await fetch(inbox+receipt.rawUrl,{headers,signal:AbortSignal.timeout(10000)});assert.equal(response.status,200)
   const bytes=new Uint8Array(await response.arrayBuffer()),mail=await normalizeInbound({provider:'cloudflare',message:{headers:new Headers(),from:receipt.from,to:recipient,rawSize:bytes.length,raw:new Blob([bytes]).stream()}},{maxRawBytes:1048576,maxBodyBytes:262144,maxAttachments:10,maxAttachmentBytes:1048576,maxTotalAttachmentBytes:1048576})
   if(!mail.text.includes(contains))continue
   assert.equal(receipt.auth?.dmarc,'pass');assert.equal(receipt.auth?.trusted,'authentication-results')
   console.log(JSON.stringify({kind,providerMessageId:submission.providerId,receiptId:receipt.id,receivedAt:receipt.receivedAt,authentication:'DMARC pass'}));return
  }
  await new Promise(resolve=>setTimeout(resolve,5000))
 }
 assert.fail('The exact retention message did not reach the controlled inbox')
}
let transport,browser,context
try{
 const f=await service(h),booking=(await h.api('/api/public/book',publicGuest(f.service,0,{email:recipient}),{as:'',status:201})).result
 await h.api('/api/retention/grant',{enabled:true})
 await h.api('/api/public/retention/request',{email:recipient},{as:''});assert.equal(submissions.length,1)
 const confirmation=submissions[0].text.match(/\/retention#([a-f0-9]{64})/)[1];await delivered(submissions[0],confirmation,'marketing permission confirmation')
 const confirmed=await h.api('/api/public/retention/confirm',{token:confirmation,confirm:true},{as:''});assert.equal(confirmed.confirmed,true)
 const expiry=new Date(Date.parse(f.service.endAt)+30*86400000).toISOString(),draft=await h.api('/api/retention/draft',{name:'Your next Cedar visit',trigger:'first-to-second',offer:'Come back for our seasonal menu. Quote CEDAR when booking your next visit.',delayDays:0,lapsedDays:90,capDays:7,quietStart:'20:00',quietEnd:'09:00',expiresAt:expiry})
 assert.equal(draft.preview.recipients.length,1);assert.equal(draft.preview.recipients[0].email,recipient)
 await h.api('/api/retention/approve',{workflowId:draft.preview.workflowId,previewHash:draft.preview.previewHash})
 await h.command('booking.status',{bookingId:booking.id,status:'seated'});await h.command('booking.status',{bookingId:booking.id,status:'completed'})
 now=Date.parse(f.service.endAt)+12*3600000
 const worker=await h.mf.getWorker();assert.equal((await worker.scheduled({scheduledTime:new Date(now),cron:'17 * * * *'})).outcome,'ok')
 assert.equal(submissions.length,2)
 const offerToken=submissions[1].text.match(/\/retention#([a-f0-9]{64})/)[1];await delivered(submissions[1],offerToken,'approved first-to-second invitation')
 const offer=await h.api('/api/public/retention/status',{token:offerToken},{as:''});assert.equal(offer.offer,draft.preview.offer)
 transport=await browserServer(h);browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]});context=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,extraHTTPHeaders:{'x-placemat-test-clock':String(now)}})
 const page=await context.newPage();await page.goto(transport.origin+'/retention#'+offerToken);await page.getByRole('heading',{name:'Your invitation',exact:true}).waitFor();await page.getByText(draft.preview.offer,{exact:true}).waitFor()
 await page.getByRole('button',{name:'Unsubscribe from marketing',exact:true}).click();await page.getByRole('heading',{name:'Unsubscribed',exact:true}).waitFor()
 await h.api('/api/public/retention/status',{token:offerToken},{as:'',status:404})
 assert.equal((await worker.scheduled({scheduledTime:new Date(now+86400000),cron:'17 * * * *'})).outcome,'ok');assert.equal(submissions.length,2)
 console.log(JSON.stringify({confirmedAddressDelivered:true,approvedMarketingDelivered:true,guestPageOpened:true,unsubscribeApplied:true,replayedSchedulerSends:0}))
}finally{if(context)await context.close();if(browser)await browser.close();if(transport)await transport.close();await h.close()}
