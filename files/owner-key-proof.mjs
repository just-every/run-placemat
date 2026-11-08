import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const {installation}=await import(pathToFileURL(resolve('tests/api/harness.mjs')))
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()

const outcomes=[]
const cookies=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
const ownerAddress=['owner','example.test'].join('@')
const adminAddress=['synthetic-placemat-2','example.test'].join('@')
for(const mode of ['autonomous','held'])for(const change of ['downgrade','suspend']){
 let now=Date.parse('2030-11-08T12:00:00Z')
 const attempts=[],mail=[],mailAttempts=[]
 const edge=async request=>{attempts.push(new URL(request.url).hostname);throw Error('Unexpected outbound effect')}
 const mailEdge=async request=>{mailAttempts.push(new URL(request.url).hostname);assert.equal(new URL(request.url).hostname,'api.resend.com');mail.push(await request.json());return Response.json({id:randomUUID()})}
 const h=await installation({mailEdge,entry:'tests/api/clock-worker.mjs',clock:()=>now,stripeEdge:edge,accountingEdge:edge})
 try{
  const headers={'CF-Connecting-IP':'192.0.2.56'}
  const request=(path,options={})=>h.request(path,{...options,headers:{...headers,...options.headers}})
  const api=async(path,body,as,status=200,method=body===undefined?'GET':'POST')=>{
   const response=await request(path,{as,method,...(body===undefined?{}:{body})})
   assert.equal(response.status,status,'Unexpected public-door status at '+path+': '+await response.clone().text())
   return response.json()
  }
  const confirm=async(as='')=>{
   const message=mail.at(-1)
   const href=message?.text?.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0]
   assert.ok(href,'Real auth mail must carry the confirmation link')
   const link=new URL(href)
   assert.equal(link.origin,h.origin)
   const response=await request('/auth/confirm',{method:'POST',as,body:{token:link.searchParams.get('token')}})
   assert.equal(response.status,303)
   return cookies(response)||as
  }
  // The bootstrap session is not treated as fresh personal identity proof.
  await api('/auth/magic-link',{email:ownerAddress,returnTo:'/app'},'',202)
  const owner=await confirm()
  const ownerSession=await api('/auth/session',undefined,owner)
  const sponsor=ownerSession.operator
  assert.equal(sponsor.role,'owner')
  assert.equal(sponsor.status,'active')
  for(const [path,payload] of [
   ['/auth/operator/role',{operatorId:sponsor.id,role:'admin'}],
   ['/auth/operator/status',{operatorId:sponsor.id,status:'inactive'}],
  ]){
   assert.equal((await api(path,payload,owner,409)).error,'last_owner')
   assert.equal((await api('/auth/session',undefined,owner)).operator.role,'owner')
  }
  await api('/auth/invite',{email:adminAddress,displayName:'synthetic-placemat-2',role:'owner',returnTo:'/app'},owner,202)
  const admin=await confirm()
  const adminSession=await api('/auth/session',undefined,admin)
  assert.equal(adminSession.operator.role,'owner')
  assert.equal(adminSession.operator.status,'active')
  assert.notEqual(adminSession.operator.id,sponsor.id)
  // All domain creation belongs to the issuing owner; the second owner only administers.
  const command=async(command,payload,as=owner)=>(await api('/api/commands',{command,payload},as)).result
  await command('table.save',{label:'synthetic-placemat-3',seats:4,x:25,y:40})
  const draft=await command('service.save',{name:'synthetic-placemat-4',startAt:'2030-11-09T18:00:00Z',endAt:'2030-11-09T22:00:00Z',turnMinutes:60,coverLimit:24})
  const credential=(await api('/api/agent-keys',{name:'synthetic-placemat-5'},owner,201)).result
  const keyRows=()=>h.db.prepare('SELECT id,created_by,revoked_at FROM pm_agent_keys ORDER BY id').all().then(value=>value.results)
  assert.deepEqual(await keyRows(),[{id:credential.id,created_by:sponsor.id,revoked_at:null}])
  const document={schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:mode==='autonomous'?[{id:'all',class:'*',do:'autonomous'}]:[{id:'all',class:'*',do:'approval',approver:['sponsor'],wait:'PT1H'},{id:'standard',class:'standard',do:'review'}],...(mode==='held'?{reviewers:['sponsor']}:{}),spend:{none:true}}
  await api('/agents/api/policy',{document},owner,200,'PUT')
  assert.deepEqual((await api('/agents/api/policy',undefined,owner)).document,document)
  const bearer={authorization:'Bearer '+credential.key}
  const mcpBody=(name,args={})=>({jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name,arguments:args}})
  const revisionRequest=mcpBody('placemat.workspace.revision')
  const mcp=async body=>{
   const response=await request('/mcp',{method:'POST',as:'',headers:{...bearer,'mcp-protocol-version':'2025-11-25'},body})
   return {status:response.status,challenge:response.headers.get('www-authenticate'),body:await response.json()}
  }
  const sentBefore=mailAttempts.length
  const before=await api('/api/state',undefined,owner)
  const revision=await mcp(revisionRequest)
  assert.equal(revision.status,200)
  assert.equal(revision.body.result.isError,false)
  assert.deepEqual(revision.body.result.structuredContent.data,{version:before.version})
  assert.equal(revision.body.result._meta['com.runeditrun/decision'].disposition,mode==='held'?'review':'autonomous')
  assert.deepEqual(await api('/api/state',undefined,owner),before)
  const payload={kind:'service.publish',plan:{serviceId:draft.id},reason:'Prepare the real draft for person review'}
  const preparationRequest=mcpBody('placemat.plans.prepare',{...payload,idempotency_key:randomUUID(),expected_revision:before.version})
  const prepared=await mcp(preparationRequest)
  assert.equal(prepared.status,200)
  assert.equal(prepared.body.result.isError,false)
  assert.equal(prepared.body.result._meta['com.runeditrun/decision'].disposition,mode==='held'?'review':'autonomous')
  const proposal=prepared.body.result.structuredContent.data
  const afterMcp=await api('/api/state',undefined,owner)
  assert.equal(proposal.status,'pending')
  assert.equal(proposal.plan.serviceId,draft.id)
  assert.equal(proposal.preparation.agent.id,credential.id)
  assert.equal(afterMcp.state.proposals.length,before.state.proposals.length+1)
  assert.deepEqual(afterMcp.state.services,before.state.services)
  assert.deepEqual(afterMcp.state.proposals.find(row=>row.id===proposal.id),proposal)
  const replay=await mcp({...preparationRequest,id:randomUUID()})
  assert.equal(replay.status,200)
  assert.deepEqual(replay.body.result.structuredContent.data,proposal)
  assert.deepEqual(await api('/api/state',undefined,owner),afterMcp)
  const nativeBody={command:'proposal.prepare',payload}
  const nativeResponse=await request('/api/commands',{method:'POST',as:'',headers:bearer,body:nativeBody})
  assert.equal(nativeResponse.status,200)
  const nativePrepared=(await nativeResponse.json()).result
  assert.equal(nativePrepared.status,'pending')
  assert.equal(nativePrepared.plan.serviceId,draft.id)
  const afterNative=await api('/api/state',undefined,owner)
  assert.equal(afterNative.state.proposals.length,afterMcp.state.proposals.length+1)
  assert.deepEqual(afterNative.state.services,before.state.services)
  assert.equal(mailAttempts.length,sentBefore)
  assert.deepEqual(attempts,[])
  assert.deepEqual(h.analytics,[])
  console.log('PROBE BASE-AGENT-005 point 3 '+mode+' '+change+': real owner-issued key reads revision, prepares and replays through MCP, and prepares through native command; only pending proposals, no service publication')
  // Expire email-proof freshness while leaving native sessions valid.
  now+=11*60000
  const path=change==='downgrade'?'/auth/operator/role':'/auth/operator/status'
  const adminPayload=change==='downgrade'?{operatorId:sponsor.id,role:'admin'}:{operatorId:sponsor.id,status:'inactive'}
  assert.equal((await api(path,adminPayload,admin,403)).error,'step_up_required')
  await api('/auth/step-up',{action:'owner:transfer',returnTo:'/app'},admin,202)
  await confirm(admin)
  const changed=await api(path,adminPayload,admin)
  assert.equal(changed.id,sponsor.id)
  assert.equal(changed.role,change==='downgrade'?'admin':'owner')
  assert.equal(changed.status,change==='suspend'?'inactive':'active')
  assert.equal((await api('/auth/session',undefined,admin)).operator.role,'owner')
  // Snapshot after administration, so identity audit writes cannot masquerade as a key effect.
  const baseline=await api('/api/state',undefined,admin)
  const keys=await keyRows()
  assert.deepEqual(keys,[{id:credential.id,created_by:sponsor.id,revoked_at:null}])
  const nativeAudit=await api('/api/audit',undefined,admin)
  const doorAudit=await api('/agents/api/audit',undefined,admin)
  const approvals=await api('/agents/api/approvals',undefined,admin)
  const reviews=await api('/agents/api/reviews',undefined,admin)
  const outbound={mail:mailAttempts.length,analytics:h.analytics.length,attempts:attempts.length}
  const assertUnchanged=async()=>{
   assert.deepEqual(await api('/api/state',undefined,admin),baseline)
   assert.deepEqual(await keyRows(),keys,'The very same key stays unrevoked')
   assert.deepEqual(await api('/api/audit',undefined,admin),nativeAudit)
   assert.deepEqual(await api('/agents/api/audit',undefined,admin),doorAudit)
   assert.deepEqual(await api('/agents/api/approvals',undefined,admin),approvals)
   assert.deepEqual(await api('/agents/api/reviews',undefined,admin),reviews)
   assert.deepEqual({mail:mailAttempts.length,analytics:h.analytics.length,attempts:attempts.length},outbound)
  }
  const refusals=[]
  for(const [kind,body] of [
   ['revision-exact',revisionRequest],
   ['revision-fresh',mcpBody('placemat.workspace.revision')],
   ['preparation-exact',preparationRequest],
   ['preparation-new-rpc-id',{...preparationRequest,id:randomUUID()}],
   ['preparation-fresh',mcpBody('placemat.plans.prepare',{...payload,idempotency_key:randomUUID(),expected_revision:baseline.version})],
  ]){
   const denied=await mcp(body)
   assert.equal(denied.status,401,kind)
   assert.equal(denied.body.result,undefined)
   assert.equal(denied.body.error.code,-32001)
   assert.equal(denied.body.error.message,'Unauthorized')
   assert.ok(denied.challenge?.includes('resource_metadata'))
   for(const value of [draft.id,draft.name,proposal.id,payload.reason,credential.key])assert.ok(!JSON.stringify(denied.body).includes(value))
   await assertUnchanged()
   refusals.push({door:'mcp',call:kind,status:401,code:denied.body.error.code})
  }
  for(const [kind,body] of [
   ['native-exact',nativeBody],
   ['native-fresh',{command:'proposal.prepare',payload:{...payload,reason:'Fresh preparation after changed owner authority'}}],
  ]){
   const response=await request('/api/commands',{method:'POST',as:'',headers:bearer,body})
   const denied=await response.json()
   assert.equal(response.status,401)
   assert.equal(denied.result,undefined)
   for(const value of [draft.id,draft.name,proposal.id,payload.reason,credential.key])assert.ok(!JSON.stringify(denied).includes(value))
   await assertUnchanged()
   refusals.push({door:'native commands',call:kind,status:401})
  }
  assert.equal(keys.some(row=>row.created_by===adminSession.operator.id),false,'Administrative owner has no agent credential')
  assert.deepEqual(baseline.state.services,before.state.services)
  assert.equal(baseline.state.proposals.length,2)
  assert.ok(baseline.state.proposals.every(row=>row.status==='pending'))
  outcomes.push({mode,change,lastOwnerGuard:true,freshIdentityProof:true,issuingKeyUnrevoked:true,administrativeOwnerAgentKeys:0,allowed:{revision:true,mcpPreparation:true,mcpReplay:true,nativePreparation:true,pendingProposals:2,publishedServices:0},refusals,unchanged:{nativeState:true,nativeAudit:true,doorAudit:true,approvals:true,reviews:true,keyWitness:true,outbound:true}})
  console.log('PROBE BASE-AGENT-005 point 3 '+mode+' '+change+': fresh-proof personal owner changes issuing owner; five MCP and two native fresh or exact retries return 401 with no private result; key unrevoked; post-administration state and outbound baseline unchanged')
 }finally{await h.close()}
}
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),head)
await writeFile(new URL('./proof-receipt.json',import.meta.url),JSON.stringify({schema:1,head,branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),clause:'BASE-AGENT-005',point:3,status:'passed',cases:outcomes},null,2)+'\n')
