declare module '*modules/mail/index.mjs' {
 export function createD1EventStore(options:{db:D1Database}):unknown
 export function createDeliveryEventIntake(options:{
  provider:'resend';tenantId:string;eventNamespace:string;key:string;store:unknown
  authorize:(event:{provider:string;tenantId:string;eventNamespace:string;providerMessageId:string;recipients:string[]})=>Promise<boolean>
 }):{ingestWebhook(input:{rawBody:Uint8Array;headers:Headers}):Promise<Array<{eventId:string;outcome:string}>>}
}
