import {fail,type State} from './model'
export type ServiceBlock={id:string;serviceId:string;scope:'service'|'room'|'arrival'|'private';tableIds:string[];startAt:string;endAt:string}
/** Closure intervals are half-open; arrival restrictions apply to the arrival only. */
export function blockedByChange(s:State,tableIds:string[],startAt:string,endAt:string,arrivalAt=startAt){
 return (s.serviceChanges??[]).some(c=>c.tableIds.some(id=>tableIds.includes(id))&&(c.scope==='arrival'?arrivalAt>=c.startAt&&arrivalAt<c.endAt:startAt<c.endAt&&endAt>c.startAt))
}
export function assertServiceBlocks(s:State,tableIds:string[],startAt:string,endAt:string,arrivalAt=startAt){
 if(blockedByChange(s,tableIds,startAt,endAt,arrivalAt))fail(409,'This inventory is closed or held for private use. Choose another available time or assignment.')
}
