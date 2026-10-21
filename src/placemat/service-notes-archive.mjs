const invalid=message=>{throw Object.assign(new Error(message+'. Nothing was restored; correct the source records and download a fresh backup.'),{status:400})}
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const label=value=>typeof value==='string'&&value.trim().length>0
const instant=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))
const quantity=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max
function date(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false
 const parsed=Date.parse(value+'T12:00:00Z')
 return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===value
}

/** Product relationships shared by HTTP backups and native installation archives. */
export function validateServiceNotes(s){
 const menus=new Map()
 for(const service of s.services){
  const items=service.preorderItems===undefined?[]:service.preorderItems
  if(!Array.isArray(items))invalid('Invalid service preorder items')
  const menu=new Map()
  for(const item of items){
   if(!record(item)||!label(item.id)||!label(item.name)||typeof item.active!=='boolean'||menu.has(item.id))invalid('Invalid service preorder item')
   menu.set(item.id,item)
  }
  menus.set(service.id,menu)
  if(service.managerPreorders!==undefined){
   if(!Array.isArray(service.managerPreorders))invalid('Invalid manager preorder counts')
   const seen=new Set()
   for(const entry of service.managerPreorders){
    if(!record(entry)||!menu.has(entry.itemId)||seen.has(entry.itemId)||!quantity(entry.quantity,0,500)||!label(entry.actor)||!instant(entry.at))invalid('Invalid manager preorder count')
    seen.add(entry.itemId)
   }
  }
 }
 for(const booking of s.bookings){
  if(booking.preorders===undefined)continue
  if(!Array.isArray(booking.preorders))invalid('Invalid booking preorders')
  const menu=menus.get(booking.serviceId),seen=new Set()
  for(const entry of booking.preorders){
   if(!record(entry)||!menu?.has(entry.itemId)||seen.has(entry.itemId)||entry.itemName!==menu.get(entry.itemId).name||!quantity(entry.quantity,1,50))invalid('Invalid booking preorder relationship')
   seen.add(entry.itemId)
  }
 }
 if(s.serviceNotes===undefined)return
 if(!Array.isArray(s.serviceNotes))invalid('Invalid service notes')
 if(!s.serviceNotes.length)return
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:s.venue.timezone,year:'numeric',month:'2-digit',day:'2-digit'})
 const dates=new Set(s.services.map(service=>format.format(new Date(service.startAt))))
 const ids=new Set(),keys=new Set()
 for(const note of s.serviceNotes){
  if(!record(note)||!label(note.id)||ids.has(note.id)||!date(note.date)||!dates.has(note.date)||!['shift','kitchen'].includes(note.kind)||!Array.isArray(note.history)||!note.history.length)invalid('Invalid service note relationship')
  const key=note.date+':'+note.kind
  if(keys.has(key))invalid('Duplicate service note')
  ids.add(note.id);keys.add(key)
  for(const entry of note.history){
   if(!record(entry)||typeof entry.text!=='string'||!label(entry.actor)||!instant(entry.at))invalid('Invalid service note history')
  }
 }
}
