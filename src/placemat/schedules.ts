import {fail,id,number,text,type Actor,type Proposal,type Service,type State} from './model'

type ShiftTimes={startTime:string;endTime:string;turnMinutes:number;coverLimit:number;startOffset?:string;endOffset?:string}
export type ScheduleException={date:string;closed:boolean}&Partial<ShiftTimes>
export type ScheduleTemplate=ShiftTimes&{
 id:string;name:string;shift:'breakfast'|'lunch'|'dinner';seasonStart:string;seasonEnd:string;weekdays:number[];
 exceptions:ScheduleException[];version:number;updatedAt:string;updatedBy:string
}
type GeneratedService=Service
type ScheduleState=State&{schedules?:ScheduleTemplate[]}
type Candidate={
 id:string;scheduleId:string;scheduleVersion:number;localDate:string;action:'create'|'keep'|'renew'|'close'|'preserve';
 service:GeneratedService;existingServiceId?:string;capacity:{seats:number;coverLimit:number};
 requiresRenewedApproval:boolean;preserved:boolean;startOffset?:string;endOffset?:string
}
type Renewal={serviceId:string;scheduleId:string;localDate:string;reason:string;bookingIds:string[];preserved:boolean;selected:boolean;manualReviewRequired:boolean}
type Conflict={candidateId:string;serviceId?:string;otherCandidateId?:string;message:string}
type SchedulePlan={
 fromDate:string;toDate:string;timezone:string;scheduleIds:string[];renewServiceIds:string[];
 snapshot:{venue:State['venue'];tables:State['tables'];combinations:State['combinations'];services:State['services'];bookings:State['bookings'];schedules:ScheduleTemplate[]};
 candidates:Candidate[];requiresRenewedApproval:Renewal[];conflicts:Conflict[]
}
const plain=(value:unknown)=>JSON.stringify(value)
const dayMs=86400000
function manager(actor:Actor){if(actor.agent||!['owner','admin'].includes(actor.role))fail(403,'A venue manager must approve or change schedules.')}
function date(value:unknown,label:string):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail(400,`${label} must be a real YYYY-MM-DD date.`)
 return value as string
}
const nextDate=(value:string)=>new Date(Date.parse(value+'T00:00:00Z')+dayMs).toISOString().slice(0,10)
function clock(value:unknown,label:string):string{
 if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))fail(400,`${label} must use local HH:mm time.`)
 return value as string
}
function offset(value:unknown,label:string):string|undefined{
 if(value===undefined||value==='')return undefined
 if(value==='Z')return '+00:00'
 if(typeof value!=='string'||!/^[-+](0\d|1[0-4]):[0-5]\d$/.test(value)||(value.slice(1,3)==='14'&&value.slice(4)!=='00'))fail(400,`${label} must be an offset such as -04:00.`)
 return value as string
}
function times(p:any,base?:ShiftTimes):ShiftTimes{
 const result:ShiftTimes={startTime:clock(p.startTime,'Start time'),endTime:clock(p.endTime,'End time'),turnMinutes:number(p.turnMinutes??base?.turnMinutes,'Turn minutes',15,360),coverLimit:number(p.coverLimit??base?.coverLimit,'Cover limit',1,500)}
 const startOffset=offset(p.startOffset,'Start offset'),endOffset=offset(p.endOffset,'End offset')
 if(startOffset)result.startOffset=startOffset
 if(endOffset)result.endOffset=endOffset
 const minutes=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3))
 let duration=minutes(result.endTime)-minutes(result.startTime);if(duration<=0)duration+=1440
 if(duration<result.turnMinutes)fail(400,'Each shift must fit its full turn duration.')
 return result
}
function normalize(p:any,current:ScheduleTemplate|undefined,actor:Actor,now:string):ScheduleTemplate{
 if(!['breakfast','lunch','dinner'].includes(p.shift))fail(400,'Choose breakfast, lunch or dinner.')
 const seasonStart=date(p.seasonStart,'Season start'),seasonEnd=date(p.seasonEnd,'Season end')
 if(seasonStart>seasonEnd)fail(400,'Season end must be on or after season start.')
 if(!Array.isArray(p.weekdays)||p.weekdays.some((n:unknown)=>!Number.isInteger(n)||Number(n)<0||Number(n)>6)||new Set(p.weekdays).size!==p.weekdays.length)fail(400,'Use distinct weekdays from 0 (Sunday) through 6 (Saturday).')
 const base=times(p),raw=p.exceptions??[]
 if(!Array.isArray(raw))fail(400,'Exceptions must be a list of dated closures or replacement shifts.')
 const exceptions:ScheduleException[]=raw.map((entry:any)=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.closed!=='boolean')fail(400,'Each exception needs a date and an explicit closed flag.')
  const localDate=date(entry.date,'Exception date')
  if(localDate<seasonStart||localDate>seasonEnd)fail(400,'Exception dates must be inside the inclusive season.')
  return entry.closed?{date:localDate,closed:true}:{date:localDate,closed:false,...times(entry,base)}
 }).sort((a:ScheduleException,b:ScheduleException)=>a.date.localeCompare(b.date))
 if(new Set(exceptions.map(e=>e.date)).size!==exceptions.length)fail(400,'Use one exception per local date.')
 return {id:current?.id??id(),name:text(p.name,'Schedule name',120),shift:p.shift,seasonStart,seasonEnd,weekdays:[...p.weekdays].sort(),...base,exceptions,version:(current?.version??0)+1,updatedAt:now,updatedBy:actor.id}
}

