import {fail,type State,type Service} from './model'
import {serviceInput} from './service-input'
import {reservationSearch,localDay} from './reservation-search'

/** The same search and capacity engine, on a transient service, with no write path. */
export function onboardingPreview(state:State,p:any){
 if(!state.tables.some(t=>!t.retiredAt))fail(409,'Add your real floor tables before previewing a service.')
 const service:Service={...serviceInput(state,p),id:'onboarding-preview',status:'published',version:0}
 const preview={...state,services:[...state.services,service]}
 const params=new URLSearchParams({date:localDay(service.startAt,state.venue.timezone),partySize:String(p.partySize??2)})
 const result=reservationSearch(preview,params)
 return {...result,results:result.results.filter(r=>r.serviceId===service.id),policies:result.policies.filter(r=>r.serviceId===service.id),preview:true,physicalSeats:state.tables.filter(t=>!t.retiredAt).reduce((sum,t)=>sum+t.seats,0)}
}
