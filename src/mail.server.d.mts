import type { MailSender } from './modules/operator-auth/index.mjs'
import type { Bindings } from './auth.server'
export function operatorMail(env: Bindings): MailSender | undefined
export type DeliveryEvent={deliveryId:string|null;product:string|null;providerMessageId:string;recipients:readonly string[]}
export type EventResult={eventId:string;outcome:'stored'|'duplicate'}
export function createD1EventStore(options:{db:D1Database}):object
export function createDeliveryEventIntake(options:{provider:'sendgrid';tenantId:string;eventNamespace:string;key:string;store:object;authorize:(event:DeliveryEvent)=>Promise<boolean>}):{ingestWebhook(input:{rawBody:Uint8Array;headers:Headers}):Promise<EventResult[]>}
