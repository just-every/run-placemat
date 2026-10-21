import {fail,id,type Actor,type State} from './model'

/** BOOK-002 analytics: the owner's provider settings live in state; the GA4 API secret and Meta access token live only in pm_analytics_keys. */
export type AnalyticsProvider='ga4'|'meta'
export type AnalyticsSettings={ga4:{enabled:boolean;measurementId:string;debugMode:boolean};meta:{enabled:boolean;datasetId:string;testEventCode:string}}
type KeyState={keySaved:boolean;keyEntered?:true;keyRemoved?:true}
export type AnalyticsAudit={ga4:AnalyticsSettings['ga4']&KeyState;meta:AnalyticsSettings['meta']&KeyState}
export const analyticsProviders:AnalyticsProvider[]=['ga4','meta']
const off:AnalyticsSettings={ga4:{enabled:false,measurementId:'',debugMode:false},meta:{enabled:false,datasetId:'',testEventCode:''}}
export const analyticsSettings=(s:State):AnalyticsSettings=>s.analytics??off

/** Which providers hold a saved key; never the key itself. */
export async function savedKeys(db:D1Database):Promise<Set<AnalyticsProvider>>{
 return new Set((await db.prepare('SELECT provider FROM pm_analytics_keys').all<{provider:AnalyticsProvider}>()).results.map(row=>row.provider))
}
/** Providers that send: switched on by the owner and holding a saved key. After a restore nothing sends until the owner enters each key again. */
export const activeProviders=(s:State,keys:Set<AnalyticsProvider>)=>analyticsProviders.filter(p=>analyticsSettings(s)[p].enabled&&keys.has(p))

const labels={ga4:'GA4',meta:'Meta'},keyNames={ga4:'API secret',meta:'access token'}
const flag=(value:unknown,label:string)=>typeof value==='boolean'?value:fail(400,`Choose whether ${label} is on or off.`)
function secret(value:unknown,label:string,min:number,max:number):string|undefined{
 if(value===undefined||value===null||value==='')return undefined
 return typeof value==='string'&&value.length>=min&&value.length<=max&&!/\s/.test(value)?value:fail(400,`${label} must be ${min}–${max} characters without spaces.`)
}

/** Owner-only. A blank key keeps the saved one and an entered key replaces it; switching a provider off stops its events and keeps its key. Key writes are fenced to the state version saved with them. */
export function setAnalytics(db:D1Database,s:State,actor:Actor,p:any,saved:Set<AnalyticsProvider>,version:number,now:string){
 if(actor.agent||actor.role!=='owner')fail(403,'The venue owner manages booking analytics.')
 const ga4=p.ga4??{},meta=p.meta??{}
 const next:AnalyticsSettings={
  ga4:{enabled:flag(ga4.enabled,'GA4 events'),measurementId:String(ga4.measurementId??'').trim().toUpperCase(),debugMode:flag(ga4.debugMode,'GA4 debug mode')},
  meta:{enabled:flag(meta.enabled,'Meta events'),datasetId:String(meta.datasetId??'').trim(),testEventCode:String(meta.testEventCode??'').trim().toUpperCase()},
 }
 if(next.ga4.measurementId&&!/^G-[A-Z0-9]{4,16}$/.test(next.ga4.measurementId))fail(400,'Enter the GA4 measurement ID, such as G-ABC123XYZ.')
 if(next.meta.datasetId&&!/^\d{6,20}$/.test(next.meta.datasetId))fail(400,'Enter the Meta dataset (Pixel) ID, digits only.')
 if(next.meta.testEventCode&&!/^[A-Z0-9]{4,20}$/.test(next.meta.testEventCode))fail(400,'Enter the Meta test event code from Events Manager, such as TEST12345, or leave it blank.')
 const entered={ga4:secret(ga4.apiSecret,'The GA4 API secret',8,200),meta:secret(meta.accessToken,'The Meta access token',20,1000)}
 const ids={ga4:next.ga4.measurementId,meta:next.meta.datasetId}
 const statements:D1PreparedStatement[]=[]
 for(const provider of analyticsProviders){
  if(next[provider].enabled&&!ids[provider])fail(400,`Enter the ${provider==='ga4'?'GA4 measurement ID':'Meta dataset (Pixel) ID'} before switching ${labels[provider]} events on.`)
  if(next[provider].enabled&&!entered[provider]&&!saved.has(provider))fail(400,`Enter the ${labels[provider]} ${keyNames[provider]} before switching ${labels[provider]} events on.`)
  if(entered[provider])statements.push(db.prepare('INSERT INTO pm_analytics_keys(provider,secret,saved_by,saved_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?) ON CONFLICT(provider) DO UPDATE SET secret=excluded.secret,saved_by=excluded.saved_by,saved_at=excluded.saved_at').bind(provider,entered[provider],actor.id,now,version))
 }
 const current=analyticsSettings(s)
 if(!statements.length&&JSON.stringify(current)===JSON.stringify(next))fail(409,'The booking analytics settings are unchanged.')
 s.analytics=next
 const audit=(settings:AnalyticsSettings,after:boolean):AnalyticsAudit=>({
  ga4:{...settings.ga4,keySaved:saved.has('ga4')||after&&!!entered.ga4,...(after&&entered.ga4?{keyEntered:true as const}:{})},
  meta:{...settings.meta,keySaved:saved.has('meta')||after&&!!entered.meta,...(after&&entered.meta?{keyEntered:true as const}:{})},
 })
 const entry={id:id(),at:now,actor:actor.id,action:'analytics.settings',subject:'analytics',before:audit(current,false),after:audit(next,true)}
 return {result:{analytics:next,keys:analyticsProviders.filter(p=>entry.after[p].keySaved),audit:entry},statements}
}

/** Owner-only (ct 21 Oct 2026): deletes one provider's saved key, fenced to the state version it was read at. Its settings stay as they are, so a provider left on sends nothing until the owner enters a new key. The audit records keySaved false and keyRemoved, never the key. */
export function removeAnalyticsKey(db:D1Database,s:State,actor:Actor,p:any,saved:Set<AnalyticsProvider>,version:number,now:string){
 if(actor.agent||actor.role!=='owner')fail(403,'The venue owner manages booking analytics.')
 const provider:AnalyticsProvider=analyticsProviders.includes(p?.provider)?p.provider:fail(400,'Choose GA4 or Meta.')
 if(!saved.has(provider))fail(409,`No ${labels[provider]} ${keyNames[provider]} is saved.`)
 const settings=analyticsSettings(s)
 const audit=(after:boolean):AnalyticsAudit=>({
  ga4:{...settings.ga4,keySaved:saved.has('ga4')&&!(after&&provider==='ga4'),...(after&&provider==='ga4'?{keyRemoved:true as const}:{})},
  meta:{...settings.meta,keySaved:saved.has('meta')&&!(after&&provider==='meta'),...(after&&provider==='meta'?{keyRemoved:true as const}:{})},
 })
 const entry={id:id(),at:now,actor:actor.id,action:'analytics.remove-key',subject:provider,before:audit(false),after:audit(true)}
 return {result:{provider,keys:analyticsProviders.filter(k=>entry.after[k].keySaved),audit:entry},statements:[db.prepare('DELETE FROM pm_analytics_keys WHERE provider=? AND EXISTS(SELECT 1 FROM pm_state WHERE id=1 AND version=?)').bind(provider,version)]}
}
