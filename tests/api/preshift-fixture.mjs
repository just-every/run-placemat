import {publicGuest} from './harness.mjs'
export async function preshiftFixture(h){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/Los_Angeles'})
 const floor=[];for(let i=0;i<3;i++)floor.push(await h.command('table.save',{label:['12','14','16'][i],seats:i===1?8:4,accessTags:['step-free'],x:20+i*20,y:30}))
 const date=new Date();date.setUTCDate(date.getUTCDate()+((5-date.getUTCDay()+7)%7||7))
 const day=date.toISOString().slice(0,10)
 const s=await h.command('service.save',{name:'Friday dinner',startAt:day+'T18:00:00-07:00',endAt:day+'T23:00:00-07:00',turnMinutes:90,coverLimit:32,pacing:{intervalMinutes:30,arrivalCovers:16,arrivalParties:6,concurrentCovers:24,areaArrivalCaps:{'Dining room':16}}})
 const server=await h.command('server.save',{serviceId:s.id,name:'Ana',coverCap:24})
 await h.command('section.save',{serviceId:s.id,name:'Window',serverId:server.id,tableIds:floor.map(t=>t.id)})
 const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Reviewed Friday pre-shift service'});await h.command('proposal.approve',{proposalId:p.id})
 const csv='guest_id,name,email,phone,notes,visit_date,party_size,visit_status\nregular,Elena Torres,elena@example.test,+1 415 555 0191,Private anniversary planning,2026-08-10,2,completed\n'
 const dry=(await h.api('/api/import/dry-run',{csv})).result;await h.api('/api/import/apply',{csv,confirm:dry.fingerprint})
 const booking=(await h.api('/api/public/book',publicGuest(s,0,{name:'Elena Torres',email:'elena@example.test',partySize:2,requestsAcknowledged:true,requiredAccessTags:['step-free'],requests:{occasion:'Anniversary',allergyNotes:'Shellfish',dietaryNotes:'No dairy',wheelchair:true,seatingPreference:'Window'}}),{as:'',status:201})).result
 const guest=(await h.api('/api/guests?search=elena@example.test')).guests[0]
 await h.command('guest.profile',{guestId:guest.id,vipLevel:'regular',tags:['Private celebration'],seatingPreference:'Window'})
 const large=(await h.api('/api/public/book',publicGuest(s,1,{name:'Marcus Chen',partySize:8,phone:'+1 212 555 0199'}),{as:'',status:201})).result
 return {date:day,service:s,booking,large,guest}
}
