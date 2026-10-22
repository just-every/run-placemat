import assert from 'node:assert/strict'
import {service,publicGuest} from './harness.mjs'
export async function sharedDeviceFixture(h,{enroll=true,pins=true}={}){
 const f=await service(h,{tables:3,seats:4,covers:80}),booking=(await h.api('/api/public/book',publicGuest(f.service,0,{name:'Jordan Ellis',email:'jordan.ellis@example.test',requests:{allergyNotes:'synthetic-placemat-private-allergy'},requestsAcknowledged:true}),{as:'',status:201})).result;
 const guest=(await h.api('/api/guests?search=jordan.ellis@example.test')).guests[0];await h.command('guest.profile',{guestId:guest.id,notes:'synthetic-placemat-private-note',tags:['synthetic-placemat-private-tag']});
 const staff=[];
 for(const [email,name,pin] of [['synthetic-placemat-avery@example.test','Avery Host','141592653589'],['synthetic-placemat-blair@example.test','Blair Host','271828182845']]){
  const cookie=await h.signIn(email,'member',name),operator=(await h.api('/auth/operators')).find(p=>p.email===email);await h.command('team.host',{operatorId:operator.id,enabled:true});if(pins)await h.api('/api/hoststand/pin',{pin},{as:cookie});staff.push({...operator,cookie,pin});
 }
 let registration,deviceCookie='';
 if(enroll){registration=await h.api('/api/hoststand/devices',{label:'Host iPad'},{status:201});const response=await h.request('/api/hoststand/claim',{method:'POST',body:{claimCode:registration.claimCode},as:''});assert.equal(response.status,200);deviceCookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).find(v=>v.startsWith('__Host-pm-device='));assert.ok(deviceCookie);}
 return {...f,tables:f.floor,booking,guest,staff,registration,deviceCookie,unlock:async(i=0,status=200)=>h.api('/api/hoststand/unlock',{operatorId:staff[i].id,pin:staff[i].pin},{as:deviceCookie,status}),floor:()=>h.api('/api/hoststand/floor',undefined,{as:deviceCookie})};
}
