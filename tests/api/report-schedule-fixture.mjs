import assert from 'node:assert/strict'
import {installation,publicGuest} from './harness.mjs'
export const reportDay='2031-11-02',firstDue='2031-11-03T18:00:00.000Z'
export async function reportGroup({recipientEmail='synthetic-placemat-group@example.test',bindings={},reportMailEdge}={}){
 let home,tap,available=true
 const mail={uncertain:false,messages:[]}
 try{
 home=await installation({bindings,origin:'https://home.example.test',peers:{'tap.example.test':()=>{if(!available)throw Error('Synthetic unavailable venue');return tap}},mailEdge:async request=>{
  const wire=await request.clone().json(),message=wire.personalizations?{subject:wire.subject,to:wire.personalizations[0].to.map(p=>p.email),text:wire.content.find(p=>p.type==='text/plain')?.value}:wire;mail.messages.push(message)
  if(reportMailEdge&&message.subject==='Your weekly group cover report')return reportMailEdge(request)
  if(mail.uncertain&&message.subject==='Your weekly group cover report')throw Error('Synthetic uncertain acceptance')
  return Response.json({id:'synthetic-placemat-mail-'+mail.messages.length},{status:wire.personalizations?202:200,headers:{'x-message-id':'synthetic-placemat-mail-'+mail.messages.length}})
 }})
 tap=await installation({origin:'https://tap.example.test',peers:{'home.example.test':()=>home}})
 const signIn=async(email,role='member',name='Group manager')=>{
  const existing=(await home.api('/auth/operators')).some(p=>p.email===email)
  await home.api(existing?'/auth/magic-link':'/auth/invite',{email,displayName:name,role,returnTo:'/app'},{status:202})
  const message=mail.messages.findLast(m=>JSON.stringify(m.to).includes(email)),link=new URL(message.text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)[0])
  const response=await home.request('/auth/confirm',{method:'POST',as:'',body:{token:link.searchParams.get('token')}});assert.equal(response.status,303)
  return response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
 }
 const recipient=await signIn(recipientEmail),manager=await signIn('synthetic-placemat-manager@example.test','admin','Venue manager'),other=await signIn('synthetic-placemat-other@example.test','member','Unapproved reader')
 const people=await home.api('/auth/operators'),recipientId=people.find(r=>r.email===recipientEmail).id,managerId=people.find(r=>r.email==='synthetic-placemat-manager@example.test').id
 const bookings=[]
 for(const [h,name,timezone,startAt] of [[home,'Home Bistro','America/Los_Angeles','2031-11-03T01:00:00Z'],[tap,'Tap Room','Australia/Brisbane','2031-11-02T09:00:00Z']]){
  await h.command('venue.update',{name,timezone})
  const table=await h.command('table.save',{label:'D1',seats:4,x:20,y:30})
  const s=await publishReportService(h,'Group dinner',startAt)
  bookings.push((await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})).result)
 }
 const invitation=(await home.api('/api/group/invite',{label:'Tap Room'},{status:201})).result
 await tap.api('/api/group/join',{homeOrigin:home.origin,code:invitation.code,ceiling:['reports.read']})
 const linkId=(await home.api('/api/group')).links[0].id,venueIds=['home',linkId]
 const grant=()=>home.api('/api/group/admin',{operatorId:recipientId,venues:{home:['reports.read'],[linkId]:['reports.read']}})
 await grant()
 const approve=(extra={})=>home.api('/api/report-schedules',{recipientId,venueIds,nextAt:firstDue,acknowledged:true,...extra},{status:201})
 const tick=async(time=firstDue)=>{const result=await(await home.mf.getWorker()).scheduled({scheduledTime:new Date(time),cron:'17 * * * *'});assert.equal(result.outcome,'ok')}
 return {home,tap,mail,recipient,recipientId,manager,managerId,other,bookings,venueIds,approve,tick,grant,signIn,setAvailable(v){available=v},async close(){await home.close();await tap.close()}}
 }catch(error){await home?.close();await tap?.close();throw error}
}
export async function publishReportService(h,name,startAt){
 const service=await h.command('service.save',{name,startAt,endAt:new Date(Date.parse(startAt)+4*3600000).toISOString(),turnMinutes:60,coverLimit:100})
 const proposal=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:service.id},reason:'Synthetic report service reviewed'})
 await h.command('proposal.approve',{proposalId:proposal.id});return service
}
