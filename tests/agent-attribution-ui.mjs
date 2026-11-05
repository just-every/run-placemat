// Real MCP preparation, native person decisions, activity, downloads and inert restore.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation} from './api/harness.mjs'
import {allocationService} from './api/allocation-fixture.mjs'
import {csvRecords} from './api/business-fixture.mjs'
import {browserServer} from './browser-server.mjs'

const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
const h=await installation()
let restored
try{
 const {service,reservation}=await allocationService(h)
 await h.command('waitlist.add',{serviceId:service.id,name:'Late four',email:['synthetic-placemat-3','example.invalid'].join('@'),partySize:4,preferredAt:new Date(Date.parse(service.endAt)-30*60000).toISOString(),preferredArea:'Dining room',requiredAccessTags:['step-free'],contactConsent:false})
 const owner=(await h.api('/api/state')).actor
 const decidingCookie=await h.signIn(['synthetic-placemat-4','example.invalid'].join('@'),'admin','Casey Reviewer')
 const decidingPerson=(await h.api('/api/state',undefined,{as:decidingCookie})).actor
 assert.notEqual(decidingPerson.id,owner.id)
 const agentName='Cedar <img src=x onerror="window.attributionInjected=true"> & team'
 const key=(await h.api('/api/agent-keys',{name:agentName})).result
 const label=`${agentName} for ${owner.name}`
 const document={schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'native-preparation',class:'*',do:'autonomous'}],spend:{none:true}}
 await h.api('/agents/api/policy',{document},{method:'PUT'})
 const mcp=async(name,args)=>{
  const response=await h.request('/mcp',{method:'POST',as:'',headers:{authorization:`Bearer ${key.key}`,'mcp-protocol-version':'2025-11-25'},body:{jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name,arguments:args}}})
  assert.equal(response.status,200)
  return response.json()
 }
 const prepare=async(kind,plan)=>{
  const before=await h.api('/api/state'),messages=h.messages.length
  const answer=await mcp('placemat.plans.prepare',{kind,plan,reason:'Coordinator prepares an exact alternative for separate person review',expected_revision:before.version,idempotency_key:randomUUID()})
  assert.equal(answer.result?.isError,false,JSON.stringify(answer.result?._meta))
  const proposal=answer.result.structuredContent.data,after=await h.api('/api/state')
  assert.deepEqual(operations(after.state),operations(before.state),'Preparation changes no operational record')
  assert.deepEqual(after.guests,before.guests)
  assert.equal(h.messages.length,messages,'Preparation sends no message')
  assert.equal(after.state.proposals.length,before.state.proposals.length+1)
  assert.equal(proposal.status,'pending');assert.equal(proposal.preparedBy,owner.id)
  assert.equal(proposal.preparation.label,label);assert.equal(proposal.preparation.agent.id,key.id)
  assert.equal(proposal.preparation.for.id,owner.id)
  return proposal
 }
 const all=[]
 await withPage(h,h.cookie,async(page,context)=>{
  await page.goto(h.originForBrowser+'/setup')
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()
  await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
  await context.clearCookies();await addCookies(context,h.originForBrowser,decidingCookie)
  for(const kind of ['allocation.improve','inventory.protect','service.adjust']){
   const advice=await h.api('/api/allocation-advice?'+new URLSearchParams({serviceId:service.id}))
   const alternatives=kind==='allocation.improve'?advice.alternatives:kind==='inventory.protect'?advice.inventory.alternatives:advice.shifts.alternatives
   assert.ok(alternatives.length,`Real recorded demand offers ${kind}`)
   const plan={serviceId:service.id,alternativeId:alternatives[0].id}
   const pending=await prepare(kind,plan),declined=await prepare(kind,plan),approved=await prepare(kind,plan)
   all.push(pending,declined,approved)
   await page.goto(h.originForBrowser+'/app');await page.getByRole('link',{name:'Approvals & reminders',exact:true}).click()
   const root=page.locator('#allocation-content'),card=id=>root.locator(`[data-allocation-proposal="${id}"]`)
   for(const proposal of [pending,declined,approved])await card(proposal.id).getByRole('heading',{name:'Allocation pending',exact:true}).waitFor()
   for(const proposal of [pending,declined,approved])await assertCard(card(proposal.id),proposal)
   await capture(page,kind+'-pending',card(pending.id))
   const decide=async(proposal,decision)=>{
    const before=await h.api('/api/state')
    // The existing key cannot stand in for the person's signed-in decision.
    await h.api('/api/commands',{command:`proposal.${decision}`,payload:{proposalId:proposal.id}},{as:'',headers:{authorization:`Bearer ${key.key}`},status:403})
    assert.deepEqual((await h.api('/api/state')).state,before.state)
    const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.command===`proposal.${decision}`)
    await card(proposal.id).getByRole('button',{name:decision==='approve'?'Approve allocation':'Decline allocation',exact:true}).click()
    const result=await response;assert.equal(result.status(),200,await result.text())
    const decided=(await result.json()).result
    assert.equal(decided.status,decision==='approve'?'approved':'declined')
    assert.equal(decided.approvedBy,decidingPerson.id);assert.equal(decided.preparation.label,label)
    await card(proposal.id).getByRole('heading',{name:`Allocation ${decided.status}`,exact:true}).waitFor()
    await card(proposal.id).locator('p.help').filter({hasText:`${decided.status==='declined'?'Declined':'Approved'} by Casey Reviewer`}).waitFor()
    await page.waitForFunction(()=>document.querySelector('#allocation-content')?.getAttribute('aria-busy')==='false')
    await assertCard(card(proposal.id),decided)
    if(decision==='decline')assert.deepEqual(operations((await h.api('/api/state')).state),operations(before.state))
    await capture(page,kind+'-'+decided.status,card(proposal.id))
    return decided
   }
   const refused=await decide(declined,'decline'),accepted=await decide(approved,'approve')
   Object.assign(declined,refused);Object.assign(approved,accepted)
   const current=(await h.api('/api/state')).state
   if(kind==='allocation.improve')assert.deepEqual(current.bookings.find(b=>b.id===reservation.id).tableIds,approved.plan.preview.affectedBookings.find(b=>b.bookingId===reservation.id).after.tableIds)
   if(kind==='inventory.protect')assert.deepEqual(current.services.find(s=>s.id===service.id).directInventory.at(-1),approved.plan.protection)
   if(kind==='service.adjust')assert.equal(current.services.find(s=>s.id===service.id).endAt,approved.plan.endAt)
   await checkActivity(page,h,all.filter(p=>p.kind===kind))
   console.log(`PROBE BASE-AGENT-008 ${kind}: MCP prepares without operational changes; signed-in reviewer approves or declines; pending, approved and declined cards retain escaped agent attribution`)
  }
 })
 const snapshot=(await h.api('/api/state')).state
 const exports=await downloads(h,all,key.key)
 const archive=await h.api('/api/backup')
 assert.ok(!JSON.stringify(archive).includes(key.key),'Backup excludes the preparation credential')
 restored=await installation();await restored.api('/api/restore',{archive,confirm:'RESTORE'})
 const copy=(await restored.api('/api/state')).state
 for(const proposal of all)assert.deepEqual(copy.proposals.find(p=>p.id===proposal.id),snapshot.proposals.find(p=>p.id===proposal.id))
 assert.deepEqual(await downloads(restored,all,key.key),exports)
 await withPage(restored,restored.cookie,async page=>{
  await page.goto(restored.originForBrowser+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()
  await page.getByRole('link',{name:'Approvals & reminders',exact:true}).click()
  const root=page.locator('#allocation-content')
  for(const proposal of all){
   const card=root.locator(`[data-allocation-proposal="${proposal.id}"]`)
   await card.waitFor();assert.ok((await card.innerText()).includes(`Prepared by ${label}`))
   assert.equal(copy.proposals.find(p=>p.id===proposal.id).approvedBy,proposal.approvedBy,'Restored decision keeps the original person identifier')
  }
  await capture(page,'restored',root)
 })
 await h.request('/api/agent-keys/'+key.id,{method:'DELETE'})
 const version=(await h.api('/api/state')).version
 const revoked=await h.request('/mcp',{method:'POST',as:'',headers:{authorization:`Bearer ${key.key}`,'mcp-protocol-version':'2025-11-25'},body:{jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name:'placemat.workspace.revision',arguments:{}}}})
 assert.equal(revoked.status,401);assert.equal((await h.api('/api/state')).version,version)
 console.log('PROBE BASE-AGENT-008 exports and restore: owner CSVs and empty-destination backup retain all nine attributed proposals, native preparation and person decisions; credential is absent and revoked key refuses')

 function operations(state){return Object.fromEntries(Object.entries(state).filter(([key])=>!['proposals','audit'].includes(key)))}
 async function assertCard(card,proposal){
  const text=await card.innerText()
  assert.ok(text.includes(`Prepared by ${label}`))
  assert.equal(await card.locator('img').count(),0,'Stored agent text never becomes markup')
  if(proposal.approvedBy)assert.ok(text.includes(`${proposal.status==='declined'?'Declined':'Approved'} by Casey Reviewer`))
  else assert.ok(!text.includes('Approved by')&&!text.includes('Declined by'))
 }
 async function checkActivity(page,installation,proposals){
  await page.getByRole('link',{name:'Settings',exact:true}).click()
  const root=page.locator('#audit-content')
  if(!await root.locator('details').first().evaluate(el=>el.open))await root.getByText('Change history',{exact:true}).click()
  const rows=(await installation.api('/api/audit')).rows
  for(const proposal of proposals){
   const preparation=rows.find(row=>row.action==='proposal.prepare'&&row.subject===proposal.id)
   assert.equal(preparation.preparation.label,label)
   const entry=root.locator(`[data-audit-entry="${preparation.id}"]`);await entry.waitFor()
   assert.ok((await entry.innerText()).includes(label));assert.equal(await entry.locator('img').count(),0)
   if(proposal.approvedBy){
    const decision=rows.find(row=>row.subject===proposal.id&&row.action===`proposal.${proposal.status==='approved'?'approve':'decline'}`)
    assert.equal(decision.actor,decidingPerson.id);assert.equal(decision.preparation,undefined)
    const personEntry=root.locator(`[data-audit-entry="${decision.id}"]`);await personEntry.waitFor()
    assert.ok((await personEntry.innerText()).includes('Casey Reviewer'))
   }
  }
  await capture(page,proposals[0].kind+'-activity',root)
 }
}finally{if(restored)await restored.close();await h.close();await browser.close()}

