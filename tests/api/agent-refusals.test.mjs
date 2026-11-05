import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {installation} from './harness.mjs'

test('Native publication refusals share UI and MCP codes, preserve records and audit the agent door',async()=>{
 let now=Date.parse('2030-01-02T12:00:00Z')
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now})
 try{
  await h.command('table.save',{label:'synthetic-placemat-1',seats:4,x:25,y:40})
  const draft=await h.command('service.save',{name:'synthetic-placemat-2',startAt:'2030-01-05T18:00:00Z',endAt:'2030-01-05T22:00:00Z',turnMinutes:60,coverLimit:24})
  const published=await h.command('service.save',{name:'synthetic-placemat-3',startAt:'2030-01-06T18:00:00Z',endAt:'2030-01-06T22:00:00Z',turnMinutes:60,coverLimit:24})
  const preparation=serviceId=>({kind:'service.publish',plan:{serviceId},reason:'Prepare the exact service for person review'})
  const plan=await h.command('proposal.prepare',preparation(published.id))
  await h.command('proposal.approve',{proposalId:plan.id})
  const credential=(await h.api('/api/agent-keys',{name:'synthetic-placemat-4'})).result
  await h.api('/agents/api/policy',{document:{schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'native-preparation',class:'*',do:'autonomous'}],spend:{none:true}}},{method:'PUT'})
  const before=await h.api('/api/state'),outbound=h.messages.length
  assert.equal(before.state.services.find(row=>row.id===published.id).status,'published')
  assert.equal(before.state.services.find(row=>row.id===draft.id).status,'draft')
  const call=async(args,key)=>{
   const response=await h.request('/mcp',{method:'POST',as:'',headers:{authorization:`Bearer ${credential.key}`,'mcp-protocol-version':'2026-07-28','mcp-method':'tools/call','mcp-name':'placemat.plans.prepare'},body:{jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name:'placemat.plans.prepare',arguments:{...args,idempotency_key:key,expected_revision:before.version},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}}})
   assert.equal(response.status,200)
   return (await response.json()).result
  }
  let audit=(await h.api('/agents/api/audit')).rows
  for(const [serviceId,status,expectedCode,message] of [
   ['synthetic-placemat-missing',404,'resource_unavailable','Service not found.'],
   [published.id,409,'native_conflict','Create tables and a draft service first.'],
  ]){
   const args=preparation(serviceId)
   const ui=await h.api('/api/commands',{command:'proposal.prepare',payload:args},{status})
   assert.equal(ui.error,message,'The person still gets the readable native refusal')
   assert.equal(ui.code,expectedCode)
   assert.deepEqual((await h.api('/agents/api/audit')).rows,audit,'Person refusals do not create agent audit entries')
   const key=randomUUID(),answer=await call(args,key)
   assert.equal(answer.isError,true)
   assert.equal(answer._meta['com.runeditrun/error'].code,ui.code)
   assert.equal(answer.structuredContent,undefined)
   assert.deepEqual(answer.content,[{type:'text',text:JSON.stringify({code:expectedCode})}],'Refusals contain only the typed error, never native result data')
   const rows=(await h.api('/agents/api/audit')).rows
   assert.equal(rows.length,audit.length+1,'Each authenticated refusal has its own door audit')
   assert.deepEqual(rows.slice(0,-1),audit)
   const row=rows.at(-1)
   assert.equal(row.idempotency_key,key)
   assert.equal(row.agent.id,credential.id)
   assert.equal(row.sponsor.id,before.actor.id)
   assert.equal(row.door,'mcp')
   assert.equal(row.tool,'placemat.plans.prepare')
   assert.equal(row.outcome,'refused')
   assert.equal(row.code,expectedCode)
   assert.deepEqual(await h.api('/api/state'),before,'Refusals change no proposals, services, native audit or version')
   assert.equal(h.messages.length,outbound)
   assert.equal(h.analytics.length,0)
   audit=rows
   console.log(`PROBE BASE-AGENT-002 point4 ${status}: person proposal.prepare and MCP on the same service -> ${expectedCode}, typed refusal, separate door audit, native state unchanged`)
  }
  now+=1000
  const key=randomUUID(),answer=await call(preparation(draft.id),key)
  assert.equal(answer.isError,false)
  const after=await h.api('/api/state'),proposal=after.state.proposals.find(row=>row.id===answer.structuredContent.data.id)
  assert.equal(proposal.kind,'service.publish')
  assert.equal(proposal.plan.serviceId,draft.id)
  assert.equal(proposal.status,'pending')
  assert.equal(proposal.preparation.agent.id,credential.id)
  assert.deepEqual(after.state.proposals.filter(row=>row.id!==proposal.id),before.state.proposals)
  assert.deepEqual(after.state.services,before.state.services,'Agent preparation cannot publish the draft')
  assert.deepEqual(after.state.audit.slice(0,-1),before.state.audit)
  assert.equal(after.state.audit.at(-1).action,'proposal.prepare')
  assert.equal(after.state.audit.at(-1).subject,proposal.id)
  const rows=(await h.api('/agents/api/audit')).rows
  assert.equal(rows.length,audit.length+1)
  assert.equal(rows.at(-1).idempotency_key,key)
  assert.equal(rows.at(-1).outcome,'done')
  assert.equal(rows.at(-1).code,null)
  assert.equal(h.messages.length,outbound)
  assert.equal(h.analytics.length,0)
  console.log('PROBE BASE-AGENT-002 point4 contrast: MCP prepares the real draft -> one pending native proposal and preparation audit; services unchanged and no outbound effect')
 }finally{await h.close()}
})
