import { placematResponse } from '../../src/placemat/http'
import { unframeable } from '../../src/placemat/embed'
import { authResponse } from '../../src/auth.server'
// Mirrors src/server.ts: every response passes the BOOK-002 frame guard.
export default {async fetch(request:Request,env:any){return unframeable(request,await authResponse(request,env)??await placematResponse(request,env)??new Response('Not found',{status:404}))}}
