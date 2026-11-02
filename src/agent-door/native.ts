import { ToolRefusal, type JsonSchema, type ToolContext } from '../modules/agent-door/index.ts'
import { Problem, type Actor } from '../placemat/model'
import { load } from '../placemat/store'

/** Company credentials retain the native person's grants and agent restrictions. */
export async function nativeActor(ctx: ToolContext, write = false): Promise<Actor> {
  const { state } = await load(ctx.db)
  const role = ctx.person.role
  if (!['owner', 'admin', 'member'].includes(role) || role === 'member' &&
      (write || state.serverIds?.includes(ctx.person.id) || state.financeIds?.includes(ctx.person.id))) {
    throw new ToolRefusal('native_authority_required')
  }
  return { id: ctx.person.id, name: ctx.actor.label, role: 'agent', agent: true, companyAgent: !!ctx.consent, preparation: ctx.actor }
}

export async function nativeCall<T>(action: () => Promise<T>): Promise<T> {
  try { return await action() }
  catch (error) {
    if (error instanceof Problem) throw new ToolRefusal(error.status === 404 ? 'resource_unavailable' : error.status === 403 ? 'native_authority_required' : error.status === 409 ? 'native_conflict' : 'invalid_arguments', error.message)
    throw error
  }
}

/** Native projections can retain hashes and provider handles; these are not agent data. */
export function publicRecords(value: unknown): any {
  if (Array.isArray(value)) return value.map(publicRecords)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/token|secret|credential|digest|privatekey|apikey/i.test(key)).map(([key, item]) => [key, publicRecords(item)]))
}

export const object = (properties: Record<string, JsonSchema> = {}, required: string[] = []) => ({ type: 'object' as const, properties, required, additionalProperties: false })
export const string = { type: 'string', minLength: 1 }
export const output = { type: 'object', properties: { data: { type: 'object' } }, required: ['data'], additionalProperties: false }
