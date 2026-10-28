import assert from 'node:assert/strict'
import {installation,service,publicGuest} from './harness.mjs'
export const marketingMessages=h=>h.messages.filter(m=>m.text?.includes('Unsubscribe from marketing:'))
export const linkToken=message=>message.text.match(/\/retention#([a-f0-9]{64})/)[1]
export async function retentionTick(h,at=h.now()){
 h.setNow(at)
 const event=await(await h.mf.getWorker()).scheduled({scheduledTime:new Date(at),cron:'17 * * * *'})
 assert.equal(event.outcome,'ok')
 if(h.autoRenew)await h.renewOwner()
}
export async function retentionFixture(options={}){
 let now=Date.now()
 const h=await installation({...options,entry:'tests/api/retention-worker.ts',clock:()=>now})
 h.now=()=>now;h.setNow=at=>{now=Number(new Date(at))}
 const originalApi=h.api,originalRequest=h.request
 h.api=(path,p,opts={})=>originalApi(path,p,{as:h.cookie,...opts})
 h.request=(path,opts={})=>originalRequest(path,{as:h.cookie,...opts})
 h.command=async(command,payload,opts={})=>(await h.api('/api/commands',{command,payload},opts)).result
 h.autoRenew=true
 h.renewOwner=async()=>{
  const ownerEmail=options.bindings?.OWNER_EMAIL||['owner','example.test'].join('@')
  await h.api('/auth/magic-link',{email:ownerEmail,returnTo:'/app'},{as:'',status:202})
  const link=h.messages.findLast(m=>m.text?.includes('/auth/confirm?token=')).text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)[0]
  const response=await h.request('/auth/confirm',{method:'POST',as:'',body:{token:new URL(link).searchParams.get('token')}})
  assert.equal(response.status,303);h.cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
 }
 try{
  const f=await service(h,{tables:5,seats:2,covers:30}),bookings=[]
  for(let i=0;i<3;i++)bookings.push((await h.api('/api/public/book',publicGuest(f.service,i),{as:'',status:201})).result)
  const snapshot=await h.api('/api/state'),guests=snapshot.guests
  for(let i=0;i<bookings.length;i++)bookings[i]=snapshot.state.bookings.find(b=>b.id===bookings[i].id)
  await h.api('/api/retention/grant',{enabled:true})
  const unsubscribeTokens=[]
  for(const b of bookings){
   const guest=guests.find(g=>g.id===b.guestId)
   const before=h.messages.length
   await h.api('/api/public/retention/request',{email:guest.email},{as:''})
   assert.equal(h.messages.length,before+1)
   const token=linkToken(h.messages.at(-1))
   await h.api('/api/public/retention/confirm',{token,confirm:false},{as:'',status:400})
   const result=await h.api('/api/public/retention/confirm',{token,confirm:true},{as:''})
   unsubscribeTokens.push(result.unsubscribeToken)
   await h.api('/api/public/retention/confirm',{token,confirm:true},{as:'',status:404})
  }
  const tickAt=Date.parse(f.service.endAt)+12*3600000
  const config=(trigger,extra={})=>({name:trigger+' guest invitation',trigger,offer:'Join us for a seasonal welcome menu. Quote CEDAR at your next visit.',delayDays:0,lapsedDays:1,capDays:1,quietStart:'20:00',quietEnd:'09:00',expiresAt:new Date(tickAt+365*86400000).toISOString(),...extra})
  const draft=async(trigger,extra={})=>h.api('/api/retention/draft',config(trigger,extra))
  const approve=async(result)=>{const p=result.preview;assert.ok(p.recipients.length);await h.api('/api/retention/approve',{workflowId:p.workflowId,previewHash:p.previewHash});return p.workflowId}
  const complete=async b=>{await h.command('booking.status',{bookingId:b.id,status:'seated'});await h.command('booking.status',{bookingId:b.id,status:'completed'});await h.command('booking.stage',{bookingId:b.id,floorStage:'ready'})}
  return {h,...f,bookings,guests,unsubscribeTokens,tickAt,config,draft,approve,complete}
 }catch(error){await h.close();throw error}
}
