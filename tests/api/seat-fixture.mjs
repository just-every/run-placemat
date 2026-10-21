export async function seatFixture(h,{inventory=true}={}){
 await h.command('venue.update',{name:'Counter & Lounge',timezone:'America/New_York'})
 const table=await h.command('table.save',{label:'Dining table',seats:4,x:25,y:25})
 if(inventory){
  await h.command('inventory.create',{name:'Chef counter',kind:'counter',capacity:10,turnMinutes:90,arrivalCovers:10,intervalMinutes:30,adjacent:true})
  await h.command('inventory.create',{name:'Lounge',kind:'pool',capacity:20,turnMinutes:90,arrivalCovers:20,intervalMinutes:30,adjacent:false})
 }
 const date=new Date(Date.now()+86400000).toISOString().slice(0,10)
 const service=await h.command('service.save',{name:'Counter dinner',startAt:date+'T17:00:00Z',endAt:date+'T23:00:00Z',turnMinutes:90,coverLimit:200})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Review all inventory'})
 await h.command('proposal.approve',{proposalId:proposal.id})
 const state=async()=>(await h.api('/api/state')).state
 const units=async name=>(await state()).tables.filter(t=>t.area===name).sort((a,b)=>a.ordinal-b.ordinal)
 let n=0
 const book=async(area='Chef counter',extra={},status=201)=>{n++;return (await h.api('/api/public/book',{serviceId:service.id,startAt:service.startAt,partySize:2,name:`synthetic-placemat-${n}`,email:`synthetic-placemat-${n}@example.test`,area,...extra},{as:'',status,headers:{'cf-connecting-ip':`192.0.2.${n}`}})).result}
 const move=async(b,ids)=>h.command('booking.move',{bookingId:b.id,tableIds:ids,version:(await h.api('/api/state')).version,reason:'Host seating transfer'})
 return {date,service,table,state,units,book,move}
}
