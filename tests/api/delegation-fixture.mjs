import {service,publicGuest} from './harness.mjs'
export async function delegationFixture(h){
 const {service:first,floor:tables}=await service(h,{tables:3,seats:4,covers:80});
 const second=await h.command('service.save',{name:'Next week',startAt:new Date(Date.parse(first.startAt)+7*86400000).toISOString(),endAt:new Date(Date.parse(first.endAt)+7*86400000).toISOString(),turnMinutes:90,coverLimit:80}),proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:second.id},reason:'Review second shift'});await h.command('proposal.approve',{proposalId:proposal.id});
 await h.command('service.pacing',{serviceId:first.id,pacing:{intervalMinutes:30,arrivalCovers:2,arrivalParties:10,concurrentCovers:20,areaArrivalCaps:{}}});
 const booking=(await h.api('/api/public/book',publicGuest(first,0,{name:'Mila Thompson'}),{as:'',status:201})).result;
 const leadCookie=await h.signIn('synthetic-placemat-lead@example.test','member','Shift Lead'),managerCookie=await h.signIn('synthetic-placemat-manager@example.test','admin','Floor Manager'),people=await h.api('/auth/operators'),lead=people.find(p=>p.email==='synthetic-placemat-lead@example.test'),manager=people.find(p=>p.email==='synthetic-placemat-manager@example.test');
 await h.command('team.lead',{operatorId:lead.id,enabled:true});await h.command('team.reports',{operatorId:lead.id,serviceIds:[first.id]});await h.command('team.reports',{operatorId:manager.id,serviceIds:[first.id]});await h.command('team.manager-limit',{operatorId:manager.id,refundLimitCents:10000});
 return {first,second,tables,booking,lead,manager,leadCookie,managerCookie};
}
