import {fail} from './model'

export type ResolvedLocalTime={at:string;offset:string}
const offsetLabel=(ms:number)=>`${ms<0?'-':'+'}${String(Math.floor(Math.abs(ms)/3600000)).padStart(2,'0')}:${String(Math.floor(Math.abs(ms)/60000)%60).padStart(2,'0')}`

/** Resolve actual IANA offsets. Gaps refuse; repeated times require a chosen offset. */
export function localResolver(timezone:string){
 let formatter:Intl.DateTimeFormat
 try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})}catch{fail(400,'Use a valid IANA venue timezone before generating services.')}
 const parts=(at:number)=>{
  const values:Record<string,string>={}
  for(const part of formatter.formatToParts(new Date(at)))if(part.type!=='literal')values[part.type]=part.value
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`
 }
 const offsetsByDate=new Map<string,number[]>()
 const candidates=(local:string)=>{
  const localDate=local.slice(0,10),naive=Date.parse(local+'Z')
  let possibleOffsets=offsetsByDate.get(localDate)
  if(!possibleOffsets){
   const center=Date.parse(localDate+'T12:00:00Z'),found=new Set<number>()
   for(let hours=-36;hours<=36;hours+=6){const sample=center+hours*3600000;found.add(Date.parse(parts(sample)+'Z')-sample)}
   possibleOffsets=[...found];offsetsByDate.set(localDate,possibleOffsets)
  }
  return possibleOffsets.map(offset=>({at:naive-offset,offset})).filter(value=>parts(value.at)===local)
 }
 return (localDate:string,time:string,choice?:string):ResolvedLocalTime=>{
  const local=`${localDate}T${time}:00`,naive=Date.parse(local+'Z')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(localDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!Number.isFinite(naive)||new Date(naive).toISOString().slice(0,19)!==local)fail(400,'Enter a complete valid local date and time.')
  const matches=candidates(local)
  if(!matches.length){
   let next=naive,nextLocal:string,nextMatches:ReturnType<typeof candidates>
   do{next+=60000;nextLocal=new Date(next).toISOString().slice(0,19);nextMatches=candidates(nextLocal)}while(!nextMatches.length)
   fail(400,`${localDate} ${time} does not exist in ${timezone}. The next valid local time is ${nextLocal!.slice(0,10)} ${nextLocal!.slice(11,16)} (${offsetLabel(nextMatches![0].offset)}). Choose that time or another valid local time.`)
  }
  if(matches.length>1&&!choice)fail(400,`${localDate} ${time} occurs twice in ${timezone}. Choose an explicit offset: ${matches.map(value=>offsetLabel(value.offset)).join(' or ')}.`)
  const selected=(choice?matches.find(value=>offsetLabel(value.offset)===(choice==='Z'?'+00:00':choice)):matches[0])??fail(400,`${choice} is not a valid offset for ${localDate} ${time} in ${timezone}.`)
  return {at:new Date(selected.at).toISOString(),offset:offsetLabel(selected.offset)}
 }
}

export function resolveLocalTime(value:string,timezone:string,choice?:string):ResolvedLocalTime{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))fail(400,'Enter a complete valid local date and time.')
 return localResolver(timezone)(value.slice(0,10),value.slice(11),choice)
}
