import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {installation} from './harness.mjs'

test('Agent rate overruns isolate credentials, preserve native work and recover exactly at the minute boundary under both policies',async()=>{
 let now=Date.parse('2030-11-05T12:00:17.250Z')
 const outbound=[],refuseOutbound=async request=>{outbound.push(new URL(request.url).hostname);throw Error('Unexpected outbound effect')}
 const h=await installation({entry:'tests/api/clock-worker.mjs',clock:()=>now,mailEdge:refuseOutbound,stripeEdge:refuseOutbound,accountingEdge:refuseOutbound})
 try{
  const table=await h.command('table.save',{label:'synthetic-placemat-1',seats:4,x:25,y:40})
  const draft=await h.command('service.save',{name:'synthetic-placemat-2',startAt:'2030-11-06T18:00:00Z',endAt:'2030-11-06T22:00:00Z',turnMinutes:60,coverLimit:24})
  const existing=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Person-reviewed native witness'})
  let sequence=0
  const call=async(key,name='placemat.workspace.revision',args={})=>{
   const id=++sequence,response=await h.request('/mcp',{method:'POST',as:'',headers:{authorization:'Bearer '+key,'mcp-protocol-version':'2025-11-25'},body:{jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}}})
   const body=await response.json();assert.equal(body.id,id)
   return {response,body}
  }
  const revision=async(key,version,disposition)=>{
   const {response,body}=await call(key)
   assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.result?.isError,false,JSON.stringify(body))
   assert.deepEqual(body.result.structuredContent.data,{version})
   assert.equal(body.result._meta['com.runeditrun/decision'].disposition,disposition)
  }
  const witness=async()=>({native:await h.api('/api/state'),approvals:await h.api('/agents/api/approvals'),reviews:await h.api('/agents/api/reviews'),audit:await h.api('/agents/api/audit')})
  for(const mode of ['autonomous','held']){
   const document={schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:mode==='autonomous'?[{id:'all',class:'*',do:'autonomous'}]:[{id:'all',class:'*',do:'approval',approver:['sponsor'],wait:'PT1H'},{id:'standard',class:'standard',do:'review'}],...(mode==='held'?{reviewers:['sponsor']}:{}),spend:{none:true}}
   await h.api('/agents/api/policy',{document},{method:'PUT'})
   assert.deepEqual((await h.api('/agents/api/policy')).document,document)
   const limited=(await h.api('/api/agent-keys',{name:'synthetic-placemat-3'})).result
   const other=(await h.api('/api/agent-keys',{name:'synthetic-placemat-4'})).result
   const before=await h.api('/api/state'),disposition=mode==='held'?'review':'autonomous'
   assert.ok(before.state.proposals.some(row=>row.id===existing.id&&row.status==='pending'))
   const boundary=Math.floor(now/60000)*60000+60000
   for(let count=0;count<600;count++)await revision(limited.key,before.version,disposition)
   const unchanged=await witness()
   assert.deepEqual(unchanged.native,before)
   const overrun=async(name,args)=>{
    const {response,body}=await call(limited.key,name,args)
    assert.equal(response.status,429,JSON.stringify(body))
    assert.equal(response.headers.get('retry-after'),String(Math.ceil((boundary-now)/1000)))
    assert.ok(Number(response.headers.get('retry-after'))>0)
    assert.equal(body.error?.data?.code,'rate_limited')
    assert.equal(body.result,undefined)
    assert.deepEqual(await witness(),unchanged)
    assert.deepEqual(outbound,[])
   }
   await overrun()
   // Even a real proposal attempt cannot enter native preparation after capacity is exhausted.
   await overrun('placemat.plans.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Capacity must refuse before native preparation',idempotency_key:randomUUID(),expected_revision:before.version})
   await revision(other.key,before.version,disposition)
   assert.deepEqual(await h.api('/api/state'),before)
   // The same sponsoring person's session can still make a native edit in the exhausted minute.
   const edited=await h.command('table.save',{...table,label:'synthetic-placemat-'+(mode==='held'?6:5)})
   assert.equal(edited.label,'synthetic-placemat-'+(mode==='held'?6:5))
   const personState=await h.api('/api/state')
   assert.ok(personState.version>before.version)
   now=boundary-1
   const atBoundary=await witness()
   const {response:refused,body}=await call(limited.key)
   assert.equal(refused.status,429);assert.equal(refused.headers.get('retry-after'),'1')
   assert.equal(body.error?.data?.code,'rate_limited');assert.equal(body.result,undefined)
   assert.deepEqual(await witness(),atBoundary)
   now=boundary
   await revision(limited.key,personState.version,disposition)
   await revision(other.key,personState.version,disposition)
   assert.deepEqual(await h.api('/api/state'),personState)
   assert.deepEqual(outbound,[])
   console.log(`PROBE BASE-AGENT-011 point 1 ${mode}: 600 native revision calls accepted; next read and preparation refused with 429 rate_limited and Retry-After 43; other agent and person edit worked; last millisecond refused with Retry-After 1; exact next minute recovered; native work unchanged by refusals; outbound effects 0`)
   now=boundary+17250
  }
 }finally{await h.close()}
})
