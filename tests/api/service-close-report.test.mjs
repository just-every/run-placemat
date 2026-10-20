import test from 'node:test'
import assert from 'node:assert/strict'
import {installation} from './harness.mjs'
import {closeReportService} from './service-close-report-fixture.mjs'

// Parse the public CSV, including quoted commas, so the proof reconciles actual exported rows.
function csvRecords(csv) {
 const rows=[],row=[];let value='',quoted=false
 for(let i=0;i<csv.length;i++) {
  const char=csv[i]
  if(char==='"'){if(quoted&&csv[i+1]==='"'){value+='"';i++}else quoted=!quoted}
  else if(char===','&&!quoted){row.push(value);value=''}
  else if(char==='\r'&&!quoted&&csv[i+1]==='\n'){row.push(value);rows.push([...row]);row.length=0;value='';i++}
  else value+=char
 }
 const [header,...data]=rows
 return data.map(values=>Object.fromEntries(header.map((name,index)=>[name,values[index]])))
}
function reconcile(report) {
 const sum=rows=>rows.reduce((covers,row)=>covers+row.partySize,0)
 for(const [key,predicate] of [
  ['booked',()=>true],['attended',row=>['seated','completed'].includes(row.status)],
  ['noShow',row=>row.status==='no-show'],['cancelled',row=>row.status==='cancelled'],['activeBooked',row=>row.status==='booked'],
 ]) {
  const rows=report.rows.filter(predicate),metric=report.summary[key]
  assert.equal(metric.bookings,rows.length);assert.equal(metric.covers,sum(rows))
  assert.deepEqual([...metric.bookingIds].sort(),rows.map(row=>row.bookingId).sort())
 }
}

test('REPORT-007 partial acceptance: atomic fixed close facts reconcile online no-shows, waitlist seats and walk-ins; later staff corrections stay beside the original',async()=>{
 const h=await installation()
 try {
  const fixture=await closeReportService(h),s=fixture.service,url='/api/reports/closed?serviceId='+s.id,csvUrl='/api/reports/closed.csv?serviceId='+s.id
  await h.api(url,undefined,{status:404})
  // An unrelated publication must not be mistaken for the service-close snapshot.
  await h.api('/api/reports/performance',{serviceId:s.id},{status:201})
  const closed=await h.command('service.close',{serviceId:s.id,reason:'Manager closed the service after reviewing recorded attendance'})
  const initial=await h.api(url),original=structuredClone(initial.original)
  assert.ok(initial.snapshotId);assert.deepEqual(initial.adjustments,[])
  assert.equal(original.closedAt,closed.closedAt);assert.equal(original.closedBy,closed.closedBy)
  assert.equal(original.performance.generatedAt,closed.closedAt);assert.equal(original.coverReport.generatedAt,closed.closedAt)
  reconcile(original.coverReport)
  assert.equal(original.coverReport.summary.booked.covers,10);assert.equal(original.coverReport.summary.noShow.covers,4);assert.equal(original.coverReport.summary.attended.covers,6)
  const sourceCovers=Object.fromEntries(['online','waitlist','walk-in'].map(source=>[source,original.coverReport.rows.filter(row=>row.source===source).reduce((sum,row)=>sum+row.partySize,0)]))
  assert.deepEqual(sourceCovers,{online:4,waitlist:4,'walk-in':2})
  assert.deepEqual(original.performance.rows.map(row=>row.bookingId).sort(),original.coverReport.rows.map(row=>row.bookingId).sort())
  assert.deepEqual([...original.performance.queue.seated.queueIds].sort(),fixture.waiting.map(row=>row.id).sort())
  const firstCsv=await h.request(csvUrl);assert.equal(firstCsv.status,200)
  const csv=await firstCsv.text(),records=csvRecords(csv)
  assert.equal(records.length,original.coverReport.rows.length)
  assert.equal(records.reduce((sum,row)=>sum+Number(row.bookedCovers),0),original.coverReport.summary.booked.covers)
  assert.equal(records.reduce((sum,row)=>sum+Number(row.noShowCovers),0),original.coverReport.summary.noShow.covers)
  for(const row of original.coverReport.rows) {
   const exported=records.find(record=>record.bookingId===row.bookingId)
   assert.equal(exported.source,row.source);assert.equal(exported.status,row.status);assert.equal(Number(exported.partySize),row.partySize)
  }
  const correction=await h.command('booking.stage',{bookingId:fixture.waitlistSeats[0].id,correctsEventId:fixture.correctionEventId,reason:'Course tap was accidental; party was seated, not ordering'})
  // Changing a terminal booking back into occupied capacity after close remains outside this slice.
  const completed=await h.command('booking.stage',{bookingId:fixture.waitlistSeats[1].id,stage:'completed',reason:'Staff observed departure after the report was closed'})
  const adjusted=await h.api(url)
  assert.equal(adjusted.snapshotId,initial.snapshotId);assert.deepEqual(adjusted.original,original)
  assert.equal(adjusted.adjustments.length,2)
  for(const change of [correction,completed]) {
   const adjustment=adjusted.adjustments.find(row=>row.eventId===change.event.id)
   assert.deepEqual(adjustment,{bookingId:change.event.bookingId,actor:change.event.actor,at:change.event.at,eventId:change.event.id,before:change.event.before,after:change.event.after})
   assert.ok(Number.isFinite(Date.parse(adjustment.at)))
  }
  assert.equal(adjusted.original.coverReport.rows.find(row=>row.bookingId===completed.id).status,'seated')
  assert.equal(adjusted.current.rows.find(row=>row.bookingId===completed.id).status,'completed')
  reconcile(adjusted.current)
  assert.equal(await (await h.request(csvUrl)).text(),csv,'Original exported statuses remain fixed after adjustments')
  await h.command('service.close',{serviceId:s.id,reason:'Duplicate close'},{status:409})
  assert.equal((await h.api(url)).snapshotId,initial.snapshotId)
  const member=await h.signIn('closed-reader@example.test'),key=(await h.api('/api/agent-keys',{name:'Report preparation key'})).result.key
  for(const path of [url,csvUrl]) {
   await h.api(path,undefined,{as:'',status:401})
   await h.api(path,undefined,{as:member,status:403})
   await h.api(path,undefined,{as:'',headers:{authorization:`Bearer ${key}`},status:403})
  }
 }finally{await h.close()}
})
