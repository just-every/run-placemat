import {person} from './access'
import {fail,id,text,type Actor} from './model'
import {hash,load,save} from './store'
import {groupOrigin,groupRightList,groupRights,groupSecret,ownerGate,parseRights} from './group-store'

const DAY=86400000
type Row<T>={results:T[]}
const audit=(state:Awaited<ReturnType<typeof load>>['state'],actor:string,action:string,subject:string,changes:{kind:string;id:string;before:unknown;after:unknown}[])=>
 state.audit.push({id:id(),at:new Date().toISOString(),actor,action,subject,changes})

/** Home venue: the owner issues a one-use invitation, shown once and stored only as a hash. */
export async function groupInvite(db:D1Database,actor:Actor,p:any){
 person(actor,true)
 if(await db.prepare('SELECT 1 AS x FROM pm_group_home').first())fail(409,'This venue already belongs to another group. Leave it before inviting venues.')
 const label=text(p.label,'Venue label',80),code=groupSecret('gi_'),now=new Date(),expiresAt=new Date(now.getTime()+DAY).toISOString()
 const {state,version}=await load(db)
 audit(state,actor.id,'group.invite',label,[])
 await save(db,state,version,[ownerGate(db,actor.id),db.prepare('INSERT INTO pm_group_invites(code_hash,label,created_by,created_at,expires_at) VALUES(?,?,?,?,?)').bind(await hash(code),label,actor.id,now.toISOString(),expiresAt)])
 return {code,label,expiresAt}
}

/** Home venue, called by the joining venue with the invitation code; the code claims exactly once. */
export async function groupAccept(db:D1Database,p:any){
 const code=await hash(String(p.code??'')),now=new Date().toISOString()
 const invite=await db.prepare('SELECT label,expires_at,used_at FROM pm_group_invites WHERE code_hash=?').bind(code).first<{label:string;expires_at:string;used_at:string|null}>()
 if(!invite||invite.used_at||invite.expires_at<=now)return fail(403,'This group invitation is not valid.')
 const name=text(p.name,'Venue name',120),origin=groupOrigin(p.origin),ceiling=groupRightList(p.ceiling),linkId=id(),secret=groupSecret('gl_')
 if(await db.prepare('SELECT 1 AS x FROM pm_group_links WHERE origin=? AND revoked_at IS NULL').bind(origin).first())fail(409,'That venue is already connected.')
 const {state,version}=await load(db)
 audit(state,'group-invite:'+invite.label,'group.connect',linkId,[{kind:'groupLinks',id:linkId,before:null,after:{name,origin,ceiling}}])
 await save(db,state,version,[
  db.prepare('UPDATE pm_group_invites SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>?').bind(now,code,now),
  db.prepare('INSERT INTO pm_assertions(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM pm_group_invites WHERE code_hash=? AND used_at=?) THEN 1 ELSE 0 END').bind(code,now),
  db.prepare('INSERT INTO pm_group_links(id,name,origin,secret_hash,ceiling,joined_at) VALUES(?,?,?,?,?,?)').bind(linkId,name,origin,await hash(secret),JSON.stringify(ceiling),now)])
 return {linkId,secret,home:{name:state.venue.name}}
}

