// Release/nightly fresh local launch; the lane's independent stranger journey is separate.
import {mkdtemp,cp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawn} from 'node:child_process'
import assert from 'node:assert/strict'
const root=resolve('.'),dir=await mkdtemp(join(tmpdir(),'placemat-install-'))
const cli=resolve('node_modules/@runeditrun/rer/global/rer.mjs')
let child
try{
 await cp(root,dir,{recursive:true,filter:path=>!['.git','node_modules','dist','.wrangler','.seed','.rer','.tanstack','.cache','exports'].some(part=>path.slice(root.length).split('/').includes(part))&&!/\/\.dev\.vars/.test(path)})
 child=spawn(process.execPath,[cli,'dev','--cwd',dir,'--json','--non-interactive'],{stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',RER_BROWSER:'0'}})
 child.stderr.resume()
 let buffer='',ready
 // Keep credentials in memory and never log the launch output.
 const completion=new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){try{const event=JSON.parse(line);if(event.event==='ready'){ready=event;resolve()}if(event.event==='error')reject(Error(event.message??event.code))}catch(error){if(error instanceof SyntaxError)continue;reject(error)}}});child.once('exit',code=>{if(!ready)reject(Error('Fresh launch exited '+code))})})
 await Promise.race([completion,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Fresh launch exceeded ten minutes')),600000);timer.unref()})])
 const response=await fetch(ready.url+'/health');assert.equal(response.status,200);assert.ok(ready.openUrl)
 console.log('Fresh installer launch passed: migrated, owner prepared, health ready, sign-in offered.')
}finally{
 if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve))}
 const stop=spawn(process.execPath,[cli,'dev','--cwd',dir,'--stop','--json'],{stdio:'ignore'});await new Promise(resolve=>stop.once('exit',resolve))
 await rm(dir,{recursive:true,force:true})
}
