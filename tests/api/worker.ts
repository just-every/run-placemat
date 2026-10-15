import { placematResponse } from '../../src/placemat/http'
import { authResponse } from '../../src/auth.server'
export default {async fetch(request:Request,env:any){return await authResponse(request,env)??await placematResponse(request,env)??new Response('Not found',{status:404})}}
