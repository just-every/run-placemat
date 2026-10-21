import {demoEffect} from '../modules/demo/index.mjs'
import {fail,number,type State} from './model'
import {hash,load} from './store'
import {embedOrigin,embedOrigins} from './embed'
import {activeProviders,analyticsSettings,type AnalyticsProvider,type AnalyticsSettings} from './analytics'

/** BOOK-002 server-side analytics events (GA4 Measurement Protocol, Meta Conversions API); no provider script ever loads on a Placemat page. */
export type AnalyticsEvent='search'|'checkout-start'|'booking'
export type AnalyticsSource={door:'widget';origin:string}|{door:'booking-page'}
/** One consented page visit: the random visit ID lives only in the guest's page and in the provider requests; it is never stored. */
export type Visit={visitId:string;partySize:number;source:AnalyticsSource;userAgent:string}
export const metaGraphVersion='v26.0'
export const providerEventNames={ga4:{search:'search','checkout-start':'begin_checkout',booking:'placemat_booking'},meta:{search:'Search','checkout-start':'InitiateCheckout',booking:'Schedule'}} as const

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const visitId=(value:unknown)=>typeof value==='string'&&uuid.test(value)?value:undefined
const userAgent=(request:Request)=>(request.headers.get('user-agent')??'').slice(0,512)

/** A consented search or checkout start from the public page; the claimed website must be on the owner's list. */
export function publicVisit(s:State,p:any,request:Request):{event:AnalyticsEvent;visit:Visit}{
 if(p.event!=='search'&&p.event!=='checkout-start')fail(400,'Send a search or checkout-start event.')
 const id=visitId(p.visitId)??fail(400,'Send the random visit ID created when the guest accepted analytics.')
 const partySize=number(p.partySize,'Party size',1,500)
 let source:AnalyticsSource={door:'booking-page'}
 if(p.embedOrigin!==undefined&&p.embedOrigin!==''){
  const origin=embedOrigin(p.embedOrigin)
  if(!embedOrigins(s).includes(origin))fail(400,'This website is not allowed to embed booking.')
  source={door:'widget',origin}
 }
 return {event:p.event,visit:{visitId:id,partySize,source,userAgent:userAgent(request)}}
}
/** The completed-booking event for a booking that was just made; without a valid visit ID (no consent) there is no event. */
export function bookingVisit(p:any,partySize:number,request:Request):Visit|undefined{
 const id=visitId(p.analytics?.visitId)
 if(!id)return undefined
 return {visitId:id,partySize,source:p.embedOrigin?{door:'widget',origin:embedOrigin(p.embedOrigin)}:{door:'booking-page'},userAgent:userAgent(request)}
}

const params=(v:Visit)=>({party_size:v.partySize,booking_source:v.source.door,...(v.source.door==='widget'?{widget_origin:v.source.origin}:{})})
export function ga4Request(settings:AnalyticsSettings['ga4'],secret:string,event:AnalyticsEvent,v:Visit){
 const url=`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(settings.measurementId)}&api_secret=${encodeURIComponent(secret)}`
 const test=settings.debugMode?{debug_mode:true,engagement_time_msec:1}:{}
 return new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_id:v.visitId,events:[{name:providerEventNames.ga4[event],params:{...params(v),...test}}]})})
}
export async function metaRequest(settings:AnalyticsSettings['meta'],token:string,event:AnalyticsEvent,v:Visit,bookingPage:string,at:number){
 const url=`https://graph.facebook.com/${metaGraphVersion}/${settings.datasetId}/events?access_token=${encodeURIComponent(token)}`
 const data=[{event_name:providerEventNames.meta[event],event_time:Math.floor(at/1000),action_source:'website',event_source_url:v.source.door==='widget'?v.source.origin:bookingPage,user_data:{client_user_agent:v.userAgent,external_id:[await hash(v.visitId)]},custom_data:params(v)}]
 return new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data,...(settings.testEventCode?{test_event_code:settings.testEventCode}:{})})})
}

/** Honest provider answers: GA4 never confirms an event; Meta reports how many it received. */
async function answer(provider:AnalyticsProvider,response:Response):Promise<string>{
 if(provider==='ga4')return response.ok?'Sent. GA4 does not confirm events; check DebugView.':'GA4 refused the request.'
 const body=await response.json().catch(()=>null) as any
 return response.ok&&Number.isInteger(body?.events_received)?`Meta received ${body.events_received} event${body.events_received===1?'':'s'}.`:`Meta refused the request${body?.error?.type?` (${String(body.error.type).slice(0,60)})`:''}.`
}

/** Sends one event to every active provider. Runs after the guest's response (waitUntil), so a slow or failing provider never blocks or delays a booking.
 The send time is taken when the request hands the event over, so each provider keeps the answer to its most recently sent event, whichever answer arrives last. */
export async function sendAnalytics(db:D1Database,event:AnalyticsEvent,visit:Visit,bookingPage:string){
 const at=Date.now(),{state}=await load(db)
 const keys=new Map((await db.prepare('SELECT provider,secret FROM pm_analytics_keys').all<{provider:AnalyticsProvider;secret:string}>()).results.map(row=>[row.provider,row.secret]))
 const settings=analyticsSettings(state)
 await Promise.all(activeProviders(state,new Set(keys.keys())).map(async provider=>{
  let status=0,detail='The provider could not be reached.'
  try{
   const request=provider==='ga4'?ga4Request(settings.ga4,keys.get(provider)!,event,visit):await metaRequest(settings.meta,keys.get(provider)!,event,visit,bookingPage,at)
   const response=await demoEffect<Response|null>(()=>fetch(request,{signal:AbortSignal.timeout(10000)}),null)
   if(response){status=response.status;detail=await answer(provider,response)}
   else detail='Demo: nothing was sent to the provider.'
  }catch{}
  await db.prepare('INSERT INTO pm_analytics_results(provider,event,status,detail,at) VALUES(?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET event=excluded.event,status=excluded.status,detail=excluded.detail,at=excluded.at WHERE excluded.at>=pm_analytics_results.at').bind(provider,providerEventNames[provider][event],status,detail,new Date(at).toISOString()).run()
 }))
}
