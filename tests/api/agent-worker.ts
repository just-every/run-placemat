import { agentResponse } from '../../src/agent-door/http'
import product from './worker'
export default { async fetch(request: Request, env: any, ctx: ExecutionContext) {
  return await agentResponse(request, env) ?? product.fetch(request, env, ctx)
} }
