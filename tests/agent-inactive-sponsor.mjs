import assert from 'node:assert/strict'

// Disposable verifier memory only; never return native sessions as phase fixtures.
let reviewers, confirmed, sponsor
const cookies = response => response.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
const native = ({ request, origin }, path, body, cookie) => request(new URL(path, origin).href, {
  method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
  headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export default async function initialize(context) {
  const { claim, email, sub, owner, mail, returnTo } = context
  if (context.reviewers) {
    reviewers = context.reviewers
    confirmed = sponsor = undefined
    return native(context, claim.path, { token: claim.token, displayName: context.displayName, returnTo })
  }
  if (!claim) {
    // The signed Business roster has already invited this member. Consume its
    // actual accepted mail through the verifier's isolated recipient mailbox.
    const message = mail.read().findLast(row => row.text.includes('/auth/confirm?'))
    const href = message?.text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0]
    assert.ok(href, 'Native member invitation must exist')
    const link = new URL(href)
    assert.equal(link.origin, context.origin)
    const response = await native(context, '/auth/confirm', { token: link.searchParams.get('token') })
    assert.equal(response.status, 303)
    assert.ok(cookies(response))
    confirmed = response
    return new Response(null, { status: response.status, headers: response.headers })
  }
  await reviewers.initialize(context.label, { cookie: owner.cookie })
  assert.ok(confirmed, 'Member must complete the native invitation')
  const cookie = cookies(confirmed)
  const response = await native(context, '/auth/session', undefined, cookie)
  assert.equal(response.status, 200)
  const session = await response.json()
  assert.equal(session.operator.email, email)
  assert.equal(session.operator.status, 'active')
  assert.equal(session.operator.role, 'member')
  // Read-only inspection proves the signed subject is durably attached to this
  // native member; every fixture mutation uses the public lifecycle above.
  const db = await context.database('DB')
  const binding = await db.prepare('SELECT operator_id FROM bs_team WHERE business_id=?').bind(sub).first()
  assert.equal(binding?.operator_id, session.operator.id)
  sponsor = { sub, email, cookie, id: session.operator.id }
  const result = confirmed
  confirmed = undefined
  return result
}

export async function inactiveSponsor(context) {
  assert.ok(sponsor, 'Native member initialization must precede negative probes')
  const active = await native(context, '/auth/session', undefined, sponsor.cookie)
  assert.equal(active.status, 200)
  const session = await active.json()
  assert.equal(session.operator.id, sponsor.id)
  assert.equal(session.operator.status, 'active')
  const changed = await native(context, '/auth/operator/status', { operatorId: sponsor.id, status: 'inactive' }, context.cookie)
  assert.equal(changed.status, 200)
  const operator = await changed.json()
  assert.equal(operator.id, sponsor.id)
  assert.equal(operator.status, 'inactive')
  const denied = await native(context, '/auth/session', undefined, sponsor.cookie)
  assert.equal(denied.status, 401)
  assert.equal((await denied.json()).error, 'unauthenticated')
  return { sub: sponsor.sub, email: sponsor.email }
}
