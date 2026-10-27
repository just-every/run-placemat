import assert from 'node:assert/strict'
import {makePart,ContentVerifier,ArchiveVerifier} from '../../src/modules/portability/format.mjs'
import {csvRecords} from './business-fixture.mjs'

export const archiveRows=(archive,table)=>archive.filter(p=>p.kind==='part').flatMap(p=>p.items).filter(i=>i.table===table).map(i=>i.row)
const download=async(h,kind)=>csvRecords(await (await h.request('/api/business-export/'+kind+'.csv')).text())
const records=rows=>rows.map(row=>JSON.parse(row.data_json))
async function changedArchive(archive,change){
 const invalid=structuredClone(archive);change(invalid)
 const content=new ContentVerifier(invalid[0]),integrity=new ArchiveVerifier(invalid[0])
 for(let i=1;i<invalid.length-1;i++){
  invalid[i]=await makePart(invalid[i].index,invalid[i].items);integrity.add(invalid[i])
  for(const item of invalid[i].items)content.add(item)
 }
 invalid.at(-1).contentHash=content.digest();invalid.at(-1).archiveHash=integrity.digest()
 return invalid
}
export async function assertDinerPortability(h,restored,archive,{account,bookings,guestId,otherGuestId,at,secrets}){
 const expectedAccount={id:account.id,email:'guest0@example.test',created_at:at,updated_at:at,favorite:1,preferences:'synthetic-placemat-1'}
 const expectedLinks=bookings.map(booking_id=>({account_id:account.id,booking_id,guest_id:guestId,verified_at:at})).sort((a,b)=>a.booking_id.localeCompare(b.booking_id))
 const accounts=await download(h,'diner-accounts'),links=await download(h,'diner-bookings')
 assert.equal(accounts.length,1);assert.equal(links.length,2,'Both individually verified booking links are portable')
 assert.deepEqual(records(accounts),[expectedAccount]);assert.deepEqual(records(links),expectedLinks)
 assert.deepEqual(accounts.map(({csv_version,data_json,...row})=>row),[{...expectedAccount,favorite:'1'}])
 assert.deepEqual(links.map(({csv_version,data_json,...row})=>row),expectedLinks)
 assert.deepEqual(archiveRows(archive,'pm_diner_accounts'),[expectedAccount])
 assert.deepEqual(archiveRows(archive,'pm_diner_bookings').sort((a,b)=>a.booking_id.localeCompare(b.booking_id)),expectedLinks)
 for(const table of ['pm_diner_challenges','pm_diner_sessions','pm_diner_mail_limits']){
  assert.ok(archive[0].excludedTables.includes(table));assert.deepEqual(archiveRows(archive,table),[])
 }
 for(const secret of secrets)assert.ok(!JSON.stringify([archive,accounts,links]).includes(secret),'Live raw and digest custody never exports')
 const invalidCases=[
  a=>{archiveRows(a,'pm_diner_accounts')[0].favorite=2},
  a=>{archiveRows(a,'pm_diner_bookings')[0].account_id='synthetic-placemat-404'},
  a=>{archiveRows(a,'pm_diner_bookings')[0].booking_id='synthetic-placemat-404'},
  a=>{archiveRows(a,'pm_diner_bookings')[0].guest_id=otherGuestId},
 ]
 for(const change of invalidCases){
  const invalid=await changedArchive(archive,change)
  await restored.api('/api/restore',{archive:invalid,confirm:'RESTORE'},{status:400})
  assert.equal((await restored.api('/api/state')).state.bookings.length,0,'Invalid diner relationships refuse atomically')
  assert.deepEqual(await download(restored,'diner-accounts'),[]);assert.deepEqual(await download(restored,'diner-bookings'),[])
 }
 await restored.api('/api/restore',{archive,confirm:'RESTORE'})
 assert.deepEqual(await download(restored,'diner-accounts'),accounts)
 assert.deepEqual(await download(restored,'diner-bookings'),links,'Restored links survive before any fresh verification can recreate them')
}
export async function assertDinerAudit(h,{bookingId,events,erased=false}){
 const verified=events.filter(e=>e.action==='diner.booking.verified'&&e.subject===bookingId)
 assert.equal(verified.length,1,'One verification of the selected booking is attributable')
 const event=verified[0],query=new URLSearchParams({actor:'guest',action:'diner.booking.verified',subject:bookingId,from:event.at,to:event.at})
 const filtered=(await h.api('/api/audit?'+query)).rows
 assert.deepEqual(filtered.map(e=>e.id),[event.id],'Diner events survive all audit filters')
 const csv=csvRecords(await (await h.request('/api/audit.csv?'+query)).text())
 assert.deepEqual(csv.map(e=>e.id),[event.id])
 assert.equal(csv[0].actor,'guest');assert.equal(csv[0].source,'guest-supplied');assert.equal(csv[0].action,event.action);assert.equal(csv[0].at,event.at)
 assert.deepEqual(JSON.parse(csv[0].changes_json),erased?[{kind:'dinerVerification',id:bookingId,before:{redacted:true},after:{redacted:true}}]:event.changes)
 assert.deepEqual((await h.api('/api/audit?'+new URLSearchParams({...Object.fromEntries(query),actor:'synthetic-placemat-404'}))).rows,[])
 if(erased){
  const all=(await h.api('/api/audit?actor=guest')).rows
  for(const prior of events){
   const kept=all.find(e=>e.id===prior.id);assert.ok(kept,'Erasure retains diner-event accountability')
   assert.deepEqual([kept.actor,kept.source,kept.action,kept.at],[prior.actor,prior.source,prior.action,prior.at])
  }
  const text=JSON.stringify([all,csv,await download(h,'audit')])
  for(const value of ['guest0@example.test','changed@example.test','synthetic-placemat-1'])assert.ok(!text.includes(value),'Erased diner data stays absent from audit downloads')
 }
}
