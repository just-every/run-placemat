import {bookingFit} from './availability'
import {searchTables} from './reservation-search'
import {ruleFor} from './booking-rules'
import type {State} from './model'
export function queueOrder(s:State,now=new Date().toISOString()){
 const active=s.waitlist.filter(w=>['queued','waiting','offered','accepted','arrived'].includes(w.status))
 const promise=(w:typeof active[number])=>w.quote?Date.parse(w.quote.at)+w.quote.maxMinutes*60000:Infinity
 const first=[...active].sort((a,b)=>(b.priority??0)-(a.priority??0)||promise(a)-promise(b)||String(a.createdAt??'').localeCompare(String(b.createdAt??''))||a.id.localeCompare(b.id))
 const forecast=first.map((w,index)=>{
  const service=s.services.find(v=>v.id===w.serviceId)!,step=ruleFor(service,'waitlist').slotMinutes*60000,start=Date.parse(service.startAt)
  const at=new Date(start+Math.ceil((Math.max(Date.parse(now),start)-start)/step)*step).toISOString()
  let fits=false
  if(!w.preferredAt||w.preferredAt<=at)try{const {state}=searchTables(s,w.preferredArea,w.requiredAccessTags);bookingFit(state,service,w.partySize,at,'waitlist');fits=true}catch(error){if(!(error instanceof Error)||!('status' in error)||![400,409].includes(Number(error.status)))throw error}
  return {id:w.id,serviceId:w.serviceId,fits,at,retainedOrder:index+1,reason:fits?'Fits current capacity; priority, then quoted deadline, then joining time determine order.':'No current fit at the next seating time; priority and quoted deadline retained. Check party size, area, access needs and preferred time.'}
 })
 return forecast.sort((a,b)=>Number(b.fits)-Number(a.fits)||a.retainedOrder-b.retainedOrder).map((f,index)=>({...f,rank:index+1,reason:f.reason+(f.fits&&forecast.some(o=>!o.fits&&o.serviceId===f.serviceId&&o.retainedOrder<f.retainedOrder)?' An earlier party retains priority for its next fitting table.':'')}))
}
