import test from 'node:test'
import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
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
  const archive=await h.api('/api/backup'),restored=await installation()
  try {
   await restored.api('/api/restore',{archive,confirm:'RESTORE'})
   const copy=await restored.api(url)
   assert.deepEqual(copy.original,original);assert.deepEqual(copy.adjustments,adjusted.adjustments)
   assert.equal(await (await restored.request(csvUrl)).text(),csv)
  }finally{await restored.close()}
  await h.command('guest.erase',{guestId:fixture.noShows[0].guestId,confirm:'ERASE'})
  assert.deepEqual((await h.api(url)).original,original,'Guest-free original facts survive erasure without personal values')
  assert.ok(!JSON.stringify(original).includes('guest0@example.test'))
  const member=await h.signIn('closed-reader@example.test'),key=(await h.api('/api/agent-keys',{name:'Report preparation key'})).result.key
  for(const path of [url,csvUrl]) {
   await h.api(path,undefined,{as:'',status:401})
   await h.api(path,undefined,{as:member,status:403})
   await h.api(path,undefined,{as:'',headers:{authorization:`Bearer ${key}`},status:403})
  }
 }finally{await h.close()}
})

// Structural PDF check: header, trailer, a valid xref whose offsets land on their objects, and the page text.
function pdfText(pdf) {
 assert.ok(pdf.startsWith('%PDF-1.4\n'));assert.ok(pdf.endsWith('%%EOF\n'))
 const xref=Number(pdf.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);assert.ok(pdf.startsWith('xref\n',xref))
 const offsets=[...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m=>Number(m[1]))
 offsets.forEach((offset,i)=>assert.ok(pdf.startsWith(`${i+1} 0 obj\n`,offset),`object ${i+1} sits at its xref offset`))
 return [...pdf.matchAll(/\((.*)\) Tj/g)].map(m=>m[1].replace(/\\([()\\])/g,'$1').replace(/\\(\d{3})/g,(_,o)=>String.fromCharCode(parseInt(o,8)))).join('\n')
}

