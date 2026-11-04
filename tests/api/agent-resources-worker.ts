import native from './worker'
import { agentResponse, businessSettingsResponse } from '../../src/agent-door/http'

// The same agent and signed settings doors that precede native HTTP in production.
export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    return await agentResponse(request, env) ?? await businessSettingsResponse(request, env) ?? native.fetch(request, env, ctx)
  },
}
