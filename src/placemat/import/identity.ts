import { sha256 } from './kit'

/** Separate contact fences prevent reimport after either contact detail changes. */
export function guestIdentityHashes(guest:{email?:string;phone?:string}):string[] {
 const email=(guest.email??'').trim().toLowerCase(), phone=(guest.phone??'').replace(/\D/g,'')
 // Keep the legacy digest and its equivalent US form: existing erasures may
 // contain either representation, and every read/write fence uses this set.
 const phones=phone?[phone]:[]
 if(phone.length===10)phones.push('1'+phone)
 else if(phone.length===11&&phone.startsWith('1'))phones.push(phone.slice(1))
 return [...new Set([...(email?[sha256('email:'+email)]:[]),...phones.map(value=>sha256('phone:'+value))])]
}
export const importedGuestId=(sourceId:string)=>'tablein_'+sha256(sourceId).slice(0,32)
