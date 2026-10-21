import {publicGuest} from './harness.mjs'

export async function searchFixture(h){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/Los_Angeles'})
 const floor=[]
 for(const [i,label] of ['Window 12','Patio 14','Dining 16','Booth 18'].entries())floor.push(await h.command('table.save',{label,seats:2,area:'Dining',accessTags:['step-free'],x:15+i*20,y:30}))
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
 const publish=async(name,hour)=>{
  const service=await h.command('service.save',{name,startAt:date+`T${hour}:00:00Z`,endAt:date+`T${hour+3}:00:00Z`,turnMinutes:60,coverLimit:32})
  const plan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Reviewed host search service'})
  await h.command('proposal.approve',{proposalId:plan.id});return service
 }
 const first=await publish('Friday lunch',17),second=await publish('Friday dinner',21)
 const book=async(service,i,extra={})=>(await h.api('/api/public/book',publicGuest(service,i,extra),{as:'',status:201})).result
 const elena=await book(first,0,{name:'Eléna García',email:'elena@example.test',phone:'+1 (415) 555-0191',requiredAccessTags:['step-free'],requestsAcknowledged:true,requests:{allergyNotes:'Shellfish <guest supplied>',wheelchair:true}})
 const guest=(await h.api('/api/guests?search=elena@example.test')).guests[0]
 await h.command('guest.profile',{guestId:guest.id,vipLevel:'vip',notes:'Private planning note never included in timeline search'})
 const jules=await book(first,1,{name:'Jules Rivers',phone:'+1 (212) 555-0192'})
 const morgan=await h.command('booking.walkin',publicGuest(first,2,{name:'Morgan Lee',phone:'+1 312 555 0193',tableIds:[floor[2].id]}))
 const queue=await h.command('waitlist.add',publicGuest(first,3,{name:'Taylor Quinn',phone:'+1 512 555 0194'}))
 const taylor=await h.command('waitlist.seat',{waitlistId:queue.id,startAt:first.startAt,tableIds:[floor[3].id]})
 const later=await book(second,0,{name:'Eléna García',email:'elena@example.test'})
 await h.command('booking.status',{bookingId:jules.id,status:'cancelled'})
 return {date,first,second,floor,elena,jules,morgan,taylor,later,guest}
}
