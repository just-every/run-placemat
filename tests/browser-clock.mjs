// Pin browser time and the matching real Worker clock without changing any assertion.
export async function browserClock(context,now){
 await context.setExtraHTTPHeaders({'x-placemat-test-clock':String(now)})
 await context.addInitScript(({now})=>{
  const RealDate=globalThis.Date
  globalThis.Date=class extends RealDate{
   constructor(...args){super(...(args.length?args:[now]))}
   static now(){return now}
  }
 },{now})
}
