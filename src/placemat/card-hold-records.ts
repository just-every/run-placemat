import {fail,type Actor} from './model'
import type {Guarantee} from './card-guarantees'
import type {CardHoldObservation} from './card-hold-provider'
import {feeEvent} from './fee-policy'
/** Provider facts remain distinct from agreement, authority expiry and owner decisions. */
export function holdObservationStatements(db:D1Database,actor:Actor,g:Guarantee,o:CardHoldObservation){
 if(g.authorization_reference&&g.authorization_reference!==o.reference)fail(502,'The authorization provider reference changed. Reconcile the original operation.')
 const heldCents=o.state==='unconfirmed'?g.authorization_held_cents:o.heldCents
 return [db.prepare('UPDATE pm_card_guarantees SET authorization_reference=?,authorization_state=?,authorization_held_cents=?,authorization_expires_at=COALESCE(?,authorization_expires_at),authorization_verified_at=?,expires_at=MIN(expires_at,COALESCE(?,expires_at)) WHERE id=?').bind(o.reference,o.state,heldCents,o.expiresAt,o.state==='unconfirmed'?g.authorization_verified_at:o.verifiedAt,o.expiresAt,g.id),feeEvent(db,actor,'payment.card-hold-observed',g.id,{reference:o.reference,state:o.state,heldCents:o.state==='unconfirmed'?null:o.heldCents,lastVerifiedHeldCents:heldCents,expiresAt:o.expiresAt,verifiedAt:o.verifiedAt},g.booking_id,{reference:g.authorization_reference,state:g.authorization_state,heldCents:g.authorization_held_cents,expiresAt:g.authorization_expires_at,verifiedAt:g.authorization_verified_at})]
}
