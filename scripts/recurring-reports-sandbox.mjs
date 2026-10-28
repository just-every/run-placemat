// Explicit held-key proof: three approved native reports to the controlled owner inbox.
// Credentials, sessions, addresses and received MIME stay in memory.
import assert from 'node:assert/strict'
import {installation,publicGuest} from '../tests/api/harness.mjs'
import {publishReportService,firstDue} from '../tests/api/report-schedule-fixture.mjs'
import {normalizeInbound} from '../src/modules/mail/src/inbound/index.mjs'
for(const name of ['MAIL_API_KEY','MAIL_FROM','TEST_MAIL_TO','QA_INBOX_RECEIPT_TOKEN'])assert.ok(process.env[name],`Missing ${name}`)
const recipient=process.env.TEST_MAIL_TO,since=new Date().toISOString(),accepted=new Map()
const h=await installation({bindings:{OWNER_EMAIL:recipient,MAIL_PROVIDER:'sendgrid',MAIL_FROM:process.env.MAIL_FROM,MAIL_API_KEY:process.env.MAIL_API_KEY},mailEdge:async request=>{
 const body=await request.json(),subject=body.subject
 assert.ok(['Your weekly reservation report','Your weekly guest report','Your weekly finance report'].includes(subject))
 assert.ok(!accepted.has(subject),'Only one provider submission per approved report is permitted')
 assert.deepEqual(body.personalizations[0].to,[{email:recipient}]);assert.equal(body.personalizations.length,1)
 assert.ok(!body.attachments&&!body.cc&&!body.bcc&&!body.personalizations[0].cc&&!body.personalizations[0].bcc)
 accepted.set(subject,null)
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:request.headers.get('authorization'),'content-type':'application/json'},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(20000)})
 assert.equal(response.status,202);accepted.set(subject,response.headers.get('x-message-id'));return response
}})
try{
 await h.command('venue.update',{name:'Controlled report venue',timezone:'America/Los_Angeles'})
 await h.command('table.save',{label:'R1',seats:4,x:20,y:30})
 const service=await publishReportService(h,'Controlled report service','2031-11-03T01:00:00Z')
 const booking=(await h.api('/api/public/book',publicGuest(service,0),{as:'',status:201})).result
 // A native deposit request supplies finance data without making a charge.
 const owner=(await h.api('/auth/operators')).find(p=>p.role==='owner')
 await h.command('payment.request',{bookingId:booking.id,perGuestCents:1000,dueAt:'2031-11-03T00:00:00.000Z',followupOwnerId:owner.id,reason:'Controlled booking deposit'})
 for(const kind of ['reservations','guests','finance'])await h.api('/api/report-schedules',{reportKind:kind,recipientId:owner.id,venueIds:['home'],nextAt:firstDue,acknowledged:true},{status:201})
 const tick=async time=>{const result=await(await h.mf.getWorker()).scheduled({scheduledTime:new Date(time),cron:'17 * * * *'});assert.equal(result.outcome,'ok')}
 await tick(firstDue)
 const data=await h.api('/api/report-schedules');assert.equal(data.deliveries.length,3)
 for(const kind of ['reservations','guests','finance']){
  const schedule=data.schedules.find(s=>s.report_kind===kind),attempt=data.deliveries.find(d=>d.schedule_id===schedule.id),subject='Your weekly '+({reservations:'reservation',guests:'guest',finance:'finance'}[kind])+' report'
  assert.equal(attempt.state,'provider accepted');assert.ok(accepted.get(subject))
  const inbox='https://rer-qa-inbox.runeditrun.workers.dev',headers={authorization:'Bearer '+process.env.QA_INBOX_RECEIPT_TOKEN},query=new URLSearchParams({to:recipient,subject,since,limit:'10'})
  let receipt,mail
  for(let poll=0;poll<18&&!receipt;poll++){
   const response=await fetch(inbox+'/receipts?'+query,{headers,signal:AbortSignal.timeout(10000)});assert.equal(response.status,200)
   for(const candidate of (await response.json()).receipts??[]){
    assert.equal(candidate.to,recipient);assert.match(candidate.rawUrl,/^\/receipts\/[a-zA-Z0-9_-]+\/raw$/)
    const raw=await fetch(inbox+candidate.rawUrl,{headers,signal:AbortSignal.timeout(10000)});assert.equal(raw.status,200)
    const bytes=new Uint8Array(await raw.arrayBuffer()),parsed=await normalizeInbound({provider:'cloudflare',message:{headers:new Headers(),from:candidate.from,to:recipient,rawSize:bytes.length,raw:new Blob([bytes]).stream()}},{maxRawBytes:1048576,maxBodyBytes:262144,maxAttachments:10,maxAttachmentBytes:1048576,maxTotalAttachmentBytes:1048576})
    if(parsed.text.includes('/api/report-deliveries/'+attempt.id+'.csv')){receipt=candidate;mail=parsed;break}
   }
   if(!receipt)await new Promise(resolve=>setTimeout(resolve,5000))
  }
  assert.ok(receipt,'The exact scheduled report must reach the controlled inbox');assert.equal(receipt.auth?.dmarc,'pass');assert.equal(receipt.auth?.trusted,'authentication-results')
  const link=new URL(mail.text.match(/https:\/\/[^\s]+\/api\/report-deliveries\/[^\s]+\.csv/)[0]);assert.equal(link.search,'');assert.equal(link.hash,'')
  assert.ok(!mail.text.includes('Alex Rowan')&&!mail.text.includes(booking.id))
  const response=await h.request(link.pathname);assert.equal(response.status,200);assert.ok((await response.text()).includes(booking.id))
  await h.api(link.pathname,undefined,{as:'',status:401})
  await h.api('/api/report-schedules/stop',{scheduleId:schedule.id});await h.api(link.pathname,undefined,{status:403})
  console.log(JSON.stringify({kind,providerMessageId:accepted.get(subject),receiptId:receipt.id,receivedAt:receipt.receivedAt,authentication:'DMARC pass',authenticatedCsv:true,stoppedLinkDenied:true}))
 }
 await tick(firstDue);await tick('2031-11-10T18:00:00.000Z');assert.equal(accepted.size,3)
 console.log(JSON.stringify({providerSubmissions:3,replaySuppressed:true,stoppedSchedulesSuppressed:true}))
}finally{await h.close()}
