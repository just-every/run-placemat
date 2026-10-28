import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
import {performanceService} from './performance-fixture.mjs'

// Real commands and booking doors supply every row; reports never use a seeded store.
test('REPORT-001: venue-local shift filters, cover denominators, drilldowns and CSV reconcile through manager HTTP doors',async()=>{
 const h=await installation();try{
  await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/Los_Angeles'})
  const dining=await h.command('table.save',{label:'D1',area:'Dining room',seats:4,x:20,y:30})
  const patio=await h.command('table.save',{label:'P1',area:'Patio',seats:4,x:60,y:30})
  const next=new Date();next.setUTCFullYear(next.getUTCFullYear()+1)
  const year=next.getUTCFullYear(),day=`${year}-11-06`,utcDay=`${year}-11-07`
  async function publish(name,startAt,endAt){
   const s=await h.command('service.save',{name,startAt,endAt,turnMinutes:60,coverLimit:100})
   const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Review reporting service'})
   await h.command('proposal.approve',{proposalId:p.id});return s
  }
  // Both shifts belong to the local Nov 6 date although their instants are Nov 7 UTC.
  const dinner=await publish('Dinner',`${utcDay}T01:00:00Z`,`${utcDay}T04:00:00Z`)
  const late=await publish('Late dinner',`${utcDay}T05:00:00Z`,`${utcDay}T08:00:00Z`)
  const booked=[]
  for(let i=0;i<4;i++){
   const s=i<2?dinner:late,startAt=new Date(Date.parse(s.startAt)+(i%2)*3600000).toISOString()
   booked.push((await h.api('/api/public/book',publicGuest(s,i,{startAt,partySize:i%2?3:2}),{as:'',status:201})).result)
  }
  await h.command('booking.status',{bookingId:booked[0].id,status:'seated'})
  await h.command('booking.status',{bookingId:booked[0].id,status:'completed'})
  await h.command('booking.stage',{bookingId:booked[0].id,stage:'ready'})
  await h.command('booking.status',{bookingId:booked[1].id,status:'cancelled'})
  await h.command('booking.status',{bookingId:booked[2].id,status:'no-show'})
  const walkin=await h.command('booking.walkin',publicGuest(late,4,{startAt:late.startAt,partySize:4,tableIds:[patio.id]}))
  const manager=await h.signIn('report-manager@example.test','admin'),member=await h.signIn('report-reader@example.test')
  const key=(await h.api('/api/agent-keys',{name:'Report preparer'})).result
  for(const path of ['/api/reports/reservations','/api/reports/reservations.csv']){
   await h.api(path,undefined,{as:'',status:401})
   await h.api(path,undefined,{as:member,status:403})
   await h.api(path,undefined,{as:'',headers:{authorization:'Bearer '+key.key},status:403})
  }
  const query=`dateFrom=${day}&dateTo=${day}`,report=await h.api('/api/reports/reservations?'+query,undefined,{as:manager})
  assert.equal(report.rows.length,5);assert.ok(report.rows.every(r=>r.serviceDate===day))
  assert.equal(report.summary.booked.covers,14)
  assert.equal(report.summary.attended.covers,6)
  assert.equal(report.summary.cancelled.covers,3)
  assert.equal(report.summary.noShow.covers,2)
  assert.equal(report.summary.activeBooked.covers,3)
  assert.equal(report.summary.rates.cancelled.numerator,3);assert.equal(report.summary.rates.cancelled.denominator,14)
  assert.ok(Math.abs(report.summary.rates.cancelled.percentage-300/14)<0.01)
  assert.deepEqual(new Set(report.summary.attended.bookingIds),new Set([booked[0].id,walkin.id]))
  for(const metric of ['booked','attended','cancelled','noShow','activeBooked']){
   const summary=report.summary[metric],drill=report.rows.filter(r=>summary.bookingIds.includes(r.bookingId))
   assert.equal(drill.reduce((sum,r)=>sum+r.partySize,0),summary.covers)
   assert.equal(drill.length,summary.bookings)
  }
  const csv=await (await h.request('/api/reports/reservations.csv?'+query,{as:manager})).text()
  for(const row of report.rows)assert.ok(csv.includes(row.bookingId))
  assert.equal(csv.trim().split('\r\n').length,report.rows.length+1)
  const cells=line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1].replaceAll('""','"'))
  const [columns,...csvRows]=csv.trim().split('\r\n').map(cells)
  for(const metric of ['booked','attended','cancelled','noShow','activeBooked']){
   const covers=csvRows.reduce((sum,row)=>sum+Number(row[columns.indexOf(metric+'Covers')]),0)
   assert.equal(covers,report.summary[metric].covers,'CSV '+metric)
  }
  for(const metric of ['attended','cancelled','noShow']){
   assert.equal(report.summary.rates[metric].numerator,report.summary[metric].covers)
   assert.equal(report.summary.rates[metric].denominator,14)
  }
  assert.ok(!csv.includes('guest0@example.test'));assert.ok(!csv.includes('Alex Rowan'))
  const checks=[['serviceId='+dinner.id,[booked[0].id,booked[1].id]],['area=Patio',[walkin.id]],['source=walk-in',[walkin.id]],['status=no-show',[booked[2].id]],['partyMin=3&partyMax=3',[booked[1].id,booked[3].id]],['venue=Another%20restaurant',[]],['dateFrom='+utcDay,[]],['period=future',booked.map(b=>b.id).concat(walkin.id)],['period=past',[]],['period=current',[]]]
  for(const [filter,ids] of checks){const r=await h.api('/api/reports/reservations?'+filter);assert.deepEqual(new Set(r.rows.map(r=>r.bookingId)),new Set(ids),filter)}
  const combined=await h.api(`/api/reports/reservations?${query}&venue=Cedar%20%26%20Salt&serviceId=${late.id}&area=Patio&source=walk-in&status=seated&partyMin=4&partyMax=4`)
  assert.deepEqual(combined.rows.map(r=>r.bookingId),[walkin.id])
  const empty=await h.api('/api/reports/reservations?serviceId=unknown')
  assert.equal(empty.summary.booked.covers,0);assert.equal(empty.summary.rates.attended.percentage,null)
  for(const filter of ['dateFrom=not-a-date','dateFrom=2027-02-30','dateFrom=2027-12-01&dateTo=2027-01-01','partyMin=4&partyMax=2','partyMin=0','status=made-up','source=made-up','period=made-up'])await h.api('/api/reports/reservations?'+filter,undefined,{status:400})
  // Historical and currently running services use the same report, without pretending they are online bookings.
  const now=Date.now(),historical=await publish('Yesterday',new Date(now-86400000).toISOString(),new Date(now-80000000).toISOString())
  const past=await h.command('booking.walkin',publicGuest(historical,7,{tableIds:[dining.id]}))
  await h.command('booking.status',{bookingId:past.id,status:'completed'});await h.command('booking.stage',{bookingId:past.id,stage:'ready'})
  const current=await publish('Now',new Date(now-1800000).toISOString(),new Date(now+5400000).toISOString())
  const present=await h.command('booking.walkin',publicGuest(current,8,{tableIds:[dining.id]}))
  assert.deepEqual((await h.api('/api/reports/reservations?period=past')).rows.map(r=>r.bookingId),[past.id])
  assert.deepEqual((await h.api('/api/reports/reservations?period=current')).rows.map(r=>r.bookingId),[present.id])
  for(const b of [walkin,present]){await h.command('booking.status',{bookingId:b.id,status:'completed'});await h.command('booking.stage',{bookingId:b.id,stage:'ready'})}
  await h.command('combination.save',{tableIds:[dining.id,patio.id],capacity:8,accessTags:[],setupMinutes:0,enabled:true,adjacent:true})
  const joined=await publish('Combined areas',`${year}-12-04T01:00:00Z`,`${year}-12-04T04:00:00Z`)
  const combinedBooking=(await h.api('/api/public/book',publicGuest(joined,9,{partySize:6}),{as:'',status:201})).result
  const combinedReport=await h.api('/api/reports/reservations?serviceId='+joined.id)
  assert.equal(combinedReport.summary.booked.covers,6);assert.equal(combinedReport.rows.length,1)
  assert.deepEqual(combinedReport.rows[0].areas,['Dining room','Patio'])
  for(const area of ['Dining room','Patio'])assert.deepEqual((await h.api('/api/reports/reservations?serviceId='+joined.id+'&area='+encodeURIComponent(area))).rows.map(r=>r.bookingId),[combinedBooking.id])
  await h.command('booking.status',{bookingId:combinedBooking.id,status:'cancelled'})
  const waiting=await h.command('waitlist.add',publicGuest(joined,10))
  const seated=await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:joined.startAt})
  assert.deepEqual((await h.api('/api/reports/reservations?source=waitlist')).rows.map(r=>r.bookingId),[seated.id])
  // Parties above 20 are supported bookings; every size filter and the unfiltered report include them.
  const [b1,b2]=[await h.command('table.save',{label:'B1',area:'Banquet',seats:12,x:10,y:80}),await h.command('table.save',{label:'B2',area:'Banquet',seats:12,x:40,y:80})]
  await h.command('combination.save',{tableIds:[b1.id,b2.id],capacity:24,accessTags:[],setupMinutes:0,enabled:true,adjacent:true})
  const bigRule={minParty:1,maxParty:40,horizonDays:3650,leadMinutes:0,sameDayCutoff:'23:59',slotMinutes:15,inquiryAbove:40,blockedStarts:[]}
  const banquet=await h.command('service.save',{name:'Banquet',startAt:`${year}-12-10T18:00:00Z`,endAt:`${year}-12-10T23:00:00Z`,turnMinutes:120,coverLimit:100,bookingRules:{'walk-in':bigRule}})
  const banquetPlan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:banquet.id},reason:'Review banquet service'});await h.command('proposal.approve',{proposalId:banquetPlan.id})
  const party=await h.command('booking.walkin',publicGuest(banquet,11,{startAt:banquet.startAt,partySize:24,tableIds:[b1.id,b2.id]}))
  const sizes=async filter=>(await h.api('/api/reports/reservations?serviceId='+banquet.id+filter)).rows.map(r=>r.bookingId)
  for(const filter of ['','&partyMin=21','&partyMin=24&partyMax=24','&partyMax=500','&partyMin=24'])assert.deepEqual(await sizes(filter),[party.id],filter||'unfiltered')
  for(const filter of ['&partyMax=20','&partyMin=25'])assert.deepEqual(await sizes(filter),[],filter)
  assert.ok((await h.api('/api/reports/reservations')).rows.some(r=>r.bookingId===party.id&&r.partySize===24))
  assert.ok((await (await h.request('/api/reports/reservations.csv?partyMin=21')).text()).includes(party.id))
  assert.equal((await h.api('/api/reports/reservations?partyMin=21')).summary.booked.covers,24)
  for(const filter of ['partyMax=501','partyMin=1.5','partyMin=-1'])await h.api('/api/reports/reservations?'+filter,undefined,{status:400})
 }finally{await h.close()}
})

