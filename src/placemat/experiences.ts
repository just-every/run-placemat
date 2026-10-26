import {validateExperiencePublication} from './experience-fit'
import {fail,id,number,text,type Actor,type Service,type State} from './model'
import {instant} from './availability'
import {normalizeTurnPolicy} from './turn-policy'
import type {ExperienceCart} from './experience-cart'

export type ExperienceAddOn={id:string;name:string;unitAmountCents:0;quantityLimit:number}
export type ExperienceDietaryChoice={id:string;name:string}
export type Experience={
 id:string;version:number;status:'draft'|'published';name:string;image:string;menu:string;
 kind:'free'|'deposit'|'prepaid';amountCents:number;currency:'USD';serviceIds:string[];areas:string[];
 ticketClasses:Array<{id:string;name:string;quantityLimit:number}>;cancellationRules:string;
 addOns?:ExperienceAddOn[];dietaryChoices?:ExperienceDietaryChoice[];
 turnMinutes:number;cleanupMinutes:number;lastSeatingAt:Record<string,string>;
 createdAt:string;createdBy:string;updatedAt:string;updatedBy:string;publishedAt?:string;publishedBy?:string
}
function options(value:unknown,previous:Array<{id:string;name:string}>,kind:'addOn'|'dietary'){
 if(!Array.isArray(value)||value.length>50)fail(400,'Choose up to 50 add-ons or dietary choices.')
 const entries=value as unknown[],ids=new Set<string>(),names=new Set<string>()
 return entries.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Supply named experience options.')
  const row=value as Record<string,unknown>,optionId=row.id===undefined||row.id===''?id():text(row.id,'Experience option ID',100)
  const original=previous.find(entry=>entry.id===optionId),name=text(row.name,'Experience option name',120)
  if(row.id&&!original)fail(400,'Use an option from this draft or omit its ID to create one.')
  if(original&&original.name!==name)fail(409,'Experience option names stay fixed. Add a new option for a different choice.')
  if(ids.has(optionId)||names.has(name.toLowerCase()))fail(400,'Choose distinct experience option names and IDs.')
  ids.add(optionId);names.add(name.toLowerCase())
  if(kind==='dietary')return {id:optionId,name}
  if(row.unitAmountCents!==0)fail(400,'Only zero-charge experience add-ons are available. Paid add-on checkout is not enabled.')
  return {id:optionId,name,unitAmountCents:0 as const,quantityLimit:number(row.quantityLimit,'Add-on quantity limit',1,500)}
 })
}
type ExperienceState=State&{experiences?:Experience[]}
function list(value:unknown,label:string,max:number){
 if(!Array.isArray(value)||!value.length||value.length>max)fail(400,`Choose 1–${max} ${label}.`)
 const values=(value as unknown[]).map(item=>text(item,label,200))
 if(new Set(values).size!==values.length)fail(400,`Choose each ${label} once.`)
 return values
}
function image(value:unknown){
 if(value===undefined||value==='')return ''
 if(typeof value!=='string'||value.length>280000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))fail(400,'Choose a PNG, JPEG or WebP image up to 200 KB.')
 const data=value as string,encoded=data.slice(data.indexOf(',')+1)
 let bytes:string
 try{bytes=atob(encoded)}catch{return fail(400,'Choose a valid image file.')}
 if(bytes.length>200000)fail(400,'Choose an image up to 200 KB.')
 const valid=data.startsWith('data:image/png;')?bytes.startsWith('\x89PNG\r\n\x1a\n'):data.startsWith('data:image/jpeg;')?bytes.startsWith('\xff\xd8\xff'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP'
 if(!valid)fail(400,'The image contents must match its PNG, JPEG or WebP format.')
 return data
}
function linkedServices(s:ExperienceState,serviceIds:string[],publishingAt?:string){
 return serviceIds.map(serviceId=>{
  const service=s.services.find(row=>row.id===serviceId)??fail(400,'Choose an existing published service for each experience date.')
  if(service.status!=='published'||service.closedAt)fail(409,'Every experience date needs an open published service.')
  if(publishingAt&&Date.parse(service.endAt)<=Date.parse(publishingAt))fail(409,'Choose future open services before publishing this experience.')
  return service
 })
}
function cutoffs(value:unknown,services:Service[],s:ExperienceState,turnMinutes:number,cleanupMinutes:number){
 if(typeof value!=='string'&&(!value||typeof value!=='object'||Array.isArray(value)))fail(400,'Set a last-seating timestamp with an explicit UTC offset for each selected service.')
 if(typeof value==='string'&&services.length!==1)fail(400,'Set last seating separately for each selected service.')
 const supplied:Record<string,unknown>=typeof value==='string'?{[services[0].id]:value}:value as Record<string,unknown>
 if(Object.keys(supplied).length!==services.length||Object.keys(supplied).some(key=>!services.some(service=>service.id===key)))fail(400,'Set last seating for exactly the selected services.')
 return Object.fromEntries(services.map(service=>{
  const at=instant(supplied[service.id],'Experience last seating')
  normalizeTurnPolicy({cleanupMinutes,lastSeatingAt:at},s,service)
  if(service.turnPolicy?.lastSeatingAt&&at>service.turnPolicy.lastSeatingAt)fail(400,'Experience last seating must respect the service last-seating rule.')
  if(Date.parse(at)+(turnMinutes+cleanupMinutes)*60000>Date.parse(service.endAt))fail(400,'The full experience turn and cleanup must fit after last seating within service hours.')
  return [service.id,at]
 }))
}
function normalize(s:ExperienceState,p:any,previous?:Experience){
 const serviceIds=list(p.serviceIds,'services',31),services=linkedServices(s,serviceIds),areas=list(p.areas,'seating areas',30)
 for(const area of areas)if(!s.tables.some(table=>!table.retiredAt&&!table.inventoryId&&(table.area??'Dining room')===area))fail(400,'Choose existing physical dining areas for the experience.')
 const turnMinutes=number(p.turnMinutes,'Experience turn minutes',15,360),cleanupMinutes=number(p.cleanupMinutes,'Experience cleanup minutes',0,120)
 const kind=p.kind??'free'
 if(!['free','deposit','prepaid'].includes(kind))fail(400,'Choose free, deposit or prepaid experience pricing.')
 const amountCents=number(p.amountCents??0,'Per-guest USD cents',kind==='free'?0:1,100000000)
 if(kind==='free'&&amountCents!==0)fail(400,'A free experience must have a zero price.')
 if(p.currency!==undefined&&p.currency!=='USD')fail(400,'Experience prices use USD.')
 if(!Array.isArray(p.ticketClasses)||!p.ticketClasses.length||p.ticketClasses.length>20)fail(400,'Add 1–20 ticket classes with quantity limits.')
 const ticketClasses=p.ticketClasses.map((entry:any)=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))fail(400,'Supply ticket class names and quantity limits.')
  const classId=entry.id===undefined||entry.id===''?id():text(entry.id,'Ticket class ID',100)
  if(entry.id&&!previous?.ticketClasses.some(row=>row.id===classId))fail(400,'Choose a ticket class from this draft or omit its ID for a new class.')
  return {id:classId,name:text(entry.name,'Ticket class name',120),quantityLimit:number(entry.quantityLimit,'Ticket class quantity',1,500)}
 }) as Experience['ticketClasses']
 if(new Set(ticketClasses.map(row=>row.id)).size!==ticketClasses.length||new Set(ticketClasses.map(row=>row.name.toLowerCase())).size!==ticketClasses.length)fail(400,'Use distinct ticket class names and IDs.')
 const addOns=options(p.addOns===undefined?previous?.addOns??[]:p.addOns,previous?.addOns??[],'addOn') as ExperienceAddOn[]
 const dietaryChoices=options(p.dietaryChoices===undefined?previous?.dietaryChoices??[]:p.dietaryChoices,previous?.dietaryChoices??[],'dietary') as ExperienceDietaryChoice[]
 return {name:text(p.name,'Experience name',120),image:image(p.image),menu:text(p.menu,'Experience menu',8000),kind:kind as Experience['kind'],amountCents,currency:'USD' as const,serviceIds,areas,ticketClasses,addOns,dietaryChoices,cancellationRules:text(p.cancellationRules,'Cancellation rules',4000),turnMinutes,cleanupMinutes,lastSeatingAt:cutoffs(p.lastSeatingAt,services,s,turnMinutes,cleanupMinutes)}
}
function current(s:ExperienceState,p:any){
 const entry=s.experiences?.find(row=>row.id===p.id)??fail(404,'Experience not found.')
 if(p.version!==entry.version)fail(409,'This experience changed. Refresh and review its current draft.')
 return entry
}
/** Catalog writes only. This module creates no reservation, ticket sale, hold or payment. */
export function executeExperience(s:ExperienceState,actor:Actor,command:string,p:any,now:string){
 if(actor.agent||actor.deviceId||!['owner','admin'].includes(actor.role))fail(403,'A personal owner or venue manager must manage experiences.')
 if(!p||typeof p!=='object'||Array.isArray(p))fail(400,'Send experience details as an object.')
 if(command==='experience.save'){
  const previous=p.id?current(s,p):undefined
  if(previous?.status==='published')fail(409,'Withdraw this catalog entry before editing its draft.')
  const details=normalize(s,p,previous)
  const entry:Experience={...details,id:previous?.id??id(),version:(previous?.version??0)+1,status:'draft',createdAt:previous?.createdAt??now,createdBy:previous?.createdBy??actor.id,updatedAt:now,updatedBy:actor.id}
  if(previous)Object.assign(previous,entry);else(s.experiences??=[]).push(entry)
  return entry
 }
 const entry=current(s,p)
 if(command==='experience.publish'){
  if(entry.status!=='draft')fail(409,'This experience is already published.')
  if(p.confirm!==true)fail(400,'Review this exact catalog entry and explicitly confirm publication.')
  normalize(s,entry,entry);linkedServices(s,entry.serviceIds,now);validateExperiencePublication(s,entry)
  entry.status='published';entry.publishedBy=actor.id;entry.publishedAt=now
 }else if(command==='experience.withdraw'){
  if(entry.status!=='published'||p.confirm!==true)fail(400,'Explicitly confirm withdrawal of this published catalog entry.')
  entry.status='draft';delete entry.publishedAt;delete entry.publishedBy
 }else return fail(400,'Unknown experience command.')
 entry.version++;entry.updatedAt=now;entry.updatedBy=actor.id
 return entry
}
/** Whitelist public content. A catalog listing is not a booking or payment promise. */
export function publicExperiences(s:ExperienceState){
 const now=new Date().toISOString()
 const allocated:Array<{serviceId:string;experience?:{id:string};experienceCart?:ExperienceCart}>=[...s.bookings.filter(row=>['booked','seated','completed'].includes(row.status)),...(s.holds??[]).filter(row=>row.expiresAt>now)]
 return(s.experiences??[]).filter(entry=>entry.status==='published').flatMap(entry=>{
  const dates=entry.serviceIds.flatMap(serviceId=>{
   const service=s.services.find(row=>row.id===serviceId&&row.status==='published'&&!row.closedAt)
   return service?[{serviceId,name:service.name,startAt:service.startAt,endAt:service.endAt,lastSeatingAt:entry.lastSeatingAt[serviceId]}]:[]
  })
  const addOns=(entry.addOns??[]).map(item=>({...item,remainingByServiceId:Object.fromEntries(entry.serviceIds.map(serviceId=>{
   const used=allocated.filter(row=>row.serviceId===serviceId&&row.experience?.id===entry.id).reduce((total,row)=>total+(row.experienceCart?.items??[]).filter(line=>line.id===item.id).reduce((quantity,line)=>quantity+line.quantity,0),0)
   if(used>item.quantityLimit)fail(409,'Experience add-on stock needs manager review before availability can be shown.')
   return [serviceId,item.quantityLimit-used]
  }))}))
  return dates.length?[{id:entry.id,name:entry.name,image:entry.image,menu:entry.menu,kind:entry.kind,amountCents:entry.amountCents,currency:'USD',areas:[...entry.areas],ticketClasses:entry.ticketClasses.map(row=>({...row})),addOns,dietaryChoices:(entry.dietaryChoices??[]).map(row=>({...row})),cancellationRules:entry.cancellationRules,turnMinutes:entry.turnMinutes,cleanupMinutes:entry.cleanupMinutes,dates,bookingAvailable:entry.kind==='free',message:entry.kind==='free'?'Choose this experience in availability to book.':'Online payment checkout is unavailable. Contact the venue; this listing takes no payment or reservation.'}]:[]
 })
}
