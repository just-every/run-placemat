import {person} from './access'
import {instant,serviceBy} from './availability'
import {Problem,fail,id,number,text,type Actor,type State,type Guest} from './model'
import {seatingPreview} from './pacing-review'
import {checkStaffing} from './staffing-capacity'
import {accessTags} from './assignments'

/** Personal sessions only until stand key enrolment and switch clearing are proved. */
export function outageAccess(s:State,actor:Actor){
 if(actor.agent||actor.deviceId)fail(403,'Use your personal session for outage preparation.')
 if(actor.role==='owner')return
 if(s.outage?.staffEnabled!==true||!(actor.role==='admin'||actor.role==='host'&&s.hostIds?.includes(actor.id)||actor.role==='lead'&&s.leadIds?.includes(actor.id)))fail(403,'The owner must enable outage access for active venue staff.')
}
export function outageSettings(s:State,actor:Actor,p:any){
 person(actor,true);if(actor.deviceId)fail(403,'Use the owner’s personal session.')
 if(typeof p.enabled!=='boolean'||p.confirm!=='CHANGE OUTAGE ACCESS')fail(400,'Explicitly confirm the venue outage access setting.')
 s.outage={staffEnabled:p.enabled};return {...s.outage}
}
export function outageSheet(s:State,actor:Actor,p:any,version:number,now:string,guests:Guest[]){
 outageAccess(s,actor)
 if(p.consent!=='SAVE SERVICE SHEET')fail(400,'Explicitly consent to an encrypted service sheet on this device.')
 const deviceId=text(p.deviceId,'Outage device',36)
 if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(deviceId))fail(400,'Use an enrolled outage device identifier.')
 const service=serviceBy(s,p.serviceId)
 if(service.status!=='published'||service.closedAt)fail(409,'Choose an open published service.')
 const sheetId=id(),expiresAt=new Date(Math.min(Date.parse(now)+12*3600000,Date.parse(service.endAt)+3600000)).toISOString()
 if(expiresAt<=now)fail(409,'This service has ended. Choose a current or future service.')
 s.audit.push({id:id(),actor:actor.id,at:now,action:'outage.enrolment',subject:sheetId,deviceId,reason:'Personal passphrase wraps a fresh device sheet key; passphrase and keys stay on device.'})
 s.audit.push({id:id(),actor:actor.id,at:now,action:'outage.consent',subject:sheetId,deviceId,reason:`Service ${service.id}; field scope 2; expires ${expiresAt}; encrypted device storage; explicit review only. Offline reads cannot be server-audited.`})
 return {id:sheetId,preparedBy:actor.id,deviceId,fieldScope:2,version:version+1,generatedAt:now,expiresAt,venue:{name:s.venue.name,timezone:s.venue.timezone},service:{id:service.id,name:service.name,startAt:service.startAt,endAt:service.endAt},tables:s.tables.filter(t=>!t.retiredAt).map(t=>({id:t.id,label:t.label,seats:t.seats,area:t.area??'Dining room'})),bookings:s.bookings.filter(b=>b.serviceId===service.id).map(b=>{
  const guest=guests.find(g=>g.id===b.guestId),erased=!guest||guest.erased
  return {reference:b.id.slice(-8),name:erased?'Erased guest':guest.name,phoneLastFour:erased?'':(/^(1)?[0-9]{10}$/.test(guest.phone.replace(/[^0-9]/g,''))?guest.phone.replace(/[^0-9]/g,'').slice(-4):''),tableIds:b.tableIds,section:b.sectionName??'',server:b.serverName??'',partySize:b.partySize,startAt:b.startAt,endAt:b.cleanupEndAt??b.endAt,status:b.status,needsBussing:!!b.needsBussing,requiredAccessTags:erased?[]:b.requiredAccessTags??[],requests:erased?null:{unverified:true,allergy:b.requests?.allergyNotes??'',dietary:b.requests?.dietaryNotes??'',access:[b.requests?.wheelchair?'Wheelchair':'',b.requests?.highchair?'Highchair':'',b.requests?.stroller?'Stroller':''].filter(Boolean)}}
 })}
}
export function outageInput(p:any){
 const actionId=text(p.actionId,'Pending action',36)
 if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(actionId))fail(400,'Use a unique pending action identifier.')
 if(!Array.isArray(p.tableIds)||!p.tableIds.length||p.tableIds.length>40||p.tableIds.some((v:unknown)=>typeof v!=='string'))fail(400,'Choose the exact tables to review.')
 return {actionId,serviceId:text(p.serviceId,'Service'),partySize:number(p.partySize,'Party size',1,500),startAt:instant(p.startAt,'Arrival'),capturedAt:instant(p.capturedAt,'Captured time'),requiredAccessTags:accessTags(p.requiredAccessTags,'Required table access tags'),tableIds:[...new Set<string>(p.tableIds)],name:'Walk-in',capturedBy:p.capturedBy===undefined?undefined:text(p.capturedBy,'Capturing person',100),originalTableIds:Array.isArray(p.originalTableIds)&&p.originalTableIds.every((v:unknown)=>typeof v==='string')?[...new Set<string>(p.originalTableIds)]:[...new Set<string>(p.tableIds)]}
}
const encoder=new TextEncoder()
const key=(secret:string)=>crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])
const input=(actor:Actor,p:ReturnType<typeof outageInput>,version:number,expires:number)=>encoder.encode(JSON.stringify([actor.id,p,version,expires]))
async function token(secret:string,actor:Actor,p:ReturnType<typeof outageInput>,version:number,expires:number){return `${expires}.`+Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),input(actor,p,version,expires))),v=>v.toString(16).padStart(2,'0')).join('')}
export function outageFit(s:State,actor:Actor,p:ReturnType<typeof outageInput>,now:string){
 const fit=seatingPreview(s,actor,'booking.walkin',p,now)
 if(fit.violations.length)fail(409,fit.violations.map(v=>v.label+': limit '+v.limit+', excess '+v.excess).join('; ')+'. No outage override is allowed.')
 checkStaffing(s,[{id:'',...fit.fit,tableIds:fit.fit.tables.map(t=>t.id),serviceId:fit.service.id,partySize:fit.partySize,status:'seated'}],now)
 return fit
}
export async function outageReview(s:State,actor:Actor,raw:any,version:number,secret:string,now:string){
 outageAccess(s,actor);const p=outageInput(raw),expires=Date.parse(now)+5*60000
 const prior=s.audit.find(e=>e.id===p.actionId&&e.action==='booking.outage')
 if(prior){
  if(prior.actor!==actor.id)fail(409,'This pending action was already reconciled by another person.')
  const booking=s.bookings.find(b=>b.id===prior.subject)??fail(409,'The reconciled booking is no longer present. Review its audit history.')
  return {version,generatedAt:now,expiresAt:new Date(expires).toISOString(),conflict:'',alternatives:[],applied:{id:booking.id,status:booking.status,tableIds:booking.tableIds}}
 }
 const choices=[p.tableIds,...s.tables.filter(t=>!t.retiredAt&&t.inventoryKind!=='pool').map(t=>[t.id]),...(s.combinations??[]).filter(c=>c.enabled).map(c=>c.tableIds)]
 const alternatives=[],seen=new Set<string>();let conflict=''
 for(const tableIds of choices){
  const identity=[...tableIds].sort().join(',');if(seen.has(identity))continue;seen.add(identity)
  const candidate={...p,tableIds}
  try{const fit=outageFit(s,actor,candidate,now);alternatives.push({payload:candidate,endAt:fit.fit.endAt,tableLabels:tableIds.map(v=>s.tables.find(t=>t.id===v)!.label),review:await token(secret,actor,candidate,version,expires)})}
  catch(error){if(!(error instanceof Problem))throw error;if(!conflict&&identity===[...p.tableIds].sort().join(','))conflict=error.message}
 }
 return {version,generatedAt:now,expiresAt:new Date(expires).toISOString(),conflict,alternatives}
}
export async function approveOutage(s:State,actor:Actor,raw:any,version:number,secret:string|undefined,now:string){
 outageAccess(s,actor);const p=outageInput(raw)
 if(raw.confirm!=='SEAT REVIEWED WALK-IN'||!secret||typeof raw.review!=='string')fail(409,'Review the current floor and explicitly confirm this walk-in.')
 const [expiry,signature,...extra]=raw.review.split('.'),expires=Number(expiry)
 if(extra.length||!/^\d+$/.test(expiry)||!/^[a-f0-9]{64}$/.test(signature??'')||expires<=Date.parse(now)||expires>Date.parse(now)+5*60000||raw.version!==version)fail(409,'The floor changed or the review expired. Review again; nothing was seated.')
 const signatureBytes=Uint8Array.from((signature as string).match(/../g)!,v=>parseInt(v,16))
 if(!await crypto.subtle.verify('HMAC',await key(secret!),signatureBytes,input(actor,p,version,expires)))fail(409,'The reviewed action changed. Review again; nothing was seated.')
 outageFit(s,actor,p,now)
 return p
}
