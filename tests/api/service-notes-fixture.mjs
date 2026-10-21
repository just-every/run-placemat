import {publicGuest} from './harness.mjs'
export async function notesFixture(h,{bookings=true}={}){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/Los_Angeles'})
 const floor=[];for(const [i,label] of ['12','14','16'].entries())floor.push(await h.command('table.save',{label,seats:i===1?8:4,x:20+i*20,y:30,accessTags:['step-free']}))
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
 const service=await h.command('service.save',{name:'Friday dinner',startAt:day+'T18:00:00-07:00',endAt:day+'T23:00:00-07:00',turnMinutes:90,coverLimit:32,pacing:{intervalMinutes:30,arrivalCovers:16,arrivalParties:6,concurrentCovers:24,areaArrivalCaps:{}}})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Reviewed kitchen service'});await h.command('proposal.approve',{proposalId:proposal.id})
 const item=await h.command('service.preorder-item',{serviceId:service.id,name:'Halibut'})
 const rows=[]
 if(bookings)for(let i=0;i<3;i++)rows.push((await h.api('/api/public/book',publicGuest(service,i,{name:['Elena Torres','Marcus Chen','Jules Rivers'][i],partySize:i===1?8:2,preorders:[{itemId:item.id,quantity:i+1}],...(i===0?{requestsAcknowledged:true,requests:{allergyNotes:'Shellfish',wheelchair:true}}:{})}),{as:'',status:201})).result)
 return {date:day,service,item,rows,floor}
}