async function addCookies(context,origin,cookie){
 await context.addCookies(cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:origin,secure:true,sameSite:'Lax'}}))
}
async function withPage(h,cookie,run){
 const transport=await browserServer(h),context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true}),errors=[]
 h.originForBrowser=transport.origin
 try{
  await addCookies(context,transport.origin,cookie)
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
  await run(page,context);assert.deepEqual(errors,[])
 }finally{await context.close();await transport.close()}
}
async function capture(page,name,root){
 // Assertions run at desktop width. The same real screens are captured once at each required proof width.
 if(!shots)return
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await root.screenshot({path:resolve(shots,`BASE-AGENT-008-${name}-${width}.png`)})
 }
 await page.setViewportSize({width:1440,height:1000})
}
async function downloads(h,proposals,credential){
 const result={}
 for(const path of ['/api/audit.csv','/api/business-export/proposals.csv']){
  const response=await h.request(path);assert.equal(response.status,200)
  const text=await response.text();assert.ok(!text.includes(credential))
  const rows=csvRecords(text)
  for(const proposal of proposals){
   const row=rows.find(row=>path==='/api/audit.csv'?row.action==='proposal.prepare'&&row.subject===proposal.id:row.id===proposal.id)
   assert.ok(row,`Export includes proposal ${proposal.id}`)
   const data=JSON.parse(row.data_json)
   assert.equal(data.preparation.label,proposal.preparation.label)
   assert.equal(data.preparation.agent.id,proposal.preparation.agent.id)
   assert.equal(data.preparation.for.id,proposal.preparation.for.id)
   if(path.endsWith('proposals.csv')){assert.equal(data.approvedBy,proposal.approvedBy);assert.equal(data.status,proposal.status)}
   else if(proposal.approvedBy){
    const decision=rows.find(row=>row.subject===proposal.id&&row.action===`proposal.${proposal.status==='approved'?'approve':'decline'}`)
    assert.equal(decision.actor,proposal.approvedBy);assert.equal(JSON.parse(decision.data_json).preparation,undefined)
   }
  }
  result[path]=text
 }
 return result
}
