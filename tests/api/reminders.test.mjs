import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation} from './harness.mjs'

// Decode the actual downloaded CSV, including commas and escaped quotes in messages.
function csvRows(csv){
 const rows=[];let row=[],field='',quoted=false
 for(let i=0;i<csv.length;i++){
  const c=csv[i]
  if(c==='"'){if(quoted&&csv[i+1]==='"'){field+='"';i++}else quoted=!quoted}
  else if(!quoted&&(c===','||c==='\r'||c==='\n')){
   row.push(field);field=''
   if(c!==','){rows.push(row);row=[];if(c==='\r'&&csv[i+1]==='\n')i++}
  }else field+=c
 }
 assert.equal(quoted,false,'Download is a complete CSV')
 if(field||row.length){row.push(field);rows.push(row)}
 const [header,...data]=rows
 return data.map(values=>Object.fromEntries(header.map((key,i)=>[key,values[i]])))
}

test('MSG-001: exact human-approved reminder CSV preserves custody, US venue time and erasure without claiming delivery',async()=>{
 const h=await installation()
 try{
  await h.api('/api/reminders.csv',undefined,{as:'',status:401})
  const manager=await h.signIn('reminder-manager@example.test','admin')
  const managerId=(await h.api('/api/state',undefined,{as:manager})).actor.id
  const mailCount=h.messages.length
  const key=(await h.api('/api/agent-keys',{name:'Reminder preparation'})).result
  const agent={as:'',headers:{authorization:'Bearer '+key.key}}
  const timezone='America/New_York',year=new Date().getUTCFullYear()+1
  await h.command('venue.update',{name:'Cedar & Salt',timezone})
  for(let i=0;i<4;i++)await h.command('table.save',{label:`T${i+1}`,seats:4,x:20+i*20,y:30})
  // UTC January 17 is still January 16 in New York; UTC or Australian rendering fails.
  const service=await h.command('service.save',{name:'January dinner',startAt:`${year}-01-17T00:30:00Z`,endAt:`${year}-01-17T04:30:00Z`,turnMinutes:90,coverLimit:16})
  const publication=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Open dinner'})
  await h.command('proposal.approve',{proposalId:publication.id})
  const people=[
   {name:'Absent Rowan',email:'absent-rowan@example.test',phone:'2025550101',partySize:2},
   {name:'Keep, "River"',email:'keep-river@example.test',phone:'2025550102',partySize:2},
   {name:'Erase Willow',email:'erase-willow@example.test',phone:'2025550103',partySize:3},
   {name:'Late No-show',email:'late-noshow@example.test',phone:'2025550104',partySize:2},
  ],bookings=[]
  for(const person of people)bookings.push((await h.api('/api/public/book',{...person,serviceId:service.id,startAt:service.startAt},{as:'',status:201})).result)
  const prepare=()=>h.command('proposal.prepare',{kind:'reminders',plan:{serviceId:service.id},reason:'Review exact booked dinner guests'},agent)
  const staleBooking=await prepare()
  await h.command('booking.status',{bookingId:bookings[0].id,status:'no-show'})
  await h.command('proposal.approve',{proposalId:staleBooking.id},{as:manager,status:409})
  const staleVenue=await prepare()
  await h.command('venue.update',{name:'Cedar & Salt Dining Room',timezone})
  await h.command('proposal.approve',{proposalId:staleVenue.id},{as:manager,status:409})
  const draft=await prepare()
  const before=await h.api('/api/state')
  assert.equal(before.state.reminders.length,0,'Preparation and rejected approvals create no exportable messages')
  assert.deepEqual(new Set(draft.plan.bookings.map(b=>b.id)),new Set(bookings.slice(1).map(b=>b.id)))
  assert.deepEqual(draft.plan.venue,before.state.venue)
  assert.equal(draft.preparedBy,key.id)
  assert.ok(Number.isFinite(Date.parse(draft.preparedAt)))
  const empty=await h.request('/api/reminders.csv')
  assert.equal(empty.status,200)
  assert.deepEqual(csvRows(await empty.text()),[],'Only approved batches can be downloaded')
  await h.command('proposal.approve',{proposalId:draft.id},{...agent,status:403})
  const approved=await h.command('proposal.approve',{proposalId:draft.id},{as:manager})
  assert.equal(approved.approvedBy,managerId)
  assert.equal(approved.preparedBy,key.id)
  assert.equal(approved.preparedAt,draft.preparedAt)
  assert.equal(approved.status,'approved')
  assert.ok(Number.isFinite(Date.parse(approved.approvedAt)))
  let snapshot=await h.api('/api/state')
  assert.equal(snapshot.state.reminders.length,3)
  assert.ok(snapshot.state.reminders.every(r=>r.status==='approved'))
  const download=await h.request('/api/reminders.csv',{as:manager})
  assert.equal(download.status,200)
  assert.match(download.headers.get('content-type'),/^text\/csv/)
  const csv=await download.text(),rows=csvRows(csv)
  assert.deepEqual(new Set(rows.map(r=>r.booking_id)),new Set(bookings.slice(1).map(b=>b.id)))
  for(const [i,person] of people.entries()){
   if(i===0){for(const value of [person.name,person.email,person.phone,bookings[i].id])assert.ok(!csv.includes(value));continue}
   const row=rows.find(r=>r.booking_id===bookings[i].id)
   assert.equal(row.guest,person.name);assert.equal(row.email,person.email);assert.equal(row.phone,person.phone)
   assert.equal(row.approved_by,managerId);assert.equal(row.approved_at,approved.approvedAt)
   assert.match(row.message,new RegExp(`Jan 16, ${year}, 7:30[\\s\\u202f]+PM`))
   assert.ok(row.message.includes(timezone),'Venue timezone is explicit in the exported message')
   assert.ok(row.message.includes(draft.plan.venue.name))
  }
  snapshot=await h.api('/api/state')
  assert.ok(snapshot.state.reminders.every(r=>r.status==='exported'))
  assert.equal(snapshot.state.proposals.find(p=>p.id===draft.id).preparedBy,key.id)
  assert.ok(!/deliver(?:ed|y)|sent_at|provider_id/i.test(csv),'Export makes no provider delivery claim')
  await h.command('booking.status',{bookingId:bookings[3].id,status:'no-show'})
  const afterNoShow=await (await h.request('/api/reminders.csv',{as:manager})).text()
  for(const value of [people[3].name,people[3].email,people[3].phone,bookings[3].id])assert.ok(!afterNoShow.includes(value),'A later no-show is excluded even from an already approved batch')
  const erasedGuest=snapshot.guests.find(g=>g.email===people[2].email)
  const privateNote='Willow private anniversary instruction'
  await h.command('guest.update',{guestId:erasedGuest.id,notes:privateNote})
  const erasedMessage=rows.find(r=>r.booking_id===bookings[2].id).message
  await h.api('/api/backup') // Establish retained archive custody before erasure.
  await h.command('guest.erase',{guestId:erasedGuest.id,confirm:'ERASE'})
  const afterDownload=await h.request('/api/reminders.csv',{as:manager})
  assert.equal(afterDownload.status,200)
  const afterCsv=await afterDownload.text(),remaining=csvRows(afterCsv)
  assert.deepEqual(remaining,[rows.find(r=>r.booking_id===bookings[1].id)],'Surviving reminder keeps its exact approved content and attribution')
  const after=await h.api('/api/state'),archive=await h.api('/api/backup')
  const custody=JSON.stringify({after,archive})
  for(const value of [people[2].name,people[2].email,people[2].phone,privateNote]){
   assert.ok(!afterCsv.includes(value),'Erased personal value is absent from the next CSV')
   assert.ok(!custody.includes(value),'Erased personal value is absent from live and archive custody')
  }
  assert.ok(!afterCsv.includes(erasedMessage),'Erased booking reminder text is not exported')
  assert.ok(after.state.reminders.every(r=>r.status==='exported'))
  assert.equal(after.state.bookings.find(b=>b.id===bookings[0].id).status,'no-show')
  assert.equal(h.messages.length,mailCount,'Preparing, approving and exporting CSV never sends a provider message')
 }finally{await h.close()}
})
