import {slots} from './availability'
import {accessTags,accessibleTables} from './assignments'
import {fail,number,text,type State} from './model'

export const localDay=(at:string,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at))

/** Search constraints are also applied at commit; availability never holds a table. */
export function searchTables(state:State,area:unknown,tags:unknown){
 const requiredArea=area===undefined||area===''?undefined:text(area,'Dining area',80)
 const requiredAccessTags=accessTags(tags,'Required access tags'),filtered=accessibleTables(state,requiredAccessTags)
 return {requiredArea,requiredAccessTags,state:{...filtered,tables:filtered.tables.filter(t=>!requiredArea||(t.area??'Dining room')===requiredArea)}}
}

export function reservationSearch(state:State,params:URLSearchParams){
 for(const key of ['date','partySize','area'])if(params.getAll(key).length>1)fail(400,`Supply ${key} only once.`)
 const date=params.get('date')||localDay(new Date().toISOString(),state.venue.timezone)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.startsWith('0000')||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail(400,'Choose a valid YYYY-MM-DD arrival date.')
 const partySize=number(params.get('partySize')??2,'Party size',1,500),area=params.get('area')??''
 const context=searchTables(state,area,params.getAll('requiredAccessTags'))
 const lastDate=new Date(Date.parse(date)+7*86400000).toISOString().slice(0,10)
 const results=[]
 for(const service of state.services){
  if(service.status!=='published'||service.closedAt||localDay(service.endAt,state.venue.timezone)<date||localDay(service.startAt,state.venue.timezone)>lastDate)continue
  for(const slot of slots(context.state,service,partySize)){
   const arrivalDate=localDay(slot.startAt,state.venue.timezone)
   if(arrivalDate>=date&&arrivalDate<=lastDate)results.push({...slot,serviceId:service.id,serviceName:service.name,date:arrivalDate,alternative:arrivalDate!==date})
  }
 }
 results.sort((a,b)=>a.startAt.localeCompare(b.startAt)||a.serviceName.localeCompare(b.serviceName)||a.serviceId.localeCompare(b.serviceId))
 const exact=results.some(r=>!r.alternative)
 return {venue:state.venue,areas:[...new Set(state.tables.map(t=>t.area??'Dining room'))].sort(),accessTags:[...new Set(state.tables.flatMap(t=>t.accessTags??[]))].sort(),query:{date,partySize,area,requiredAccessTags:context.requiredAccessTags},results,message:exact?'Available times on your date, followed by nearby dates. Times are not held until booking succeeds.':results.length?'No matching times on your date. Choose an available alternative in the next seven days.':'No matching times on this date or the next seven days. Change the date, party size or seating requirements, or contact the venue. No booking has been made.'}
}
