import type {Actor} from './model'
import {feeEvent} from './fee-policy'

/** A missing deadline fails closed. A current service boundary can only restrict saved authority. */
export function authorityExpiry(saved:string,serviceEnd:string|undefined,ended?:string|null){
 const limits=[saved,serviceEnd,...ended?[ended]:[]].map(value=>Date.parse(value??''))
 return new Date(limits.every(Number.isFinite)?Math.min(...limits):0).toISOString()
}

/** Runs inside the reviewed service amendment transaction, preserving the earlier limit on later extensions. */
export async function shortenServiceAuthority(db:D1Database,actor:Actor,serviceId:string,endAt:string){
 const statements:D1PreparedStatement[]=[]
 for(const table of ['pm_fee_consents','pm_card_guarantees']){
  const rows=await db.prepare(`SELECT id,booking_id,expires_at FROM ${table} WHERE json_extract(booking_snapshot,'$.serviceId')=? AND expires_at>?`).bind(serviceId,endAt).all<{id:string;booking_id:string;expires_at:string}>()
  for(const row of rows.results){
   statements.push(db.prepare(`UPDATE ${table} SET expires_at=? WHERE id=? AND expires_at>?`).bind(endAt,row.id,endAt),feeEvent(db,actor,'payment.authority-shortened',row.id,{serviceId,expiresAt:endAt},row.booking_id,{serviceId,expiresAt:row.expires_at}))
  }
 }
 return statements
}
