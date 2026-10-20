// Real workerd + D1. The only fakes are network edges: the paid outbound mail service and the BOOK-002 analytics providers (GA4, Meta).
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {unstable_splitSqlQuery} from 'wrangler'
import {build} from 'esbuild'
import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'
export async function installation({entry='tests/api/worker.ts',bindings={}}={}){
 const directory=await mkdtemp(join(tmpdir(),'placemat-api-'))
 const bundled=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['node:*','cloudflare:*']})
 const setup=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),messages=[]
 const origin='https://venue.example.test'
 const mail=async request=>{assert.equal(new URL(request.url).hostname,'api.resend.com');messages.push(await request.json());return Response.json({id:randomUUID()})}
 // GA4 Measurement Protocol answers 204 without confirming; Meta's Conversions API reports events_received. Tests may swap the answer.
 const analytics=[],answer={provider:async request=>new URL(request.url).hostname==='graph.facebook.com'?Response.json({events_received:1,messages:[],fbtrace_id:'edge-fake'}):new Response(null,{status:204})}
 const outbound=async request=>{
  const url=new URL(request.url)
  if(!['www.google-analytics.com','graph.facebook.com'].includes(url.hostname))return mail(request)
  analytics.push({url:url.href,method:request.method,headers:Object.fromEntries(request.headers),body:await request.clone().json()})
  return answer.provider(request)
 }
 const options=port=>({...convertV4MiniflareOptions({host:'127.0.0.1',upstream:origin,port,modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{AUTH_LOCAL:'false',AUTH_ORIGIN:origin,OWNER_EMAIL:'owner@example.test',SESSION_SECRET:secret,SETUP_TOKEN:setup,MAIL_PROVIDER:'resend',MAIL_FROM:'auth@example.test',MAIL_API_KEY:'test-network-edge',...bindings},outboundService:outbound}),resourcePersistencePath:directory})
 const mf=new Miniflare(options(0))
 try{
  await mf.ready
  const db=await mf.getD1Database('DB')
  for(const f of (await readdir('migrations/core')).filter(f=>f.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile(join('migrations/core',f),'utf8')).map(sql=>db.prepare(sql)))
  let cookie=''
  const request=(path,{method='GET',body,as=cookie,headers={}}={})=>mf.dispatchFetch(origin+path,{method,redirect:'manual',headers:{origin,host:new URL(origin).host,'content-type':'application/json',...(as?{cookie:as}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})})
  const boot=await request('/auth/bootstrap',{method:'POST',body:{token:setup,displayName:'Venue owner'}});assert.equal(boot.status,303,boot.status===303?undefined:await boot.text())
  cookie=boot.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
  const api=async(path,body,opts={})=>{const r=await request(path,{...(body===undefined?{}:{method:'POST',body}),...opts}),v=await r.json();if(opts.status)assert.equal(r.status,opts.status,JSON.stringify(v));else assert.ok(r.ok,JSON.stringify(v));return v}
  const command=async(command,payload,opts={})=>(await api('/api/commands',{command,payload},opts)).result
  const signIn=async(email,role='member')=>{
   await api('/auth/invite',{email,displayName:role==='admin'?'Floor manager':'Host reader',role,returnTo:'/app'},{status:202})
   const message=messages.findLast(m=>JSON.stringify(m.to).includes(email)),match=message?.text?.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0]??message?.html?.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;','&')
   assert.ok(match,'Invitation crosses the real mail edge')
   const link=new URL(match),confirmed=await request('/auth/confirm',{method:'POST',as:'',body:{token:link.searchParams.get('token')}});assert.equal(confirmed.status,303)
   return confirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
  }
  return {mf,db,origin,cookie,request,api,command,signIn,messages,analytics,answerAnalytics(provider){answer.provider=provider},async close(){await mf.dispose();await rm(directory,{recursive:true,force:true})}}
 }catch(error){await mf.dispose();await rm(directory,{recursive:true,force:true});throw error}
}
export async function service(h,{tables=4,seats=2,covers=8}={}){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'Australia/Brisbane'})
 const floor=[];for(let i=0;i<tables;i++)floor.push(await h.command('table.save',{label:`T${i+1}`,seats,x:20+i*20,y:30}))
 const date=new Date();date.setUTCDate(date.getUTCDate()+((5-date.getUTCDay()+7)%7||7));const day=date.toISOString().slice(0,10)
 const draft=await h.command('service.save',{name:'Friday dinner',startAt:day+'T08:00:00Z',endAt:day+'T12:00:00Z',turnMinutes:90,coverLimit:covers})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:draft.id},reason:'Friday service reviewed by the venue manager'})
 await h.command('proposal.approve',{proposalId:proposal.id})
 return {floor,service:draft,startAt:draft.startAt}
}
export const publicGuest=(service,i,extra={})=>({serviceId:service.id,startAt:service.startAt,name:['Alex Rowan','Sam Patel','Morgan Lee','Jules Rivers','Taylor Quinn'][i]??`Guest ${i}`,email:`guest${i}@example.test`,partySize:2,...extra})