test('REPORT-007: seated refills of freed tables are the only recovered covers; zero fee figures remain distinct from older unrecorded snapshots; the fixed report prints as PDF and CSV and stays unchanged beside later adjustments',async()=>{
 const h=await installation()
 try {
  const fixture=await closeReportService(h),s=fixture.service,q='?serviceId='+s.id
  const tables=async id=>(await h.api('/api/state')).state.bookings.find(b=>b.id===id).tableIds
  const live=async()=>(await h.api('/api/reports/performance'+q)).recovery
  // Two cancellations whose freed tables are rebooked online: one party is seated before close, the other never is.
  const pairs=[]
  for(const i of [5,7]) {
   const cancelled=(await h.api('/api/public/book',publicGuest(s,i),{as:'',status:201})).result
   const release=await h.command('booking.stage',{bookingId:cancelled.id,stage:'cancelled',reason:'Guest phoned to cancel'})
   const rebooked=(await h.api('/api/public/book',publicGuest(s,i+1),{as:'',status:201})).result
   assert.deepEqual(await tables(rebooked.id),await tables(cancelled.id),'the online rebooking holds the cancelled party\'s freed table')
   pairs.push({cancelled,rebooked,releasedAt:release.event.at})
  }
  let recovery=await live(),freed=id=>recovery.freed.find(f=>f.bookingId===id)
  assert.deepEqual([recovery.covers,freed(pairs[0].cancelled.id).replacements,freed(pairs[0].cancelled.id).notSeatedBookingIds],[4,[],[pairs[0].rebooked.id]],'a refill booked on the freed table does not count before its party is seated')
  await h.command('booking.stage',{bookingId:pairs[0].rebooked.id,stage:'seated',reason:'Rebooked party arrived and was seated'})
  recovery=await live()
  assert.deepEqual([recovery.covers,freed(pairs[0].cancelled.id).replacements.map(p=>[p.bookingId,p.recoveredCovers])],[6,[[pairs[0].rebooked.id,2]]],'once seated, the refill counts')
  await h.command('service.close',{serviceId:s.id,reason:'Manager closed the service after reviewing recorded attendance'})
  const closed=await h.api('/api/reports/closed'+q),{fees,coverReport}=closed.original;recovery=closed.original.recovery
  assert.deepEqual([coverReport.summary.booked.covers,coverReport.summary.noShow.covers,coverReport.summary.cancelled.covers,coverReport.summary.attended.covers,coverReport.summary.activeBooked.covers],[18,4,4,8,2])
  assert.deepEqual([recovery.covers,recovery.freedCovers,recovery.replacementParties,recovery.fromNoShows,recovery.fromCancellations],[6,8,3,4,2])
  const state=(await h.api('/api/state')).state,releasedAt=id=>state.serviceEvents.findLast(e=>e.bookingId===id&&e.after.bookingStatus==='no-show').at
  assert.deepEqual(recovery.freed.map(f=>[f.bookingId,f.status,f.releasedAt,f.recoveredCovers,f.replacements.map(p=>[p.bookingId,p.source,p.recoveredCovers,p.seatedBy]),f.notSeatedBookingIds]).sort(),[
   ...fixture.noShows.map((b,i)=>[b.id,'no-show',releasedAt(b.id),2,[[fixture.waitlistSeats[i].id,'waitlist',2,'staff-recorded']],[]]),
   [pairs[0].cancelled.id,'cancelled',pairs[0].releasedAt,2,[[pairs[0].rebooked.id,'online',2,'staff-recorded']],[]],
   [pairs[1].cancelled.id,'cancelled',pairs[1].releasedAt,0,[],[pairs[1].rebooked.id]],
  ].sort(),'each seated refill is credited to the reservation whose table it took; the party still booked at close is listed, never counted')
  assert.deepEqual([...recovery.bookingIds].sort(),[...fixture.noShows.map(b=>b.id),...fixture.waitlistSeats.map(b=>b.id),pairs[0].cancelled.id,pairs[0].rebooked.id].sort(),'the figure drills to its reservations')
  assert.ok(!recovery.bookingIds.includes(fixture.walkin.id),'a walk-in on a table nobody freed recovers nothing')
  assert.equal(fees.recorded,true);assert.deepEqual([fees.chargedCents,fees.waivedCents,fees.refundedCents,fees.pendingCents,fees.rows],[0,0,0,0,[]])
  // The CSV rows reconcile to every figure, including recovered covers and what each refill recovered.
  const csv=await (await h.request('/api/reports/closed.csv'+q)).text(),records=csvRecords(csv)
  assert.equal(records.reduce((n,r)=>n+Number(r.recoveredCovers),0),recovery.covers)
  assert.deepEqual(records.filter(r=>r.recoversBookingId).map(r=>[r.bookingId,r.recoversBookingId]).sort(),[...fixture.waitlistSeats.map((b,i)=>[b.id,fixture.noShows[i].id]),[pairs[0].rebooked.id,pairs[0].cancelled.id]].sort())
  for(const [key,column] of [['booked','bookedCovers'],['attended','attendedCovers'],['cancelled','cancelledCovers'],['noShow','noShowCovers']])assert.equal(records.reduce((n,r)=>n+Number(r[column]),0),coverReport.summary[key].covers)
  // The PDF carries the same fixed figures with denominators and every reservation.
  const pdfResponse=await h.request('/api/reports/closed.pdf'+q)
  assert.equal(pdfResponse.status,200);assert.equal(pdfResponse.headers.get('content-type'),'application/pdf');assert.match(pdfResponse.headers.get('content-disposition'),/attachment; filename="placemat-service-close.pdf"/)
  const text=pdfText(await pdfResponse.text())
  for(const line of ['End-of-service report','Cedar & Salt · Friday dinner','Booked: 18 covers (9 reservations, including cancellations and no-shows)','Attended: 8 / 18 covers (44.4%)','No-show: 4 / 18 covers (22.2%)','Cancelled: 4 / 18 covers (22.2%)','Recovered from cancellations and no-shows: 6 / 8 freed covers by 3 seated replacement parties','Fees charged, waived and refunded: Charged $0.00 USD; waived $0.00 USD; refunded $0.00 USD; pending $0.00 USD.','Pacing overrides (SERVICE-007): 0 reservations','Observations after close (0)'])
   assert.ok(text.includes(line),`PDF shows: ${line}`)
  for(const row of coverReport.rows)assert.ok(text.includes(`ref ${row.bookingId}`),'every reservation is listed in the PDF')
  assert.match(text,/Average actual turn: .* against expected 90\.00 min/)
  // A status recorded after close is a dated adjustment beside the original; the original figures, CSV and PDF stay fixed.
  const completed=await h.command('booking.stage',{bookingId:pairs[0].rebooked.id,stage:'completed',reason:'Staff observed departure after the report was closed'})
  const after=await h.api('/api/reports/closed'+q)
  assert.deepEqual(after.original,closed.original)
  assert.deepEqual(after.adjustments.map(a=>[a.eventId,a.actor,a.at,a.after.bookingStatus]),[[completed.event.id,completed.event.actor,completed.event.at,'completed']])
  assert.equal(await (await h.request('/api/reports/closed.csv'+q)).text(),csv,'the original CSV is unchanged')
  const later=pdfText(await (await h.request('/api/reports/closed.pdf'+q)).text())
  assert.ok(later.includes('Recovered from cancellations and no-shows: 6 / 8 freed covers')&&later.includes('Observations after close (1)')&&later.includes(`ref ${pairs[0].rebooked.id} · `),'the PDF keeps the original figures and lists the dated adjustment beside them')
  const member=await h.signIn('pdf-reader@example.test'),key=(await h.api('/api/agent-keys',{name:'PDF preparation key'})).result.key
  await h.api('/api/reports/closed.pdf'+q,undefined,{as:'',status:401});await h.api('/api/reports/closed.pdf'+q,undefined,{as:member,status:403})
  await h.api('/api/reports/closed.pdf'+q,undefined,{as:'',headers:{authorization:`Bearer ${key}`},status:403})
 }finally{await h.close()}
})
