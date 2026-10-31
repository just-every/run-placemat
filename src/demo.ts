// Demo mode's sample restaurant (Base DEMO.md): Fern & Fig with its floor, team,
// regular guests and a lived-in book around `now`. It runs once after the owner
// exists, never fetches, and writes fixed ids that a repeat leaves unchanged.
import type { Bindings } from './auth.server'
import { venueClock } from './placemat/demo/clock'
import { guests, owner, team, venue } from './placemat/demo/venue'
import { book } from './placemat/demo/book'
import { assistant, decide, retiredKey } from './placemat/demo/approvals'
import { hash } from './placemat/store'

export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }): Promise<void> {
  const db = env.DB
  const ownerRow = await db.prepare("SELECT id FROM oa_operators WHERE email=? AND role='owner' AND status='active'").bind(ownerEmail).first<{ id: string }>()
  if (!ownerRow) throw new Error('The demo owner does not exist yet.')
  const clock = venueClock(now, venue.timezone, '22:30'), people = guests(clock), sample = book(clock, people, venue)
  decide(sample, clock, ownerRow.id, people.all)
  const created = now.getTime() - 120 * 86400000
  // Preparation keys are shown once; nobody holds these, so they only name past work.
  const keys = await Promise.all([assistant, retiredKey].map(async (k, i) => ({ ...k, digest: await hash(crypto.randomUUID() + crypto.randomUUID()), created_at: new Date(created + i * 86400000).toISOString(), revoked_at: i ? new Date(created + 40 * 86400000).toISOString() : null })))
  await db.batch([
    db.prepare("UPDATE oa_operators SET display_name=? WHERE id=?").bind(owner, ownerRow.id),
    // The owner's finished first run: the demo opens on the floor, not on setup.
    db.prepare('INSERT INTO oa_first_run(singleton,completed_by,completed_at) VALUES(1,?,?) ON CONFLICT(singleton) DO NOTHING').bind(ownerRow.id, now.getTime()),
    db.prepare(`INSERT INTO oa_operators(id,email,display_name,role,status,created_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.email'),json_extract(value,'$.name'),json_extract(value,'$.role'),json_extract(value,'$.status'),? FROM json_each(?) WHERE true ON CONFLICT DO NOTHING`).bind(created, JSON.stringify(team)),
    db.prepare(`INSERT INTO pm_agent_keys(id,digest,name,created_by,created_at,revoked_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.digest'),json_extract(value,'$.name'),?,json_extract(value,'$.created_at'),json_extract(value,'$.revoked_at') FROM json_each(?) WHERE true ON CONFLICT DO NOTHING`).bind(ownerRow.id, JSON.stringify(keys)),
    db.prepare(`INSERT INTO pm_guests(id,version,data) SELECT json_extract(value,'$.id'),1,value FROM json_each(?) WHERE true ON CONFLICT(id) DO NOTHING`).bind(JSON.stringify(people.all)),
    // A staff read may already have created the empty floor (version 0); replace only that.
    db.prepare(`INSERT INTO pm_state(id,version,data) VALUES(1,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=1 WHERE pm_state.version=0`).bind(JSON.stringify(sample.state)),
  ])
}
