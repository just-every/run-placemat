import {service} from './harness.mjs'
export async function experienceFixture(h){
 const f=await service(h,{tables:3,covers:40})
 await h.command('table.save',{...f.floor[2],area:'Patio'})
 await h.command('table.save',{...f.floor[0],accessTags:['wheelchair']})
 const at=minutes=>new Date(Date.parse(f.service.startAt)+minutes*60000).toISOString()
 const draft=(name,areas,turnMinutes,cleanupMinutes,limit=8)=>({name,kind:'free',amountCents:0,currency:'USD',menu:'Seasonal vegetables, handmade pasta and orchard fruit',image:'',serviceIds:[f.service.id],areas,ticketClasses:[{name:'Dinner seating',quantityLimit:limit}],cancellationRules:'Cancel with the venue before the service. No payment is collected.',turnMinutes,cleanupMinutes,lastSeatingAt:{[f.service.id]:at(240-turnMinutes-cleanupMinutes)}})
 const create=async payload=>{const saved=await h.command('experience.save',payload);await h.command('experience.publish',{id:saved.id,version:saved.version,confirm:true});return (await h.api('/api/state')).state.experiences.find(e=>e.id===saved.id)}
 return {...f,at,draft,create}
}
