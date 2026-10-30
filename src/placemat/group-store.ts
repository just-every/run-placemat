import {fail} from './model'

/** Group access is read-only by design: no right here changes records, money, people, exports or providers. */
export const groupRights=['reports.read','preshift.read','guestbook.read'] as const
export type GroupRight=typeof groupRights[number]
export const groupSecret=(prefix:string)=>prefix+Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
export function groupOrigin(value:unknown):string{
 let url:URL
 try{url=new URL(String(value))}catch{return fail(400,'Use the https address of the venue, for example https://venue.example.')}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)fail(400,'Use only the https address of the venue, with no path or credentials.')
 return url.origin
}
export function groupRightList(value:unknown,allowed:readonly string[]=groupRights):GroupRight[]{
 if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(v=>typeof v!=='string'||!allowed.includes(v)))return fail(400,'Choose distinct group rights from the list.')
 return [...value] as GroupRight[]
}
export const parseRights=(json:string):GroupRight[]=>JSON.parse(json)
export const ownerGate=(db:D1Database,actorId:string)=>db.prepare("INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role='owner') THEN 1 ELSE 0 END").bind(actorId)
