import {fail,number,type Service,type State,type Table} from './model'
export type TurnPolicy={cleanupMinutes:number;lastSeatingAt?:string;partyTurns:Array<{minSize:number;maxSize:number;minutes:number}>;tableTurns:Record<string,number>;areaTurns:Record<string,number>}
export const emptyTurnPolicy=():TurnPolicy=>({cleanupMinutes:0,partyTurns:[],tableTurns:{},areaTurns:{}})
export function normalizeTurnPolicy(value:any,s:State,service:{startAt:string;endAt:string}):TurnPolicy{
 if(value===undefined)return emptyTurnPolicy()
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Send a turn policy object.')
 const cleanupMinutes=number(value.cleanupMinutes,'Cleanup minutes',0,120),partyTurns=value.partyTurns??[],tableTurns:Record<string,number>={},areaTurns:Record<string,number>={}
 if(!Array.isArray(partyTurns)||partyTurns.length>20)fail(400,'Choose up to 20 party-size turn rules.')
 const rules=partyTurns.map((p:any)=>({minSize:number(p.minSize,'Minimum turn party',1,500),maxSize:number(p.maxSize,'Maximum turn party',1,500),minutes:number(p.minutes,'Party turn minutes',15,360)}))
 for(let i=0;i<rules.length;i++){
  if(rules[i].maxSize<rules[i].minSize||rules.slice(0,i).some((r:{minSize:number;maxSize:number})=>r.minSize<=rules[i].maxSize&&r.maxSize>=rules[i].minSize))fail(400,'Party-size turn ranges must be ordered and must not overlap.')
 }
 for(const [id,minutes] of Object.entries(value.tableTurns??{})){
  if(!s.tables.some(t=>t.id===id))fail(400,'Choose a current table for a turn rule.')
  tableTurns[id]=number(minutes,'Table turn minutes',15,360)
 }
 for(const [area,minutes] of Object.entries(value.areaTurns??{})){
  if(!s.tables.some(t=>(t.area??'Dining room')===area))fail(400,'Choose a current dining area for a turn rule.')
  areaTurns[area]=number(minutes,'Area turn minutes',15,360)
 }
 let lastSeatingAt:string|undefined
 if(value.lastSeatingAt){
  if(typeof value.lastSeatingAt!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value.lastSeatingAt)||!Number.isFinite(Date.parse(value.lastSeatingAt)))fail(400,'Last seating requires an offset timestamp.')
  lastSeatingAt=new Date(value.lastSeatingAt).toISOString()
  if(lastSeatingAt<service.startAt||lastSeatingAt>service.endAt)fail(400,'Last seating must be within service hours.')
 }
 return {cleanupMinutes,partyTurns:rules,tableTurns,areaTurns,...(lastSeatingAt?{lastSeatingAt}:{})}
}
/** Table, then area, then party range, then service default. A join uses its longest table turn. */
export function tableTurn(service:Service,table:Table,partySize:number){
 const policy=service.turnPolicy
 return table.inventoryTurnMinutes??policy?.tableTurns[table.id]??policy?.areaTurns[table.area??'Dining room']??policy?.partyTurns.find(r=>partySize>=r.minSize&&partySize<=r.maxSize)?.minutes??service.turnMinutes
}
export function turnImpact(s:State,service:Service,policy:TurnPolicy){
 const proposed={...service,turnPolicy:policy}
 return s.bookings.filter(b=>b.serviceId===service.id).map(b=>{
  const minutes=Math.max(...b.tableIds.map(id=>tableTurn(proposed,s.tables.find(t=>t.id===id)!,b.partySize)))
  const endAt=new Date(Date.parse(b.startAt)+minutes*60000).toISOString(),cleanupEndAt=new Date(Date.parse(endAt)+policy.cleanupMinutes*60000).toISOString()
  return {bookingId:b.id,current:{endAt:b.endAt,cleanupEndAt:b.cleanupEndAt??b.endAt},proposed:{endAt,cleanupEndAt},changed:endAt!==b.endAt||cleanupEndAt!==(b.cleanupEndAt??b.endAt),preserved:true,outsideNewPolicy:cleanupEndAt>service.endAt||!!policy.lastSeatingAt&&b.startAt>policy.lastSeatingAt}
 })
}
