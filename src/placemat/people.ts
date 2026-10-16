import type { State } from './model'

/** Readable names for the people and preparation keys that prepared or approved
 * something, keyed by the ids stored in the floor state. Only referenced ids. */
export async function actorNames(db:D1Database,s:State):Promise<Record<string,string>>{
 const ids=[...new Set([...s.proposals.flatMap(p=>[p.preparedBy,p.approvedBy]),...s.reminders.map(r=>r.approvedBy)].filter((id):id is string=>!!id))].slice(0,90)
 if(!ids.length)return {}
 const marks=ids.map(()=>'?').join(',')
 const [people,keys]=await Promise.all([
  db.prepare(`SELECT id,display_name AS name FROM oa_operators WHERE id IN (${marks})`).bind(...ids).all<{id:string;name:string}>(),
  db.prepare(`SELECT id,name FROM pm_agent_keys WHERE id IN (${marks})`).bind(...ids).all<{id:string;name:string}>(),
 ])
 return {...Object.fromEntries(people.results.map(r=>[r.id,r.name])),...Object.fromEntries(keys.results.map(r=>[r.id,`${r.name} (preparation key)`]))}
}
