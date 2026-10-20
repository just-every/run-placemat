import {performanceReport} from './performance'
import {fail,id,text,type Actor} from './model'
import {load} from './store'

type Published = {id:string;service_id:string;published_at:string;published_by:string;floor_version:number;data:string}

export async function readPerformance(db:D1Database,params:URLSearchParams) {
 const {state,version}=await load(db),snapshot=params.get('snapshot')
 let report:ReturnType<typeof performanceReport>,publication:null|{id:string;at:string;actor:string;version:number}=null
 if(snapshot){
  const row=await db.prepare('SELECT * FROM pm_performance_reports WHERE id=?').bind(snapshot).first<Published>()??fail(404,'Published performance report not found.')
  report=JSON.parse(row.data);publication={id:row.id,at:row.published_at,actor:row.published_by,version:row.floor_version}
 }else report=performanceReport(state,text(params.get('serviceId'),'Service'))
 const saved=await db.prepare('SELECT id,published_at,published_by,floor_version FROM pm_performance_reports WHERE service_id=? ORDER BY published_at DESC,id').bind(report.serviceId).all<Omit<Published,'data'|'service_id'>>()
 return {report,publication,currentVersion:version,changedSincePublication:publication!==null&&publication.version!==version,publications:saved.results.map(row=>({id:row.id,at:row.published_at,actor:row.published_by,version:row.floor_version}))}
}

/** Store numeric service facts and stable references; later corrections create a new publication. */
export async function publishPerformance(db:D1Database,actor:Actor,p:Record<string,unknown>) {
 const {state,version}=await load(db),serviceId=text(p.serviceId,'Service'),now=new Date().toISOString()
 const report=performanceReport(state,serviceId,now),reportId=id()
 const result=await db.prepare('INSERT INTO pm_performance_reports(id,service_id,published_at,published_by,floor_version,data) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(reportId,serviceId,now,actor.id,version,JSON.stringify(report),version).run()
 if(result.meta.changes!==1)fail(409,'The floor changed. Refresh before publishing this report.')
 return readPerformance(db,new URLSearchParams({snapshot:reportId}))
}
