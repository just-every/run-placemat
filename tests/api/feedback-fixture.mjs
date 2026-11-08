import assert from 'node:assert/strict'
import {service,publicGuest} from './harness.mjs'
export const feedbackReviewUrl='https://reviews.example.test/venue'
export async function feedbackTick(h){const result=await(await h.mf.getWorker()).scheduled({scheduledTime:new Date(),cron:'17 * * * *'});assert.equal(result.outcome,'ok')}
export async function feedbackFixture(h,{count=2,complete=true}={}){
 const f=await service(h,{tables:Math.max(count,4),covers:Math.max(count*2,8)})
 await h.api('/api/feedback/settings',{enabled:true,publicReviewUrl:feedbackReviewUrl})
 const bookings=[]
 for(let i=0;i<count;i++){
  const b=(await h.api('/api/public/book',publicGuest(f.service,i,{feedbackEmailConsent:true}),{as:'',status:201})).result;bookings.push(b)
  if(complete){await h.command('booking.status',{bookingId:b.id,status:'seated'});await h.command('booking.status',{bookingId:b.id,status:'completed'})}
 }
 if(complete)await feedbackTick(h)
 const invitations=h.messages.filter(m=>m.text?.includes('/feedback#'))
 const tokens=invitations.map(m=>m.text.match(/\/feedback#([a-f0-9]{64})/)[1])
 const view=await h.api('/api/feedback'),visits=bookings.map(b=>view.visits.find(v=>v.bookingId===b.id))
 const state=(await h.api('/api/state')).state
 return {...f,bookings:bookings.map(b=>state.bookings.find(row=>row.id===b.id)),visits,tokens,invitations,view}
}