/** Resolve with the venue's actual IANA rules. A fold needs an explicit offset; a gap never shifts silently. */
function localResolver(timezone:string){
 let formatter:Intl.DateTimeFormat
 try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})}catch{fail(400,'Use a valid IANA venue timezone before generating services.')}
 const parts=(at:number)=>{
  const values:Record<string,string>={}
  for(const part of formatter.formatToParts(new Date(at)))if(part.type!=='literal')values[part.type]=part.value
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`
 }
 const offsetsByDate=new Map<string,number[]>()
 return (localDate:string,time:string,choice:string|undefined)=>{
  const local=`${localDate}T${time}:00`,naive=Date.parse(local+'Z')
  let possibleOffsets=offsetsByDate.get(localDate)
  if(!possibleOffsets){
   const center=Date.parse(localDate+'T12:00:00Z'),found=new Set<number>()
   for(let hours=-36;hours<=36;hours+=6){const sample=center+hours*3600000;found.add(Date.parse(parts(sample)+'Z')-sample)}
   possibleOffsets=[...found];offsetsByDate.set(localDate,possibleOffsets)
  }
  const matches=possibleOffsets.map(o=>({at:naive-o,offset:o})).filter(v=>parts(v.at)===local)
  if(!matches.length)fail(400,`${localDate} ${time} does not exist in ${timezone}. Choose another local time.`)
  const label=(ms:number)=>`${ms<0?'-':'+'}${String(Math.floor(Math.abs(ms)/3600000)).padStart(2,'0')}:${String(Math.floor(Math.abs(ms)/60000)%60).padStart(2,'0')}`
  if(matches.length>1&&!choice)fail(400,`${localDate} ${time} occurs twice in ${timezone}. Choose an explicit offset: ${matches.map(v=>label(v.offset)).join(' or ')}.`)
  const selected=(choice?matches.find(v=>label(v.offset)===choice):matches[0])??fail(400,`${choice} is not a valid offset for ${localDate} ${time} in ${timezone}.`)
  return {at:new Date(selected.at).toISOString(),offset:label(selected.offset)}
 }
}
function occurrence(template:ScheduleTemplate,localDate:string):ShiftTimes|null{
 if(localDate<template.seasonStart||localDate>template.seasonEnd)return null
 const exception=template.exceptions.find(e=>e.date===localDate)
 if(exception)return exception.closed?null:exception as ShiftTimes
 return template.weekdays.includes(new Date(localDate+'T00:00:00Z').getUTCDay())?template:null
}
function sameService(a:GeneratedService,b:GeneratedService){
 return !a.closedAt&&a.name===b.name&&a.startAt===b.startAt&&a.endAt===b.endAt&&a.turnMinutes===b.turnMinutes&&a.coverLimit===b.coverLimit&&a.scheduleSource?.scheduleVersion===b.scheduleSource?.scheduleVersion
}
const overlaps=(a:Service,b:Service)=>Date.parse(a.startAt)<Date.parse(b.endAt)&&Date.parse(b.startAt)<Date.parse(a.endAt)
function conflictsFor(s:State,candidates:Candidate[]):Conflict[]{
 const conflicts:Conflict[]=[],replaced=new Set(candidates.filter(c=>['renew','close'].includes(c.action)).map(c=>c.existingServiceId))
 const active=candidates.filter(c=>['create','renew'].includes(c.action))
 for(let index=0;index<active.length;index++){
  const candidate=active[index]
  for(const existing of s.services)if(!existing.closedAt&&existing.id!==candidate.existingServiceId&&!replaced.has(existing.id)&&overlaps(candidate.service,existing))conflicts.push({candidateId:candidate.id,serviceId:existing.id,message:`Overlaps existing service ${existing.name}.`})
  for(const other of active.slice(0,index))if(overlaps(candidate.service,other.service))conflicts.push({candidateId:candidate.id,otherCandidateId:other.id,message:'Selected schedule occurrences overlap.'})
 }
 return conflicts
}

function preview(s:ScheduleState,actor:Actor,p:any,now:string):Proposal{
 const fromDate=date(p.fromDate,'Preview start'),toDate=date(p.toDate,'Preview end')
 if(toDate<fromDate||(Date.parse(toDate)-Date.parse(fromDate))/dayMs>=31)fail(400,'Preview an inclusive range of up to 31 days; preview the next range separately.')
 const schedules=s.schedules??[],scheduleIds=p.scheduleIds??schedules.map(t=>t.id)
 if(!Array.isArray(scheduleIds)||!scheduleIds.length||scheduleIds.some((v:unknown)=>typeof v!=='string')||new Set(scheduleIds).size!==scheduleIds.length)fail(400,'Select distinct saved schedule IDs to preview.')
 const selected:ScheduleTemplate[]=scheduleIds.map((scheduleId:string)=>schedules.find(t=>t.id===scheduleId)??fail(404,'Schedule not found.'))
 const renewServiceIds=p.renewServiceIds??[]
 if(!Array.isArray(renewServiceIds)||renewServiceIds.some((v:unknown)=>typeof v!=='string')||new Set(renewServiceIds).size!==renewServiceIds.length)fail(400,'Choose distinct existing service IDs for renewed approval.')
 const seats=s.tables.reduce((sum,t)=>sum+t.seats,0),resolve=localResolver(s.venue.timezone),candidates:Candidate[]=[],requiresRenewedApproval:Renewal[]=[]
 for(const template of selected)for(let localDate=fromDate;localDate<=toDate;localDate=nextDate(localDate)){
  const settings=occurrence(template,localDate)
  const existing=s.services.filter(v=>v.scheduleSource?.scheduleId===template.id&&v.scheduleSource.localDate===localDate)
  if(existing.length>1)fail(409,`Multiple generated services exist for ${template.name} on ${localDate}; review them individually before generating again.`)
  const current=existing[0]
  let service:GeneratedService|undefined,startOffset:string|undefined,endOffset:string|undefined
  if(settings){
   const start=resolve(localDate,settings.startTime,settings.startOffset),end=resolve(settings.endTime<=settings.startTime?nextDate(localDate):localDate,settings.endTime,settings.endOffset)
   const duration=(Date.parse(end.at)-Date.parse(start.at))/60000
   if(duration<settings.turnMinutes||duration>1440)fail(400,`${template.name} on ${localDate} must fit a full turn and be at most 24 elapsed hours.`)
   service={...structuredClone(current??{}),id:current?.id??id(),name:template.name,startAt:start.at,endAt:end.at,turnMinutes:settings.turnMinutes,coverLimit:settings.coverLimit,status:'published',version:(current?.version??0)+1,scheduleSource:{scheduleId:template.id,scheduleVersion:template.version,localDate}}
   delete service.closedAt;delete service.closedBy;delete service.closeReason
   startOffset=start.offset;endOffset=end.offset
  }
  if(!service&&!current)continue
  let action:Candidate['action']='create',renewal=false,preserved=false
  if(current){
   const unchanged=service?sameService(current,service):!!current.closedAt&&current.scheduleSource?.scheduleVersion===template.version
   if(unchanged){action='keep';service=structuredClone(current)}
   else if(Date.parse(current.endAt)<=Date.parse(now)){action='preserve';preserved=true;service=structuredClone(current)}
   else{
    renewal=true
    const bookingIds=s.bookings.filter(b=>b.serviceId===current.id).map(b=>b.id),selected=renewServiceIds.includes(current.id)
    preserved=bookingIds.length>0||!selected
    action=preserved?'preserve':service?'renew':'close'
    requiresRenewedApproval.push({serviceId:current.id,scheduleId:template.id,localDate,reason:service?'Template or generated service settings changed.':'The edited schedule no longer opens this date.',bookingIds,preserved,selected,manualReviewRequired:bookingIds.length>0})
    if(!service)service={...structuredClone(current),scheduleSource:{scheduleId:template.id,scheduleVersion:template.version,localDate},closedAt:now,closedBy:actor.id,closeReason:'Closed by explicitly renewed schedule publication.',version:current.version+1}
   }
  }
  if(!service)continue
  candidates.push({id:id(),scheduleId:template.id,scheduleVersion:template.version,localDate,action,service,capacity:{seats,coverLimit:service.coverLimit},requiresRenewedApproval:renewal,preserved,...(current?{existingServiceId:current.id}:{}),...(startOffset?{startOffset,endOffset}:{})})
 }
 for(const serviceId of renewServiceIds)if(!requiresRenewedApproval.some(row=>row.serviceId===serviceId))fail(400,'Renewed approval IDs must identify changed future services in this preview.')
 const plan:SchedulePlan={fromDate,toDate,timezone:s.venue.timezone,scheduleIds:[...scheduleIds],renewServiceIds:[...renewServiceIds],snapshot:structuredClone({venue:s.venue,tables:s.tables,combinations:s.combinations??[],services:s.services,bookings:s.bookings,schedules}),candidates,requiresRenewedApproval,conflicts:conflictsFor(s,candidates)}
 const proposal:Proposal={id:id(),kind:'schedule.publish',plan,status:'pending',preparedBy:actor.id,preparedAt:now,reason:text(p.reason,'Schedule publication reason',1000)}
 s.proposals.push(proposal)
 return proposal
}

/** The parent command transaction persists the decision and its audit row atomically. */
export function approveSchedule(s:State,actor:Actor,proposal:Proposal,now:string):Proposal{
 manager(actor)
 if(proposal.kind!=='schedule.publish')fail(400,'Choose a schedule publication proposal.')
 if(proposal.status!=='pending')fail(409,'This schedule proposal has already been decided.')
 const plan=proposal.plan as SchedulePlan,snapshot=plan.snapshot
 const current={venue:s.venue,tables:s.tables,combinations:s.combinations??[],services:s.services,bookings:s.bookings,schedules:(s as ScheduleState).schedules??[]}
 if(!snapshot||plain(current)!==plain(snapshot))fail(409,'The schedules, venue, floor, services or bookings changed. Preview and review the schedule again.')
 if(!s.tables.length)fail(409,'Create the real floor tables before publishing a schedule.')
 if(plan.conflicts.length)fail(409,'Resolve the overlapping services shown in the preview before publishing.')
 for(const candidate of plan.candidates){
  if(candidate.action==='create')s.services.push(structuredClone(candidate.service))
  else if(candidate.action==='renew'||candidate.action==='close'){
   const service=s.services.find(v=>v.id===candidate.existingServiceId)??fail(409,'An existing service changed. Preview again.')
   if(!plan.renewServiceIds.includes(service.id)||s.bookings.some(b=>b.serviceId===service.id))fail(409,'Existing guest commitments need an individual reviewed service change; no schedule changes were applied.')
   const replacement=structuredClone(candidate.service)
   // Retain independent service policy settings; a weekly-hours edit does not replace them.
   Object.assign(service,{name:replacement.name,startAt:replacement.startAt,endAt:replacement.endAt,turnMinutes:replacement.turnMinutes,coverLimit:replacement.coverLimit,status:replacement.status,version:replacement.version,scheduleSource:replacement.scheduleSource})
   if(candidate.action==='close')Object.assign(service,{closedAt:now,closedBy:actor.id,closeReason:replacement.closeReason})
   else{delete service.closedAt;delete service.closedBy;delete service.closeReason}
  }
 }
 proposal.status='approved';proposal.approvedBy=actor.id;proposal.approvedAt=now
 return proposal
}

export function executeSchedule(s:State,actor:Actor,p:any,command:string,now:string):any{
 const state=s as ScheduleState
 if(command==='schedule.preview'){
  if(!actor.agent&&!['owner','admin'].includes(actor.role))fail(403,'A venue manager or preparation key is required.')
  return preview(state,actor,p,now)
 }
 manager(actor)
 if(command==='schedule.save'){
  const current=p.id?state.schedules?.find(t=>t.id===p.id):undefined
  if(p.id&&!current)fail(404,'Schedule not found.')
  const template=normalize(p,current,actor,now)
  if(current){
   const content=(t:ScheduleTemplate)=>{const {version,updatedAt,updatedBy,...rest}=t;return rest}
   if(plain(content(current))===plain(content(template)))return current
   Object.assign(current,template);return current
  }
  ;(state.schedules??=[]).push(template);return template
 }
 if(command==='schedule.publish')return approveSchedule(s,actor,s.proposals.find(v=>v.id===p.proposalId)??fail(404,'Schedule proposal not found.'),now)
 return fail(400,'Unknown schedule command.')
}
