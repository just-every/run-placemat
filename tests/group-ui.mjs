// ROLE-001: two owners connect their venues, grant a scoped group admin, who reads with a token until the grant is revoked.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {installation,publicGuest,service} from './api/harness.mjs'
import {browserServer} from './browser-server.mjs'
const shots=process.env.PLACEMAT_SCREENSHOTS
if(shots)await mkdir(shots,{recursive:true})
for(const width of [1440,390]){
 let home,tap,homeTransport,tapTransport,browser,errors=[]
 home=await installation({origin:'https://home.example.test',peers:{'tap.example.test':()=>tap}});tap=await installation({origin:'https://tap.example.test',peers:{'home.example.test':()=>home}})
 homeTransport=await browserServer(home);tapTransport=await browserServer(tap)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',`--ignore-certificate-errors-spki-list=${homeTransport.certificateSpki},${tapTransport.certificateSpki}`]})
 try{
  for(const [h,name] of [[home,'Home Bistro'],[tap,'Tap Room']]){const {service:s}=await service(h);await h.command('venue.update',{name,timezone:'Australia/Brisbane'});await h.api('/api/public/book',publicGuest(s,0),{as:'',status:201})}
  const ga=await home.signIn('ui-group-admin@example.test')
  const cookies=(cookie,origin)=>cookie.split('; ').map(value=>{const at=value.indexOf('=');return {name:value.slice(0,at),value:value.slice(at+1),url:origin,secure:true,sameSite:'Lax'}})
  const open=async(h,transport,cookie,setup)=>{
   const context=await browser.newContext({viewport:{width,height:1000},ignoreHTTPSErrors:true});await context.addCookies(cookies(cookie,transport.origin));const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
   if(setup){await page.goto(transport.origin+'/setup');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}else await page.goto(transport.origin+'/app')
   await page.locator('.app-main[aria-busy=false]').waitFor();await page.getByRole('link',{name:'Settings',exact:true}).click();return {context,page}
  }
  const group=page=>page.locator('details:has(> summary:text-is("Venue group")), details:has(> summary:text-is("Group access"))').first()
  const shot=async(page,name,locator)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'ROLE-001 fits viewport');if(shots)await (locator||page).screenshot({path:resolve(shots,`ROLE-001-${name}-${width}.png`)})}
  const submit=async(page,kind,button,path,status='Group settings saved.')=>{
   await group(page).evaluate(el=>el.open=true);const panel=await group(page).evaluateHandle(el=>el.parentElement),response=page.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='POST')
   await group(page).locator(`form[data-group-form="${kind}"]`).getByRole('button',{name:button,exact:true}).click();assert.ok((await response).ok())
   if(!['invite','token'].includes(kind)){await page.waitForFunction(el=>!el.isConnected,panel);await group(page).locator('form').first().waitFor({state:'attached'})}
   else await page.getByRole('status').filter({hasText:status}).first().waitFor()
  }
  const homeOwner=await open(home,homeTransport,home.cookie,true),tapOwner=await open(tap,tapTransport,tap.cookie,true)
  // The home owner issues a one-use invitation; the other venue's owner joins and limits what group admins may read there.
  await group(homeOwner.page).evaluate(el=>el.open=true);await group(homeOwner.page).locator('form[data-group-form=invite] [name=label]').fill('Tap Room');await submit(homeOwner.page,'invite','Create one-use invitation','/api/group/invite','Invitation created.')
  const code=await homeOwner.page.locator('#group-code pre').innerText();assert.match(code,/^gi_[a-f0-9]{64}$/);await shot(homeOwner.page,'invitation',group(homeOwner.page))
  await group(tapOwner.page).evaluate(el=>el.open=true);const join=group(tapOwner.page).locator('form[data-group-form=join]')
  await join.locator('[name=homeOrigin]').fill('https://home.example.test');await join.locator('[name=code]').fill(code);await join.locator('[value="preshift.read"]').uncheck();await shot(tapOwner.page,'join',group(tapOwner.page))
  await submit(tapOwner.page,'join','Join group','/api/group/join');await group(tapOwner.page).evaluate(el=>el.open=true);assert.match(await group(tapOwner.page).innerText(),/Member of the group at https:\/\/home\.example\.test[\s\S]*Reservation report/);assert.ok(!(await group(tapOwner.page).innerText()).includes('Pre-shift sheet.'));await shot(tapOwner.page,'member',group(tapOwner.page))
  // The home owner sees the connected venue and grants the person explicit rights at both venues.
  await homeOwner.page.reload();await homeOwner.page.locator('.app-main[aria-busy=false]').waitFor();await homeOwner.page.getByRole('link',{name:'Settings',exact:true}).click();await group(homeOwner.page).evaluate(el=>el.open=true)
  assert.match(await group(homeOwner.page).innerText(),/Connected venues[\s\S]*Tap Room/)
  const grant=group(homeOwner.page).locator('form[data-group-form=grant]');await grant.locator('[name=operatorId]').selectOption({label:'Host reader'})
  const boxes=grant.locator('input[type=checkbox]');assert.equal(await boxes.count(),3,'Home offers both rights and the member venue only its ceiling');for(const box of await boxes.all())await box.check()
  await submit(homeOwner.page,'grant','Grant group access','/api/group/admin');await group(homeOwner.page).evaluate(el=>el.open=true);const granted=await group(homeOwner.page).innerText();assert.match(granted,/Group admins/);assert.match(granted,/This venue: Reservation report, Pre-shift sheet/);assert.match(granted,/Tap Room: Reservation report\n/);await shot(homeOwner.page,'grants',group(homeOwner.page))
  // The group admin creates a token in their own settings and reads both venues until the owner revokes access.
  const admin=await open(home,homeTransport,ga);await group(admin.page).evaluate(el=>el.open=true);await group(admin.page).locator('form[data-group-form=token]').getByRole('button',{name:'Create group token',exact:true}).click();await admin.page.locator('#group-token pre').waitFor()
  const token=await admin.page.locator('#group-token pre').innerText();assert.match(token,/^gt_[a-f0-9]{64}$/);await shot(admin.page,'token',group(admin.page))
  const bearer={as:'',headers:{authorization:'Bearer '+token}}
  assert.equal((await tap.api('/api/group/reports/reservations',undefined,bearer)).venue,'Tap Room');assert.equal((await home.api('/api/group/preshift',undefined,bearer)).venue,'Home Bistro')
  await group(homeOwner.page).evaluate(el=>el.open=true);await submit(homeOwner.page,'revoke','Revoke group access','/api/group/admin/revoke');await group(homeOwner.page).evaluate(el=>el.open=true);assert.ok(!(await group(homeOwner.page).innerText()).includes('Revoke group access'));await shot(homeOwner.page,'revoked',group(homeOwner.page))
  await tap.api('/api/group/reports/reservations',undefined,{...bearer,status:403});await home.api('/api/group/preshift',undefined,{...bearer,status:403})
  assert.deepEqual(errors,[])
  console.log(`ROLE-001 invitation, join with ceiling, scoped grant, group token reads and revocation passed at ${width}`)
  for(const o of [homeOwner,tapOwner,admin])await o.context.close()
 }finally{await browser.close();await homeTransport.close();await tapTransport.close();await home.close();await tap.close()}
}
