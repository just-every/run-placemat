import test from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'

test('ROLE-003: hosts act without approval, read-only members never mutate, and a server sees only their own live section sheet and kitchen view',async()=>{
 const h=await installation(),empty=await installation();try{
  await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/Los_Angeles'})
  const tables=[];for(const [i,label] of ['W-12','W-14','G-21','G-22'].entries())tables.push(await h.command('table.save',{label,seats:4,x:20+i*15,y:30}))
  const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
  const service=await h.command('service.save',{name:'Friday dinner',startAt:day+'T18:00:00-07:00',endAt:day+'T23:00:00-07:00',turnMinutes:90,coverLimit:32})
  const people={};for(const [name,email,role] of [['manager','role-manager@example.test','admin'],['host','role-host@example.test'],['ana','role-ana@example.test'],['ben','role-ben@example.test'],['member','role-member@example.test']])people[name]={email,cookie:await h.signIn(email,role)}
  const operators=await h.api('/auth/operators');for(const person of Object.values(people))person.id=operators.find(p=>p.email===person.email).id
  const as=name=>({as:people[name].cookie})
  await h.command('team.host',{operatorId:people.host.id,enabled:true})
  // The server grant is owner-only, separate from host and lead, and a manager can link only granted people.
  await h.command('team.server',{operatorId:people.ana.id,enabled:true},{...as('manager'),status:403})
  await h.command('team.server',{operatorId:people.host.id,enabled:true},{status:409})
  await h.command('team.server',{operatorId:people.ana.id,enabled:true});await h.command('team.server',{operatorId:people.ben.id,enabled:true})
  await h.command('team.host',{operatorId:people.ana.id,enabled:true},{status:409});await h.command('team.lead',{operatorId:people.ben.id,enabled:true},{status:409})
  const staff=name=>h.command('server.save',{serviceId:service.id,name:name[0].toUpperCase()+name.slice(1),coverCap:12,operatorId:people[name].id},as('manager'))
  await h.command('server.save',{serviceId:service.id,name:'Unlinked',coverCap:12,operatorId:people.member.id},{status:409})
  const ana=await staff('ana'),ben=await staff('ben')
  await h.command('server.save',{serviceId:service.id,name:'Duplicate',coverCap:12,operatorId:people.ana.id},{status:409})
  await h.command('section.save',{serviceId:service.id,name:'Window',serverId:ana.id,tableIds:[tables[0].id,tables[1].id]});await h.command('section.save',{serviceId:service.id,name:'Garden',serverId:ben.id,tableIds:[tables[2].id,tables[3].id]})
  const publication=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Reviewed server service'});await h.command('proposal.approve',{proposalId:publication.id})
  const guest=(i,name,requests)=>h.api('/api/public/book',publicGuest(service,i,{name,partySize:2,requestsAcknowledged:true,requests}),{as:'',status:201}).then(r=>r.result)
  const elena=await guest(0,'Elena Torres',{allergyNotes:'Shellfish',occasion:'Anniversary'}),marcus=await guest(1,'Marcus Chen',{allergyNotes:'Peanut',wheelchair:true})
  const version=async()=>(await h.api('/api/floor-version')).version
  const place=async(booking,table,opts={})=>{const now=(await h.api('/api/state')).state.bookings.find(b=>b.id===booking.id);if(now.tableIds[0]!==table.id)await h.command('booking.move',{bookingId:booking.id,tableIds:[table.id],version:await version(),reason:'Place in section'},opts)}
  await place(elena,tables[0]);await place(marcus,tables[2])
  await h.command('service.note',{date:day,kind:'shift',text:'Shift note: VIP table moves at nine'});await h.command('service.note',{date:day,kind:'kitchen',text:'Halibut: 12 portions'})
  await h.command('guest.profile',{guestId:(await h.api('/api/guests?search=Elena')).guests[0].id,vipLevel:'regular',tags:['Private celebration'],seatingPreference:'Window'})
  const secrets=['Marcus Chen','Peanut','Garden','G-21','G-22','Shift note','VIP table','role-manager@example.test','guest0@example.test','guest1@example.test','Private celebration','Deposit','checkout.stripe.com','service cover limit','arrivalCovers','concurrentCovers','areaArrivalCaps']
  const sheets=async(name,sheetValues,kitchenValues,absent)=>{
   for(const door of ['/api/preshift?date='+day,'/preshift?date='+day,'/api/preshift.pdf?date='+day,'/api/kitchen?serviceId='+service.id,'/kitchen?serviceId='+service.id]){
    const r=await h.request(door,as(name));assert.equal(r.status,200,door);const text=await r.text()
    for(const value of door.includes('kitchen')?kitchenValues:sheetValues)assert.ok(text.includes(value),name+' '+door+' '+value)
    for(const value of absent)assert.ok(!text.includes(value),name+' '+door+' must not contain '+value)
   }
  }
  const forbiddenForAna=secrets,forbiddenForBen=['Elena Torres','Shellfish','Anniversary','Window','W-12','W-14','Shift note','VIP table','guest0@example.test','Private celebration']
  await sheets('ana',['Elena Torres','Shellfish','Anniversary','Window','Halibut: 12 portions'],['Shellfish','Halibut: 12 portions'],forbiddenForAna.concat(['Marcus','Peanut']))
  const anaSheet=await h.api('/api/preshift?date='+day,undefined,as('ana'));assert.equal(anaSheet.audience,'Server');assert.deepEqual(anaSheet.services[0].sections.map(s=>s.name),['Window']);assert.deepEqual(anaSheet.services[0].bookings.map(b=>b.name),['Elena Torres']);assert.deepEqual(anaSheet.notes.map(n=>n.kind),['kitchen']);assert.equal(anaSheet.services[0].pacing,undefined);assert.equal(anaSheet.services[0].coverLimit,undefined)
  for(const field of ['email','phone','notes','tags'])assert.ok(!(field in anaSheet.services[0].bookings[0]),field)
  await sheets('ben',['Marcus Chen','Peanut','Garden'],['Peanut'],forbiddenForBen)
  const kitchen=await h.api('/api/kitchen?serviceId='+service.id,undefined,as('ana'));assert.equal(kitchen.audience,'Server');assert.deepEqual(kitchen.needs.map(n=>[n.tables,n.allergy]),[[['W-12'],'Shellfish']]);assert.deepEqual(kitchen.items,[]);assert.deepEqual(kitchen.intervals,[]);assert.equal(kitchen.policy,undefined);assert.deepEqual(kitchen.notes.map(n=>n.kind),['kitchen'])
  // Every other door is closed to a server, reads and writes alike.
  for(const [path,body] of [['/api/state'],['/api/guests?search=Elena'],['/api/timeline?serviceId='+service.id],['/api/sections?serviceId='+service.id],['/api/pacing?serviceId='+service.id],['/api/reports/reservations'],['/api/hoststand/devices'],['/api/commands',{command:'booking.move',payload:{bookingId:elena.id,tableIds:[tables[1].id],version:await version()}}],['/api/commands',{command:'booking.stage',payload:{bookingId:elena.id,stage:'seated'}}]]){
   const r=await h.request(path,{...as('ana'),...(body?{method:'POST',body}:{})});assert.equal(r.status,403,path);assert.ok(!(await r.text()).includes('Elena'),path)
  }
  const app=await h.request('/app',as('ana'));assert.equal(app.status,303);assert.equal(app.headers.get('location'),'/preshift')
  // Bulk guest exports and backups are refused to a host, a server and a read-only member.
  const exportsPaths=['/api/reminders.csv',...(await h.api('/api/state')).businessExportKinds.map(kind=>'/api/business-export/'+kind+'.csv'),'/api/reports/reservations.csv','/api/audit.csv','/api/backup','/api/calendar/'+elena.id,'/api/import/journal']
  for(const name of ['host','ana','member'])for(const path of exportsPaths){const r=await h.request(path,as(name));assert.equal(r.status,403,name+' '+path);const text=await r.text();assert.ok(!text.includes('guest0@example.test')&&!text.includes('Elena'),name+' '+path)}
  // A read-only member reads but never mutates; the host acts without a proposal and the server's section follows the live assignment.
  await h.api('/api/state',undefined,as('member'))
  for(const command of [['booking.move',{bookingId:elena.id,tableIds:[tables[1].id],version:await version()}],['booking.stage',{bookingId:elena.id,stage:'seated'}],['booking.lock',{bookingId:elena.id,locked:true,version:await version()}],['waitlist.add',{serviceId:service.id,name:'Walk',partySize:2}]])await h.command(command[0],command[1],{...as('member'),status:403})
  await h.command('booking.lock',{bookingId:elena.id,locked:true,version:await version()},as('host'));assert.equal((await h.api('/api/state')).state.bookings.find(b=>b.id===elena.id).assignmentLocked,true)
  await h.command('booking.lock',{bookingId:elena.id,locked:false,version:await version()},as('host'))
  await h.command('booking.stage',{bookingId:elena.id,stage:'seated'},as('host'));await h.command('booking.stage',{bookingId:marcus.id,stage:'seated'},as('host'))
  await h.command('booking.move',{bookingId:elena.id,tableIds:[tables[1].id],version:await version(),reason:'Host rebalances'},as('host'))
  await h.command('booking.swap',{bookingId:elena.id,otherBookingId:marcus.id,version:await version(),reason:'Host swaps sections'},as('host'))
  assert.deepEqual((await h.api('/api/preshift?date='+day,undefined,as('ana'))).services[0].bookings.map(b=>b.name),['Marcus Chen'])
  assert.deepEqual((await h.api('/api/preshift?date='+day,undefined,as('ben'))).services[0].bookings.map(b=>b.name),['Elena Torres'])
  assert.deepEqual((await h.api('/api/kitchen?serviceId='+service.id,undefined,as('ana'))).needs.map(n=>n.allergy),['Peanut'])
  // Grants and links remain historical on restore; a fresh identity needs owner confirmation before access.
  const archive=await h.api('/api/backup');await empty.api('/api/restore',{archive,confirm:'RESTORE'})
  const restored=(await empty.api('/api/state')).state;assert.deepEqual(restored.serverIds,[people.ana.id,people.ben.id]);assert.deepEqual(restored.services[0].staffing.servers.map(s=>s.operatorId),[people.ana.id,people.ben.id])
  assert.ok((await (await h.request('/api/business-export/venue.csv')).text()).includes(people.ana.id))
  const restoredAna=await empty.signIn(people.ana.email),restoredOperator=(await empty.api('/auth/operators')).find(p=>p.email===people.ana.email)
  assert.notEqual(restoredOperator.id,people.ana.id,'Native identities and sessions never restore from domain history')
  await empty.api('/api/preshift?date='+day,undefined,{as:restoredAna,status:403})
  await empty.api('/api/kitchen?serviceId='+service.id,undefined,{as:restoredAna,status:403})
  await empty.command('team.server',{operatorId:restoredOperator.id,enabled:true})
  assert.deepEqual((await empty.api('/api/preshift?date='+day,undefined,{as:restoredAna})).services,[],'An owner grant alone cannot reactivate a historical shift link')
  await empty.command('server.save',{serviceId:service.id,id:ana.id,name:'Ana',coverCap:12,operatorId:restoredOperator.id})
  assert.deepEqual((await empty.api('/api/preshift?date='+day,undefined,{as:restoredAna})).services[0].bookings.map(b=>b.name),['Marcus Chen'])
  await h.command('server.save',{serviceId:service.id,id:ana.id,name:'Ana',coverCap:12,operatorId:''})
  assert.deepEqual((await h.api('/api/preshift?date='+day,undefined,as('ana'))).services,[]);await h.api('/api/kitchen?serviceId='+service.id,undefined,{...as('ana'),status:403})
  await h.command('server.save',{serviceId:service.id,id:ana.id,name:'Ana',coverCap:12,operatorId:people.ana.id})
  await h.command('team.server',{operatorId:people.ana.id,enabled:false})
  const state=(await h.api('/api/state')).state;assert.deepEqual(state.serverIds,[people.ben.id]);assert.ok(!state.services[0].staffing.servers.some(s=>s.operatorId===people.ana.id))
  await h.api('/api/preshift?date='+day,undefined,{...as('ana'),status:403})
  assert.equal((await h.request('/api/state',as('ana'))).status,200,'A revoked server returns to read-only member access')
 }finally{await h.close();await empty.close()}
})
