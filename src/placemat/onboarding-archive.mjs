const invalid=message=>{throw Object.assign(new Error(message+'. Nothing was restored; correct the source records and download a fresh backup.'),{status:400})}
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max
const instant=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))
const channels=['online','walk-in','waitlist']
function equal(a,b){
 if(a===b)return true
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>equal(value,b[index]))
 if(!record(a)||!record(b))return false
 const keys=Object.keys(a)
 return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equal(a[key],b[key]))
}
function rules(value){
 if(!record(value))invalid('Invalid restaurant booking defaults')
 for(const channel of channels){
  const p=value[channel]
  if(!record(p)||!integer(p.minParty,1,500)||!integer(p.maxParty,p.minParty,500)||!integer(p.horizonDays,0,3650)||!integer(p.leadMinutes,0,525600)||!integer(p.slotMinutes,5,120)||!integer(p.inquiryAbove,1,500)||typeof p.sameDayCutoff!=='string'||p.sameDayCutoff!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.sameDayCutoff)||!Array.isArray(p.blockedStarts)||p.blockedStarts.length>100||p.blockedStarts.some(value=>!instant(value)))invalid('Invalid restaurant '+channel+' booking defaults')
 }
 if(value.online.inquiryAbove!==value.online.maxParty)invalid('Invalid online inquiry threshold')
}

/** Validate only installations that have saved restaurant setup; older archives remain valid. */
export function validateOnboarding(s){
 const venue=s.venue,setup=venue.setup
 if(setup===undefined)return
 if(!record(setup)||!text(venue.name,120)||!text(venue.timezone,80)||!text(setup.legalName,200)||!text(setup.address,500)||setup.currency!=='USD'||typeof setup.phone!=='string'||!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(setup.phone)||!text(setup.email,254)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(setup.email)||typeof setup.website!=='string'||typeof setup.logo!=='string'||!Number.isSafeInteger(setup.version)||setup.version<1)invalid('Invalid restaurant setup')
 try{new Intl.DateTimeFormat('en',{timeZone:venue.timezone}).format()}catch{invalid('Invalid restaurant timezone')}
 if(setup.website){
  try{const url=new URL(setup.website);if(url.protocol!=='https:'||url.username||url.password)throw Error()}catch{invalid('Invalid restaurant contact website')}
 }
 if(setup.logo&&(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(setup.logo)||setup.logo.length>280000))invalid('Invalid restaurant logo')
 rules(setup.bookingDefaults)
 const acknowledgment=setup.acknowledgment
 if(!record(acknowledgment)||!text(acknowledgment.actor,Infinity)||!instant(acknowledgment.at)||acknowledgment.version!==setup.version)invalid('Invalid restaurant policy acknowledgment')
 rules(acknowledgment.rules)
 if(!equal(acknowledgment.rules,setup.bookingDefaults))invalid('Restaurant policy acknowledgment does not match the current booking defaults')
}
