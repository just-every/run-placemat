import {fail,type Actor} from '../model'
import {guestRow,policy} from './store'

export type ErasureRevision={floorVersion:number;guestVersion:number;policyVersion:number}
export const staleErasure='This erasure review no longer applies. Review the guest again; nothing was erased.'
const encoder=new TextEncoder(),lifetime=5*60000
const key=(secret:string)=>crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])
const input=(actor:Actor,guestId:string,revision:ErasureRevision,expires:number)=>encoder.encode(JSON.stringify(['privacy.erasure',actor.id,guestId,revision,expires]))
async function snapshot(db:D1Database,guestId:unknown){
 const row=await guestRow(db,guestId),current=await policy(db)
 if(!current)fail(409,'Record retention grounds before reviewing privacy erasure.')
 if(row.guest.erased)fail(409,staleErasure)
 const floor=await db.prepare('SELECT version FROM pm_state WHERE id=1').first<{version:number}>()
 return {row,revision:{floorVersion:floor?.version??0,guestVersion:row.version as number,policyVersion:current.version as number}}
}
export async function reviewErasure(db:D1Database,actor:Actor,guestId:unknown,secret:string){
 const {row,revision}=await snapshot(db,guestId),expires=Date.now()+lifetime
 const signature=await crypto.subtle.sign('HMAC',await key(secret),input(actor,row.id,revision,expires))
 return {guestId:row.id,name:row.guest.name,review:`${expires}.`+Array.from(new Uint8Array(signature),v=>v.toString(16).padStart(2,'0')).join('')}
}
export async function validateErasure(db:D1Database,actor:Actor,p:any,secret:string):Promise<ErasureRevision>{
 if(typeof p.review!=='string')fail(409,staleErasure)
 const [expiry,hex,...extra]=p.review.split('.'),expires=Number(expiry),now=Date.now()
 if(extra.length||!/^\d+$/.test(expiry)||!Number.isSafeInteger(expires)||expires<=now||expires>now+lifetime||!/^[a-f0-9]{64}$/.test(hex??''))fail(409,staleErasure)
 const {row,revision}=await snapshot(db,p.guestId)
 const signature=Uint8Array.from((hex as string).match(/../g)!,v=>parseInt(v,16))
 if(!await crypto.subtle.verify('HMAC',await key(secret),signature,input(actor,row.id,revision,expires)))fail(409,staleErasure)
 return revision
}
