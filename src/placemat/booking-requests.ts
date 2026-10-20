import {fail,text} from './model'

export type BookingRequests={
 occasion:string;stroller:boolean;highchair:boolean;wheelchair:boolean;
 dietaryNotes:string;allergyNotes:string;seatingPreference:string;requestedArea:string
}
const labels={occasion:'Occasion',dietaryNotes:'Dietary notes',allergyNotes:'Allergy notes',seatingPreference:'Seating preference',requestedArea:'Requested area'}

/** Requests record preparation and preferences; area/access promises are separate fields. */
export function normalizeBookingRequests(p:any):BookingRequests{
 const value=p?.requests===undefined?p:p.requests
 if(value===null||typeof value!=='object'||Array.isArray(value))fail(400,'Send booking requests as an object.')
 const strings=Object.fromEntries(Object.entries(labels).map(([key,label])=>[key,value[key]===undefined||value[key]===''?'':text(value[key],label,key==='dietaryNotes'||key==='allergyNotes'?1000:200)]))
 const flags=Object.fromEntries(['stroller','highchair','wheelchair'].map(key=>{
  if(value[key]!==undefined&&typeof value[key]!=='boolean')fail(400,`Choose whether ${key} accommodation is requested.`)
  return [key,value[key]??false]
 }))
 return {...strings,...flags} as BookingRequests
}

export function requestTerms(requests:BookingRequests):string[]{
 const terms=Object.entries(labels).flatMap(([key,label])=>requests[key as keyof typeof labels]?[`${label} requested: ${requests[key as keyof typeof labels]}.`]:[])
 for(const key of ['stroller','highchair','wheelchair'] as const)if(requests[key])terms.push(`${key[0].toUpperCase()+key.slice(1)} accommodation requested.`)
 if(terms.length)terms.push('Requests are not guaranteed. Only the area, access needs and guarantees in an accepted venue offer are promised; allergy notes do not confirm allergy-safe preparation.')
 return terms
}
