import test from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest,service} from './harness.mjs'

test('ROLE-001: an owner connects two venues, grants a scoped read-only group admin, and revoking or disconnecting stops direct access at once',async()=>{
 let home,tap,empty,homeAvailable=true
 home=await installation({origin:'https://home.example.test',peers:{'tap.example.test':()=>tap}});tap=await installation({origin:'https://tap.example.test',peers:{'home.example.test':()=>{if(!homeAvailable)throw Error('Venue network unavailable');return home}}});empty=await installation()
 try{
  for(const [h,name] of [[home,'Home Bistro'],[tap,'Tap Room']]){const {service:s}=await service(h);await h.command('venue.update',{name,timezone:'Australia/Brisbane'});await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})}
  const manager=await tap.signIn('tap-manager@example.test','admin'),homeManager=await home.signIn('home-manager@example.test','admin')
  // A venue manager is denied the owner's export, erasure, provider credentials and group authority.
  const guest=(await tap.api('/api/guests?search=guest0')).guests[0]
  for(const kind of (await tap.api('/api/state')).businessExportKinds)assert.equal((await tap.request('/api/business-export/'+kind+'.csv',{as:manager})).status,403,kind)
  assert.equal((await tap.request('/api/backup',{as:manager})).status,403);await tap.api('/api/restore',{archive:[],confirm:'RESTORE'},{as:manager,status:403})
  await tap.command('guest.erase',{guestId:guest.id,confirm:'ERASE'},{as:manager,status:403})
  await tap.command('analytics.settings',{},{as:manager,status:403});await tap.api('/api/agent-keys',{name:'No key'},{as:manager,status:403})
  for(const [path,body] of [['/api/group/invite',{label:'Tap Room'}],['/api/group/join',{homeOrigin:'https://home.example.test',code:'gi_x',ceiling:[]}],['/api/group/admin',{operatorId:'x',venues:{}}],['/api/group/link/revoke',{linkId:'x'}]])await home.api(path,body,{as:homeManager,status:403})
  await home.api('/api/group',undefined,{as:homeManager,status:403})
  // The owner connects the member venue with a one-use code and chooses what group admins may read there.
  const invite=(await home.api('/api/group/invite',{label:'Tap Room'})).result
  assert.match(invite.code,/^gi_[a-f0-9]{64}$/)
  await tap.api('/api/group/join',{homeOrigin:'https://home.example.test',code:'gi_'+'0'.repeat(64),ceiling:['reports.read']},{status:409})
  await tap.api('/api/group/join',{homeOrigin:'http://home.example.test',code:invite.code,ceiling:['reports.read']},{status:400});await tap.api('/api/group/join',{homeOrigin:'https://home.example.test',code:invite.code,ceiling:['guests.export']},{status:400})
  await tap.api('/api/group/join',{homeOrigin:'https://home.example.test',code:invite.code,ceiling:['reports.read']})
  await tap.api('/api/group/join',{homeOrigin:'https://home.example.test',code:invite.code,ceiling:['reports.read']},{status:409})
  const replay=await home.request('/api/group/join-accept',{as:'',method:'POST',body:{code:invite.code,name:'Replay',origin:'https://replay.example.test',ceiling:[]}});assert.equal(replay.status,403)
  const status=(await home.api('/api/group'));assert.equal(status.standing,'home');assert.equal(status.links.length,1);assert.equal(status.links[0].name,'Tap Room');assert.deepEqual(status.links[0].ceiling,['reports.read']);assert.ok(status.invites[0].usedAt)
  const linkId=status.links[0].id,tapStatus=await tap.api('/api/group');assert.equal(tapStatus.standing,'member');assert.deepEqual(tapStatus.home.ceiling,['reports.read'])
  // A person is granted explicit per-venue rights, never above the member venue's ceiling.
  const ga=await home.signIn('group-admin@example.test'),operators=await home.api('/auth/operators'),gaId=operators.find(p=>p.email==='group-admin@example.test').id
  await home.api('/api/group/admin',{operatorId:gaId,venues:{[linkId]:['reports.read','preshift.read']}},{status:409});await home.api('/api/group/admin',{operatorId:operators.find(p=>p.email==='home-manager@example.test').id,venues:{home:['reports.read']}},{status:409});await home.api('/api/group/admin',{operatorId:gaId,venues:{nowhere:['reports.read']}},{status:409})
  await home.api('/api/group/token',{},{as:ga,status:403})
  await home.api('/api/group/admin',{operatorId:gaId,venues:{home:['reports.read','preshift.read'],[linkId]:['reports.read']}})
  const token=(await home.api('/api/group/token',{},{as:ga,status:201})).result.token;assert.match(token,/^gt_[a-f0-9]{64}$/)
  const bearer=t=>({as:'',headers:{authorization:'Bearer '+t}})
  // The group admin reads both venues directly with one token, only the rights granted at each, and nothing else.
  const tapReport=await tap.api('/api/group/reports/reservations',undefined,bearer(token)),homeReport=await home.api('/api/group/reports/reservations',undefined,bearer(token))
  assert.equal(tapReport.venue,'Tap Room');assert.equal(homeReport.venue,'Home Bistro');assert.ok(!JSON.stringify([tapReport,homeReport]).includes('guest0@example.test'))
  assert.equal((await home.api('/api/group/preshift',undefined,bearer(token))).venue,'Home Bistro');await tap.api('/api/group/preshift',undefined,{...bearer(token),status:403})
  await tap.api('/api/group/reports/reservations',undefined,{...bearer('gt_'+'1'.repeat(64)),status:403});await tap.api('/api/group/reports/reservations',undefined,{as:'',status:401})
  for(const door of [tap,home]){await door.api('/api/state',undefined,{...bearer(token),status:401});await door.api('/api/commands',{command:'booking.status',payload:{}},{...bearer(token),status:401});await door.api('/api/group/reports/reservations',{},{...bearer(token),status:405})}
  await home.request('/api/backup',bearer(token)).then(r=>assert.equal(r.status,401));await tap.api('/api/group/introspect',{token},{as:'',status:200}).then(r=>assert.deepEqual(r,{active:false}))
  const linksCsv=await (await home.request('/api/business-export/group-links.csv')).text(),adminsCsv=await (await home.request('/api/business-export/group-admins.csv')).text()
  assert.ok(linksCsv.includes('https://tap.example.test')&&!/g[ilt]_[a-f0-9]{64}/.test(linksCsv)&&adminsCsv.includes(gaId)&&adminsCsv.includes('preshift.read'))
  assert.equal((await home.request('/api/business-export/group-admins.csv',{as:homeManager})).status,403)
  // The member refuses when the home cannot introspect; existing tokens follow reduced rights immediately.
  homeAvailable=false
  try{const offline=await tap.api('/api/group/reports/reservations',undefined,{...bearer(token),status:403});assert.ok(!JSON.stringify(offline).includes('Tap Room')&&!JSON.stringify(offline).includes('guest0@example.test'))}finally{homeAvailable=true}
  await tap.api('/api/group/reports/reservations',undefined,bearer(token))
  await home.api('/api/group/admin',{operatorId:gaId,venues:{home:['reports.read'],[linkId]:['reports.read']}})
  await home.api('/api/group/preshift',undefined,{...bearer(token),status:403});await tap.api('/api/group/reports/reservations',undefined,bearer(token))
  // Revocation stops access at once, at every venue, and an unrelated person never gains it.
  await home.api('/api/group/admin/revoke',{operatorId:gaId})
  for(const door of [tap,home])await door.api('/api/group/reports/reservations',undefined,{...bearer(token),status:403})
  await home.api('/api/group/admin',{operatorId:gaId,venues:{[linkId]:['reports.read']}});const fresh=(await home.api('/api/group/token',{},{as:ga,status:201})).result.token
  await tap.api('/api/group/reports/reservations',undefined,bearer(fresh));await home.api('/api/group/link/revoke',{linkId})
  await tap.api('/api/group/reports/reservations',undefined,{...bearer(fresh),status:403})
  assert.deepEqual((await home.api('/api/group')).admins,[],'Disconnecting a venue drops every grant that reached it')
  // Every grant is a recorded personal decision visible to the owner only; secrets never enter state, audit or backups.
  const ownerRows=(await home.api('/api/audit')).rows.filter(r=>r.action.startsWith('group.')),managerRows=(await home.api('/api/audit',undefined,{as:homeManager})).rows.filter(r=>r.action.startsWith('group.'))
  assert.ok(ownerRows.some(r=>r.action==='group.admin'&&JSON.stringify(r.changes).includes('reports.read')));assert.ok(managerRows.length>=4);assert.ok(!JSON.stringify(managerRows).includes('reports.read'))
  const archive=JSON.stringify(await home.api('/api/backup')),tapArchive=JSON.stringify(await tap.api('/api/backup'))
  for(const value of [invite.code,token,fresh])assert.ok(!archive.includes(value)&&!tapArchive.includes(value),'Secrets stay out of archives')
  assert.ok(!/g[ilt]_[a-f0-9]{64}/.test(archive+tapArchive),'No group secret of any kind is archived')
  await empty.api('/api/restore',{archive:JSON.parse(archive),confirm:'RESTORE'});assert.equal((await empty.api('/api/group')).standing,'none')
  await tap.api('/api/group/leave',{})
  assert.equal((await tap.api('/api/group')).standing,'none');await tap.api('/api/group/reports/reservations',undefined,{...bearer(token),status:403})
 }finally{await home.close();await tap.close();await empty.close()}
})
