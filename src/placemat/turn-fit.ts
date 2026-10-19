import {fail,type State,type Service,type Table} from './model'
import {allocation} from './capacity'
import {tableTurn} from './turn-policy'

/** Search real fitting combinations for each possible turn, including reset occupancy. */
export function fitAt(s:State,service:Service,partySize:number,startAt:string,requested?:unknown){
 const policy=service.turnPolicy,cleanup=policy?.cleanupMinutes??0
 if(startAt<service.startAt||policy?.lastSeatingAt&&startAt>policy.lastSeatingAt)fail(400,'Choose an arrival within the service and its last-seating time.')
 const durations=[...new Set(s.tables.map(t=>tableTurn(service,t,partySize)))].sort((a,b)=>a-b)
 let best:{startAt:string;endAt:string;cleanupEndAt:string;tables:Table[]}|undefined,physicalFitTried=false
 for(const minutes of durations){
  const endAt=new Date(Date.parse(startAt)+minutes*60000).toISOString(),cleanupEndAt=new Date(Date.parse(endAt)+cleanup*60000).toISOString()
  if(cleanupEndAt>service.endAt)continue
  physicalFitTried=true
  const eligible=s.tables.filter(t=>tableTurn(service,t,partySize)<=minutes)
  if(Array.isArray(requested)&&requested.some(id=>!eligible.some(t=>t.id===id)))continue
  let tables:Table[]
  try{tables=allocation({...s,tables:eligible},service,partySize,{startAt,endAt,cleanupEndAt},requested)}catch(error){if(error instanceof Error&&'status' in error&&error.status===409)continue;throw error}
  const actual=Math.max(...tables.map(t=>tableTurn(service,t,partySize))),actualEnd=new Date(Date.parse(startAt)+actual*60000).toISOString()
  const candidate={startAt,endAt:actualEnd,cleanupEndAt:new Date(Date.parse(actualEnd)+cleanup*60000).toISOString(),tables}
  const seats=(ts:Table[])=>ts.reduce((n,t)=>n+t.seats,0)
  if(!best||seats(tables)<seats(best.tables)||seats(tables)===seats(best.tables)&&(tables.length<best.tables.length||tables.length===best.tables.length&&candidate.endAt<best.endAt))best=candidate
 }
 if(best)return best
 if(!physicalFitTried)fail(400,'Choose a start that fits the full turn and cleanup within service hours.')
 return fail(409,'No table combination fits this party for its full turn and cleanup. Choose another available time.')
}
