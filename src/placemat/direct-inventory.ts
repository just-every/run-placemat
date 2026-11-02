import {fail,type State,type DirectInventory} from './model'

export type ScheduledInventory=DirectInventory
export const inventoryActive=(p:ScheduledInventory,now=new Date().toISOString())=>p.endAt>now&&(!p.releaseAt||p.releaseAt>now)
export const inventoryChannel=(p:DirectInventory)=>p.channel??'online'

/** Channel protection uses half-open setup-through-cleanup intervals in the shared physical ledger. */
export function assertInventory(state:State,tableIds:string[],startAt:string,endAt:string,channel:string){
 const blocked=state.services.flatMap(service=>service.directInventory??[]).find(p=>inventoryChannel(p)!==channel&&inventoryActive(p)&&p.startAt<endAt&&p.endAt>startAt&&p.tableIds.some(id=>tableIds.includes(id)))
 if(blocked)fail(409,`This table interval is protected for ${inventoryChannel(blocked)==='phone'?'phone reservations':'direct website bookings'}. A manager must review its release before another channel can allocate it.`)
}
