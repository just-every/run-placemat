import {fail,text} from './model'
export const costSources=[
 {name:'Twilio US SMS',url:'https://www.twilio.com/en-us/sms/pricing/us',checked:'2026-10-24',note:'Published base $0.0083 per segment. Carrier fees, number rental and registration are extra. Encoding and message length change segment counts.'},
 {name:'Stripe US online cards',url:'https://stripe.com/pricing',checked:'2026-10-24',note:'Domestic cards 2.9% + $0.30 per successful transaction. International cards +1.5%, currency conversion +1%, manually entered cards +0.5%; custom contracts and other fees can differ. Refunds do not generally return original processing fees.'},
 {name:'Cloudflare Workers',url:'https://developers.cloudflare.com/workers/platform/pricing/',checked:'2026-10-24',note:'Paid plan starts at $5/month plus request/CPU overages and other services including D1. Allowances are account-wide. Enter your installation allocation; no hosting bill is connected.'}
]
export function integer(v:unknown,label:string,max=100000000){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>max)fail(400,`${label} must be a nonnegative integer up to ${max}.`);return v as number}
export function month(v:unknown){if(typeof v!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v))fail(400,'Use a month in YYYY-MM format.');return v as string}
export function quote(v:any,label:string){
 if(v===null||v===undefined)return null
 if(!v||typeof v!=='object'||Array.isArray(v))fail(400,`${label} needs a rate, source and date.`)
 const micros=integer(v.micros,label+' USD micros',100000000000)
 const source=text(v.source,label+' source',300),date=text(v.date,label+' date',10)
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>new Date().toISOString().slice(0,10))fail(400,'Rate date must be a valid date through today.')
 return {micros,source,date}
}
export function calculate(p:any){
 const input={month:month(p.month),reminders:integer(p.reminders,'Reminders',1000000),segments:integer(p.segments,'Segments per reminder',100),covers:integer(p.covers,'Promoted event covers',1000000),payments:integer(p.payments,'Successful card payments',1000000),grossCents:integer(p.grossCents,'Domestic card volume cents',100000000000),carrier:quote(p.carrier,'Carrier fee per segment'),cover:quote(p.cover,'Distribution per cover'),promotion:quote(p.promotion,'Promotion total'),hosting:quote(p.hosting,'Hosting allocation')}
 if(input.reminders&&input.segments===0)fail(400,'Each reminder needs at least one segment.')
 if((input.payments===0)!==(input.grossCents===0))fail(400,'Card payment count and gross volume must both be zero or both positive.')
 const baseSms=input.reminders*input.segments*8300
 const sms=baseSms+(input.carrier?.micros??0)*input.reminders*input.segments
 const distribution=(input.cover?.micros??0)*input.covers
 const processor=input.grossCents*290+input.payments*300000
 const totalMicros=sms+distribution+processor+(input.promotion?.micros??0)+(input.hosting?.micros??0)
 if(!Number.isSafeInteger(totalMicros))fail(400,'Combined forecast is too large.')
 const unknown=[...input.reminders&&!input.carrier?['SMS carrier fees']:[],...input.covers&&!input.cover?['Distribution quote']:[],...!input.promotion?['Promotion spend']:[],...!input.hosting?['Hosting allocation']:[],'Number rental, registration, voice, optional providers and applicable tax','Card surcharges and custom processor pricing']
 return {input,smsMicros:sms,distributionMicros:distribution,processorMicros:processor,totalMicros,unknown,sources:costSources,currency:'usd',basis:'Published estimate plus owner-entered quotes; not a complete bill, send, campaign or channel enablement.'}
}
