import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

export const door='/api/public/diner/'
export const call=(h,action,body,options={})=>h.api(action.startsWith('/')?action:door+action,body,{as:'',...options})
export async function assertCustody(h,secret,table){
 const digest=createHash('sha256').update(secret).digest('hex')
 assert.ok(await h.db.prepare(`SELECT digest FROM ${table} WHERE digest=?`).bind(digest).first(),'Only the credential digest grants lookup')
 const tables=(await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results
 for(const {name} of tables){
  const rows=await h.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all()
  assert.ok(!JSON.stringify(rows.results).includes(secret),'Raw diner credential never persists in '+name)
 }
}
export const code=h=>{
 const match=h.messages.findLast(m=>m.subject==='Verify your diner account').text.match(/\b[a-f0-9]{64}\b/)
 assert.ok(match,'The emitted one-use code contains thirty-two random bytes')
 return match[0]
}
export async function issue(h,b,email){
 await call(h,'request',{bookingId:b.id,email,acknowledged:true},{status:202})
 return code(h)
}
export async function verify(h,b,email){return call(h,'verify',{code:await issue(h,b,email),acknowledged:true})}
