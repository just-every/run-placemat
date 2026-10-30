import { createAgentDoor, operatorAuthPeople, type Trust } from '../modules/agent-door/index.ts'
import { createBusinessSettings } from '../modules/business-settings/index.ts'
import { operatorAuth, authConfig, type Bindings } from '../auth.server'
import { hasDeviceCookie } from '../placemat/shared-device-cookie'
import { hash } from '../placemat/store'
import { readTools } from './reads'
import { proposalTool } from './proposals'

const capabilities = ['tools', 'policy', 'pause', 'audit', 'idempotency'] as const
export const notTools = [
  { clauses: ['ACCESS-001'], reason: 'screen' as const },
  { clauses: ['FLOOR-008'], reason: 'device' as const },
  { clauses: ['DATA-001', 'DATA-002'], reason: 'import-door' as const },
  { clauses: ['SETUP-001'], reason: 'installation' as const },
  { clauses: ['PAY-001'], reason: 'connector' as const },
]
export function companyDoor(env: Bindings) {
  const issuer = env.RER_OWNER_CLAIM_ISSUER, installationId = env.RER_OWNER_CLAIM_INSTALLATION_ID, publicKeys = env.RER_OWNER_CLAIM_PUBLIC_KEYS
  let trust: Trust | null = null
  if ([issuer, installationId, publicKeys].some(Boolean)) {
    if (!issuer || !installationId || !publicKeys) throw new Error('Incomplete owner-claim trust')
    trust = { issuer, installationId, appOrigin: env.AUTH_ORIGIN, publicKeys: JSON.parse(publicKeys) }
  }
  const tools = [...readTools, proposalTool]
  const door = createAgentDoor({ seed: 'placemat', name: 'Placemat', specialist: 'restaurant service coordinator', capabilities: [...capabilities], db: env.DB, origin: env.AUTH_ORIGIN, trust,
    people: operatorAuthPeople({ db: env.DB, allowList: authConfig(env).allowList, session: request => hasDeviceCookie(request) ? Promise.resolve(null) : operatorAuth(env).getSession(request) }),
    tools, resources: [], notTools,
    async localCredentials(request) {
      const value = request.headers.get('authorization')
      if (!value?.startsWith('Bearer ')) return null
      const row = await env.DB.prepare("SELECT k.id,k.name,k.created_by FROM pm_agent_keys k JOIN oa_operators o ON o.id=k.created_by WHERE k.digest=? AND k.revoked_at IS NULL AND o.role='owner' AND o.status='active'").bind(await hash(value.slice(7))).first<{ id: string; name: string; created_by: string }>()
      return row ? { sponsor: { id: row.created_by }, agent: { id: row.id, name: row.name }, scopes: ['operations:read', 'plans:prepare'] } : null
    },
    async currentScopes(principal) {
      if (principal.consent) return [...principal.scopes]
      const row = await env.DB.prepare("SELECT k.id FROM pm_agent_keys k JOIN oa_operators o ON o.id=k.created_by WHERE k.id=? AND k.created_by=? AND k.revoked_at IS NULL AND o.role='owner' AND o.status='active'").bind(principal.agent.id, principal.person.id).first()
      return row ? ['operations:read', 'plans:prepare'] : []
    },
  })
  return door
}

export function businessSettings(env: Bindings) {
  return createBusinessSettings({ db: env.DB, trust: env.RER_BUSINESS_TRUST, business: { settings: 1, values: ['display_name'], team: { roles: { admin: 'admin', member: 'member' } } }, team: operatorAuth(env).businessTeam })
}