/** Member venue: the owner joins a group with the code and chooses the most any group admin may read here. */
export async function groupJoin(db:D1Database,actor:Actor,p:any,ownOrigin:string,fetcher:typeof fetch=fetch){
 person(actor,true)
 if(await db.prepare('SELECT 1 AS x FROM pm_group_home').first())fail(409,'This venue already belongs to a group.')
 if(await db.prepare('SELECT 1 AS x FROM pm_group_links WHERE revoked_at IS NULL').first())fail(409,'This venue hosts a group. Disconnect its venues before joining another group.')
 const homeOrigin=groupOrigin(p.homeOrigin),ceiling=groupRightList(p.ceiling),venueName=(await load(db)).state.venue.name
 let reply:any
 try{
  const response=await fetcher(homeOrigin+'/api/group/join-accept',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({code:text(p.code,'Invitation code',200),name:venueName,origin:ownOrigin,ceiling}),signal:AbortSignal.timeout(8000)})
  if(response.status===403||response.status===409)fail(409,'The group did not accept this invitation. Ask its owner for a new one.')
  if(!response.ok)fail(502,'The group venue could not be reached. Try again.')
  reply=await response.json()
 }catch(error){if(error&&typeof error==='object'&&'status' in error)throw error;fail(502,'The group venue could not be reached. Try again.')}
 if(typeof reply?.linkId!=='string'||typeof reply?.secret!=='string')fail(502,'The group venue answered unexpectedly.')
 const now=new Date().toISOString(),{state,version}=await load(db)
 audit(state,actor.id,'group.join',homeOrigin,[{kind:'groupHome',id:'home',before:null,after:{origin:homeOrigin,ceiling}}])
 await save(db,state,version,[ownerGate(db,actor.id),db.prepare('INSERT INTO pm_group_home(id,home_origin,link_id,secret,ceiling,joined_at) VALUES(1,?,?,?,?,?)').bind(homeOrigin,reply.linkId,reply.secret,JSON.stringify(ceiling),now)])
 return {homeOrigin,ceiling}
}
export async function groupLeave(db:D1Database,actor:Actor){
 person(actor,true)
 const row=await db.prepare('SELECT home_origin FROM pm_group_home').first<{home_origin:string}>();if(!row)return fail(409,'This venue is not in a group.')
 const {state,version}=await load(db)
 audit(state,actor.id,'group.leave',row.home_origin,[{kind:'groupHome',id:'home',before:{origin:row.home_origin},after:null}])
 await save(db,state,version,[ownerGate(db,actor.id),db.prepare('DELETE FROM pm_group_home')])
 return {left:true}
}

/** Home venue: replace one person's explicit per-venue rights; rights above a venue's ceiling are refused. */
export async function groupGrant(db:D1Database,actor:Actor,p:any){
 person(actor,true)
 const operatorId=text(p.operatorId,'Group admin',100),operator=await db.prepare('SELECT role,status FROM oa_operators WHERE id=?').bind(operatorId).first<{role:string;status:string}>()
 if(!operator||operator.status!=='active'||operator.role!=='member')fail(409,'Choose an active native member for group access.')
 if(!p.venues||typeof p.venues!=='object'||Array.isArray(p.venues))fail(400,'Choose the venues and their rights.')
 const links=(await db.prepare('SELECT id,ceiling FROM pm_group_links WHERE revoked_at IS NULL').all<{id:string;ceiling:string}>()).results
 const grants:[string,string[]][]=[]
 for(const [venueId,value] of Object.entries(p.venues)){
  const rights=groupRightList(value),link=links.find(l=>l.id===venueId)
  if(venueId!=='home'&&!link)fail(409,'Choose a connected venue.')
  if(link&&rights.some(r=>!parseRights(link.ceiling).includes(r)))fail(409,'That venue allows group admins fewer rights than requested.')
  if(rights.length)grants.push([venueId,rights])
 }
 const before=(await db.prepare('SELECT venue_id,rights FROM pm_group_admins WHERE operator_id=?').bind(operatorId).all<{venue_id:string;rights:string}>()).results
 const snapshot=(rows:[string,unknown][])=>rows.length?Object.fromEntries(rows):null
 const {state,version}=await load(db),now=new Date().toISOString()
 audit(state,actor.id,'group.admin',operatorId,[{kind:'groupAdmins',id:operatorId,before:snapshot(before.map(r=>[r.venue_id,JSON.parse(r.rights)])),after:snapshot(grants)}])
 await save(db,state,version,[ownerGate(db,actor.id),db.prepare('DELETE FROM pm_group_admins WHERE operator_id=?').bind(operatorId),...grants.map(([venueId,rights])=>db.prepare('INSERT INTO pm_group_admins(operator_id,venue_id,rights,granted_by,granted_at) VALUES(?,?,?,?,?)').bind(operatorId,venueId,JSON.stringify(rights),actor.id,now)),...(grants.length?[]:[db.prepare('DELETE FROM pm_group_tokens WHERE operator_id=?').bind(operatorId)])])
 return {operatorId,venues:Object.fromEntries(grants)}
}

