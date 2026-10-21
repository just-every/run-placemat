import {inventoryChoices} from './seat-inventory'
import {assertInventory} from './direct-inventory'
import {fail,type State,type Service} from './model'
import {allocation} from './capacity'
import {assignmentFor,candidateSets} from './combinations'
import {tableTurn} from './turn-policy'

/** Enumerate single tables and exact approved joins; reserve setup before arrival. */
export function fitAt(s:State,service:Service,partySize:number,startAt:string,requested?:unknown,unavailable:string[]=[],allowPacing=false,channel='online'){
 const cleanup=service.turnPolicy?.cleanupMinutes??0
 if(startAt<service.startAt||service.turnPolicy?.lastSeatingAt&&startAt>service.turnPolicy.lastSeatingAt)fail(400,'Choose an arrival within the service and its last-seating time.')
 let best:(ReturnType<typeof assignmentFor>&{startAt:string;endAt:string;cleanupEndAt:string})|undefined,turnFits=false,lastConflict:Error|undefined
 if(channel!=='online')s={...s,tables:s.tables.filter(t=>t.inventoryKind!=='pool')}
 const choices=requested===undefined?[...candidateSets(s),...inventoryChoices(s,partySize,startAt,cleanup)]:[requested]
 for(const ids of choices){
  try{
   const assignment=assignmentFor(s,ids,partySize,startAt,service.startAt)
   const minutes=Math.max(...assignment.tables.map(t=>tableTurn(service,t,partySize)))
   const endAt=new Date(Date.parse(startAt)+minutes*60000).toISOString(),cleanupEndAt=new Date(Date.parse(endAt)+cleanup*60000).toISOString()
   if(cleanupEndAt>service.endAt)continue
   turnFits=true
   assertInventory(s,assignment.tables.map(t=>t.id),assignment.setupStartAt,cleanupEndAt,channel)
   const candidate={...assignment,startAt,endAt,cleanupEndAt}
   allocation(s,service,partySize,candidate,assignment.tables.map(t=>t.id),undefined,unavailable,new Date().toISOString(),allowPacing)
   const capacity=assignment.combination?.capacity??assignment.tables[0].seats,bestCapacity=best?.combination?.capacity??best?.tables[0].seats??Infinity
   if(!best||capacity<bestCapacity||capacity===bestCapacity&&(assignment.tables.length<best.tables.length||assignment.tables.length===best.tables.length&&endAt<best.endAt))best=candidate
  // Search may contain only the tables eligible for an area or access need.
  // A requested table outside that inventory is an unavailable fit, as before.
  }catch(error){if(error instanceof Error&&'status' in error&&[404,409].includes(Number(error.status))){if(Number(error.status)===409)lastConflict=error;continue;}throw error}
 }
 if(best)return best
 if(!turnFits&&choices.length&&s.tables.every(t=>Date.parse(startAt)+tableTurn(service,t,partySize)*60000+cleanup*60000>Date.parse(service.endAt)))fail(400,'Choose a start that fits the full turn and cleanup within service hours.')
 if(lastConflict)fail(409,`${lastConflict.message} Choose another available time or assignment.`)
 return fail(409,'No approved table assignment fits this party for its full setup, turn and cleanup. Choose another available time.')
}
