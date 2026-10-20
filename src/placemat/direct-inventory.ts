import {fail,type State} from './model'

/** Protected website inventory uses half-open setup-through-cleanup intervals. */
export function assertInventory(state:State,tableIds:string[],startAt:string,endAt:string,channel:string){
 if(channel==='online')return
 if(state.services.flatMap(service=>service.directInventory??[]).some(p=>p.startAt<endAt&&p.endAt>startAt&&p.tableIds.some(id=>tableIds.includes(id))))fail(409,'This table interval is protected for direct website bookings. A manager must review its release before staff seating or reassignment.')
}
