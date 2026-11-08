import type { Bindings } from '../auth.server'
import { companyDoor, businessSettings } from './index'
import { agentDocs } from './docs'
import { coordinatorTools, PromptArgumentsError } from './prompts'

/** Select HTTP ownership before constructing services that require installation configuration. */
export async function agentResponse(request: Request, env: Bindings): Promise<Response | null> {
  const docs = agentDocs(request, coordinatorTools)
  if (docs) return docs
  const path = new URL(request.url).pathname
  if (!['/mcp', '/api/rer/agent-policy', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/agents'].includes(path)
    && !path.startsWith('/agents/api/') && !/^\/agents\/approvals\/[^/]+$/.test(path)) return null
  // The shipped adapter validates argument types. These static jobs also refuse
  // named string arguments, after its authentication and policy read guard.
  const promptRequest = path === '/mcp' && request.method === 'POST' &&
    (!request.headers.has('mcp-method') || request.headers.get('mcp-method') === ['prompts', 'get'].join('/')) ? request.clone() : null
  try { return await companyDoor(env).handle(request) }
  catch (error) {
    if (!(error instanceof PromptArgumentsError) || !promptRequest) throw error
    const rpc = await promptRequest.json() as { id?: string | number | null }
    return Response.json({ jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32602, message: 'Invalid prompt arguments', data: { code: 'invalid_arguments' } } },
      { headers: { 'cache-control': 'no-store' } })
  }
}

export async function businessSettingsResponse(request: Request, env: Bindings): Promise<Response | null> {
  if (!['/api/rer/business-settings', '/rer-business-logo', '/rer-business.css'].includes(new URL(request.url).pathname)) return null
  return businessSettings(env).handle(request)
}
