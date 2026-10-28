// Pin both scheduler and HTTP clocks around the actual Worker, without a production clock door.
import worker from './worker'
const NativeDate=globalThis.Date
function pin(now:number){
 if(!Number.isFinite(now))throw Error('A pinned journey clock is required')
 globalThis.Date=class extends NativeDate{
  constructor(...args:any[]){super(...(args.length?args:[now]) as [any])}
  static now(){return now}
 } as DateConstructor
}
export default {
 fetch(request:Request,env:any,ctx:ExecutionContext){const clock=request.headers.get('x-placemat-test-clock');if(clock===null)throw Error('A pinned journey clock is required');pin(Number(clock));return worker.fetch(request,env,ctx)},
 scheduled(event:ScheduledController,env:any){pin(Number(event.scheduledTime));return worker.scheduled(event,env)}
}
