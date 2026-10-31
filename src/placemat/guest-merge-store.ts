import type {Actor,State} from './model'

/** Snapshots and the identity-change journal remain manager-only on every reader. */
export function filterMergeAudit(state:State,actor:Actor):State {
 if(!actor.agent&&['owner','admin'].includes(actor.role))return state
 delete state.guestEnrichments
 state.audit=state.audit.filter(event=>!['guest.merge','guest.unmerge'].includes(event.action)&&!event.action.startsWith('guest.enrichment.'))
 return state
}
export async function readMergeJournal(db:D1Database,guestId:string){
 const rows=await db.prepare("SELECT data FROM pm_guest_merges WHERE json_extract(data,'$.guestId')=? OR json_extract(data,'$.duplicateId')=? ORDER BY rowid DESC").bind(guestId,guestId).all<{data:string}>()
 return rows.results.map(row=>JSON.parse(row.data))
}
