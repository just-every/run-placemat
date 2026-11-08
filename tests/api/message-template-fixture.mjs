import {publicGuest} from './harness.mjs'
export async function reminderFixture(h){
 await h.command('venue.update',{name:'Cedar & Salt <Dining>',timezone:'America/New_York'})
 for(let i=0;i<4;i++)await h.command('table.save',{label:'T'+i,seats:4,x:20+i*15,y:30})
 const s=await h.command('service.save',{name:'January dinner',startAt:'2032-01-17T00:30:00Z',endAt:'2032-01-17T04:30:00Z',turnMinutes:90,coverLimit:16})
 const publication=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Publish reviewed dinner'})
 await h.command('proposal.approve',{proposalId:publication.id})
 const people=[publicGuest(s,0,{name:'María & <Ana> "O’Connor" '+ 'Fernández '.repeat(9).trim(),phone:'+1 (202) 555-0123'}),publicGuest(s,1,{name:'{{venue_name}} <script>window.templateLeak=1</script>',phone:'2025550124'})]
 const bookings=[]
 for(const person of people)bookings.push((await h.api('/api/public/book',person,{as:'',status:201})).result)
 return {service:s,people,bookings:(await h.api('/api/state')).state.bookings}
}
