# Payment operations

A personal venue owner opens **Disputes and accounting work** from the service's payment panel. The current implementation is an owner-held first slice pending the PAY-009 custody ruling. Managers, finance identities, integration keys and shared devices cannot open these doors.

The owner imports a Stripe test-mode dispute by its reference and the matching reservation. Placemat reads the disputed charge, complete refund history and verified dispute withdrawal. It refuses live-mode records, mismatched bookings, currencies other than USD, incomplete history and dispute reversals. Import creates one owner-held callback with the Stripe response deadline. The Stripe link opens the processor's test dashboard.

**Assemble current evidence** freezes the booking facts, staff attendance observations, linked immutable fee policy, recorded agreement, fee decisions, refunds and linked guest conversation. Owner attestation and guest acceptance remain distinguishable. Reminders and provider acceptance are never described as proof of mailbox delivery. Missing agreement or attendance is shown as missing; no saved card supplies consent.

The owner reads the frozen evidence and approves an exact written response. The saved digest binds the evidence being approved. Approval records the person and instant and cannot edit a prior approved response. The download contains that exact response and evidence. No Stripe response, guest message, refund or charge is sent by this feature. Submission remains a separate explicit processor action.

An approved review can explicitly export the case's verified gross principal ledger once to the configured QuickBooks Online sandbox. The owner maps three distinct numeric accounts for clearing, revenue and disputed receivables and checks the send confirmation. Charge, succeeded refund and disputed principal references remain separately visible in balanced journal lines. Processor fees and payout net reconciliation are not represented as principal, and PAY-006's remaining duties are unchanged.

Before the provider request, Placemat reserves a stable export identifier and an immediately due callback owned by the deciding owner. The result records accepted, rejected or unconfirmed, a sanitized error code and provider trace when available. An accepted result includes the QuickBooks journal identifier. Every replay returns the existing attempt and sends nothing further. A timeout or crash needs manual reconciliation against that identifier; no automatic retry occurs. The owner completes or reassigns the task through the existing service handover.

The server reads `QBO_ACCESS_TOKEN` and `QBO_REALM_ID` from private runtime bindings and sends only to the QuickBooks sandbox host. These values are never accepted from a browser, displayed or archived. This slice does not implement production OAuth onboarding or token renewal. The held-key sandbox script obtains an access token privately through `scripts/payment-accounting-token.mjs`; a rotated refresh token is immediately stored through the fleet ingest command before any further work.

The owner can export `payment-cases.csv`, `payment-reviews.csv` and `accounting-exports.csv` through the existing business export door. Archives preserve financial facts, decisions and outcomes, exclude execution custody and validate case, review and journal relationships. Restoring an approval grants no new accounting send. Guest erasure removes evidence, response text and associated human tasks while retaining financial references and amounts. DATA-001 through DATA-004 and AUDIT-001 remain binding, including existing retention gaps.

Public doors:

- `GET /payment-operations` and `GET /api/payments/operations` read the owner view.
- `POST /api/payments/operations/open` takes `bookingId` and `disputeId`.
- `POST /api/payments/operations/assemble` takes `caseId`.
- `POST /api/payments/operations/approve` takes `reviewId`, `digest`, `response` and `acknowledged: true`.
- `POST /api/payments/operations/export` takes `caseId`, `reviewId`, `accounts` with `clearing`, `revenue` and `disputes`, and `acknowledged: true`.
- `GET /api/payments/operations/bundle?reviewId=...` downloads an approved response.
- `GET /api/payments/operations/journal?exportId=...` downloads the accounting journal and its outcome.

The full PAY-009 requirement remains open for ct's custody ruling, delegated manager work, failed-card and broader chargeback lifecycle tasks, full fee exposure and production accounting connection duties. PAY-003 and PAY-006 keep their existing statuses and obligations; no authority is inherited from an unapproved payment default.
