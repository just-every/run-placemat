import {fail,type State,type DirectInventory} from './model'

export type ScheduledInventory=DirectInventory&{releaseAt?:string}
export const inventoryActive=(p:ScheduledInventory,now=new Date().toISOString())=>p.endAt>now&&(!p.releaseAt||p.releaseAt>now)

/** Protected website inventory uses half-open setup-through-cleanup intervals. */
export function assertInventory(state:State,tableIds:string[],startAt:string,endAt:string,channel:string){
 if(channel==='online')return
 if(state.services.flatMap(service=>service.directInventory??[]).some(p=>inventoryActive(p)&&p.startAt<endAt&&p.endAt>startAt&&p.tableIds.some(id=>tableIds.includes(id))))fail(409,'This table interval is protected for direct website bookings. A manager must review its release before staff seating or reassignment.')
}
