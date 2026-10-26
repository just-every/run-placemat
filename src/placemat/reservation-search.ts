import {experienceContext} from './experience-fit'
import {publicExperiences} from './experiences'
import {publicVenue} from './onboarding'
import {ruleFor} from './booking-rules'
import {slots} from './availability'
import {accessTags,accessibleTables} from './assignments'
import {fail,number,text,type State} from './model'

export const localDay=(at:string,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at))

/** Search constraints are also applied at commit; availability never holds a table. */
export function searchTables(state:State,area:unknown,tags:unknown){
 const requiredArea=area===undefined||area===''?undefined:text(area,'Dining area',80)
 const requiredAccessTags=accessTags(tags,'Required access tags'),filtered=accessibleTables(state,requiredAccessTags)
 return {requiredArea,requiredAccessTags,state:{...filtered,tables:filtered.tables.filter(t=>(t.inventoryKind!=='pool'||requiredArea===t.area)&&(!requiredArea||(t.area??'Dining room')===requiredArea))}}
}

export function reservationSearch(state:State,params:URLSearchParams){
 for(const key of ['date','partySize','area','experienceId','ticketClassId'])if(params.getAll(key).length>1)fail(400,`Supply ${key} only once.`)
 const date=params.get('date')||localDay(new Date().toISOString(),state.venue.timezone)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.startsWith('0000')||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail(400,'Choose a valid YYYY-MM-DD arrival date.')
 const partySize=number(params.get('partySize')??2,'Party size',1,500),area=params.get('area')??''
 const experienceId=params.get('experienceId')??'',requestedClass=params.get('ticketClassId')??''
 const catalog=publicExperiences(state),selected=experienceId?state.experiences?.find(e=>e.id===experienceId&&e.status==='published'&&e.kind==='free'):undefined
 if(experienceId&&!selected)fail(409,'This experience is not open for online booking. Choose another experience or contact the venue.')
 const ticket=selected?.ticketClasses.find(t=>t.id===(requestedClass||selected.ticketClasses[0].id))
 if(selected&&!ticket)fail(400,'Choose a current experience ticket class.')
 const selection=selected?{experienceId:selected.id,ticketClassId:ticket!.id,experienceVersion:selected.version}:{}
 const context=searchTables(state,area,params.getAll('requiredAccessTags'))
 const lastDate=new Date(Date.parse(date)+7*86400000).toISOString().slice(0,10)
 const results=[],policies=[]
 for(const service of state.services){
  if(service.status!=='published'||service.closedAt||localDay(service.endAt,state.venue.timezone)<date||localDay(service.startAt,state.venue.timezone)>lastDate)continue
  // BOOK-002 policy disclosure: the online channel's own SERVICE-004 rules for every service in the search window.
  const {minParty,maxParty,inquiryAbove,horizonDays,sameDayCutoff,leadMinutes,slotMinutes}=ruleFor(service,'online')
  policies.push({serviceId:service.id,serviceName:service.name,date:localDay(service.startAt,state.venue.timezone),minParty,maxParty,inquiryAbove,horizonDays,sameDayCutoff,leadMinutes,slotMinutes})
  if(selected&&!selected.serviceIds.includes(service.id))continue
  let available
  try{available=experienceContext(context.state,service,selection,partySize)}catch(error){if(error instanceof Error&&'status'in error&&Number(error.status)===409)continue;throw error}
  for(const slot of slots(available.state,available.service,partySize)){
   const arrivalDate=localDay(slot.startAt,state.venue.timezone)
   if(arrivalDate>=date&&arrivalDate<=lastDate)results.push({...slot,...selection,...selected?{experienceName:selected.name,className:ticket!.name}:{},serviceId:service.id,serviceName:service.name,date:arrivalDate,alternative:arrivalDate!==date})
  }
 }
 results.sort((a,b)=>a.startAt.localeCompare(b.startAt)||a.serviceName.localeCompare(b.serviceName)||a.serviceId.localeCompare(b.serviceId))
 const exact=results.some(r=>!r.alternative)
 return {experiences:catalog,inventoryOptions:(state.inventories??[]).map(i=>({...i,units:state.tables.filter(t=>t.inventoryId===i.id).map(t=>({id:t.id,label:t.label,ordinal:t.ordinal}))})),venue:publicVenue(state.venue),areas:[...new Set(state.tables.map(t=>t.area??'Dining room'))].sort(),accessTags:[...new Set(state.tables.flatMap(t=>t.accessTags??[]))].sort(),query:{date,partySize,area,...selected?{experienceId:selected.id,ticketClassId:ticket!.id}:{},requiredAccessTags:context.requiredAccessTags},results,policies,message:exact?'Available times on your date, followed by nearby dates. Times are not held until booking succeeds.':results.length?'No matching times on your date. Choose an available alternative in the next seven days.':'No matching times on this date or the next seven days. Change the date, party size or seating requirements, or contact the venue. No booking has been made.'}
}
