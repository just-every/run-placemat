import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,service,publicGuest} from './harness.mjs'

test('PRIVACY-001: signed-out availability and confirmations isolate guest contacts, notes and visit history',async()=>{
 const h=await installation();try{
  const {service:s}=await service(h)
  // Draft services stay private even when a guest knows their identifier.
  const draft=await h.command('service.save',{name:'Private rehearsal',startAt:s.startAt,endAt:s.endAt,turnMinutes:90,coverLimit:8})
  const inputs=[
   publicGuest(s,0,{name:'Elena Torres',email:'elena.torres@example.test',phone:'+1 212 555 0137'}),
   publicGuest(s,1,{name:'Marcus Chen',email:'marcus.chen@example.test',phone:'+1 212 555 0184'})
  ],confirmations=[]
  for(const input of inputs){
   const response=await h.api('/api/public/book',input,{as:'',status:201})
   confirmations.push(response)
   assert.equal(response.result.startAt,s.startAt)
   assert.equal(response.result.partySize,input.partySize)
   assert.ok(response.result.id)
  }
  const privateNotes=['Private anniversary arrangements','Private accessibility conversation']
  const before=await h.api('/api/state')
  for(const [i,input] of inputs.entries()){
   const guest=before.guests.find(g=>g.email===input.email)
   await h.command('guest.update',{guestId:guest.id,notes:privateNotes[i]})
  }
  const staff=await h.api('/api/state')
  assert.equal(staff.guests.length,2)
  for(const [i,input] of inputs.entries()){
   const guest=staff.guests.find(g=>g.email===input.email)
   assert.equal(guest.notes,privateNotes[i])
   assert.ok(staff.state.bookings.some(b=>b.guestId===guest.id&&b.id===confirmations[i].result.id))
  }
  const availability=await h.api('/api/public/services',undefined,{as:''})
  assert.deepEqual(availability.services.map(v=>v.id),[s.id])
  assert.ok(!availability.services.some(v=>v.id===draft.id))
  const privateValues=[...inputs.flatMap(g=>[g.name,g.email,g.phone]),...privateNotes,...staff.guests.map(g=>g.id)]
  for(const response of [availability,...confirmations]){
   const serialized=JSON.stringify(response)
   for(const value of privateValues)assert.ok(!serialized.includes(value),'Public response must omit guest personal values')
   const inspect=value=>{
    if(!value||typeof value!=='object')return
    for(const [key,child] of Object.entries(value)){
     assert.ok(!['guests','bookings','guestId','name','email','phone','notes','history'].includes(key)||value===availability.venue||availability.services.includes(value),'Public response must omit guest records and visit history')
     inspect(child)
    }
   }
   inspect(response)
  }
  for(const [i,response] of confirmations.entries())assert.ok(!JSON.stringify(response).includes(confirmations[1-i].result.id))
  await h.api('/api/state',undefined,{as:'',status:401})
 }finally{await h.close()}
})
