import {number,text,fail,type State,type Service} from './model'
import {instant} from './availability'
import {localResolver} from './local-time'
import {normalizeRules} from './booking-rules'
import {normalizePacing} from './pacing'
import {normalizeTurnPolicy} from './turn-policy'

export function serviceInput(s:State,p:any,current?:Service|null){
 const resolve=localResolver(s.venue.timezone)
 const when=(value:unknown,choice:unknown,label:string)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?resolve(value.slice(0,10),value.slice(11),typeof choice==='string'?choice:undefined).at:instant(value,label)
 const startAt=when(p.startAt,p.startOffset,'Service start'),endAt=when(p.endAt,p.endOffset,'Service end'),turnMinutes=number(p.turnMinutes,'Turn minutes',15,360)
 const duration=(Date.parse(endAt)-Date.parse(startAt))/60000
 if(duration<turnMinutes||duration>1440)fail(400,'Service duration must fit a turn and be no more than 24 hours.')
 return {name:text(p.name,'Service name',120),startAt,endAt,turnMinutes,coverLimit:number(p.coverLimit,'Cover limit',1,500),pacing:normalizePacing(p.pacing??current?.pacing),bookingRules:normalizeRules(p.bookingRules??current?.bookingRules??s.venue.setup?.bookingDefaults),turnPolicy:normalizeTurnPolicy(p.turnPolicy??current?.turnPolicy,s,{startAt,endAt})}
}
