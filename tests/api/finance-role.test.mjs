import test from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest,service} from './harness.mjs'
import {paymentEdge} from './payment-fixture.mjs'

test('ROLE-004: a finance identity reconciles charges and refunds and exports finance records, but reaches no guest notes, floor, sheets or writes',async()=>{
 const edge=paymentEdge(),h=await installation({bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'},stripeEdge:edge.edge}),empty=await installation();try{
  const f=await service(h,{tables:3,seats:4,covers:80}),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(f.service.startAt))
  const booking=(await h.api('/api/public/book',publicGuest(f.service,0,{requestsAcknowledged:true,requests:{allergyNotes:'Shellfish'}}),{as:'',status:201})).result
  const chargeId=edge.charge(booking.id);await h.command('payment.charge-sync',{bookingId:booking.id,chargeId})
  await h.command('payment.refund',{bookingId:booking.id,chargeId,amountCents:4000,requestId:'owner-refund',reason:'Guest-requested deposit refund'})
  const people={};for(const [name,email,role] of [['finance','synthetic-placemat-finance@example.test'],['host','synthetic-placemat-fin-host@example.test'],['manager','synthetic-placemat-fin-manager@example.test','admin'],['member','synthetic-placemat-fin-member@example.test']])people[name]={email,cookie:await h.signIn(email,role)}
  const operators=await h.api('/auth/operators');for(const person of Object.values(people))person.id=operators.find(p=>p.email===person.email).id
  const as=name=>({as:people[name].cookie})
  await h.command('team.finance',{operatorId:people.finance.id,enabled:true},{...as('manager'),status:403});await h.command('team.host',{operatorId:people.host.id,enabled:true})
  await h.command('team.finance',{operatorId:people.host.id,enabled:true},{status:409});await h.command('team.finance',{operatorId:people.manager.id,enabled:true},{status:400})
  await h.command('team.finance',{operatorId:people.finance.id,enabled:true});await h.command('team.host',{operatorId:people.finance.id,enabled:true},{status:409});await h.command('team.server',{operatorId:people.finance.id,enabled:true},{status:409})
  // The permitted jobs: reconcile each charge against pending and succeeded refunds and export the finance records.
  const summary=await h.api('/api/finance',undefined,as('finance'));assert.equal(summary.charges.length,1);assert.deepEqual([summary.charges[0].amountCents,summary.charges[0].succeededCents,summary.charges[0].pendingCents,summary.charges[0].remainingCents],[15000,4000,0,11000]);assert.equal(summary.refunds[0].status,'succeeded')
  for(const kind of ['payment-requests','refund-charges','refunds','refund-events']){const r=await h.request('/api/finance/export/'+kind+'.csv',as('finance'));assert.equal(r.status,200,kind);const csv=await r.text();assert.ok(!/Shellfish|guest0@example\.test|checkout\.stripe\.com/.test(csv),kind);if(kind==='refund-charges')assert.ok(csv.includes(chargeId))}
  const page=await h.request('/finance',as('finance'));assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('$150.00')&&html.includes('$40.00')&&html.includes('$110.00'));assert.ok(!/Alex Rowan|Shellfish|guest0@example\.test/.test(html))
  const app=await h.request('/app',as('finance'));assert.equal(app.status,303);assert.equal(app.headers.get('location'),'/finance')
  // Every unrelated read and write is refused, including the guest sheet and kitchen across HTML, print and PDF, and refunds.
  const reads=['/api/state','/api/guests?search=Alex','/api/timeline?serviceId='+f.service.id,'/api/sections?serviceId='+f.service.id,'/preshift?date='+date,'/api/preshift?date='+date,'/api/preshift.pdf?date='+date,'/kitchen?serviceId='+f.service.id,'/api/kitchen?serviceId='+f.service.id,'/api/reports/reservations','/api/reports/reservations.csv','/api/business-export/guests.csv','/api/audit','/api/backup','/api/reminders.csv','/api/group']
  for(const path of reads){const r=await h.request(path,as('finance'));assert.equal(r.status,403,path);assert.ok(!/Alex Rowan|Shellfish|guest0@example\.test/.test(await r.text()),path)}
  assert.equal((await h.request('/api/finance/export/guests.csv',as('finance'))).status,404,'Only finance kinds are exportable')
  for(const [command,payload] of [['booking.stage',{bookingId:booking.id,stage:'seated'}],['booking.status',{bookingId:booking.id,status:'cancelled'}],['payment.refund',{bookingId:booking.id,chargeId,amountCents:100,requestId:'finance-refund',reason:'Not permitted'}],['payment.charge-sync',{bookingId:booking.id,chargeId}],['team.manager-limit',{operatorId:people.manager.id,refundLimitCents:500000}]])await h.command(command,payload,{...as('finance'),status:403})
  assert.equal((await h.request('/api/finance',as('finance'))).status,200)
  for(const name of ['member','manager','host'])assert.equal((await h.request('/api/finance',as(name))).status,403,name+' has no finance door');assert.equal((await h.request('/finance',{as:''})).status,401)
  assert.equal((await h.request('/api/finance/export/refunds.csv',as('member'))).status,403)
  // The grant survives backup and restore, and revoking it closes the doors at once.
  const archive=await h.api('/api/backup');await empty.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual((await empty.api('/api/state')).state.financeIds,[people.finance.id])
  assert.ok((await (await h.request('/api/business-export/venue.csv')).text()).includes(people.finance.id))
  await h.command('team.finance',{operatorId:people.finance.id,enabled:false});await h.api('/api/finance',undefined,{...as('finance'),status:403});assert.equal((await h.request('/api/state',as('finance'))).status,200,'A revoked finance identity returns to read-only member access')
 }finally{await h.close();await empty.close()}
})
