import {businessCsv,type BusinessPerformanceReport} from './business-export'
import {emptyState,type Guest,type State} from './model'

/** D1 batches give the three record stores one consistent read transaction. */
export async function readBusinessCsv(db:D1Database,kind:string):Promise<string>{
 const [floor,people,reports]=await db.batch<{data:string}>([
  db.prepare('SELECT data FROM pm_state WHERE id=1'),
  db.prepare('SELECT data FROM pm_guests ORDER BY id'),
  db.prepare('SELECT id,service_id,published_at,published_by,floor_version,data FROM pm_performance_reports ORDER BY published_at,id'),
 ])
 const state:State=floor.results[0]?JSON.parse(floor.results[0].data):emptyState()
 const guests:Guest[]=people.results.map(row=>JSON.parse(row.data))
 return businessCsv(state,guests,kind,reports.results as unknown as BusinessPerformanceReport[])
}
