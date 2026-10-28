# Placemat rulings

These rulings preserve unfinished obligations and do not accept completion. The contract states their product outcomes; its Status table records proof.

### RL-101 — Category-specific erasure and recorded financial exceptions

**Date:** 2026-10-28 · **Ruled by:** ct · **Clauses governed:** DATA-004.

**Question:** May whole-identity erasure wait for every unrelated retention period while expired personal content and finance evidence remain indefinitely?

**Adopted/proposed default:** Owner reviews whole-identity erasure only after every personal-content period; financial grounds and manual processor receipts are recorded.

**Outcome: replace.** Erase or de-identify each eligible personal-data category when its purpose/retention expires or an applicable verified deletion request requires it; retain only the specific financial/held records with documented current grounds, review dates and restricted access, and track each processor's actual response separately.

**Why:** OpenTable provides deletion rights subject to necessary retention; Resy distinguishes its controlled data from restaurant-controlled records. No common norm supports retaining all guest text until the longest unrelated period or treating a manual processor task as completed deletion. Safe default: category-specific reviewed disposal, with justified exceptions and truthful processor state.

**Sources:**
- [OpenTable describes privacy requests and retention exceptions.](https://www.opentable.com/c/legal/privacy-policy/)
- [Resy account deletion covers Resy-controlled data; restaurant records require separate requests.](https://resy.com/about/)
- [California explains verified deletion rights and their exceptions.](https://www.oag.ca.gov/privacy/ccpa)

**Placement:** Write category-specific expiry/exception handling once in DATA-004's own acceptance point; cite DATA-002 erasure fences and restore duties. No duplicated retention rule across guest or finance doors.

**Current-main evidence:** CONTRACT.md:319 (clause), :583 (Status row); `ff96cd354e54aeedaf3e80c61750dd38b144a912`.

**Engineering/proof boundary:** Separate category disposal, expired-finance disposal, processor census and purpose-specific field controls remain unproved. Product default is not a legal sign-off on a particular venue's retention schedule.

### RL-102 — Opted-in paid guest checkout retains its target

**Date:** 2026-10-28 · **Ruled by:** ct · **Clauses governed:** EXP-002.

**Question:** Does publishing a ticket catalog itself authorize charges, or can the interim denial permanently block guest paid checkout?

**Adopted/proposed default:** Paid self-service disabled; catalog publication confers no payment authority; only zero-charge carts are implemented.

**Outcome: replace.** Keep payment off until an authorized venue administrator explicitly enables a capable merchant connection and paid checkout policy; after enablement the guest may create and confirm the exact booking-bound hosted payment through checkout, without a new personal-owner action for every cart. A catalog alone never authorizes charging.

**Why:** OpenTable Experiences offers guest-prepaid bookings or payment at the restaurant, chosen by the venue. Blanket permanent personal-owner creation of every payment request would remove the very guest-purchase flow the clause promises. The safe default is merchant opt-in plus exact guest authorization.

**Sources:**
- [OpenTable supports venue-chosen prepaid guest experiences.](https://www.opentable.com/restaurant-solutions/products/features/experiences/)
- [OpenTable configures experiences with prepaid options and processor fees.](https://support.opentable.com/s/article/create-experience?language=en_US)

**Placement:** Put merchant-enable and guest-authorization conditions once in EXP-002's own point, citing PAY-001/PAY-003 connection/consent rules and BOUND-001 rather than repeating their full text.

**Current-main evidence:** CONTRACT.md:201 (clause), :530 (Status row); `ff96cd354e54aeedaf3e80c61750dd38b144a912`.

**Engineering/proof boundary:** The zero-charge slice stays partial; every paid purchase, stock race, receipt, refund, allocation and recovery obligation remains. This is product authority, not permission to launch/pricing or spend real funds.

### RL-103 — Merchant-owned processor connection and revocation

**Date:** 2026-10-28 · **Ruled by:** ct · **Clauses governed:** PAY-001.

**Question:** May the restaurant explicitly connect its own Stripe merchant while keeping card and funds custody at Stripe?

**Adopted/proposed default:** Personal owner reviews cost and connects; capability failure/disconnect fences new collection and charges; setup itself sends or charges nothing.

**Outcome: adopt with rider.** Adopt explicit merchant connection, verified capability state and immediate fencing of new operations on revocation; connection or ownership alone never grants a guest mandate or later fee authority, and restored records do not restore executable credentials or consent.

**Why:** OpenTable uses a payment vault and disclosed reservation terms rather than exposing full card data. Stripe documents server-held account credentials. The earlier 25 October 17:40Z ct ruling in lanes/sx/INBOX.md:4322 already approved the partial merchant slice subject to exact original scope, USD amounts, non-extending expiry and same-operation reconciliation; retain those riders. No common norm dictates this product's personal-owner-only role, which remains the conservative current slice.

**Sources:**
- [OpenTable discloses booking-specific payment terms and limits visible card details.](https://help.opentable.com/s/article/What-are-cancellation-no-show-and-deposit-policies?language=en_US)
- [Stripe keeps privileged API credentials on the server and supports restricted keys.](https://docs.stripe.com/keys)

**Placement:** State connection/capability fences as PAY-001's single connection door rule; cite PAY-003's existing exact mandate/expiry rider once. Remove pending wording only after synchronization, preserving the prior ruling.

**Current-main evidence:** CONTRACT.md:177 (clause), :519 (Status row); `ff96cd354e54aeedaf3e80c61750dd38b144a912`.

**Engineering/proof boundary:** Hosted setup proves no charge, production eligibility, bank settlement or complete mandate/capture. Actual paid-account, legal or production-launch decisions remain with the owner.

### RL-104 — Scoped dispute evidence and inert accounting handoff

**Date:** 2026-10-28 · **Ruled by:** ct · **Clauses governed:** PAY-009.

**Question:** May the venue approve a frozen dispute packet and accounting handoff while preserving processor custody and inert restore?

**Adopted/proposed default:** Personal-owner-only test-mode import, evidence review and explicit QuickBooks sandbox gross-principal handoff; no automated response or financial action.

**Outcome: adopt with rider.** Adopt exact packet/revision approval, least-data accounting export and inert restored execution state; responses, refunds, charges and retries require their separately authorized current operation, and evidence deletion/retention follows DATA-004. Keep manager delegation and the full dispute/fee lifecycle as owed product work.

**Why:** OpenTable assigns reservation-charge/refund control to the restaurant; Stripe has a separate dispute response with evidence and deadlines. No common norm makes import or evidence approval authority to submit, spend, refund or replay after restore. Owner-only/test-only is the conservative implementation slice, not the final manager target.

**Sources:**
- [OpenTable directs reservation-charge refund decisions to the restaurant.](https://help.opentable.com/s/article/What-are-cancellation-no-show-and-deposit-policies?language=en_US)
- [Stripe separates dispute evidence preparation and response submission.](https://docs.stripe.com/disputes/responding)

**Placement:** State custody and exact submission boundary once in PAY-009's own point; cite DATA-004 for retention and existing PAY-003/PAY-006 authority rather than restating their policy.

**Current-main evidence:** CONTRACT.md:193 (clause), :527 (Status row); `ff96cd354e54aeedaf3e80c61750dd38b144a912`.

**Engineering/proof boundary:** Manager delegation, production accounting and Pantry handoff, failed-card/chargeback lifecycle and full fee exposure stay unproved. Sandbox gross principal is not complete fee/net settlement reconciliation.

### RL-105 — Read-only finance grant is bounded interim authority

**Date:** 2026-10-28 · **Ruled by:** ct · **Clauses governed:** ROLE-004.

**Question:** May the owner grant a separate read-only finance identity without private guest notes or refund rights?

**Adopted/proposed default:** Exclusive owner-granted finance read-only capability; no staff role combination, writes or refund authority.

**Outcome: adopt with rider.** Adopt the current finance-only grant and server-enforced field/action restrictions; every future finance, marketing, integration and agent door must resolve its current venue/purpose scope and revocation, while full settlement reconciliation and the promised delegated workflows remain owed.

**Why:** OpenTable supports custom staff roles with selected permissions. No common norm requires finance readers to inherit private dietary notes, guest-service roles or charge/refund permission. The earlier PAY-006 ruling preserved ROLE-004 limited finance reads (the ct lane state record.md:1817); this entry retains that boundary.

**Sources:**
- [OpenTable documents flexible custom staff roles and granular permissions.](https://support.opentable.com/s/article/New-on-GuestCenter?language=en_US)

**Placement:** Keep one ROLE-004 finance door rule; cite FLOOR-012 field/sheet projection and live revocation duties once for receiving workflows.

**Current-main evidence:** CONTRACT.md:301 (clause), :574 (Status row); `ff96cd354e54aeedaf3e80c61750dd38b144a912`.

**Engineering/proof boundary:** Read-only reconciliation slice does not satisfy settlements, marketing, scoped execution credentials or queued-job revocation; those remain named gaps, never scope cuts.

### RL-1 — SETUP-001 adopted restaurant rules

**Date:** 21 October 2026 · **Ruled by:** ct · **Clauses governed:** SETUP-001, SETUP-002.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

The owner sets legal/trading name, address, US phone, contact channels, logo, booking policies, USD currency and an IANA venue timezone. Setup previews a realistic service without creating fake production guests; Los Angeles and New York daylight-saving gaps and repeated hours require explicit resolution.
Finish onboarding for a 72-seat US restaurant, preview its booking page and create services across both DST changes; refuse nonexistent local times and disambiguate repeated times.
Under ct scope51 (21 October 2026), completing restaurant setup saves editable defaults for new dated and recurring services: online parties 1–8 with inquiry above the maximum, 60 inclusive venue-local days ahead, inclusive 16:00 same-day cutoff, 30 elapsed minutes lead and 15-minute slots.
Walk-in and waitlist defaults have no cutoff and zero lead.
Every rule applies together; owner/admin may override party, horizon and lead with a recorded reason, never a cutoff or physical capacity.
The owner acknowledges the exact summary, recorded with a monotonically increasing version, actor and instant; edits require a fresh acknowledgment.
Existing services retain their own policies, and pre-onboarding installations retain their existing rules until the owner completes restaurant setup.
Contact channels are the restaurant’s phone, email and optional HTTPS website; saving them claims no provider validation or send.
PNG/JPEG/WebP restaurant logos are uploaded locally. USD is the edition currency. A transient preview uses the entered service and real floor through the current search/capacity engine and creates no service, guest, booking or proposal. Service creation and recurring generation refuse a DST gap and name its next valid local minute; repeated start or end times require an actual valid offset choice. Venue-local input resolves on the server and stored timestamps remain unambiguous instants. Restaurant fields, exact policies and acknowledgment export and restore under DATA-003 and DATA-001.

### RL-2 — BOOK-002 adopted restaurant rules

**Date:** 20 October 2026 · **Ruled by:** ct · **Clauses governed:** BOOK-002, BOOK-008, BOOK-009.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Restaurants embed a responsive, accessible booking widget on their own WordPress, Squarespace, Wix or custom website with venue branding, locale, party/date/time search and policy disclosure. The standalone booking page and embed share inventory and preserve source attribution. Owners can switch on consent-aware Google Analytics 4 and Meta Pixel/Conversions API events for search, checkout start and completed booking (with party size and source, never guest contact data). Before shipping, this capability must inherit SERVICE-005 arrival/service/concurrent/area pacing and SERVICE-007 warning, reasoned override and hard physical-capacity obligations; public and agent allocations never override. Embedding follows ct’s 20 October 2026 ruling: the owner alone manages an explicit list of up to 20 exact `https` website origins for the `/book?embed=1` widget (no wildcards, credentials, paths, `http`, `localhost` or loopback addresses, in any environment), and every change is audited with actor, time and the before/after list. Only that widget response names the list in CSP `frame-ancestors`, and it omits `X-Frame-Options`, which cannot express a list; an empty list answers `frame-ancestors 'none'` with `X-Frame-Options: DENY`, as does every other response, so staff pages, the standalone page, the queue and inquiry pages stay unframeable. The widget never submits on its own: a booking needs the guest’s own Confirm booking press. It accepts no messages from the host page, posts only its height to the listed origin and shows no staff link or data. Widget bookings use the public booking door with the online channel’s rules, turn/reset, joins, staffing, pacing and physical capacity, never an override, and record `attribution` `{door: widget, origin}` (the listed origin the widget reported: attribution, not proof); other public bookings record `{door: booking-page}`. The widget uses this installation’s own branding and venue name, US English with venue-local times in the venue’s IANA time zone, and the standalone page’s request terms, availability re-check and inquiry routing; both list each searched service’s online booking rules (party range, large-party inquiry threshold, horizon, same-day cutoff, lead time and arrival interval) before the guest confirms. Analytics follows ct’s 20 October 2026 ruling. Only the owner switches Google Analytics 4 (Measurement Protocol: measurement ID and API secret, optional `debug_mode` test mode) and Meta (Conversions API to the owner’s Pixel/dataset ID: access token, optional `test_event_code`) on or off; every change is audited with actor, time and before/after settings. Switching a provider off stops its events; its saved key stays until the owner enters a new one or removes it. Following ct’s 21 October 2026 ruling, the owner alone (as one of the owner’s own controls; no finance or staff role) can press Remove saved key for each provider: it deletes the stored GA4 API secret or Meta access token, leaves that provider’s other settings unchanged and is audited under AUDIT-001 with actor, time and `keySaved` false, never the key. While a provider is on without a key it sends nothing, the guest is not asked about it, and the settings say a key is needed; restores never bring a key back (DATA-001, DATA-003). The GA4 API secret and Meta access token are write-only: no state response, backup, archive, business CSV, audit row or log contains them (DATA-003 names the exclusion), so a restored installation sends nothing until the owner enters them again (DATA-001). While a provider is on and holds its key, `/book` and the widget ask once per page visit with Accept and Decline, naming each provider that is on and saying what is sent; the answer lives only in that page’s memory and is never stored or carried to another visit. Nothing is sent before Accept, on Decline or without an answer. After Accept the page creates a random visit ID, and Placemat’s server, never a script on the page, sends search (after each search the guest runs), checkout start (when the guest selects a time) and completed booking (after the booking commits) with exactly party size, booking source (`widget` with the listed origin, or `booking-page`) and the visit ID (Meta receives its SHA-256 as `external_id`), plus for Meta the browser user agent, the source page as `event_source_url` and the send time; never guest name or contact data, IP address, cookies, booking reference or reservation date/time. The visit ID is never stored on the booking or anywhere else. Sends run after the guest’s response with no retry queue, so a slow or failing provider never blocks or delays a booking. The owner sees each provider’s latest HTTP answer: GA4 never confirms an event (check DebugView) and Meta reports `events_received`; Placemat never claims a provider verified an event.
Embed on an allowed test website, search and book at 1440 and 390 widths, navigate by keyboard and verify the same slot disappears on the standalone page; observe the GA4 and Meta test events for the completed booking with no guest contact data, then decline analytics consent and observe none.
Test events are observed where GA4 and Meta receive them, at Placemat’s outbound network edge, in each provider’s test mode (`debug_mode`, `test_event_code`): provider-sandbox evidence with the provider edge faked in tests, never hosted or production acceptance.

### RL-3 — BOOK-004 adopted restaurant rules

**Date:** 22 October 2026 · **Ruled by:** ct · **Clauses governed:** BOOK-004.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

A scoped expiring manage-booking link lets a guest change time, size or contact details, reconfirm or cancel only their reservation. Show fee/refund consequences before consent and replace inventory atomically; changed links and replays cannot expose other guests.
Use a delivered link to move a two-top to four, fail an unavailable move without losing the old booking, cancel with policy acknowledgment and refuse an expired or foreign token.
Ct approved as adopted with riders (22 October 2026, 18:30Z): an owner or a native admin manager holding reservation authority explicitly sends or reissues to the reservation's recorded email, with an actor audit on every issue.
Hosts, shared-device sessions and agents cannot issue.
At most five issues per reservation per venue-local calendar day, including reissues and failed-delivery attempts; refusal happens before email.
A 32-byte random bearer is stored only as a digest, expires at the earlier of 24 hours and service start, and rotates on successful writes without extending expiry.
Reissue or a changed reservation invalidates the prior link.
Changing the recorded email closes link access; sending to the new address requires the same explicit issue action.
This door sends email only; MSG-008 must establish SMS consent before any future SMS send. No automatic payment, refund or outbound retry occurs. Reservations with payment obligations remain unchanged in manager review until PAY-004 (PARTIAL fee/cancellation policy) and PAY-005 (PARTIAL refund execution) ship their financial-consequence duties. Zero-money management is implemented and proven through public HTTP and the guest page. **Live delivery proof:** `scripts/booking-management-sandbox.mjs` — “BOOK-004 delivered-link zero-money journey”, controlled receiver receipt 3af92aa1-6a2c-4694-87e2-fb245c71cc37 at 2026-10-22T15:15:04.327Z (DMARC pass), proves actual delivery, private-link use, two-to-four change, unavailable preservation, acknowledged cancellation and replay refusal. Fresh controlled receiver receipt 6502906c-1114-40aa-83e7-dffcf3fd7922 at 2026-10-22T19:38:50.261Z repeats that journey with DMARC pass.

### RL-4 — DIST-005 adopted restaurant rules

**Date:** 27 October 2026 · **Ruled by:** ct · **Clauses governed:** DIST-005.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

**Status: done.** CT judged DIST-005 at `90fbab254ae525906eded2f2f27752c1799dda30` on 27 October 2026 and accepted it as done. Diners can optionally keep verified contact details, favorite restaurants, manage upcoming reservations and rebook prior visits across devices, with saved preferences controlled per restaurant. Guest checkout remains available and identity never merges distinct people solely because they share a phone. **CT ruling, 26 October 2026 — APPROVE WITH RIDERS; DIST-005 remains PARTIAL.** A diner explicitly proves access to the selected booking’s current recorded email before attaching that booking. Thirty-two-byte random one-use codes are stored only as digests and expire after fifteen minutes; independent device bearers are stored only as digests and expire after twenty-four hours. Each additional booking needs its own current-contact proof. Shared phone numbers confer no identity, booking or account authority. Favorites and preferences are controlled per restaurant; verification grants no staff role, marketing permission, review eligibility or group-sharing permission. Sends are explicit, bounded and audited, with provider acceptance distinguished from mailbox delivery. Logout revokes the selected device; account forget revokes all account sessions without cancelling reservations. DATA-003 portability, DATA-002 erasure fences and AUDIT-001 accountability apply to these records, while verification and device custody remain excluded from archives. The complete diner-facing favorite, repeat-booking and upcoming-reservation management target across devices remains binding. Group sharing remains the separate GUEST-006 target. **CT update ruling, 26 October 2026 — APPROVE WITH RIDERS; DIST-005 remains PARTIAL.** The earlier DIST-005 ruling remains binding. Pending email proof may retain the private booking, guest and current-contact references needed to validate that single booking, while storing the random code only as a digest, expiring it after fifteen minutes and consuming it once. Failed or uncertain mail does not establish delivery or successful verification. An independent digest-only device session expires after twenty-four hours and grants management only for individually verified bookings whose current recorded contact still matches. Every change, reconfirmation or cancellation requires a fresh booking-specific preview and explicit diner confirmation; the preview is bound to that device, booking and current state, is revocable and is excluded from archives. Capacity failure, stale state, replay, revoked access or changed contact grants no mutation authority. Recorded payment obligations require manager review and remain unchanged through this diner door; this grants no charge, refund, fee waiver or automatic message authority. Current-contact, custody, audit, portability and erasure riders remain binding. This update accepts no completion.
Book without an account, verify a diner account, attach only the verified booking, rebook a favorite on another device and revoke saved preferences.

### RL-5 — FLOOR-007 adopted restaurant rules

**Date:** 21 October 2026 · **Ruled by:** ct · **Clauses governed:** FLOOR-007, FLOOR-014.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Hosts find guests, bookings, phone numbers and table labels quickly, filter by service/source/status and see VIP, allergy, access and unpaid-policy alerts with PAY-010 deadlines. A handover lists unresolved guest requests, late parties and promised callbacks with owners and due times.
Find an arriving guest by phone suffix, resolve their access request, hand over an unpaid deposit exception and prove the next host can complete the promised callback.
Current timeline search uses GUEST-002 case/accent-normalized name/email and normalized US phone suffix matching, plus case-insensitive booking-ID, service-name and table-label substrings.
Venue-local service-start date, service, source and booking-status filters combine; an empty filter includes every value.
It displays existing VIP/regular facts, guest-supplied allergy/accommodation requests and required table access/area, without certifying food safety or claiming a payment.
Ct policy (21 October 2026): An active owner-granted host or a manager creates a follow-up and assigns it to themself or another active host or manager.
A host reassigns only items they hold; a manager reassigns any.
The current assignee or a manager completes it.
Every active host and manager sees each open item's kind, booking, guest, due time, assignee and state. Free text is shown only to managers and the current assignee, never to agents or preparation keys, and leaves the SEC-002 stand page on lock or switch. **Ct assertions:** host A hands to B; C sees the item without its text; B completes it on the stand; after a switch to C, B's text is absent from response and DOM. All acceptance points pass. Hosts create and hand over their own work; active hosts retain booking/kind/guest/assignee/due/state metadata, while current assignment controls free text in live and historical reads. Manager-defined USD deposit requests supply real unpaid deadlines and overdue exceptions; transferring their callback transfers the follow-up owner. Completion records an operational outcome and never marks a deposit paid. PAY-010 retains delivered notices, policy automation, waivers and live sandbox proof in its own partial clause.

### RL-6 — FLOOR-012 adopted restaurant rules

**Date:** 21 October 2026 · **Ruled by:** ct · **Clauses governed:** FLOOR-012.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Before service a host or manager opens one sheet for the service date, printable from the browser, downloadable as PDF and readable on host devices. It lists the guests to know (VIP and regular status with visit count, occasion, declared allergies and access needs from GUEST-003, seating preference and the notes the viewer’s role may see), deposits and card guarantees held with amounts (PAY-002, PAY-003) and unpaid PAY-010 deadlines, the server sections with their tables and expected covers (FLOOR-004), the pacing limits (SERVICE-005) and the kitchen notes of FLOOR-013. It reflects bookings and changes up to the moment it is opened and shows when it was generated. Roles without rights (ROLE-003, ROLE-004) never see restricted notes or contact details on it, and erased guests (DATA-002) never appear with personal values.
Prepare a Friday with a shellfish-allergic anniversary regular, an eight-top with a deposit and a chef’s-counter booking; open the pre-shift sheet as manager and print it to PDF; read each guest’s flags, deposit and section; change a booking and reopen to see the change and a new generated time; open it as a server and find restricted notes absent; erase one guest and prove a new sheet holds none of their values.
Under ct’s 21 October 2026 ruling, FLOOR-012 is done when every existing capability conforms: owner/admin get the full current sheet; owner-granted hosts get names, VIP/regular level, recorded attended visit count, occasion, unverified guest-supplied dietary/allergy/access requests, seating preferences, table/section/server and pacing only.
Hosts receive no contact, guest notes or tags.
Plain members and preparation keys are refused.
One server-side projection feeds HTML, print and on-demand PDF; no sheet or PDF is stored.
The date is venue-local; every service starting on that date is included, with current non-canceled/non-no-show bookings and a generated instant.
Erased guests show only “Erased guest”, time, party size and table.
Saved deposit requests show protection state and their pay-by deadline in the live sheet, print and PDF for managers and hosts; only server-verified paid state establishes protection. No card guarantee or held-deposit amount is inferred; PAY-002 and PAY-003 retain their amount/guarantee duties. Before their capabilities ship, PAY-002, PAY-003, PAY-010, FLOOR-013, GUEST-003, FLOOR-010, ROLE-003 (server acceptance step) and ROLE-004 each inherit their full sheet duties and acceptance in both documents. The deposit eight-top, chef’s-counter and server acceptance steps remain binding in those receivers; current proof uses an ordinary eight-top, guest-supplied requests and a granted host.

### RL-7 — FLOOR-013 adopted restaurant rules

**Date:** 21 October 2026 · **Ruled by:** ct · **Clauses governed:** FLOOR-013, FLOOR-019, FLOOR-020.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Managers attach free-text shift notes (for example “regular booked Thursday, seat in Ana’s section”) and kitchen notes to a service date. Every host device and the pre-shift sheet (FLOOR-012) show them, and edits keep author, time and history. The kitchen view of a service shows the arrival pacing limit and covers expected per interval (SERVICE-005), large parties, counts of dishes, add-ons or tasting choices that guests supplied at booking (BOOK-007, EXP-002) totaled by item, and each declared allergy and access need by table (GUEST-003) with no diagnosis and no statement that food is safe. Counts come only from guest-supplied booking data or manager entry and say which; Placemat never estimates portions.
As manager add the kitchen note “Halibut: 12 portions” and a shift note; as host open the floor on a second device and read both; collect a halibut pre-order on three bookings and see the item total with its source; record a shellfish allergy for the Table 12 booking and read it in the kitchen view beside the arrival pacing limit; edit the note and read author, time and history; open the kitchen view as a server and find only that server’s section allergies.
Before service notes ship, feed current authorized shift/kitchen notes into FLOOR-012 through its one server-filtered projection for screen, print and PDF.
FLOOR-013 retains unpaid ordinary-reservation dish pre-orders from a manager-published list; paid or ticketed add-ons belong to EXP-002.
FLOOR-013 must add DATA-003 CSV/archive coverage, DATA-001 restore validation and DATA-002 erasure before shipping.
Under ct’s 21 October 2026 ruling, FLOOR-013 is done when every current capability conforms: unpaid dish pre-orders are captured on ordinary public reservations from the manager-published per-service list, with integer quantities and the item name preserved.
Withdrawn dishes refuse new requests and retain previous quantities.
Guest-supplied quantities and manager-entered counts are shown separately, never estimated or treated as a paid order.
Kitchen totals and covers include booked, seated and completed reservations, excluding cancelled/no-show parties; large parties are eight or more. Service-date notes use the venue-local date on which the service starts. Owner/admin write notes and publish dishes/counts; owner/admin and granted hosts read shift notes, while owner/admin, granted hosts and plain members read the identity-free kitchen view; preparation keys cannot open it. Note edits append text, actor and instant history; hosts receive live changes through the existing floor version, and the kitchen has live updates plus explicit refresh. Authorized shift and kitchen notes feed FLOOR-012’s one screen/print/PDF projection. Kitchen allergy/access fields are unverified guest-supplied requests by table, with no guest identity/contact fields, diagnosis or safety claim. Paid/ticketed add-ons and tasting choices inherit item/source totals and sheet coverage in EXP-002 before shipping. ROLE-003 inherits server sign-in with own-section allergies, including the full server kitchen acceptance step; GUEST-003 inherits declared/acknowledged allergy and access sources before shipping. Notes/history, published lists, manager counts and booking quantities export in DATA-003 CSVs and structured archives; DATA-001 validates their dates, shapes and relationships before restore. DATA-002 clears the erased guest’s booking quantities/needs and shared note text/history on their booked service dates, redacts the corresponding audit snapshots and fences older archives. Anonymous counts, dates, actors and instants remain. Current tests assert manager/host/member/key boundaries, three guest pre-orders, per-table needs, pacing/large parties, note history/live reads, pre-shift HTML/PDF, portable restore, invalid-reference refusal and erasure. The future server and acknowledged-needs acceptance remains binding in those receivers.

### RL-8 — PAY-002 adopted restaurant rules

**Date:** 25 October 2026 · **Ruled by:** ct · **Clauses governed:** PAY-002.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Managers require fixed or per-person deposits by service, party size, experience or channel, disclose terms before checkout and link the receipt to one capacity-held reservation. Failures and abandoned checkout release holds; deposit balance is available for POS settlement. Before shipping, this capability inherits BOUND-001: each payment is tied to one named booking or event, shown as a balance against it and refunded under PAY-005; it is nontransferable, cannot be topped up and cannot be redeemed outside that booking or event or spent as a general balance. **Ct ruling, 25 October 2026 — APPROVED WITH RIDERS; PAY-002 remains PARTIAL.** The interim workflow uses existing personal owner or native admin-manager authority to create fixed-USD or per-person booking-bound deposit requests and explicitly close collection. For a per-person request, preserve the original booking reference, party count, integer-cent USD rate, total and saved deadline; later booking or policy changes do not rewrite that request or authorize another collection through its original scope. Existing PAY-010 host authority, including a live authorized host PIN session, may issue or copy the saved request and use existing status-verification doors without acquiring request-setting, waiver, refund, payment-administration or ledger authority. Stripe retains payment credentials and money movement; Placemat retains restricted references and recorded outcomes, not PAN/CVC or merchant funds. Creating or copying a hosted link establishes neither delivery nor guest receipt or consent, collected money, bank settlement, POS credit, seating release or refund. Paid/protected claims require matching authenticated provider facts. PAY-002 pre-checkout disclosure, BOOK-004 financial-consequence consent, applicable PAY-003/PAY-004 agreement and MSG-008 channel-permission duties remain separate and binding. This slice authorizes no automatic send, reservation release, refund or seating settlement. Unresolved Checkout collection preserves the reservation; collection closure and any permitted booking cancellation remain separate explicit actions under BOOK-006. The complete original payment, refund, capacity, display and seating acceptance remains binding.
Require a $25-per-person deposit for four guests, pay $100, retry the callback and inspect one paid booking; fail another payment and verify its table becomes bookable.
Each deposit held shows on the booking, the confirmation and the pre-shift sheet (FLOOR-012) with its amount, per-guest rate and the card’s last four digits, and states what happens at seating; seating the booking applies it to the check (PAY-008) or releases the hold exactly once and shows which.
Prove the inherited BOUND-001 boundary: inspect the booking/event-bound balance and PAY-005 refund, and refuse transfer, top-up, redemption against another booking/event and general-balance spending.
Before deposits ship, FLOOR-012 shows held deposit amounts on its manager sheet and only amounts permitted by the receiving role policy; assert the deposited eight-top in its screen, print and PDF.

### RL-9 — PAY-003 adopted restaurant rules

**Date:** 25 October 2026 · **Ruled by:** ct · **Clauses governed:** PAY-003.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Guests provide a tokenized card guarantee or supported authorization with explicit no-show terms. The venue sees authorization expiry and recollection tasks; a saved card is not described as an indefinite card hold and the restaurant must use the approved mandate for later charging. **Ct expiry ruling, 25 October 2026 — APPROVED WITH CHANGES for the expiry foundation.** Expiry restricts authority and creates none: ownership, owner attestation, a saved card or a successful setup alone never authorize a fee. The original booking, guest, dated service, arrival, party count, immutable policy, USD-cent amount and fixed or per-person basis remain binding; material changes need matching fresh agreement. Save a finite deadline no later than that dated service's absolute end instant and display it in venue time. Earlier revocation or an applicable guest or provider limit wins. Shortening the service permanently shortens authority; extending or rescheduling never extends saved authority. A violation before expiry permits no new charge attempt after expiry. A previously submitted reserved decision may reconcile its known provider operation after expiry without a replacement decision, key or charge; an uncertain operation without a known provider reference needs manual reconciliation once authority expires. Legacy unbounded authority expires on upgrade; missing or invalid expiry is refused or conservatively expired on restore. Historical archives restore neither credentials nor charging authority. Explicit recollection is attributable owner-held work for an upcoming active retained booking; it sends nothing, changes no expiry and establishes no renewal. Erasure fences, attributable history, role-safe sheets and DATA-001 through DATA-004 remain binding. BOOK-004, BOOK-006, PAY-004, PAY-010, MSG-008, FLOOR-012, GUEST-004 and AUDIT-001 retain their receiving duties. This foundation ruling does not approve the later merchant and guest-collection default or certify a provider mandate. **CT ruling, 26 October 2026 — APPROVE WITH RIDERS; PAY-003 remains PARTIAL.** The merchant collection, guest mandate, manual authorization and explicit capture default is approved subject to the 25 October expiry riders. A personal owner explicitly enables collection; the guest accepts exact immutable booking-bound terms before hosted setup or authorization. Integer-cent USD authorization cannot exceed the agreed maximum fee. Authority ends at the earliest saved guest limit, dated service end, owner revocation or verified provider deadline, and later changes never extend it. A fresh explicit owner decision for a matching actual violation may capture only the original verified authorization within its permitted amount and deadline. Uncertainty reserves the original operation; it permits observation, not a replacement charge. Unconfirmed release retains the last verified held amount, and renewed authorization waits for confirmed release of the earlier hold and fresh applicable agreement. Recollection remains attributable owner-held work without an automatic message or renewed authority. Personal-owner restrictions on staff financial projections remain in force. The complete guarantee and permitted-fee acceptance remains binding; this ruling grants no completion or legal certification.
Create a guaranteed reservation, expire an authorization and request renewed collection; prove an expired hold is not reported as protected and inspect guest consent to a permitted later fee.
Before card guarantees ship, FLOOR-012 shows held guarantee amounts only to permitted roles in the live sheet, print and PDF, without card credentials.

### RL-10 — PAY-006 adopted restaurant rules

**Date:** 25 October 2026 · **Ruled by:** ct · **Clauses governed:** PAY-006.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

An immutable minor-unit USD ledger relates reservation, charge, deposit, fee, transfer, refund, dispute and payout references. Signed webhooks are deduplicated and out-of-order events reconciled; finance can resolve unmatched settlements without changing historical amounts. **Ct ruling, 25 October 2026 — APPROVED WITH RIDERS; PAY-006 remains PARTIAL.** Only a full personal venue owner may use the interim ledger-read, payout-import and explicit unmatched-attribution doors. This neither enlarges nor withdraws ROLE-004's existing limited charge/refund finance read/export authority; scoped finance settlement reconciliation remains a contracted target. Payout import retrieves the complete provider settlement through read-only provider requests and reconciles USD gross, fees and net; incomplete or inconsistent retrieval establishes no reconciled payout. An attribution correction appends a separately identifiable human decision linking an existing unmatched transaction to an existing booking. It may change derived attribution, never historical amounts, currency, fees, net, processor references, payout snapshots or economic-event history. The original provider facts and the actor/time/source of the human decision remain distinguishable and inspectable, with AUDIT-001 before/after and reason-when-recorded duties. Attribution is not provider confirmation of an absent booking reference. It cannot hide an amount or lifecycle discrepancy, manufacture a balancing entry or make a financial difference disappear by marking an item matched. These doors grant no charge, refund, send, deletion or automatic provider-write authority. The complete original reference relationships, signed-event deduplication, out-of-order reconciliation, finance delegation, audit, portability, correction and DATA-004 retention obligations remain binding.
Deliver refund before charge callbacks, duplicate both and reconcile a Stripe payout to its bookings, fees and net amount; correct an unmatched item with a new adjustment record.

### RL-11 — GUEST-004 adopted restaurant rules

**Date:** 21 October 2026 · **Ruled by:** ct · **Clauses governed:** GUEST-004.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Potential duplicate profiles are suggested from normalized identities and visit context, with a preview of conflicts, linked bookings, consent and spend before an authorized merge. Shared household numbers do not auto-merge people; merges are traceable and mistaken merges can be reversed safely.
Import two emails for one guest and a shared family phone, review suggestions, merge only the true duplicate and reverse it without losing visits or changing anyone’s marketing permissions.
Matching follows ct scope51 (21 October 2026): email is trimmed/lowercased only; US phone is normalized to +1; names compare exactly after accent/case normalization.
Suggest only the same email or the same phone plus name; shared phone with a different name is a household and is never mergeable.
Imports retain distinct source IDs with collision warnings, never automatic merging.
Owner/admin previews choose the surviving profile; typed confirmation and current profile/linked-record versions fence each atomic mutation.
Selected profile fields remain selected; both originals, provenance, notes and visits remain in the manager-only journal, alternate contacts retain their source identity, and approved reminders retain their original recipients.
Queue consent stays bound to the original phone; the most restrictive recorded value wins for a shared phone, unknown never grants, and unrelated household permission stays separate.
Marketing permission and spend remain not recorded. Unmerge restores only unchanged records and lists later edits/new records for manual assignment without overwriting them or restoring more permissive consent. Journal CSV and structured archives include snapshots, aliases, contact provenance and pending assignments with relationship validation. Erasing a merged identity erases its reviewed aliases and unresolved profiles still carrying that identity pending assignment, purges related journal snapshots and linked audit/operational personal values, and permanently blocks reversal and pre-erasure restore. MSG-008 inherits contact/channel/purpose-specific consent and suppression; GUEST-005 inherits POS visit/payment relationship reassignment before those capabilities ship.

### RL-12 — REPORT-005 adopted restaurant rules

**Date:** 25 October 2026 · **Ruled by:** ct · **Clauses governed:** REPORT-005, REPORT-009.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Managers download reservation/guest/finance CSV reports across past, current and future periods and schedule authorized email deliveries. Groups compare locations using consistent local dates and timezones; exports obey field permissions, consent and erasure.
Schedule a weekly group cover report for a permitted manager, export future bookings and historical visits, then revoke access before the next scheduled delivery and prove it is blocked.
Ct APPROVED PARTIAL, 25 October 2026 at 20:08Z: a personal venue-wide owner or admin explicitly approves each native group recipient.
External recipients require owner approval of that exact address through an owner-created schedule; an admin may only reuse that recorded identity and address approval.
Changed addresses require renewed owner approval.
Current schedule-owner authority, recipient identity and every selected venue grant are checked on each delivery attempt and authenticated download; removal, changed recipient email, disconnection or an unreachable venue refuses.
Email contains only an authenticated link, never an anonymous or bearer link or report snapshot.
No report snapshot is retained.
Private schedule and attempt metadata is owner-exportable but excluded from restorable archives, so restore cannot resume sends. Uncertain submission remains “delivery unconfirmed” for explicit manual resend. Recipient approval, attempts and every recheck or foreign-identity refusal are audited. Group comparisons use ROLE-001 read-only tokens with member-to-home checks on every call and identical inclusive local service-date labels in each venue timezone. Operational CSVs inherit current manager service scopes; guest personal and finance fields retain their existing restricted export doors, consent and erasure. DATA-001, DATA-002 and DATA-003 continue to govern these records; MSG-003 and MSG-007 inherit authenticated report custody and uncertain-send handling before richer delivery receipts or retries ship.

### RL-13 — ROLE-001 adopted restaurant rules

**Date:** 23 October 2026 · **Ruled by:** ct · **Clauses governed:** ROLE-001.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Owners control restaurant configuration, billing/provider connections, people and capability grants, exports, erasure and backup/restore. Group central management is deferred to ROLE-010. Group admins get explicit per-venue rights without becoming owner; sensitive access and financial changes require recorded personal authority. Before additional venues ship, approved sister-venue alternatives inherit BOOK-003 search, exact fit and stale-result reselect.
As owner connect two venues, grant a scoped group admin, revoke it and prove direct API access stops; deny a venue manager an owner export, erasure and provider credential change.
Group model (ct approved as the first slice, 23 October 2026): each venue stays its own installation.
An owner issues a one-use invitation and the other venue's owner joins with it, choosing the most any group admin may read there; the home owner grants a native member explicit per-venue rights, read-only and never above that ceiling (reservation report, host pre-shift projection).
A short-lived token is checked by the member venue against its home on every call, so revocation or disconnection stops access at once and an unreachable home refuses.
Group rights cannot write in this slice, and every grant, export, erasure, refund, person and provider-credential change stays the venue's own owner or manager's personal authority, recorded in the audit history with before/after visible to the owner only.
Connections, grants and tokens are never restored from a backup; DATA-003 exports links and grants without secrets.
Central management, group-wide configuration and billing (ROLE-010), sister-venue alternatives (BOOK-003), shared guest profiles (GUEST-006) and group reports (REPORT-005) are deferred, not excluded, and inherit this model.

### RL-14 — ROLE-002 adopted restaurant rules

**Date:** 21 October 2026 · **Ruled by:** ct · **Clauses governed:** ROLE-002.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Managers configure approved shifts, publish services, assign sections, resolve guest recovery, approve policy exceptions and refunds within limits, and see allowed reports. Shift leads may resolve operational exceptions without changing payment credentials, owners or guest export rights.
Give a manager a $100 refund limit and a lead seating-only override; test each direct operation, refuse the excess refund and provider change, and record a permitted decision.
Ct policy (21 October 2026): owner-issued separate seating-lead grant, reviewed seating/rule/pacing exceptions with hard conflicts never bypassed, no owner/provider/guest-export/financial mutation rights for leads, and explicit service scopes for lead report reads.
Leads receive reservation/performance JSON only, no exports or publication.
Existing managers keep venue-wide reports until explicitly scoped; explicit scopes cover every report door and immutable snapshots.
Owner-recorded refund authority uses USD cents ($100 = 10000).
A limit is integer USD cents.
No recorded limit means no refund authority, and owners are uncapped.
It caps the sum of pending and succeeded refunds that person submits against one booking's charges, so splitting cannot exceed it. PAY-005 refuses an excess before any processor call. Only an owner sets limits, with AUDIT-001 before/after history. **Ct assertions (PAY-005 inherits them):** with a 10000 limit, refunding $60 then $40 of $150 succeeds and a further $0.01 is refused; a manager with no limit is refused. All acceptance points pass under the final ct policy. Owner-only integer-cent limits are audited; pending plus succeeded refunds submitted by one manager across one booking's charges consume that authority. With a 10000 limit, $60 then $40 of $150 succeed and a further cent is refused before any processor call. Managers with no limit are refused; owners are uncapped within the charge balance. Reviewed lead seating, hard physical conflicts, scoped reports and denial of owner/provider/export/financial changes remain proven. ROLE-001/ROLE-004 retain future venue/group/provider scoping.

### RL-15 — ROLE-003 adopted restaurant rules

**Date:** 23 October 2026 · **Ruled by:** ct · **Clauses governed:** ROLE-003.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Hosts manage reservations, arrivals and queues within their venue, directly move, swap and lock table assignments (FLOOR-009) and, when granted, override pacing (SERVICE-007); servers see their section and service-relevant dietary/access notes; read-only staff can view permitted operations but never mutate. Guest exports, bulk marketing and sensitive notes are separately permissioned.
Sign in as host, server and read-only member, seat, move and swap tables as host without approval, inspect only the server’s section and refuse member mutations and all three actors’ bulk guest exports.
Before server sign-in ships, enforce own-section FLOOR-012 and FLOOR-013 visibility on the server; assert the pre-shift server step with restricted notes/contact absent from HTML, print and PDF.
Current owner-granted hosts receive only FLOOR-012’s enumerated host projection; ordinary read-only members are refused the sheet.
Before server sign-in ships, assert FLOOR-013’s full server acceptance: open the kitchen as a server and find only that server’s own-section allergy/access requests, with no other section, guest identity/contact or shift-note values in the response or page.
Server identity model (ct approved, 23 October 2026): only the owner grants a native member the separate server capability (never together with host or shift-lead; revoking removes every shift link), and a manager links that person to one shift server.
A signed-in server reaches only their own pre-shift sheet (HTML, print, PDF) and kitchen view for shifts they are linked to, limited to their own sections' tables and parties; no contact, guest notes, tags, payments, shift notes, other sections, pacing or dish totals.
Every other door answers 403.
Hosts keep reservation, arrival, queue and assignment rights. Host guest conversations are carried by ROLE-009. Restored grants and links remain inactive until the owner confirms the native identity and shift link. MSG-006, GUEST-003 and POS-007 inherit the server view; DATA-003 covers the grant and link.

### RL-16 — ROLE-009 adopted restaurant rules

**Date:** 23 October 2026 · **Ruled by:** ct · **Clauses governed:** ROLE-009.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Hosts manage reservations, arrivals, queues and guest conversations within their venue; guest conversations beyond BOOK-007 inquiries stay with MSG-006, and inquiry replies stay manager-only until MSG-006 / BOOK-007 reply authority is built. Carved verbatim from ROLE-003 under ct’s 23 October 2026 ruling.
**Status: missing.** Hosts manage reservations, arrivals, queues and guest conversations within their venue; guest conversations beyond BOOK-007 inquiries stay with MSG-006, and inquiry replies stay manager-only until MSG-006 / BOOK-007 reply authority is built.
Carved from ROLE-003 under ct’s 23 October 2026 ruling.

### RL-17 — ROLE-010 adopted restaurant rules

**Date:** 23 October 2026 · **Ruled by:** ct · **Clauses governed:** ROLE-010.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

Group central management provides one shared directory of several venues inside one installation, group-wide configuration and billing. This requirement is carved verbatim from ROLE-001 under ct’s 23 October 2026 ruling; group writes are deferred, not excluded. A later grant may add explicitly consented per-venue write rights.
**Status: missing.** One shared directory of several venues inside one installation, group-wide configuration and billing.
Carved from ROLE-001 under ct’s 23 October 2026 ruling; group writes are deferred, not excluded, and later grants may add explicitly consented per-venue write rights.

### RL-18 — SEC-002 adopted restaurant rules

**Date:** 21 October 2026 · **Ruled by:** ct · **Clauses governed:** SEC-002.

The historical decision and its surrounding scope are retained below. Implementation statements are historical, and accept no new completion in this rewrite.

An owner registers a host-stand tablet as a venue device that stays available with limited rights. Each staff member switches in with a personal PIN or badge in seconds; every action is attributed to that person, the device locks after inactivity or on switch, and restricted notes, refunds, waivers, payment settings, exports and administration require the individual’s full session or step-up (SEC-001). PINs are per person, throttled after failed attempts and revoked with the person or the device.
Register a host iPad as a venue device, switch between two hosts by PIN, seat and move parties and read audit rows attributed to each host.
Let it idle and see it lock; enter wrong PINs until throttled; suspend one host and refuse their PIN; refuse a guest export from a PIN session without step-up; revoke the device and refuse its next request.
Ct policy (21 October 2026): owner-only one-use registration (10 minutes), 30-day installation-local device lease, personal 6–12 digit PIN and two-minute inactivity lock.
A PIN session carries the person's live host authority: FLOOR-009, WAIT-002, SERVICE-007 when granted, FLOOR-007, phone and walk-in booking create/change, and sending PAY-010 links.
It never carries restricted notes, refunds, waivers, payment settings, exports or administration.
Staff tap their name on a roster of active enrolled hosts, then enter the PIN.
PINs are HMAC-SHA256-keyed with a versioned Worker-secret pepper, then PBKDF2-SHA256 at the platform maximum with a per-PIN salt.
Pepper version and iterations are stored per PIN and upgraded on successful unlock. Common, repeated and sequential PINs are refused. Ten consecutive failures disable a PIN until a full-session reset, with an owner/manager security event. The owner renews a lease for at most 30 more days, warned from day 23. Claim, switch and lock sign out personal sessions left in the browser; PIN mode also refuses native account-administration and sign-in/setup routes and has no full-session fallback. Device credentials and personal PIN credentials remain excluded from archives. PIN replacement, native suspension/version changes, host-grant removal and device revocation invalidate authority, including in-write invalidation fences. **Ct assertions:** phone booking and walk-in made by PIN; export refused; 123456 refused; the 10th failure disables the PIN and a correct 11th entry is refused; a digest does not verify without the pepper; a renewed stand works past day 30. All acceptance points pass under the final ct policy. PIN sessions use the live host grants with in-write device fences; unsupported financial, restricted-note, export and administration doors refuse without personal-session fallback. Ten consecutive failures disable the personal PIN across stands until a full-session reset, recorded in manager-visible security events. Versioned Worker-secret HMAC then platform-maximum PBKDF2, per-PIN salt, predictable-PIN refusal and successful-unlock upgrades are proven. The day-23 warning and owner-only renewal preserve the server lease bound. SEC-001 retains future step-up duties.
