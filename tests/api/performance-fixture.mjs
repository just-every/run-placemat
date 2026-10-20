import {publicGuest} from './harness.mjs'

// Real staff operations and receipt timestamps, shared by HTTP and browser journeys.
export async function performanceService(h) {
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
 const tables=[]
 for(const [i,label] of ['12','14','21','22'].entries())tables.push(await h.command('table.save',{label,seats:4,area:i<2?'Window':'Garden',x:20+i%2*45,y:25+Math.floor(i/2)*40}))
 const startAt=new Date(Math.floor(Date.now()/900000)*900000-3600000).toISOString()
 const service=await h.command('service.save',{name:'Friday supper',startAt,endAt:new Date(Date.parse(startAt)+3*3600000).toISOString(),turnMinutes:15,coverLimit:80,pacing:{intervalMinutes:30,arrivalCovers:20,arrivalParties:10,concurrentCovers:30,areaArrivalCaps:{}}})
 const servers=[]
 for(const name of ['Ana Torres','Ben Carter'])servers.push(await h.command('server.save',{serviceId:service.id,name,coverCap:20}))
 for(let i=0;i<2;i++)await h.command('section.save',{serviceId:service.id,name:i?'Garden':'Window',serverId:servers[i].id,tableIds:tables.slice(i*2,i*2+2).map(t=>t.id)})
 const prepared=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Supper floor ready'})
 await h.command('proposal.approve',{proposalId:prepared.id})
 const overruns=[]
 for(let i=0;i<2;i++){
  const booking=await h.command('booking.walkin',publicGuest(service,i,{name:i?'Marco Rivera':'Priya Shah',phone:i?'2025550102':'2025550101',tableIds:[tables[i].id]}))
  await h.command('booking.extend',{bookingId:booking.id,expectedEndAt:new Date(Date.now()+30*60000).toISOString(),reason:'Party is finishing dessert'})
  if(i===0)await h.command('booking.move',{bookingId:booking.id,tableIds:[tables[2].id],version:(await h.api('/api/state')).version,reason:'Finish dessert in the garden'})
  await h.command('booking.stage',{bookingId:booking.id,stage:'completed'})
  overruns.push(booking)
 }
 const waiting=await h.command('waitlist.add',publicGuest(service,2,{name:'Dee Morgan',phone:'2025550103',quoteMin:5,quoteMax:10,basis:'Host observation of tables finishing'}))
 const seated=await h.command('waitlist.seat',{waitlistId:waiting.id,startAt:new Date(Date.parse(startAt)+60*60000).toISOString(),tableIds:[tables[3].id]})
 await h.command('booking.stage',{bookingId:seated.id,stage:'completed'})
 const abandoned=await h.command('waitlist.add',publicGuest(service,3,{name:'Sam Wilson',phone:'2025550104',quoteMin:10,quoteMax:20,basis:'Host estimate'}))
 await h.command('waitlist.status',{waitlistId:abandoned.id,status:'abandoned',reason:'Party left the queue'})
 const upcoming=(await h.api('/api/public/book',publicGuest(service,4,{name:'Alex Rowan',startAt:new Date(Date.parse(startAt)+90*60000).toISOString(),requiredArea:'Window'}),{as:'',status:201})).result
 return {service,tables,servers,overruns,waiting,seated,abandoned,upcoming}
}
