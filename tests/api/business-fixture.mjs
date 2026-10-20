import assert from 'node:assert/strict'
import {service,publicGuest} from './harness.mjs'

export async function businessService(h){
 const {service:shift,floor}=await service(h,{covers:20})
 const online=(await h.api('/api/public/book',publicGuest(shift,0,{name:'Alex "Cedar", Rowan',requests:{occasion:'Anniversary',allergyNotes:'Guest reports shellfish allergy'},requestsAcknowledged:true}),{as:'',status:201})).result
 const guest=(await h.api('/api/state')).state.bookings.find(b=>b.id===online.id).guestId
 await h.command('guest.profile',{guestId:guest,vipLevel:'regular',tags:['Anniversary'],notes:'=SUM(1,2)\nStaff reports a window request',seatingPreference:'Window'})
 await h.command('booking.walkin',publicGuest(shift,1))
 const queued=await h.api('/api/public/queue/join',publicGuest(shift,2,{contactConsent:true}),{as:'',status:201})
 await h.command('risk.decide',{bookingId:online.id,kind:'contact',decision:'accepted',reason:'Confirm anniversary plans personally',dueAt:new Date(Date.now()+3600000).toISOString()})
 const inquiry=await h.api('/api/public/inquiries/create',{name:'Jules Rivers',email:'jules@example.test',partySize:16,message:'Can we discuss a private dinner?'},{as:'',status:201})
 const reminder=await h.command('proposal.prepare',{kind:'reminders',plan:{serviceId:shift.id},reason:'Review reminder CSV for our own sender'})
 await h.command('proposal.approve',{proposalId:reminder.id})
 const publication=await h.api('/api/reports/performance',{serviceId:shift.id})
 return {shift,floor,online,guest,queued,inquiry,publication}
}

// Read real RFC 4180 downloads, including embedded commas, quotes and newlines.
export function csvRecords(csv){
 const rows=[];let row=[],value='',quoted=false
 for(let i=0;i<csv.length;i++){
  const c=csv[i]
  if(c==='"'){if(quoted&&csv[i+1]==='"'){value+='"';i++}else quoted=!quoted}
  else if(c===','&&!quoted){row.push(value);value=''}
  else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value=''}
  else value+=c
 }
 assert.equal(quoted,false,'DATA-003: CSV quotes are balanced')
 if(value||row.length){row.push(value);rows.push(row)}
 const [fields,...records]=rows
 return records.map(values=>{assert.equal(values.length,fields.length,'DATA-003: every CSV row matches its field definitions');return Object.fromEntries(fields.map((key,i)=>[key,values[i]]))})
}
