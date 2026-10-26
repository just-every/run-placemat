export const dinerNow=Date.parse('2026-10-26T10:00:00Z')
export async function dinerFixture(h){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'UTC'})
 for(let i=0;i<6;i++)await h.command('table.save',{label:`T${i+1}`,seats:4,x:20+i*10,y:30})
 const service=await h.command('service.save',{name:'Friday dinner',startAt:'2026-10-30T08:00:00Z',endAt:'2026-10-30T12:00:00Z',turnMinutes:90,coverLimit:40})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Publish a reviewed service'})
 await h.command('proposal.approve',{proposalId:proposal.id})
 const input={serviceId:service.id,startAt:service.startAt,name:'Alex Rowan',email:'guest0@example.test',phone:'+1 212 555 0100',partySize:2}
 const same=(await h.api('/api/public/book',input,{as:'',status:201})).result
 const sibling=(await h.api('/api/public/book',{...input,name:'Sam Patel',email:'guest1@example.test'},{as:'',status:201})).result
 return {service,input,same,sibling}
}
export const dinerCode=h=>h.messages.findLast(m=>m.subject==='Verify your diner account').text.match(/\b[a-f0-9]{64}\b/)[0]
