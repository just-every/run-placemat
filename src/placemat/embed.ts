import {fail,id,type Actor,type State} from './model'

/** BOOK-002: the owner's exact HTTPS origins that may frame the /book?embed=1 widget. */
export const maxEmbedOrigins=20
export const embedOrigins=(s:State):string[]=>s.embed?.origins??[]

function loopback(host:string){
 const name=host.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase()
 return name==='localhost'||name.endsWith('.localhost')||/^127(\.\d{1,3}){3}$/.test(name)||['0.0.0.0','::','::1'].includes(name)||/^::ffff:7f/.test(name)
}

/** Exact origin only: https, no wildcard, credentials, path, query, fragment or loopback host, in every environment. */
export function embedOrigin(value:unknown):string{
 const raw=typeof value==='string'?value.trim():''
 if(!raw||raw.length>200)fail(400,'Enter each website origin, such as https://www.example.com.')
 if(raw.includes('*'))fail(400,`Wildcards are not allowed: ${raw}. List each exact website origin.`)
 let url:URL
 try{url=new URL(raw)}catch{return fail(400,`Not a website origin: ${raw}. Use https://www.example.com.`)}
 if(url.protocol!=='https:')fail(400,`Only https origins can embed booking: ${raw}.`)
 if(url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)||/[?#]/.test(raw))fail(400,`Use the origin only, without a path, query or credentials: ${raw}.`)
 if(loopback(url.hostname))fail(400,`Local addresses cannot embed booking: ${raw}.`)
 return url.origin
}

/** Owner-only exact replacement of the list; every change keeps actor, time and before/after origins in the audit. */
export function setEmbedOrigins(s:State,actor:Actor,p:any,now:string){
 if(actor.agent||actor.role!=='owner')fail(403,'The venue owner manages which websites can embed booking.')
 if(!Array.isArray(p.origins))fail(400,'Send the complete list of allowed website origins.')
 const origins=[...new Set((p.origins as unknown[]).map(embedOrigin))]
 if(origins.length>maxEmbedOrigins)fail(400,`Allow at most ${maxEmbedOrigins} website origins.`)
 const before=embedOrigins(s)
 if(JSON.stringify(before)===JSON.stringify(origins))fail(409,'The allowed website list is unchanged.')
 s.embed={origins}
 return {origins,audit:{id:id(),at:now,actor:actor.id,action:'embed.origins',subject:'book',before:{origins:before},after:{origins}}}
}

/** The widget variant of /book is the only frameable document; it names the allowlist exactly or refuses every frame. */
export function bookFrameHeaders(origins:string[]):Record<string,string>{
 return origins.length?{'frame-ancestors':origins.join(' ')}:{'frame-ancestors':"'none'",'x-frame-options':'DENY'}
}

export const isWidgetRequest=(url:URL)=>url.pathname==='/book'&&url.searchParams.get('embed')==='1'

/** Every other response, staff pages included, stays unframeable in CSP and X-Frame-Options clients alike. */
export function unframeable(request:Request,response:Response):Response{
 if(response.status===101||isWidgetRequest(new URL(request.url)))return response
 const headers=new Headers(response.headers),policy=headers.get('content-security-policy')
 headers.set('x-frame-options','DENY')
 if(!policy?.includes('frame-ancestors'))headers.set('content-security-policy',policy?`${policy}, frame-ancestors 'none'`:"frame-ancestors 'none'")
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers})
}

/** Attribution for public bookings: a widget claim must name a currently allowed website. */
export function campaignCode(value:unknown):string|undefined{
 if(value===undefined||value==='')return undefined
 if(typeof value!=='string'||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value))fail(400,'Campaign must be a code of up to 80 letters, digits, dots, underscores or hyphens.')
 return value as string
}
export function bookingAttribution(s:State,claimed:unknown,campaign?:unknown):NonNullable<import('./model').Booking['attribution']>{
 const code=campaignCode(campaign),details=code?{campaign:code}:{}
 if(claimed===undefined||claimed===null||claimed==='')return {door:'booking-page',...details}
 const origin=embedOrigin(claimed)
 if(!embedOrigins(s).includes(origin))fail(400,'This website is not allowed to embed booking. No booking has been made.')
 return {door:'widget',origin,...details}
}
