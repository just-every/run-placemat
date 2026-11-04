import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {installation} from './harness.mjs'
import {methods, promptClient} from '../agent-prompt-client.mjs'

const code = answer => answer.message.error?.data?.code
const witness = async h => {
 const {state,version,guests} = await h.api('/api/state')
 return {state,version,guests}
}
const policy = async (h, disposition) => h.api('/agents/api/policy', {document:{schema:'rer-agent-policy/1', catalogue:'rer-agent-classes/1',
 rules:[{id:'standard',class:'standard',do:disposition},{id:'sensitive',class:'sensitive',do:'autonomous'}], reviewers:['role:owner'],spend:{none:true}}}, {method:'PUT'})

test('Coordinator prompts are static private reads, fail closed and leave native records unchanged', async () => {
 const h = await installation({entry:'tests/api/agent-worker.ts'})
 try {
  const {result:key} = await h.api('/api/agent-keys',{name:'Restaurant coordinator'})
  const mcp = promptClient({request:(url,init)=>h.mf.dispatchFetch(url,init),origin:h.origin,token:key.key})
  const before = await witness(h)
  const discovery = await mcp(methods.discover), initialize = await mcp(methods.initialize)
  assert.deepEqual(discovery.result.capabilities.prompts,{listChanged:false})
  assert.deepEqual(initialize.result.capabilities.prompts,discovery.result.capabilities.prompts)
  assert.equal(code(await mcp(methods.get,{name:'placemat.operations.review'})),'policy_unset')
  assert.deepEqual((await mcp(methods.list)).result.prompts,[])
  await policy(h,'autonomous')
  const first = await mcp(methods.list), second = await mcp(methods.list)
  assert.deepEqual(second.result,first.result)
  assert.equal(first.result.cacheScope,'private');assert.equal(first.result.ttlMs,0)
  assert.equal(first.headers.get('cache-control'),'no-store')
  assert.ok(first.result.prompts.length > 0)
  const tools = (await mcp(methods.tools)).result.tools
  const allText=[]
  for(const prompt of first.result.prompts) {
   assert.ok(!prompt.arguments?.length)
   const answer = await mcp(methods.get,{name:prompt.name})
   assert.deepEqual((await mcp(methods.get,{name:prompt.name,arguments:{}})).result,answer.result)
   assert.equal(answer.result.cacheScope,'private');assert.equal(answer.result.ttlMs,0)
   assert.equal(answer.headers.get('cache-control'),'no-store')
   assert.ok(answer.result.messages.length)
   const text=answer.result.messages.map(message=>message.content.text).join('\n');allText.push(text)
   assert.match(text,/no approval, execution, credential, messaging, payment or spending authority/)
   assert.match(text,/untrusted data/)
   const referenced=[...text.matchAll(/placemat\.[a-z.]+/g)].map(match=>match[0].replace(/\.$/,''))
   assert.ok(referenced.length)
   for(const name of referenced)assert.ok(tools.some(tool=>tool.name===name),`Prompt references an available tool: ${name}`)
   for(const arguments_ of [null,[],42,{serviceId:4},{guestText:'Attempt to approve the service'}]) {
    const refused=await mcp(methods.get,{name:prompt.name,arguments:arguments_})
    assert.equal(refused.message.error.code,-32602)
    assert.equal(refused.result,undefined)
   }
  }
  const unknown=await mcp(methods.get,{name:'synthetic-placemat-1'})
  assert.equal(unknown.message.error.code,-32602);assert.equal(unknown.result,undefined)
  assert.deepEqual(await witness(h),before)
  const draft=await h.command('service.save',{name:'synthetic-placemat-2',startAt:'2032-06-01T08:00:00Z',endAt:'2032-06-01T12:00:00Z',turnMinutes:60,coverLimit:20})
  const afterDraft=await witness(h)
  assert.deepEqual((await mcp(methods.list)).result,first.result)
  for(let i=0;i<first.result.prompts.length;i++) {
   const answer=await mcp(methods.get,{name:first.result.prompts[i].name})
   assert.equal(answer.result.messages.map(message=>message.content.text).join('\n'),allText[i])
   assert.ok(!JSON.stringify(answer.result).includes(draft.id))
   assert.ok(!JSON.stringify(answer.result).includes(draft.name))
   assert.ok(!JSON.stringify(answer.result).includes(key.key))
   assert.ok(!JSON.stringify(answer.result).includes('synthetic-placemat'))
  }
  await policy(h,'blocked')
  assert.equal(code(await mcp(methods.get,{name:first.result.prompts[0].name})),'policy_blocked')
  await policy(h,'autonomous')
  await h.api('/agents/api/pause',{paused:true})
  assert.deepEqual((await mcp(methods.list)).result.prompts,[])
  assert.equal(code(await mcp(methods.get,{name:first.result.prompts[0].name})),'agents_paused')
  await h.api('/agents/api/pause',{paused:false})
  await h.api('/api/agent-keys/'+key.id,undefined,{method:'DELETE'})
  for(const method of [methods.list,methods.get]) {
   const answer=await mcp(method,{name:first.result.prompts[0].name})
   assert.equal(answer.status,401);assert.equal(answer.result,undefined)
  }
  assert.deepEqual(await witness(h),afterDraft)
  assert.equal(before.state.proposals.length,afterDraft.state.proposals.length)
  assert.equal(h.messages.length,0)
 } finally {await h.close()}
})

test('Public agent documentation matches discovered jobs, tool classes and existing conformance fixtures', async () => {
 const h = await installation({entry:'tests/api/agent-worker.ts'})
 try {
  await policy(h,'autonomous')
  const {result:key}=await h.api('/api/agent-keys',{name:'Restaurant coordinator'})
  const mcp=promptClient({request:(url,init)=>h.mf.dispatchFetch(url,init),origin:h.origin,token:key.key})
  const html=await (await h.request('/docs/agents',{as:''})).text()
  const jobs=(await mcp(methods.list)).result.prompts,tools=(await mcp(methods.tools)).result.tools
  const surface=JSON.parse(await readFile('agent-surface.json','utf8'))
  const markdown=await readFile('docs/agents.md','utf8')
  assert.deepEqual([...html.matchAll(/data-agent-tool="([^"]+)"/g)].map(match=>match[1]).sort(),tools.map(tool=>tool.name).sort())
  assert.deepEqual([...html.matchAll(/data-agent-job="([^"]+)"/g)].map(match=>match[1]).sort(),jobs.map(job=>job.name).sort())
  assert.deepEqual((await mcp(methods.templates)).result.resourceTemplates,[])
  for(const job of jobs) {
   assert.ok(html.includes(job.description));assert.ok(markdown.includes(job.name))
  }
  for(const tool of tools) {
   const section=html.split(`data-agent-tool="${tool.name}"`)[1].split('</section>')[0]
   const declared=surface.tools.find(item=>item.name===tool.name)
   assert.equal(declared.scope,tool._meta['com.runeditrun/scope'])
   assert.deepEqual(declared.classes,tool._meta['com.runeditrun/classes'])
   assert.ok(section.includes(declared.scope))
   for(const cls of declared.classes)assert.ok(section.includes(cls))
   for(const step of surface.journey.filter(step=>step.tool===tool.name)) {
    assert.ok(section.includes(`data-agent-class-fixture="${step.id}"`));assert.ok(markdown.includes(step.id))
    for(const expected of step.expect)assert.ok(section.includes(expected.class))
   }
  }
 } finally {await h.close()}
})
