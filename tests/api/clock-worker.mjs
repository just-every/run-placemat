// A deterministic clock around the actual test Worker; production has no clock override.
import worker from './worker.ts'
const RealDate=globalThis.Date
export default {
 fetch(request,env,ctx){
  const now=Number(request.headers.get('x-placemat-test-clock'))
  if(!Number.isFinite(now))throw Error('A pinned test clock is required')
  globalThis.Date=class extends RealDate{
   constructor(...args){super(...(args.length?args:[now]))}
   static now(){return now}
  }
  return worker.fetch(request,env,ctx)
 }
}