test('REPORT-002: two overrun histories, turn/wait distributions, abandonment, staffing, utilization and immutable publications through manager HTTP doors',async()=>{
 const h=await installation();try{
  const f=await performanceService(h),url='/api/reports/performance?serviceId='+f.service.id
  const manager=await h.signIn('performance-manager@example.test','admin'),member=await h.signIn('performance-reader@example.test')
  const key=(await h.api('/api/agent-keys',{name:'Report preparation'})).result
  for(const as of ['',member]){
   await h.api(url,undefined,{as,status:as?403:401})
   await h.api('/api/reports/performance',{serviceId:f.service.id},{as,status:as?403:401})
  }
  await h.api(url,undefined,{as:'',headers:{authorization:'Bearer '+key.key},status:403})
  await h.api('/api/reports/performance',{serviceId:f.service.id},{as:manager,headers:{origin:'https://other.example.test'},status:403})
  const {report:r}=await h.api(url,undefined,{as:manager})
  assert.equal(r.rows.length,4)
  assert.equal(r.distributions.actualTurns.sampleSize,3);assert.equal(r.distributions.actualTurns.missing,1)
  const missing=r.rows.find(row=>row.bookingId===f.upcoming.id)
  assert.equal(missing.actualTurnMinutes,null);assert.equal(missing.arrivalLatenessMinutes,null)
  for(const b of f.overruns){const row=r.rows.find(row=>row.bookingId===b.id)
   assert.ok(row.extended);assert.ok(row.departureDelayMinutes>0);assert.equal(row.turnHistory.length,1)
   assert.equal(row.expectedTurnMinutes,(Date.parse(b.endAt)-Date.parse(b.startAt))/60000)
   assert.equal(row.actualTurnMinutes,(Date.parse(row.actualDepartureAt)-Date.parse(row.actualSeatAt))/60000)
   assert.ok(row.serviceHistory.some(e=>e.after.status==='completed'))
   assert.ok(row.servingHistory.some(e=>e.action==='seated'));assert.ok(row.seatingAssignment)
  }
  for(const distribution of Object.values(r.distributions)){
   const values=distribution.values.map(v=>v.value).sort((a,b)=>a-b),n=values.length
   assert.equal(distribution.sampleSize,n)
   assert.equal(distribution.mean,n?values.reduce((a,b)=>a+b,0)/n:null)
   assert.equal(distribution.median,n?(values[Math.floor((n-1)/2)]+values[Math.floor(n/2)])/2:null)
   assert.equal(distribution.p90,n?values[Math.ceil(n*.9)-1]:null)
   for(const value of distribution.values)assert.ok(r.rows.some(row=>row.bookingId===value.id)||r.queue.rows.some(row=>row.queueId===value.id))
  }
  assert.equal(r.queue.abandoned.count,1);assert.deepEqual(r.abandoned.queueIds,[f.abandoned.id])
  assert.equal(r.queue.seated.count,1);assert.equal(r.distributions.actualWait.sampleSize,2)
  assert.equal(r.distributions.quotedWaitMin.sampleSize,2);assert.equal(r.distributions.quotedWaitMax.sampleSize,2)
  for(const q of r.queue.rows){
   assert.equal(q.actualWaitMinutes,(Date.parse(q.resolvedAt)-Date.parse(q.createdAt))/60000)
   assert.equal(q.quoteDeviationMinutes,q.actualWaitMinutes-q.quotedWaitMin)
   assert.equal(q.quoteSource,'staff-recorded');assert.ok(q.history.some(e=>e.actor&&e.at))
  }
  assert.equal(r.servers.find(s=>s.id===f.servers[0].id).attended.covers,4)
  assert.notEqual(r.rows.find(b=>b.bookingId===f.overruns[0].id).serverId,r.rows.find(b=>b.bookingId===f.overruns[0].id).seatingAssignment.serverId)
  assert.equal(r.servers.find(s=>s.id===f.servers[1].id).attended.covers,2)
  for(const group of [r.servers,r.sections])for(const row of group){
   assert.equal(row.attended.covers,row.attended.bookingIds.reduce((sum,id)=>sum+r.rows.find(b=>b.bookingId===id).partySize,0))
   assert.equal(row.attended.covers,row.seated.covers+row.completed.covers)
  }
  assert.equal(r.missingSeatingHistory.sampleSize,0)
  const available=f.tables.reduce((sum,t)=>sum+t.seats,0)*(Date.parse(f.service.endAt)-Date.parse(f.service.startAt))/60000
  assert.equal(r.utilization.availableSeatMinutes,available);assert.equal(r.utilization.sampleSize,3)
  const observed=r.rows.filter(b=>b.actualTurnMinutes!==null).reduce((sum,b)=>sum+b.tableIds.reduce((n,id)=>n+f.tables.find(t=>t.id===id).seats,0)*b.actualTurnMinutes,0)
  assert.ok(Math.abs(r.utilization.observedSeatMinutes-observed)<0.000001)
  assert.equal(r.utilization.ratio,r.utilization.observedSeatMinutes/available)
  const pacing=await h.api('/api/pacing?serviceId='+f.service.id)
  assert.deepEqual(r.pacing.intervals,pacing.intervals);assert.deepEqual(r.pacing.overrideBookingIds,pacing.overrideBookingIds)
  const published=await h.api('/api/reports/performance',{serviceId:f.service.id},{as:manager,status:201})
  const fixed=structuredClone(published.report),snapshot=published.publication.id
  const original=r.rows.find(b=>b.bookingId===f.overruns[0].id).serviceHistory.at(-1)
  await h.command('booking.stage',{bookingId:f.overruns[0].id,correctsEventId:original.id,reason:'Completion tapped early'})
  const changed=(await h.api(url)).report,corrected=changed.rows.find(b=>b.bookingId===f.overruns[0].id)
  assert.equal(corrected.actualTurnMinutes,null);assert.equal(changed.distributions.actualTurns.sampleSize,2)
  assert.equal(corrected.serviceHistory.at(-1).correctsEventId,original.id)
  assert.ok(corrected.serviceHistory.some(e=>e.id===original.id))
  const retained=await h.api('/api/reports/performance?snapshot='+snapshot)
  assert.deepEqual(retained.report,fixed);assert.equal(retained.changedSincePublication,true)
  const adjusted=await h.api('/api/reports/performance',{serviceId:f.service.id},{status:201})
  assert.notEqual(adjusted.publication.id,snapshot);assert.equal(adjusted.publications.length,2)
  assert.equal(adjusted.report.distributions.actualTurns.sampleSize,2)
  await h.command('booking.stage',{bookingId:f.overruns[0].id,stage:'completed'})
  await h.command('service.close',{serviceId:f.service.id,reason:'Supper ended'})
  const guestId=(await h.api('/api/state')).state.bookings.find(b=>b.id===f.overruns[0].id).guestId
  await h.command('guest.erase',{guestId,confirm:'ERASE'})
  const after=await h.api('/api/reports/performance?snapshot='+snapshot)
  assert.deepEqual(after.report,fixed)
  for(const value of ['Priya Shah','guest0@example.test','2025550101','Party is finishing dessert','Completion tapped early'])assert.ok(!JSON.stringify(after).includes(value))
  await h.api('/api/reports/performance?serviceId=unknown',undefined,{status:404})
  await h.api('/api/reports/performance?snapshot=unknown',undefined,{status:404})
 }finally{await h.close()}
})

