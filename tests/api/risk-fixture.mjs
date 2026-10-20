import {publicGuest} from './harness.mjs'
export async function riskService(h){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
 const tables=[];for(let i=0;i<4;i++)tables.push(await h.command('table.save',{label:['Window 4','Patio 4','Dining 4','Booth 4'][i],seats:4,area:i===1?'Patio':'Dining',accessTags:['wheelchair'],x:20+i%2*45,y:25+Math.floor(i/2)*40}))
 const publish=async(name,days)=>{
  const startAt=new Date(Date.now()+days*86400000).toISOString(),s=await h.command('service.save',{name,startAt,endAt:new Date(Date.parse(startAt)+4*3600000).toISOString(),turnMinutes:90,coverLimit:40})
  const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Service floor reviewed'});await h.command('proposal.approve',{proposalId:p.id});return s
 }
 const prior=await publish('Previous Friday',1),service=await publish('Friday dinner',8)
 const book=async(s,i,extra={})=>(await h.api('/api/public/book',publicGuest(s,i,extra),{as:'',status:201})).result
 const missed=await book(prior,0,{name:'Alex Rowan',email:'alex@example.test'})
 await h.command('booking.stage',{bookingId:missed.id,stage:'reconfirmed'})
 await h.command('booking.stage',{bookingId:missed.id,stage:'no-show'})
 const risky=await book(service,0,{name:'Alex Rowan',email:'alex@example.test',requiredAccessTags:['wheelchair'],area:'Dining'})
 const unknown=await book(service,1,{name:'Sam Patel'})
 const confirmed=await book(service,2,{name:'Morgan Lee'})
 await h.command('booking.stage',{bookingId:confirmed.id,stage:'reconfirmed'})
 return {service,missed,risky,unknown,confirmed}
}
