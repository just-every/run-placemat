import { emptyState, fail, type State, type Guest } from './model'
export async function load(db:D1Database):Promise<{state:State;version:number}> {
 await db.prepare('INSERT OR IGNORE INTO pm_state(id,version,data) VALUES(1,0,?)').bind(JSON.stringify(emptyState())).run()
 const row=await db.prepare('SELECT version,data FROM pm_state WHERE id=1').first<{version:number;data:string}>()
 const state:State=JSON.parse(row!.data)
 state.combinations??=[]
 return {state,version:row!.version}
}
export async function guests(db:D1Database):Promise<Guest[]> {return (await db.prepare('SELECT data FROM pm_guests ORDER BY id').all<{data:string}>()).results.map(r=>JSON.parse(r.data))}
export async function save(db:D1Database,state:State,version:number,before:D1PreparedStatement[]=[]) {
 const out=await db.batch([...before,db.prepare('DELETE FROM pm_assertions'),db.prepare('UPDATE pm_state SET data=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(state),version)])
 if(out.at(-1)!.meta.changes!==1) fail(409,'The floor changed. Refresh and review the current availability.')
}
export async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('')}
export const fenced = (db:D1Database,version:number,sql:string,...values:any[]) => db.prepare(sql+' AND EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(...values,version)
