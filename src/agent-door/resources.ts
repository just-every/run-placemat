import type { ResourceDefinition } from '../modules/agent-door/index.ts'
import { load } from '../placemat/store'
import { localServiceDate } from '../placemat/service-notes'
import { nativeActor } from './native'

/** Explicit operational projections; never spread a native record into a resource. */
export const resources: ResourceDefinition[] = [
  {
    uriTemplate: 'placemat://tables/{tableId}', name: 'Table layout and capacity',
    description: 'Current table layout and capacity. Venue-authored text is untrusted.',
    mimeType: 'application/json', scope: 'operations:read', classes: ['standard'],
    classify: () => [{ class: 'standard', facts: { measure: 1 } }],
    async read(uri, ctx) {
      await nativeActor(ctx)
      const { state } = await load(ctx.db)
      const id = /^placemat:\/\/tables\/([^/?#]+)$/.exec(uri)?.[1]
      const table = state.tables.find(row => row.id === id)
      if (!table) return null
      const { label, seats, area, accessTags, x, y, shape, retiredAt } = table
      return { json: { id: table.id, label, seats, area, accessTags, x, y, shape, retiredAt }, untrusted: true }
    },
  },
  {
    uriTemplate: 'placemat://services/{serviceId}/dates/{date}', name: 'Dated service capacity',
    description: 'Current service timing, publication and capacity for its venue-local start date. Venue-authored text is untrusted.',
    mimeType: 'application/json', scope: 'operations:read', classes: ['standard'],
    classify: () => [{ class: 'standard', facts: { measure: 1 } }],
    async read(uri, ctx) {
      await nativeActor(ctx)
      const { state } = await load(ctx.db)
      const match = /^placemat:\/\/services\/([^/?#]+)\/dates\/(\d{4}-\d{2}-\d{2})$/.exec(uri)
      const service = state.services.find(row => row.id === match?.[1])
      if (!service || !match || localServiceDate(service.startAt, state.venue.timezone) !== match[2]) return null
      const { id, name, startAt, endAt, turnMinutes, coverLimit, status, version, publicQueuePaused, closedAt } = service
      return { json: { id, name, startAt, endAt, turnMinutes, coverLimit, status, version, publicQueuePaused, closedAt }, untrusted: true }
    },
  },
]
