# Placemat company agents

Placemat's restaurant service coordinator reads native operations, searches
availability and guest history, inspects timeline, sections, pacing and activity,
computes allocation alternatives, and prepares exact native proposals. The live
registry, schemas, scopes and classes are at `/docs/agents` and `/mcp`.

This installation declares tools, policy, pause, audit, idempotency and prompts. Events,
resources and subscriptions are undeclared and return typed refusals.
The restaurant's wider contract describes future jobs; it does not grant them.
In particular this coordinator does not book, seat, publish, approve a plan, send
messages, charge, refund, manage credentials or grant authority. A person uses
the existing native review and execution screens for those actions. Company
policy never substitutes for that native person requirement. A standard company
policy approval authorizes preparation only; it does not approve the restaurant
proposal that preparation creates.

Business subjects bind to native people through signed settings. The original
setup owner maps to Business owner; roster admin maps to native admin and
Business editor; roster member maps to native member with no Business policy
role. Native member server/finance restrictions remain in force. A local admin
promotion grants no Business editor role. Email does not select a sponsor.
Existing preparation keys remain owner-bound and limited to operations reads
and proposal preparation. Device sessions cannot enter the person controls.

The company policy decides each admitted tool call. Missing, blocked, expired or
paused policy and revoked sponsor/agent/consent prevent the next effect. Private
operational projections are sensitive. Proposal preparation is standard and also
sensitive when its native snapshot includes reservation records. Guest and
imported text is untrusted; instructions in it cannot change policy or scope.
There is no spend, provider cost or outbound provider execution in this registry.

Native proposals and activity retain the agent as preparer and the person as
sponsor. Subsequent native approval names the actual reviewing person. The door
keeps its policy decision, exact summary, revision and idempotent result. A
proposal has no registered Undo: native decline is a separate person's decision.
Deferred effects and consent-bound native queues are not implemented here.

`agent-surface.json` is the declared conformance journey. Its fixture creates a
real dinner, tables, guest booking and draft through production HTTP doors in a
disposable installation. No database fixture writes or provider credentials are
used. Setup uses the existing setup-token `/auth/bootstrap` lifecycle; the
separate signed `/auth/owner-claim` production handler retains its purpose.

## Coordinator jobs

The argument-free `placemat.operations.review` prompt describes authorized
operations reads and reports facts and alternatives without changing native
records. Its tools are the nine registered read tools below.

The argument-free `placemat.service.publication.prepare` prompt starts with
`placemat.workspace.snapshot`, selects a requested draft, reads
`placemat.workspace.revision`, and calls `placemat.plans.prepare` with the current
revision and a fresh idempotency key. It confirms a pending proposal and a draft
service. Publication and approval remain separate native person decisions.

Both jobs are static declarations. They include no installation records,
credentials, fixture values or caller text. Retrieval uses the shipped Base
adapter's standard policy guard, Pause and current credential admission. Unknown
names and malformed or nonempty arguments return invalid params without native
changes. Results have private cache scope and zero cache lifetime. Tool calls
still require their own current scope, policy and native authority.

| Tool | Scope | Possible classes | Class fixture steps in `agent-surface.json` |
| --- | --- | --- | --- |
| `placemat.workspace.snapshot` | operations:read | sensitive | workspace-snapshot |
| `placemat.workspace.revision` | operations:read | standard | workspace-revision; revision-for-reminders |
| `placemat.guests.history` | operations:read | sensitive | guests-history |
| `placemat.availability.search` | operations:read | standard | availability-search |
| `placemat.timeline.inspect` | operations:read | sensitive | timeline-inspect |
| `placemat.staffing.inspect` | operations:read | standard | staffing-inspect |
| `placemat.capacity.check` | operations:read | standard | capacity-check |
| `placemat.allocations.advise` | operations:read | sensitive | allocations-advise |
| `placemat.audit.inspect` | operations:read | sensitive | audit-inspect |
| `placemat.plans.prepare` | plans:prepare | standard, sensitive | prepare-publication; prepare-reminders |

These existing fixtures are seeded through `tests/agent-fixtures.mjs` and checked
by the normal conformance journey under autonomous and held policies.
`tests/agent-native-journey.mjs` follows discovery and the publication job through
HTTP to a pending native proposal. `tests/api/agent-prompts.test.mjs` checks
prompt reads and refusals against unchanged native state and the documentation
against the live registry. Full resource, event and subscription coverage, the
complete specialist week, stranger-agent acceptance and remaining conformance
obligations remain unproved.