/** Home venue: disconnecting a venue ends its introspection at once and drops every grant that reached it. */
export async function groupDisconnect(db:D1Database,actor:Actor,p:any){
 person(actor,true)
 const linkId=text(p.linkId,'Venue',100),link=await db.prepare('SELECT name,origin FROM pm_group_links WHERE id=? AND revoked_at IS NULL').bind(linkId).first<{name:string;origin:string}>()
 if(!link)return fail(404,'Connected venue not found.')
 const {state,version}=await load(db),now=new Date().toISOString()
 audit(state,actor.id,'group.disconnect',linkId,[{kind:'groupLinks',id:linkId,before:{name:link.name,origin:link.origin},after:null}])
 await save(db,state,version,[ownerGate(db,actor.id),db.prepare('UPDATE pm_group_links SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(now,linkId),db.prepare('DELETE FROM pm_group_admins WHERE venue_id=?').bind(linkId)])
 return {linkId,disconnected:true}
}

export const isGroupAdmin=async(db:D1Database,operatorId:string)=>!!await db.prepare('SELECT 1 AS x FROM pm_group_admins WHERE operator_id=?').bind(operatorId).first()
/** A group admin (or the owner) exchanges their signed-in session for a short-lived read token, shown once. */
export async function groupToken(db:D1Database,actor:Actor){
 if(actor.agent||!await isGroupAdmin(db,actor.id))fail(403,'The owner has not granted you group access.')
 const token=groupSecret('gt_'),now=Date.now(),expiresAt=new Date(now+12*3600000).toISOString()
 await db.batch([db.prepare('DELETE FROM pm_group_tokens WHERE expires_at<=?').bind(new Date(now).toISOString()),
  db.prepare('DELETE FROM pm_group_tokens WHERE operator_id=? AND token_hash NOT IN (SELECT token_hash FROM pm_group_tokens WHERE operator_id=? ORDER BY created_at DESC LIMIT 4)').bind(actor.id,actor.id),
  db.prepare('INSERT INTO pm_group_tokens(token_hash,operator_id,created_at,expires_at) VALUES(?,?,?,?)').bind(await hash(token),actor.id,new Date(now).toISOString(),expiresAt)])
 return {token,expiresAt}
}

export async function groupStatus(db:D1Database,actor:Actor){
 if(actor.agent)fail(403,'A person must open group settings.')
 const mine=(await db.prepare('SELECT venue_id,rights FROM pm_group_admins WHERE operator_id=?').bind(actor.id).all<{venue_id:string;rights:string}>()).results
 if(actor.role!=='owner'){
  if(!mine.length)fail(403,'The owner has not granted you group access.')
  return {role:'admin' as const,venues:[{id:'home',name:(await load(db)).state.venue.name},...(await db.prepare('SELECT id,name FROM pm_group_links WHERE revoked_at IS NULL').all<{id:string;name:string}>()).results],rights:Object.fromEntries(mine.map(r=>[r.venue_id,JSON.parse(r.rights)])),available:groupRights}
 }
 const [home,links,admins,invites]=await db.batch([db.prepare('SELECT home_origin,ceiling,joined_at FROM pm_group_home'),db.prepare('SELECT id,name,origin,ceiling,joined_at,revoked_at FROM pm_group_links ORDER BY joined_at'),db.prepare('SELECT operator_id,venue_id,rights FROM pm_group_admins ORDER BY operator_id,venue_id'),db.prepare('SELECT label,created_at,expires_at,used_at FROM pm_group_invites ORDER BY created_at DESC LIMIT 20')]) as unknown as Row<any>[]
 const member=home.results[0]
 return {role:'owner' as const,available:groupRights,standing:member?'member':links.results.some((l:any)=>!l.revoked_at)?'home':'none',home:member?{origin:member.home_origin,ceiling:JSON.parse(member.ceiling),joinedAt:member.joined_at}:null,
  links:links.results.map((l:any)=>({id:l.id,name:l.name,origin:l.origin,ceiling:JSON.parse(l.ceiling),joinedAt:l.joined_at,revokedAt:l.revoked_at})),
  admins:[...new Set(admins.results.map((r:any)=>r.operator_id))].map(operatorId=>({operatorId,venues:Object.fromEntries(admins.results.filter((r:any)=>r.operator_id===operatorId).map((r:any)=>[r.venue_id,JSON.parse(r.rights)]))})),
  invites:invites.results.map((i:any)=>({label:i.label,createdAt:i.created_at,expiresAt:i.expires_at,usedAt:i.used_at}))}
}
