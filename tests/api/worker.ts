import {runFeedbackSurveys} from '../../src/placemat/feedback-mail'
import {runReportSchedules} from '../../src/placemat/scheduled-reports'
import { placematResponse } from '../../src/placemat/http'
import { unframeable } from '../../src/placemat/embed'
import { authResponse } from '../../src/auth.server'
// Mirrors src/server.ts: every response passes the BOOK-002 frame guard.
export default {async scheduled(event:ScheduledController,env:any){await Promise.all([runReportSchedules(env,new Date(event.scheduledTime)),runFeedbackSurveys(env,new Date(event.scheduledTime))])},async fetch(request:Request,env:any,ctx:ExecutionContext){return unframeable(request,await authResponse(request,env)??await placematResponse(request,env,work=>ctx.waitUntil(work))??new Response('Not found',{status:404}))}}
