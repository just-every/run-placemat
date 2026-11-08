// Synchronize selected legacy acceptance entries without rewriting other recorded journeys.
import {readFileSync,writeFileSync} from 'node:fs'
import {parseContract} from '../src/base/seed-contract.mjs'
const [mode,...ids]=process.argv.slice(2)
if(!['write','check'].includes(mode)||!ids.length)throw Error('Use write or check followed by changed clause IDs.')
const read=path=>readFileSync(path,'utf8'),rows=read('CONTRACT.md').split('\n').filter(line=>/^\| `[^`]+` \|/.test(line)).map(line=>line.slice(1,-1).split(/(?<!\\)\|/).map(cell=>cell.trim()))
const tally=rows=>['done','partial','missing'].map(status=>rows.filter(row=>row[3]===status).length).concat(rows.length)
const contract=read('CONTRACT.md').replace(/^\| (Published|Target and push further|All) \|.*$/gm,(_,label)=>`| ${label} | ${tally(rows.filter(row=>label==='All'||(label==='Published'?row[2]==='published':row[2]!=='published'))).join(' | ')} |`)
const parsed=parseContract(contract),lines=contract.split('\n')
let acceptance=read('ACCEPTANCE.md')
for(const id of [...new Set([...ids,...parsed.clauses.filter(c=>c.id.startsWith('BASE-AGENT-')).map(c=>c.id)])]){
 const clause=parsed.clauses.find(c=>c.id===id)
 if(!clause)throw Error('Unknown clause '+id)
 const cells=lines[clause.row-1].slice(1,-1).split(/(?<!\\)\|/).map(cell=>cell.trim()),journey=clause.text.split('**Acceptance evidence:**')[1]?.trim()??clause.text.split('**Acceptance.**')[1]?.trim().replace(/\s+/g,' ')
 if(!journey)throw Error('Missing acceptance evidence for '+id)
 const current=acceptance.split('\n').find(line=>line.startsWith(`- **${id} — `))
 if(!current&&!id.startsWith('BASE-AGENT-'))throw Error('Missing legacy acceptance entry '+id)
 if(!current)acceptance+='\n- **'+id+' — '+clause.title+'.**\n'
 acceptance=acceptance.replace(current??`- **${id} — ${clause.title}.**`,`- **${id} — ${clause.title}.** **Status: ${clause.status}.** ${journey} **Evidence:** ${cells[4]}`+(cells[5]?` **Remaining:** ${cells[5]}`:''))
}
const claims=['# Clause claims','','Generated from CONTRACT.md. The acceptance journeys are in ACCEPTANCE.md.','',`Inventory: ${parsed.counts.done} done, ${parsed.counts.partial} partial, ${parsed.counts.missing} missing; ${parsed.counts.total} total.`,'','| Clause | Status | Evidence |','| --- | --- | --- |',...parsed.clauses.map(c=>`| ${c.id} | ${c.status} | ${c.evidence.map(path=>'`'+path+'`').join('; ')} |`)].join('\n')+'\n'
for(const [path,output] of [['CONTRACT.md',contract],['ACCEPTANCE.md',acceptance],['docs/CLAIMS.md',claims]]){
 if(mode==='write')writeFileSync(path,output)
 else if(read(path)!==output)throw Error('Regenerate '+path)
}
console.log(`Contract docs ${mode}: ${ids.join(', ')}; ${parsed.counts.total} clauses`)
