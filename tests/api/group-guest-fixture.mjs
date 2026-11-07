import {installation,service,publicGuest} from './harness.mjs'
import {verify,call} from './diner-client.mjs'
export const address=n=>`synthetic-placemat-${n}`+String.fromCharCode(64)+'example.test'
export async function groupGuests({attended=true,serviceOptions}={}){
 const f={available:true},homeOrigin='https://home.example.test',tapOrigin='https://tap.example.test'
 f.home=await installation({origin:homeOrigin,peers:{'tap.example.test':()=>f.tap}})
 f.tap=await installation({origin:tapOrigin,peers:{'home.example.test':()=>{if(!f.available)throw Error('Introspection unavailable');return f.home}}})
 f.close=async()=>{await f.home.close();await f.tap.close()}
 try{
  f.records=[]
  for(const [h,name,n] of [[f.home,'Home Bistro',1],[f.tap,'Tap Room',2]]){
   const {service:s}=await service(h,serviceOptions)
   await h.command('venue.update',{name,timezone:'Australia/Brisbane'})
   const input=publicGuest(s,0,{email:address(n),name:'Synthetic guest '+n})
   const b=(await h.api('/api/public/book',input,{as:'',status:201})).result
   if(attended){await h.command('booking.status',{bookingId:b.id,status:'seated'});await h.command('booking.status',{bookingId:b.id,status:'completed'})}
   if(attended)await h.command('booking.stage',{bookingId:b.id,stage:'ready'})
   const unverified=(await h.api('/api/public/book',{...input,startAt:new Date(Date.parse(s.startAt)+2*3600000).toISOString()},{as:'',status:201})).result
   await h.command('booking.status',{bookingId:unverified.id,status:'seated'});await h.command('booking.status',{bookingId:unverified.id,status:'completed'})
   f.records.push({h,s,b:(await h.api('/api/state')).state.bookings.find(row=>row.id===b.id),input,unverified,session:await verify(h,b,input.email)})
  }
  const invite=(await f.home.api('/api/group/invite',{label:'Tap Room'})).result
  await f.tap.api('/api/group/join',{homeOrigin,code:invite.code,ceiling:['guestbook.read']})
  f.linkId=(await f.home.api('/api/group')).links[0].id
  f.reader=await f.home.signIn(address(3),'member','Group reader')
  f.readerId=(await f.home.api('/auth/operators')).find(o=>o.email===address(3)).id
  f.grants={home:['guestbook.read'],[f.linkId]:['guestbook.read']}
  await f.home.api('/api/group/admin',{operatorId:f.readerId,venues:f.grants})
  f.token=(await f.home.api('/api/group/token',{},{as:f.reader,status:201})).result.token
  f.bearer={as:'',headers:{authorization:'Bearer '+f.token}}
  f.consent=(n,choices={preferences:true,visits:true,rebooking:true})=>call(f.records[n].h,'group-consent',{token:f.records[n].session.token,acknowledged:true,...choices})
  f.link=async(choices={preferences:true,visits:true,rebooking:true})=>{
   const code=(await call(f.home,'group-code',{token:f.records[0].session.token,acknowledged:true,venueId:f.linkId})).code
   const result=await call(f.tap,'group-link',{token:f.records[1].session.token,acknowledged:true,code,...choices})
   return {code,...result}
  }
  f.read=(h=f.home,status)=>h.api('/api/group/guestbook?profileId='+f.profileId,undefined,{...f.bearer,...status?{status}:{}})
  return f
 }catch(error){await f.close();throw error}
}
