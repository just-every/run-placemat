import { sha256 } from './kit'

/** Separate contact fences prevent reimport after either contact detail changes. */
export function guestIdentityHashes(guest:{email?:string;phone?:string}):string[] {
 const email=(guest.email??'').trim().toLowerCase(), phone=(guest.phone??'').replace(/\D/g,'')
 return [...new Set([...(email?[sha256('email:'+email)]:[]),...(phone?[sha256('phone:'+phone)]:[])])]
}
export const importedGuestId=(sourceId:string)=>'tablein_'+sha256(sourceId).slice(0,32)