test('REPORT-002: published service facts survive owner archive round-trip without guest values',async()=>{
 const h=await installation();let destination
 try{
  const {service}=await performanceService(h)
  const saved=await h.api('/api/reports/performance',{serviceId:service.id},{status:201})
  const archive=await h.api('/api/backup')
  destination=await installation();await destination.api('/api/restore',{archive,confirm:'RESTORE'})
  const restored=await destination.api('/api/reports/performance?snapshot='+saved.publication.id)
  assert.deepEqual(restored.report,saved.report);assert.deepEqual(restored.publication,saved.publication)
  assert.ok(!JSON.stringify(restored.report).includes('Priya Shah'))
 }finally{await destination?.close();await h.close()}
})

// REPORT-005 exercises native sessions, two real venue Workers and their public report doors.
test('Report exports retain service scopes, future bookings and historical visits without disclosing personal fields after erasure',async()=>{
 const {publishReportService}=await import('./report-schedule-fixture.mjs'),h=await installation()
 try{
  await h.command('venue.update',{name:'Report venue',timezone:'America/Los_Angeles'})
  const table=await h.command('table.save',{label:'R1',seats:4,x:20,y:30})
  const future=await publishReportService(h,'Future dinner','2031-11-03T01:00:00Z')
  const reservation=(await h.api('/api/public/book',publicGuest(future,0),{as:'',status:201})).result
  const past=await publishReportService(h,'Historical dinner','2020-11-03T01:00:00Z')
  const visit=await h.command('booking.walkin',publicGuest(past,1,{tableIds:[table.id]}))
  await h.command('booking.status',{bookingId:visit.id,status:'completed'});await h.command('booking.stage',{bookingId:visit.id,stage:'ready'})
  const manager=await h.signIn('synthetic-placemat-report-manager@example.test','admin'),member=await h.signIn('synthetic-placemat-report-member@example.test')
  const download=async(query,as=manager)=>{const response=await h.request('/api/report-export.csv?'+query,{as});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');return response.text()}
  const futureCsv=await download('period=future'),visitCsv=await download('kind=visits&period=past')
  assert.ok(futureCsv.includes(reservation.id)&&!futureCsv.includes(visit.id));assert.ok(visitCsv.includes(visit.id)&&!visitCsv.includes(reservation.id))
  for(const personal of ['Alex Rowan','Sam Patel','guest0@example.test','guest1@example.test'])assert.ok(!(futureCsv+visitCsv).includes(personal))
  for(const as of ['',member])assert.equal((await h.request('/api/report-export.csv',{as})).status,as?403:401)
  for(const kind of ['guests','finance'])await h.api('/api/report-export.csv?kind='+kind,undefined,{as:manager,status:403})
  const managerId=(await h.api('/auth/operators')).find(p=>p.email==='synthetic-placemat-report-manager@example.test').id
  await h.command('team.reports',{operatorId:managerId,serviceIds:[past.id]})
  await h.api('/api/report-export.csv',undefined,{as:manager,status:403})
  assert.ok((await download('kind=visits&serviceId='+past.id)).includes(visit.id))
  await h.api('/api/report-export.csv?serviceId='+future.id,undefined,{as:manager,status:403})
  const guestId=(await h.api('/api/state')).state.bookings.find(b=>b.id===visit.id).guestId
  await h.command('guest.erase',{guestId,confirm:'ERASE'})
  assert.ok(!(await download('kind=visits&serviceId='+past.id)).includes('guest1@example.test'))
 }finally{await h.close()}
})

test('REPORT-005: group comparisons use identical venue-local date labels and fail closed when any current grant or venue is unavailable',async()=>{
 const {reportGroup,reportDay}=await import('./report-schedule-fixture.mjs'),f=await reportGroup()
 try{
  const query=new URLSearchParams({dateFrom:reportDay,dateTo:reportDay});for(const id of f.venueIds)query.append('venueId',id)
  const path='/api/group-comparison?'+query,result=await f.home.api(path,undefined,{as:f.recipient})
  assert.deepEqual(result.locations.map(r=>[r.venue,r.timezone,r.bookedCovers]),[['Home Bistro','America/Los_Angeles',2],['Tap Room','Australia/Brisbane',2]])
  const response=await f.home.request(path+'&format=csv',{as:f.recipient}),csv=await response.text();assert.equal(response.status,200);assert.ok(csv.includes(reportDay)&&!csv.includes('guest0@example.test'))
  assert.equal((await f.home.request(path,{as:f.other})).status,403)
  f.setAvailable(false);await f.home.api(path,undefined,{as:f.recipient,status:403});f.setAvailable(true)
  await f.home.api('/api/group/admin/revoke',{operatorId:f.recipientId})
  const denied=await f.home.api(path,undefined,{as:f.recipient,status:403});assert.ok(!JSON.stringify(denied).includes('Tap Room'))
 }finally{await f.close()}
})

test('REPORT-009: weekly group delivery requires explicit recipient approval, authenticates links and blocks every attempt after recipient or schedule-owner revocation',async()=>{
 const {reportGroup,firstDue}=await import('./report-schedule-fixture.mjs'),f=await reportGroup({bindings:{MAIL_PROVIDER:'sendgrid',MAIL_API_KEY:'synthetic-placemat-1'},reportMailEdge:async()=>new Response(null,{status:202,headers:{'x-message-id':'synthetic-placemat-1'}})})
 try{
  await f.home.api('/api/report-schedules',{recipientId:f.recipientId,venueIds:f.venueIds,nextAt:firstDue},{status:400})
  const schedule=await f.approve()
  assert.equal((await f.home.api('/api/report-schedules')).schedules.length,1)
  for(const as of ['',f.recipient,f.other])await f.home.api('/api/report-schedules',undefined,{as,status:as?403:401})
  await f.tick();const sent=f.mail.messages.filter(m=>m.subject==='Your weekly group cover report');assert.equal(sent.length,1)
  assert.ok(!JSON.stringify(sent[0]).includes('bookedCovers')&&!JSON.stringify(sent[0]).includes('guest0@example.test'))
  const link=new URL(sent[0].text.match(/https:\/\/[^\s]+/)[0]),path=link.pathname
  assert.equal(link.search,'');assert.equal(link.hash,'')
  for(const as of ['',f.other,f.home.cookie]){const denied=await f.home.api(path,undefined,{as,status:as?403:401});assert.ok(!JSON.stringify(denied).includes('Home Bistro'))}
  assert.ok((await(await f.home.request(path,{as:f.recipient})).text()).includes('Home Bistro'))
  await f.tick();assert.equal(f.mail.messages.filter(m=>m.subject==='Your weekly group cover report').length,1,'Durable due claim prevents a repeated send')
  await f.home.api('/api/group/admin/revoke',{operatorId:f.recipientId})
  await f.home.api(path,undefined,{as:f.recipient,status:403})
  await f.tick('2031-11-10T18:00:00.000Z');assert.equal(f.mail.messages.filter(m=>m.subject==='Your weekly group cover report').length,1)
  assert.ok((await f.home.api('/api/report-schedules')).deliveries.some(d=>d.state==='blocked'))
  await f.grant();await f.home.api('/auth/operator/status',{operatorId:f.recipientId,status:'inactive'})
  await f.tick('2031-11-17T18:00:00.000Z');assert.equal(f.mail.messages.filter(m=>m.subject==='Your weekly group cover report').length,1)
  await f.home.api('/auth/operator/status',{operatorId:f.recipientId,status:'active'});f.recipient=await f.signIn('synthetic-placemat-group@example.test')
  const owned=(await f.home.api('/api/report-schedules',{recipientId:f.recipientId,venueIds:f.venueIds,nextAt:firstDue,acknowledged:true},{as:f.manager,status:201})).id
  await f.home.api('/auth/operator/status',{operatorId:f.managerId,status:'inactive'})
  await f.tick();assert.equal(f.mail.messages.filter(m=>m.subject==='Your weekly group cover report').length,1)
  assert.ok((await f.home.api('/api/report-schedules')).deliveries.some(d=>d.schedule_id===owned&&d.state==='blocked'))
  const audit=(await f.home.api('/api/audit')).rows
  for(const action of ['report.recipient-approved','report.link-refused','report.recheck-refused'])assert.ok(audit.some(e=>e.action===action))
  await f.home.api('/api/report-schedules/stop',{scheduleId:schedule.id});await f.home.api(path,undefined,{as:f.recipient,status:403})
  const archive=await f.home.api('/api/backup');for(const table of ['pm_report_schedules','pm_report_deliveries'])assert.ok(archive[0].excludedTables.includes(table))
  assert.ok(!JSON.stringify(archive.filter(l=>l.kind==='part')).includes('recipient_hash'))
  for(const kind of ['report-schedules','report-deliveries']){const csv=await(await f.home.request('/api/business-export/'+kind+'.csv')).text();assert.ok(csv.includes(schedule.id));assert.ok(!csv.includes('recipient_hash'))}
  const restored=await installation();try{await restored.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual((await restored.api('/api/report-schedules')).schedules,[])}finally{await restored.close()}
 }finally{await f.close()}
})

test('REPORT-009: uncertain report submissions stay unconfirmed across scheduler replay and require an explicit manual resend with fresh authority',async()=>{
 const {reportGroup,firstDue}=await import('./report-schedule-fixture.mjs'),f=await reportGroup()
 try{
  await f.home.api('/api/report-schedules',{recipientId:f.recipientId,venueIds:f.venueIds,nextAt:firstDue,acknowledged:true},{as:f.manager,status:403})
  assert.ok((await f.home.api('/api/audit')).rows.some(e=>e.action==='report.recipient-refused'&&e.actor===f.managerId))
  await f.approve({nextAt:'2032-11-03T18:00:00.000Z'})
  const schedule=await f.home.api('/api/report-schedules',{recipientId:f.recipientId,venueIds:f.venueIds,nextAt:firstDue,acknowledged:true},{as:f.manager,status:201});f.mail.uncertain=true;await f.tick()
  const deliveries=(await f.home.api('/api/report-schedules')).deliveries,attempt=deliveries[0]
  assert.equal(attempt.state,'delivery unconfirmed');assert.equal(f.mail.messages.filter(m=>m.subject==='Your weekly group cover report').length,1)
  await f.tick();assert.equal(f.mail.messages.filter(m=>m.subject==='Your weekly group cover report').length,1)
  await f.home.api('/api/report-schedules/resend',{scheduleId:schedule.id,deliveryId:attempt.id},{status:400})
  const ownerId=(await f.home.api('/auth/operators')).find(p=>p.role==='owner').id
  f.mail.uncertain=false;await f.home.api('/api/report-schedules/resend',{scheduleId:schedule.id,deliveryId:attempt.id,acknowledged:true})
  assert.ok((await f.home.api('/api/audit')).rows.some(e=>e.action==='report.manual-resend-approved'&&e.actor===ownerId))
  assert.equal(f.mail.messages.filter(m=>m.subject==='Your weekly group cover report').length,2)
  assert.ok((await f.home.api('/api/report-schedules')).deliveries.some(d=>d.state==='provider accepted'))
  await f.home.api('/api/group/admin/revoke',{operatorId:f.recipientId})
  await f.home.api('/api/report-schedules/resend',{scheduleId:schedule.id,deliveryId:attempt.id,acknowledged:true})
  assert.equal(f.mail.messages.filter(m=>m.subject==='Your weekly group cover report').length,2)
  assert.ok((await f.home.api('/api/audit')).rows.some(e=>e.action==='report.recheck-refused'))
 }finally{await f.close()}
})

test('REPORT-008: recurring native reports recheck purpose, service scope, consent facts and erasure on delivery, open and replay',async()=>{
 const {reportGroup,firstDue}=await import('./report-schedule-fixture.mjs'),{paymentEdge}=await import('./payment-fixture.mjs')
 const edge=paymentEdge(),f=await reportGroup({bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1'},stripeEdge:edge.edge})
 try{
  const owner=(await f.home.api('/auth/operators')).find(p=>p.role==='owner'),booking=f.bookings[0],state=(await f.home.api('/api/state')).state,serviceId=state.bookings.find(b=>b.id===booking.id).serviceId
  const phone=await f.home.command('booking.phone',{serviceId,startAt:new Date(Date.parse(state.services.find(s=>s.id===serviceId).startAt)+90*60000).toISOString(),name:'Synthetic consent guest',phone:'2025550118',partySize:2,staffIntake:{source:'phone',contactPreference:'none',confirmationConsent:false}})
  const chargeId=edge.charge(booking.id);await f.home.command('payment.charge-sync',{bookingId:booking.id,chargeId})
  await f.home.command('payment.refund',{bookingId:booking.id,chargeId,amountCents:4000,requestId:'synthetic-placemat-refund',reason:'Reviewed refund'})
  const finance=await f.signIn('synthetic-placemat-finance'+String.fromCharCode(64)+'example.test'),financeId=(await f.home.api('/auth/operators')).find(p=>p.email.startsWith('synthetic-placemat-finance')).id
  await f.home.command('team.finance',{operatorId:financeId,enabled:true})
  await f.home.command('team.reports',{operatorId:f.managerId,serviceIds:[serviceId]})
  const schedule=(reportKind,recipientId,extra={})=>f.home.api('/api/report-schedules',{reportKind,recipientId,venueIds:['home'],nextAt:firstDue,acknowledged:true,...extra},{status:201})
  for(const reportKind of ['guests','finance','reservations'])await f.home.api('/api/report-schedules',{reportKind,recipientId:f.managerId,venueIds:['home'],nextAt:firstDue,acknowledged:true},{status:403})
  await f.home.api('/api/report-schedules',{reportKind:'reservations',recipientId:f.managerId,venueIds:f.venueIds,nextAt:firstDue,acknowledged:true},{status:400})
  const reservation=await schedule('reservations',f.managerId,{serviceId}),guest=await schedule('guests',owner.id),money=await schedule('finance',financeId)
  await f.tick()
  const deliveries=(await f.home.api('/api/report-schedules')).deliveries
  assert.equal(deliveries.length,3);assert.deepEqual(deliveries.map(d=>d.state),['provider accepted','provider accepted','provider accepted'])
  const path=s=>'/api/report-deliveries/'+deliveries.find(d=>d.schedule_id===s.id).id+'.csv'
  const download=async(s,as)=>{const r=await f.home.request(path(s),{as});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');return r.text()}
  const reservations=await download(reservation,f.manager),guests=await download(guest,f.home.cookie),financeCsv=await download(money,finance)
  assert.ok(reservations.includes(booking.id));assert.ok(!reservations.includes('Alex Rowan'))
  assert.ok(guests.includes('Alex Rowan'));assert.ok(guests.includes('"not recorded","not recorded","Not recorded"'),'No contact or marketing permission is manufactured')
  assert.ok(financeCsv.includes('"charge","'+booking.id+'","'+chargeId+'","15000"'))
  assert.ok(financeCsv.includes('"4000"')&&financeCsv.includes('"11000"'));assert.ok(!financeCsv.includes('Alex Rowan')&&!financeCsv.includes('Reviewed refund'))
  assert.ok(guests.includes(phone.id)&&guests.includes('"false","none","Not recorded"'),'Declined purpose-specific contact stays declined')
  for(const [kind,value] of [['guests','Alex Rowan'],['finance',chargeId]]){
   const future=await f.home.request('/api/report-export.csv?kind='+kind+'&period=future'),past=await f.home.request('/api/report-export.csv?kind='+kind+'&period=past')
   assert.equal(future.status,200);assert.equal(past.status,200);assert.ok((await future.text()).includes(value));assert.ok(!(await past.text()).includes(value))
  }
  assert.deepEqual((await f.home.api('/api/state')).state.bookings.find(b=>b.id===phone.id).staffIntake,{source:'phone',contactPreference:'none',confirmationConsent:false})
  assert.equal(f.mail.messages.filter(m=>m.subject.startsWith('Your weekly ')).length,3)
  for(const message of f.mail.messages.filter(m=>m.subject.startsWith('Your weekly ')))assert.ok(!message.text.includes('Alex Rowan')&&!message.text.includes(chargeId),'Only authenticated links leave the installation')
  for(const [s,as] of [[guest,f.manager],[guest,finance],[money,f.manager],[reservation,f.other],[money,'']])await f.home.api(path(s),undefined,{as,status:as?403:401})
  const personal=(await f.home.api('/api/state')).state.bookings.find(b=>b.id===booking.id).guestId
  await f.home.command('guest.erase',{guestId:personal,confirm:'ERASE'})
  assert.ok(!(await download(guest,f.home.cookie)).includes(booking.id),'Erased guest rows leave the guest report')
  assert.ok((await download(money,finance)).includes('"11000"'),'Erasure preserves financial facts without personal fields')
  await f.tick();assert.equal(f.mail.messages.filter(m=>m.subject.startsWith('Your weekly ')).length,3,'Replayed captures never resend')
  await f.home.command('team.finance',{operatorId:financeId,enabled:false});await f.home.command('team.reports',{operatorId:f.managerId,serviceIds:[]})
  await f.home.api(path(money),undefined,{as:finance,status:403});await f.home.api(path(reservation),undefined,{as:f.manager,status:403})
  await f.tick('2031-11-10T18:00:00.000Z')
  assert.equal(f.mail.messages.filter(m=>m.subject==='Your weekly finance report').length,1)
  assert.equal(f.mail.messages.filter(m=>m.subject==='Your weekly reservation report').length,1)
  const later=(await f.home.api('/api/report-schedules')).deliveries
  for(const s of [reservation,money])assert.equal(later.find(d=>d.schedule_id===s.id&&d.due_at!==firstDue).state,'blocked')
  const guestAttempt=later.find(d=>d.schedule_id===guest.id&&d.due_at!==firstDue),erased=await f.home.request('/api/report-deliveries/'+guestAttempt.id+'.csv')
  assert.equal(erased.status,200);assert.ok(!(await erased.text()).includes('Alex Rowan'))
  await f.home.api('/api/report-schedules/stop',{scheduleId:guest.id});await f.home.api(path(guest),undefined,{status:403})
  const archive=await f.home.api('/api/backup'),restored=await installation()
  try{await restored.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual((await restored.api('/api/report-schedules')).schedules,[])}finally{await restored.close()}
 }finally{await f.close()}
})
