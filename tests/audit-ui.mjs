// AUDIT-001: real native owner, HTTP booking/consent changes and shipped history controls.
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {mkdir,readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,service,publicGuest} from './api/harness.mjs'
import {browserServer} from './browser-server.mjs'
import {csvRecords} from './api/business-fixture.mjs'
const ledgerSecret='synthetic-placemat-2'
const ledgerEdge=async request=>new URL(request.url).pathname.includes('/payouts/')?Response.json({object:'payout',id:'synthetic-placemat-payout-1',currency:'usd',status:'paid',amount:200}):Response.json({object:'list',has_more:false,data:[{object:'balance_transaction',id:'synthetic-placemat-bt-1',source:'synthetic-placemat-charge-1',currency:'usd',amount:200,fee:0,net:200}]})
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
  const h=await installation({stripeEdge:ledgerEdge,bindings:{STRIPE_SECRET_KEY:'synthetic-placemat-1',STRIPE_WEBHOOK_SECRET:ledgerSecret}}),transport=await browserServer(h),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${transport.certificateSpki}`]}),context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true,acceptDownloads:true})
  try {
   const {service:s,floor}=await service(h,{tables:3,covers:30})
   const b=(await h.api('/api/public/book',publicGuest(s,0,{name:'Priya Rowan',requests:{occasion:'Anniversary',allergyNotes:'Guest-declared shellfish allergy'},requestsAcknowledged:true}),{as:''})).result
   const current=await h.api('/api/state'),booked=current.state.bookings.find(row=>row.id===b.id),guestId=booked.guestId
   await h.command('booking.move',{bookingId:b.id,tableIds:[floor.find(t=>!booked.tableIds.includes(t.id)).id],version:current.version,reason:'Guest requested the window'})
   await h.command('guest.update',{guestId,notes:'Priya requested a quiet table'})
   const q=await h.api('/api/public/queue/join',publicGuest(s,0,{contactConsent:false}),{as:''})
   await h.api('/api/public/queue/update',{token:q.token,contactConsent:true},{as:''})
   const raw=JSON.stringify({id:'synthetic-placemat-event-1',type:'charge.succeeded',data:{object:{object:'charge',id:'synthetic-placemat-charge-1',currency:'usd',amount_captured:500,paid:true,captured:true,metadata:{}}}})
   const timestamp=Math.floor(Date.now()/1000),signature=createHmac('sha256',ledgerSecret).update(timestamp+'.'+raw).digest('hex')
   assert.equal((await h.mf.dispatchFetch(h.origin+'/api/payments/ledger-events',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${signature}`},body:raw})).status,200)
   await h.api('/api/payments/ledger/payout',{payoutId:'synthetic-placemat-payout-1'})
   await h.api('/api/payments/ledger/adjustment',{payoutId:'synthetic-placemat-payout-1',transactionId:'synthetic-placemat-bt-1',bookingId:b.id,reason:'Priya reviewed attribution; the provider amount remains disputed.'})
   await context.addCookies(h.cookie.split('; ').map(v=>{const at=v.indexOf('=');return {name:v.slice(0,at),value:v.slice(at+1),url:transport.origin,secure:true,sameSite:'Lax'}}))
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
   await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'Cedar & Salt',exact:true}).waitFor()
   await page.getByRole('link',{name:'Settings',exact:true}).click()
   const root=page.locator('#audit-content');await root.getByText('Change history',{exact:true}).click()
   await root.getByText(/history entr(?:y|ies)$/).waitFor()
   const filter=root.locator('form'),apply=async()=>{
    const expected=await filter.evaluate(el=>Object.fromEntries(new FormData(el)))
    const answer=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/audit'&&Object.entries(expected).every(([key,value])=>url.searchParams.get(key)===value)})
    await filter.getByRole('button',{name:'Filter history'}).click()
    const response=await answer;assert.equal(response.status(),200)
    const {rows}=await response.json()
    await page.waitForFunction(ids=>JSON.stringify([...document.querySelectorAll('#audit-content [data-audit-entry]')].map(el=>el.dataset.auditEntry))===JSON.stringify(ids),rows.map(row=>row.id))
   }
   const owner=(await h.api('/api/state')).actor.id
   await filter.locator('[name=actor]').selectOption(owner);await filter.locator('[name=action]').selectOption('guest.update');await apply()
   assert.equal(await root.locator('[data-audit-entry]').count(),1)
   await root.locator('article > details > summary').click();assert.match(await root.innerText(),/Priya requested a quiet table/);assert.match(await root.innerText(),/Before[\s\S]*After/)
   const capture=async name=>{await root.scrollIntoViewIfNeeded();if(shots)await root.screenshot({path:resolve(shots,`AUDIT-001-${name}-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'History fits viewport')}
   await capture('person-before-after')
   const pending=page.waitForEvent('download');await root.getByRole('link',{name:'Download filtered history CSV'}).click();const downloaded=await pending
   assert.equal(await downloaded.failure(),null);const csv=csvRecords(await readFile(await downloaded.path(),'utf8'))
   assert.equal(csv.length,1);assert.equal(csv[0].actor,owner);assert.equal(JSON.parse(csv[0].changes_json)[0].after.notes,'Priya requested a quiet table')
   await filter.locator('[name=actor]').selectOption('guest');await filter.locator('[name=action]').selectOption('waitlist.public-update');await apply()
   await root.locator('article > details > summary').click();const entry=await root.innerText();assert.match(entry,/guest-supplied/);assert.match(entry,/contact Consent[\s\S]*false[\s\S]*true/)
   await capture('guest-consent')
   await filter.locator('[name=action]').selectOption('booking.move');await apply();assert.equal(await root.locator('[data-audit-entry]').count(),0);await capture('empty-filter')
   await filter.locator('[name=actor]').selectOption(owner);await filter.locator('[name=action]').selectOption('payment.ledger-attribution');await apply()
   const money=root.locator('[data-audit-entry]');await money.locator('details').first().locator('summary').first().click()
   for(const details of await money.locator('td details').all())await details.locator('summary').click()
   if(width===1440){
    const values=money.locator('.audit-values')
    for(const [field,amount] of [['amount','200'],['difference Cents','-300'],['source','synthetic-placemat-charge-1'],['payout Id','synthetic-placemat-payout-1']]){
     const row=values.getByRole('row').filter({has:page.getByRole('rowheader',{name:field,exact:true})})
     assert.equal(await row.locator('td').count(),2)
     for(const cell of await row.locator('td').all())assert.ok((await cell.innerText()).includes(amount))
    }
    assert.match(await money.innerText(),/amountCents[\s\S]*500/);assert.match(await money.innerText(),/provider amount remains disputed/)
   }
   await capture('money-discrepancy')
   await h.command('guest.erase',{guestId,confirm:'ERASE'})
   await page.reload();await page.getByRole('link',{name:'Settings',exact:true}).click()
   if(!(await root.locator('details').first().evaluate(el=>el.open)))await root.getByText('Change history',{exact:true}).click()
   await root.getByText(/history entr(?:y|ies)$/).waitFor()
   await root.locator('[name=actor]').selectOption(owner);await root.locator('[name=action]').selectOption('guest.update');await apply();await root.locator('article > details > summary').click()
   assert.doesNotMatch(await root.innerText(),/Priya|quiet table|shellfish/);assert.match(await root.innerText(),/redacted/);await capture('erased-history')
   const history=(await h.api('/api/audit')).rows,archive=await h.api('/api/backup'),restored=await installation()
   try {await restored.api('/api/restore',{archive,confirm:'RESTORE'});assert.deepEqual((await restored.api('/api/audit')).rows,history,'AUDIT-001: redacted history survives empty-destination restore without returning personal values')}
   finally{await restored.close()}
   assert.deepEqual(errors,[]);console.log(`AUDIT-001 person changes, guest consent, filtered CSV, empty filter, erasure and restored history passed at ${width}`)
  }finally{await context.close();await browser.close();await transport.close();await h.close()}
 }
