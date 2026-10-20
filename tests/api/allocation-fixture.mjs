// Real public-door service with a two-person booking stranding the only large table.
export async function allocationService(h,{size=2,demand=4}={}){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
 const large=await h.command('table.save',{label:'Window 6',seats:6,area:'Dining room',accessTags:['step-free'],x:20,y:30})
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
 const service=await h.command('service.save',{name:'Friday demand review',startAt:day+'T21:00:00Z',endAt:day+'T23:00:00Z',turnMinutes:90,coverLimit:24,pacing:{intervalMinutes:30,arrivalCovers:12,arrivalParties:6,concurrentCovers:12,areaArrivalCaps:{'Dining room':12}},turnPolicy:{cleanupMinutes:15,partyTurns:[],tableTurns:{},areaTurns:{}}})
 const server=await h.command('server.save',{serviceId:service.id,name:'Ana Torres',coverCap:12})
 const section=await h.command('section.save',{serviceId:service.id,name:'Inside',serverId:server.id,tableIds:[large.id]})
 const publication=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Friday floor and arrival limits reviewed'})
 await h.command('proposal.approve',{proposalId:publication.id})
 const reservation=(await h.api('/api/public/book',{serviceId:service.id,startAt:service.startAt,name:'Avery Chen',email:'avery@example.test',partySize:size,area:'Dining room',requiredAccessTags:['step-free']},{as:'',status:201})).result
 const tables=[large]
 for(const [label,accessTags] of [['Inside 2',['step-free']],['Window 2',['step-free']],['Stairs 2',[]]])tables.push(await h.command('table.save',{label,seats:2,area:'Dining room',accessTags,x:20+tables.length*20,y:30}))
 await h.command('section.save',{...section,serviceId:service.id,tableIds:tables.map(t=>t.id)})
 await h.command('kitchen.save',{serviceId:service.id,area:'Dining room',coverCap:12})
 const waiting=await h.command('waitlist.add',{serviceId:service.id,name:'Jordan Rivera',email:'jordan@example.test',phone:'+12025550127',partySize:demand,preferredAt:service.startAt,preferredArea:'Dining room',requiredAccessTags:['step-free'],contactConsent:false})
 const before=(await h.api('/api/state')).state.bookings.find(b=>b.id===reservation.id)
 return {service,tables,reservation,waiting,before,server}
}
