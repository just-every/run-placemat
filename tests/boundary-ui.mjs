// BOUND-001: inspect the shipped site, owner guide and real staff/guest doors at both widths.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest} from './api/harness.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
try{
 for(const width of [1440,390]){
  const h=await installation(),context=await browser.newContext({viewport:{width,height:1000}})
  try{
   await h.command('venue.update',{name:'Cedar & Salt',timezone:'America/New_York'})
   for(let i=0;i<4;i++)await h.command('table.save',{label:`T${i+1}`,seats:2,x:15+i*22,y:40})
   const date=new Date();date.setUTCDate(date.getUTCDate()+((5-date.getUTCDay()+7)%7||7));const day=date.toISOString().slice(0,10)
   const s=await h.command('service.save',{name:'Friday dinner',startAt:day+'T23:00:00Z',endAt:new Date(Date.parse(day+'T23:00:00Z')+4*3600000).toISOString(),turnMinutes:90,coverLimit:8})
   const plan=await h.command('proposal.prepare',{kind:'service.publish',plan:{serviceId:s.id},reason:'Reviewed Friday dinner'})
   await h.command('proposal.approve',{proposalId:plan.id})
   const booked=(await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})).result
   await context.addCookies(h.cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:h.origin,secure:true,sameSite:'Lax'}}))
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==h.origin){await route.abort();return}
    const site=url.pathname==='/'?'index.html':url.pathname.startsWith('/docs/')?url.pathname.slice(1)+'.html':url.pathname.startsWith('/site-assets/')?url.pathname.slice(1):null
    const file=resolve(site?'dist/site':'public',site??'.'+url.pathname)
    if(site||extname(file)){
     try{const body=await readFile(file);await route.fulfill({status:200,contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body});return}catch{}
    }
    const response=await h.mf.dispatchFetch(req.url(),{method:req.method(),headers:{...req.headers(),host:url.host},...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})})
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
   })
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
   const shot=async(name,locator=page)=>{
    if(shots)await locator.screenshot({path:resolve(shots,`BOUND-001-${name}-${width}.png`),...(locator===page?{fullPage:false}:{})})
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,text:el.textContent.slice(0,160),right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width,space:getComputedStyle(el).whiteSpace})).sort((a,b)=>b.right-a.right).slice(0,8))
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'BOUND-001: screen fits viewport '+JSON.stringify({overflow,dimensions:await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,x:scrollX,body:document.body.getBoundingClientRect().toJSON(),spills:[...document.querySelectorAll('body *')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,100),scroll:el.scrollWidth,client:el.clientWidth})).slice(-12)}))}))
   }
   await page.goto(h.origin+'/');const boundary=page.locator('.mi-not');await boundary.scrollIntoViewIfNeeded()
   assert.match(await boundary.innerText(),/online ordering.*gift cards.*POS/);await shot('homepage-boundary',boundary)
   for(const slug of ['getting-started','http-contract']){
    await page.goto(h.origin+'/docs/'+slug)
    assert.match(await page.locator('.docs-body').innerText(),/restaurant’s POS or its payment provider/)
    if(slug==='http-contract')await page.getByRole('heading',{name:'BOUND-001 product boundary'}).scrollIntoViewIfNeeded()
    await shot(slug)
   }
   await page.goto(h.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   const forbidden=/gift[- ]?card|stored[- ]?value|voucher|online (?:food )?order/i
   assert.ok(await page.locator('input,select,button').count(),'BOUND-001: hydrated controls are present')
   assert.doesNotMatch(await page.locator('button,a,input,select').allTextContents().then(v=>v.join(' ')),forbidden)
   assert.ok((await h.api('/api/state')).state.bookings.some(b=>b.id===booked.id));await shot('staff-reservation')
   await context.clearCookies();await page.goto(h.origin+'/book');await page.locator('[data-public-command=search]').waitFor();await page.locator('#public-content[aria-busy]').waitFor({state:'detached'})
   assert.ok(await page.locator('input,select,button').count(),'BOUND-001: hydrated controls are present')
   assert.doesNotMatch(await page.locator('button,a,input,select').allTextContents().then(v=>v.join(' ')),forbidden);await shot('public-booking')
   assert.deepEqual(errors,[])
   console.log(`BOUND-001 public boundary and reservation-only doors passed at ${width}`)
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();await h.close()}
 }
}finally{await browser.close()}
