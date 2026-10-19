export function turnPolicyFields(service,state,{field,esc,localTime}){
 const policy=service?.turnPolicy||{},parties=policy.partyTurns||[];
 return `<details class="wide"><summary>Turn and cleanup rules</summary><p class="help">Table rules take priority over area, party-size range and service duration, in that order. A table combination uses its longest turn. Existing bookings keep their confirmed turn and reset.</p><div class="form-grid">${field('Cleanup / reset (minutes)','turn.cleanupMinutes','number',policy.cleanupMinutes??0,'required min="0" max="120"')}${field('Last seating (venue time, optional)','turn.lastSeatingAt','datetime-local',policy.lastSeatingAt?localTime(policy.lastSeatingAt):'')}${field('Party ranges: min-max:minutes, separated by commas','turn.partyTurns','text',parties.map(p=>`${p.minSize}-${p.maxSize}:${p.minutes}`).join(', '),'placeholder="1-2:90, 3-6:120"')}<div class="wide turn-overrides"><h4>Table turn overrides</h4><div class="form-grid">${state.tables.map(t=>field(`${t.label} (minutes, optional)`,`turn.table.${t.id}`,'number',policy.tableTurns?.[t.id]??'','min="15" max="360"')).join('')}</div><h4>Area turn overrides</h4><div class="form-grid">${[...new Set(state.tables.map(t=>t.area||'Dining room'))].map(area=>field(`${area} (minutes, optional)`,esc(`turn.area.${area}`),'number',policy.areaTurns?.[area]??'','min="15" max="360"')).join('')}</div></div></div></details>`;
}
export function parseTurnPolicy(values,toUtc){
 if(!('turn.cleanupMinutes' in values))return;
 const policy={cleanupMinutes:Number(values['turn.cleanupMinutes']),partyTurns:[],tableTurns:{},areaTurns:{}};
 if(values['turn.lastSeatingAt'])policy.lastSeatingAt=toUtc(values['turn.lastSeatingAt']);
 const ranges=values['turn.partyTurns'].trim();
 if(ranges)policy.partyTurns=ranges.split(',').map(value=>{const match=value.trim().match(/^(\d+)-(\d+):(\d+)$/);if(!match)throw new Error('Use party ranges such as 1-2:90, 3-6:120.');return {minSize:Number(match[1]),maxSize:Number(match[2]),minutes:Number(match[3])}});
 for(const key of Object.keys(values))if(key.startsWith('turn.')){if(key.startsWith('turn.table.')&&values[key]!=='')policy.tableTurns[key.slice(11)]=Number(values[key]);if(key.startsWith('turn.area.')&&values[key]!=='')policy.areaTurns[key.slice(10)]=Number(values[key]);delete values[key];}
 values.turnPolicy=policy;
}
