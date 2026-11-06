import type { Bindings } from '../auth.server'
import { companyDoor, businessSettings } from './index'
import { agentDocs } from './docs'
import { readTools } from './reads'
import { proposalTool } from './proposals'

/** Select HTTP ownership before constructing services that require installation configuration. */
export async function agentResponse(request: Request, env: Bindings): Promise<Response | null> {
  const docs = agentDocs(request, [...readTools, proposalTool])
  if (docs) return docs
  const path = new URL(request.url).pathname
  if (!['/mcp', '/api/rer/agent-policy', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/agents'].includes(path)
    && !path.startsWith('/agents/api/') && !/^\/agents\/approvals\/[^/]+$/.test(path)) return null
  return companyDoor(env).handle(request)
}

export async function businessSettingsResponse(request: Request, env: Bindings): Promise<Response | null> {
  if (!['/api/rer/business-settings', '/rer-business-logo', '/rer-business.css'].includes(new URL(request.url).pathname)) return null
  return businessSettings(env).handle(request)
}
