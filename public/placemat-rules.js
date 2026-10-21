export function bookingRuleFields(service,{field}){
 const defaults={minParty:1,maxParty:20,horizonDays:3650,leadMinutes:0,sameDayCutoff:'23:59',slotMinutes:15,inquiryAbove:20};
 return ['online','walk-in','waitlist'].map(channel=>{
  const rule={...defaults,...service?.bookingRules?.[channel]};
  return `<details class="wide"><summary>${channel} booking rules</summary><div class="form-grid">${[['Minimum party','minParty',1,500],['Maximum party','maxParty',1,500],['Advance horizon (local calendar days)','horizonDays',0,3650],['Lead time (minutes)','leadMinutes',0,525600],['Slot interval (minutes)','slotMinutes',5,120],['Route parties above this size to inquiries','inquiryAbove',1,500]].map(([label,key,min,max])=>field(label,`rule.${channel}.${key}`,'number',rule[key],`required min="${min}" max="${max}"`)).join('')}${field('Same-day cutoff (venue time)',`rule.${channel}.sameDayCutoff`,'time',rule.sameDayCutoff,' ')}${field('Blocked starts (comma-separated offset timestamps)',`rule.${channel}.blockedStarts`,'text',(rule.blockedStarts||[]).join(', '),'')}</div></details>`;
 }).join('');
}
export function parseBookingRules(values){
 const rules={};
 for(const key of Object.keys(values))if(key.startsWith('rule.')){
  const [,channel,field]=key.split('.');(rules[channel]??={})[field]=field==='sameDayCutoff'?values[key]:field==='blockedStarts'?values[key].split(',').map(v=>v.trim()).filter(Boolean):Number(values[key]);delete values[key];
 }
 if(Object.keys(rules).length)values.bookingRules=rules;
}
