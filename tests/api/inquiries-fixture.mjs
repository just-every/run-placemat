export async function inquiryService(h){
 await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
 const small=await h.command('table.save',{label:'Accessible 4',seats:4,area:'Dining room',accessTags:['step-free'],x:20,y:30})
 const large=await h.command('table.save',{label:'Private 16',seats:16,area:'Dining room',accessTags:['step-free'],x:60,y:30})
 await h.command('table.save',{label:'Patio 2',seats:2,area:'Patio',accessTags:[],x:30,y:70})
 const rule={minParty:1,maxParty:20,horizonDays:3650,leadMinutes:0,sameDayCutoff:'23:59',slotMinutes:15,inquiryAbove:8,blockedStarts:[]}
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
 const service=await h.command('service.save',{name:'Friday private dining',startAt:day+'T21:00:00Z',endAt:day+'T23:30:00Z',turnMinutes:90,coverLimit:40,bookingRules:{online:rule}})
 const p=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Private room and accessible inventory ready'})
 await h.command('proposal.approve',{proposalId:p.id})
 return {service,small,large}
}
export const requests={occasion:'Anniversary',stroller:true,highchair:true,wheelchair:true,dietaryNotes:'Vegetarian',allergyNotes:'Shellfish allergy',seatingPreference:'Quiet corner',requestedArea:'Patio'}
export const inquiryPayload=(service,name='Elena Morrison',email='elena@example.test')=>({serviceId:service.id,requestedStartAt:service.startAt,name,email,partySize:16,requiredArea:'Dining room',requiredAccessTags:['step-free'],requests,requestsAcknowledged:true,message:'Please discuss a private anniversary dinner.'})
