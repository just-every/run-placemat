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
