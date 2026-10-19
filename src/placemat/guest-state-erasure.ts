import type {State} from './model'
import type {D1Database,D1Sql} from './import/kit'

/** Guest-linked operational free text follows the existing DATA-002 erasure. */
export async function guestStateErasure(db:D1Database,guestId:string):Promise<D1Sql[]>{
 const row=await db.prepare('SELECT version,data FROM pm_state WHERE id=1').first()
 if(!row)return []
 const state=JSON.parse(row.data) as State
 const bookings=[...state.bookings,...state.proposals.flatMap(p=>[...(p.plan?.bookings??[]),...(p.plan?.booking?[p.plan.booking]:[])])]
 for(const b of bookings)if(b.guestId===guestId&&b.ruleOverride)b.ruleOverride.reason=''
 return [
  {sql:'INSERT INTO ik_d1_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) THEN 1 ELSE 0 END',params:[row.version]},
  {sql:'UPDATE pm_state SET data=?,version=version+1 WHERE id=1 AND version=?',params:[JSON.stringify(state),row.version]},
 ]
}
