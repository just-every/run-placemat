// Native SendGrid signatures; only the outbound provider network is faked by callers.
import {generateKeyPairSync,sign} from 'node:crypto'

export function refundMailFixture({installationId='synthetic-placemat-1',tenantId='synthetic-placemat-2'}={}){
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
 const publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64')
 return {
  publicKey,installationId,tenantId,
  bindings:{MAIL_PROVIDER:'sendgrid',MAIL_API_KEY:'synthetic-placemat-1',RER_INSTALLATION_ID:installationId,SENDGRID_EVENT_TENANT_ID:tenantId,SENDGRID_EVENT_PUBLIC_KEY:publicKey},
  signedRequest(h,events,{timestamp=Math.floor(Date.now()/1000),rawBody=JSON.stringify(events),signature,headers={},path='/api/payments/refund-mail-events'}={}){
   const raw=Buffer.from(rawBody),prefix=String(timestamp)
   const signed=signature??sign('sha256',Buffer.concat([Buffer.from(prefix),raw]),{key:keys.privateKey,dsaEncoding:'der'}).toString('base64')
   return h.mf.dispatchFetch(h.origin+path,{method:'POST',headers:{'content-type':'application/json','x-twilio-email-event-webhook-timestamp':prefix,'x-twilio-email-event-webhook-signature':signed,...headers},body:raw})
  },
 }
}
