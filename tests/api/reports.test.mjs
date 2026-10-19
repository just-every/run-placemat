import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'

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
 }finally{await h.close()}
})
