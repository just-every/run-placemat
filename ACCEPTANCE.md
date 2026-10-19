# First release and target acceptance

Target edition: **17 October 2026**. [CONTRACT.md](CONTRACT.md) is the product target and source of clause IDs. Base’s command behavior remains in SEED-COMMAND-CONTRACT.md. The published first-release journeys remain; deposits, delivered messaging, POS, distribution and the rest of the target are now required acceptance, with honest implementation status rather than exclusions.

Each bullet is a journey through a real public door: screen/form, documented HTTP API, download, CLI or authenticated provider callback. Use isolated installations and realistic restaurant/guest records; fakes belong only at paid/network boundaries. Provider acceptance additionally needs an approved account and controlled real receipt/call/booking. No customer messages or charges are authorized by running ordinary local tests. Run mobile journeys at 390 and desktop at 1440, plus named native/tablet clients where required. Missing journey tests are future work, not proof of completion.

Statuses below match the contract at code commit `d1ee743104d2256f1a3211a958f7b5d960bbe1d4` (17 October 2026). The current domain journeys run with `pnpm run test:api`; site and runtime journeys use `pnpm run test:site` and `pnpm run test:runtime`. `rer check --profile first-party` validates document shape; passing it does not prove an unimplemented behavior. CI remains the full verification wall.

## Published foundations

- **ACCESS-001 — Native sessions and preparation authority.** **Status: done.** Call state, commands, downloads, import and backup directly while signed out, as member, admin and preparation key; refuse unauthorized writes and cross-origin requests; revoke a key and refuse its next read. **Current evidence:** `src/placemat/access.ts`; `src/placemat/http.ts`; `tests/api/flows.test.mjs`.

- **PRIVACY-001 — Public guest isolation.** **Status: done.** Create two guests through the public booking door; inspect availability and both confirmations while signed out and prove neither response contains the other guest’s details. **Current evidence:** `src/placemat/http.ts`; `src/placemat/commands.ts`; `tests/api/privacy.test.mjs`.

- **BOOK-001 — Live assigned reservations.** **Status: done.** Publish a service, make three public reservations and race the final fitting combination from two guest requests; exactly one succeeds and the next availability read reflects it. **Current evidence:** `src/placemat/http.ts`; `src/placemat/availability.ts`; `tests/api/flows.test.mjs`.

- **FLOOR-001 — Conflict-safe physical capacity.** **Status: done.** Book a combined table through HTTP, reject too few or duplicate tables and over-capacity arrivals, finish a turn and book a later one; attempt a clash across services and require refusal. **Current evidence:** `src/placemat/availability.ts`; `src/placemat/store.ts`; `tests/api/flows.test.mjs`.

- **SERVICE-001 — Reviewed dated service publication.** **Status: done.** Create tables and a Friday service through commands, prepare publication, edit it, refuse stale approval and approve a fresh plan; only the published service becomes bookable. **Current evidence:** `src/placemat/commands.ts`; `tests/api/flows.test.mjs`.

- **PLAN-001 — Exact plans and accountable decisions.** **Status: done.** Prepare with an owner-issued key, refuse key approval, change a draft, refuse stale approval, then approve a fresh plan as manager and read its identities; prepare and approve a valid table move. **Current evidence:** `src/placemat/commands.ts`; `src/placemat/people.ts`; `tests/api/flows.test.mjs`.

- **MSG-001 — Approved reminder CSV custody.** **Status: partial.** Book guests, mark one no-show, approve remaining reminders and download CSV with US-formatted local times; erase a booked guest and download again, proving the guest’s personal values are absent. **Current evidence:** `src/placemat/commands.ts`; `src/placemat/downloads.ts`; `tests/api/flows.test.mjs`. **Remaining:** Approval, export attribution, no-show and erasure exclusion work; reminder text is rendered with an `en-AU` date format, not US format.

- **WAIT-001 — Staff walk-ins and waiting parties.** **Status: done.** Run the Friday HTTP journey with online bookings, a walk-in, a waiting party and a no-show; seat the waiting party and refuse completion before seating. **Current evidence:** `src/placemat/commands.ts`; `tests/api/flows.test.mjs`.

- **GUEST-001 — Guest visit history.** **Status: done.** Book a guest, change its service status, import dated visits and read guest/state through an authorized session; update notes and find both current and imported history. **Current evidence:** `src/placemat/guests.ts`; `src/placemat/import/plan.ts`; `tests/api/flows.test.mjs`.

- **MIG-001 — Reviewed Tablein-shaped move-in.** **Status: done.** Upload the fixture through dry-run, reject a wrong fingerprint, apply, read the journal, undo unchanged rows and refuse undo after a staff edit while keeping that edit. **Current evidence:** `src/placemat/import/index.ts`; `src/placemat/import/plan.ts`; `tests/api/flows.test.mjs`.

- **DATA-001 — Validated empty-destination backups.** **Status: done.** Export a booked venue through the owner backup endpoint; restore into an empty installation, compare records, then refuse overwrite and a modified archive without changing destination data. **Current evidence:** `src/placemat/backup.ts`; `src/placemat/archive-policy.mjs`; `tests/api/flows.test.mjs`.

- **DATA-002 — Guest erasure and restore fences.** **Status: done.** Import, back up and erase a guest; verify guest and retained archive custody no longer contain personal values, refuse reimport and refuse a pre-erasure restore when given the trusted later journal. **Current evidence:** `src/placemat/import/erase.ts`; `src/placemat/backup.ts`; `tests/api/flows.test.mjs`.

- **SITE-001 — Runnable product and owner guides.** **Status: partial.** Build the run site and follow homepage to /run and /docs; open the installed root after fresh setup and reach empty restaurant operations. The homepage’s Run Placemat and Read the docs buttons and its Run it yourself command (`npx -y @runeditrun/rer dev just-every/run-placemat`) match `src/site/run.json`, README and /run exactly; run that command in a clean directory and reach owner setup. **Current evidence:** `tests/site.mjs`; `tests/runtime.mjs`; `src/placemat/model.ts`. **Remaining:** Site links and the native runtime are exercised separately; the combined fresh-installed empty-product browser journey is not covered.

- **OSS-001 — Free and open source, MIT licensed.** **Status: partial.** Read `LICENSE` (MIT) and the licence line on the homepage, README and /run; install with the /run command and run a complete service with no payment, plan or licence prompt; enable a provider channel and prove the cost shown is that provider’s own (COST-001) and that Placemat bills nothing. **Current evidence:** `LICENSE`; `src/site/run.json`. **Remaining:** `LICENSE` is MIT and no charge exists anywhere in the product; no test asserts the licence lines or the absence of a paywall, and COST-001 provider-cost disclosure is not built.

- **BOUND-001 — Stated boundary: online ordering, gift cards and the POS.** **Status: partial.** Read the homepage boundary line, this clause and the owner docs and find the same three exclusions and the same pointer to the venue’s POS or payment provider; search the staff app, public booking page, `docs/HTTP-CONTRACT.md` routes and exports for gift-card, stored-value, voucher and ordering surfaces and find none; pay a deposit and a prepaid ticket and prove neither can be transferred, topped up or redeemed outside its booking; a site test fails if the homepage names a gift-card or ordering capability this clause excludes, or this clause names one the page omits. **Current evidence:** `src/placemat/http.ts`. **Remaining:** Nothing in the product sells gift cards or takes orders, so the boundary holds in code; the homepage line and docs statement are not on main and no test compares the page, docs and product.

## Target clauses

Target journeys, grouped as in CONTRACT.md.

### Venue setup and service policy

- **SETUP-001 — US restaurant onboarding.** **Status: partial.** Finish onboarding for a 72-seat US restaurant, preview its booking page and create services across both DST changes; refuse nonexistent local times and disambiguate repeated times. **Current evidence:** `src/placemat/commands.ts`; `public/placemat.js`; `tests/api/flows.test.mjs`. **Remaining:** Name/timezone and offset instants exist; US defaults, business/contact fields, policy setup and US DST browser evidence are absent.

- **SERVICE-002 — Recurring shifts and seasonal schedules.** **Status: partial.** Create a recurring dinner template and Thanksgiving exception, preview and publish a week, then change the template and inspect which future services need renewed approval. **Current evidence:** `src/placemat/commands.ts`; `tests/api/flows.test.mjs`. **Remaining:** Only individual dated services exist; recurrence, seasons, generation and exception reconciliation are absent.

- **SERVICE-003 — Closures and emergency service changes.** **Status: missing.** Close a room with three future bookings; preview impacts, confirm the change, relocate one, cancel/refund another and track failed outreach for the third to staff ownership. **Remaining:** No implementation of this journey exists.

- **SERVICE-004 — Party and advance-booking rules.** **Status: partial.** Configure different lunch/dinner rules; try early, late, oversized and blocked public requests, then authorize a lead-time override and inspect its audit. **Current evidence:** `src/placemat/availability.ts`; `src/placemat/commands.ts`; `tests/api/flows.test.mjs`. **Remaining:** Fixed party bounds and 15-minute slots exist; configurable service/channel rules and overrides do not.

- **SERVICE-005 — Arrival pacing and concurrent covers.** **Status: partial.** Set a 12-cover arrival limit and 48 simultaneous covers, book through two channels concurrently and prove the next public party is refused despite a physically free table, while a staff booking at the same moment receives a warning and needs a SERVICE-007 override. The reservation book shows covers against the limit for each arrival interval and marks a full interval, whose next public request is offered alternatives (BOOK-003). **Current evidence:** `src/placemat/availability.ts`; `tests/api/flows.test.mjs`. **Remaining:** Cumulative service covers and table occupancy exist; interval pacing, concurrent-cover and kitchen/area limits are absent.

- **SERVICE-006 — Turn and cleanup rules.** **Status: partial.** Configure 90-minute two-tops, 120-minute six-tops and a 15-minute reset; search last seating, book both sizes and verify adjacent turns and a policy edit. **Current evidence:** `src/placemat/availability.ts`; `src/placemat/commands.ts`; `tests/api/flows.test.mjs`. **Remaining:** One full-turn duration per service exists; party/table/area durations and cleanup buffers do not.

- **SERVICE-007 — Staff pacing overrides with warnings.** **Status: missing.** With a full 12-cover 7:30 interval and a physically free four-top, have a public request and an agent request refused. As a host without the grant, be refused. As a granted host, see the warning naming the limit and excess, confirm with a reason and book; read the audit row, the flag on the timeline and the override count in the pacing report. Attempt an override onto an occupied table and be refused. **Remaining:** The service cover limit refuses every channel, staff included; there is no override, warning, reason or override reporting.

### Booking and distribution

- **BOOK-002 — Branded website booking widget.** **Status: partial.** Embed on an allowed test website, search and book at 1440 and 390 widths, navigate by keyboard and verify the same slot disappears on the standalone page; observe the GA4 and Meta test events for the completed booking with no guest contact data, then decline analytics consent and observe none. **Current evidence:** `src/placemat/views.ts`; `public/placemat.js`; `public/placemat.css`; `tests/api/flows.test.mjs`. **Remaining:** Standalone branded booking exists; embed SDK, host-site installation and browser booking evidence are absent.

- **BOOK-003 — Reservation search and availability alternatives.** **Status: missing.** Search a full Friday for an accessible four-top, select a Saturday alternative and complete it; race a stale result and receive a clear reselect path. **Remaining:** No implementation of this journey exists.

- **BOOK-004 — Secure guest modification and cancellation.** **Status: missing.** Use a delivered link to move a two-top to four, fail an unavailable move without losing the old booking, cancel with policy acknowledgment and refuse an expired or foreign token. **Remaining:** No implementation of this journey exists.

- **BOOK-005 — Staff telephone and concierge reservations.** **Status: partial.** As host, book next Friday for a returning caller, identify the concierge source, confirm by SMS and read the booking in the same floor schedule as online guests; book a six-top under a deposit policy and see the PAY-010 request delivered. **Current evidence:** `src/placemat/commands.ts`; `tests/api/flows.test.mjs`. **Remaining:** Staff walk-ins and guest matching exist; future staff reservations, concierge source and delivered confirmation are absent.

- **BOOK-006 — Booking holds and duplicate submissions.** **Status: partial.** Two guests start checkout for the final four-top, expire one hold, complete the other and retry its booking/payment request after a network interruption; find one booking and one charge. **Current evidence:** `src/placemat/commands.ts`; `src/placemat/store.ts`; `tests/api/flows.test.mjs`. **Remaining:** Floor-version race guards and same-guest/time duplicate refusal exist; temporary holds and idempotent checkout recovery do not.

- **BOOK-007 — Special requests and group inquiries.** **Status: missing.** Book with a required accessible table and requested patio, submit a 16-person inquiry, have a manager reply and convert it; verify guest acknowledgment of what is guaranteed. **Remaining:** No implementation of this journey exists.

- **DIST-001 — Reserve with Google.** **Status: missing.** Through Google’s approved test/production partner journey, publish a venue, book on Google, change and cancel there, and verify matching reservation IDs and released local inventory; exercise feed rejection and outage recovery. **Remaining:** No implementation of this journey exists.

- **DIST-002 — Instagram and Facebook booking.** **Status: missing.** Connect a supported profile, follow its reservation action at phone width, book and inspect social attribution; disconnect and prove existing bookings remain manageable. **Remaining:** No implementation of this journey exists.

- **DIST-003 — Diner discovery and partner distribution.** **Status: missing.** Find a venue by neighborhood and cuisine, book an experience from a partner listing and reconcile its source, fee and remaining tables; reject a duplicate partner callback. **Remaining:** No implementation of this journey exists.

- **DIST-004 — Channel inventory and attribution.** **Status: missing.** Reserve two four-tops for direct until 5 p.m., exhaust partner allocation, release it on schedule and inspect original source after a guest changes time. The reservation book shows each party’s channel and totals covers by channel (website, Google, Instagram, phone) that reconcile to its rows, including after a guest changes time. **Remaining:** No implementation of this journey exists.

- **DIST-005 — Guest accounts and repeat booking.** **Status: missing.** Book without an account, verify a diner account, attach only the verified booking, rebook a favorite on another device and revoke saved preferences. **Remaining:** No implementation of this journey exists.

- **DIST-006 — Verified diner reviews and restaurant replies.** **Status: missing.** Complete a visit, receive the review invitation, submit a four-star review and see it with its visit date on the venue page and widget. Refuse a review for a no-show and a second review for the same visit. Reply as manager and see the reply public; report an abusive review and read the moderation outcome; prove a manager cannot delete a one-star review. **Remaining:** No diner reviews, ratings, replies or moderation exist.

### The host stand and floor

- **FLOOR-002 — Rooms and editable floor plans.** **Status: partial.** Draw dining room and patio, retire a booked table with an approved replacement, book both areas and watch occupancy update on a second host device. **Current evidence:** `src/placemat/commands.ts`; `src/placemat/views.ts`; `public/placemat.js`; `tests/api/flows.test.mjs`. **Remaining:** Positioned tables and manual refreshed occupancy exist; rooms, table attributes, editable combinations and live synchronization do not.

- **FLOOR-003 — Approved table combinations.** **Status: partial.** Permit T1+T2 but prohibit T1+T8; request six guests, verify the permitted join is used and reject a host attempting the prohibited join. **Current evidence:** `src/placemat/availability.ts`; `tests/api/flows.test.mjs`. **Remaining:** Distinct-table subset allocation exists; adjacency, allowed combination definitions and setup buffers are absent.

- **FLOOR-004 — Server sections and fair covers.** **Status: missing.** Assign two sections and servers, seat uneven parties, put one server on break and move a table; verify cover totals, suggested rotation and attributed service history. **Remaining:** No implementation of this journey exists.

- **FLOOR-005 — Timeline and overdue turns.** **Status: missing.** Seat a late six-top, extend its actual turn and inspect the collision with the next arrival; move the next arrival to a fitting replacement as a host in one action and read both histories. The host header shows seated covers now, covers due within a configurable next window and the average actual turn so far today, each opening its parties. **Remaining:** No implementation of this journey exists.

- **FLOOR-006 — Service statuses and handover.** **Status: partial.** Run a reservation from arrival through paid and clearing to ready, correct an accidental state with a reason and inspect the next shift’s handover. The floor plan marks each table reserved, seated, mains, dessert, check dropped or needs bussing with a timer since its last transition, from host taps or POS signals (POS-007), and a legend names the same states. **Current evidence:** `src/placemat/commands.ts`; `src/placemat/model.ts`; `tests/api/flows.test.mjs`. **Remaining:** Booked/seated/completed/cancelled/no-show transitions exist; arrival, course/check, cleanup timestamps and correction history do not.

- **FLOOR-007 — Busy-service search and shift handover.** **Status: missing.** Find an arriving guest by phone suffix, resolve their access request, hand over an unpaid deposit exception and prove the next host can complete the promised callback. **Remaining:** No implementation of this journey exists.

- **FLOOR-008 — Concurrent devices and operational outage.** **Status: partial.** Seat from two tablets, disconnect one, record a pending walk-in and reconnect after its table is sold; refuse silent overwrite and reconcile to a different table. With the reservation book open on one device, make a booking from the guest page and see it arrive within seconds with a “new since” count and marker, without a reload and without overwriting a stale edit. **Current evidence:** `src/placemat/store.ts`; `src/placemat/http.ts`; `public/placemat.js`; `tests/api/flows.test.mjs`. **Remaining:** Server version checks and explicit refresh exist; live device sync, offline sheet and pending-action reconciliation are absent.

- **FLOOR-009 — Direct host table moves, swaps and locks.** **Status: partial.** Signed in as a host, not a manager, move a seated four-top to a free fitting table, swap two booked parties and lock a third assignment, each in one HTTP command and one floor-screen gesture at 1440 and 390 widths; read the three audit rows. Refuse a move into an occupied table and into a table whose next turn clashes. Book a new party and prove automatic allocation leaves the locked assignment untouched. Prove a preparation key can still only prepare a `table.assign` proposal. **Current evidence:** `src/placemat/commands.ts`; `src/placemat/availability.ts`; `tests/api/flows.test.mjs`. **Remaining:** Clash-checked reassignment exists only as a `table.assign` proposal that an owner/admin approves; a direct host move, swap, lock, host role and per-move audit row do not exist.

- **FLOOR-010 — Counter seats and unassigned bar pools.** **Status: missing.** Define a 10-seat counter and a 20-cover lounge pool; book five two-tops at the counter and refuse a sixth for the same turn; seat two adjacent counter guests and prove those seats are not sold twice across overlapping turns. Book a lounge reservation, seat it at assigned bar seats on arrival and then move it to a table, reading pool and table occupancy after each step. **Remaining:** Only whole tables and table combinations exist; seat-level counter inventory and unassigned pools do not.

- **FLOOR-011 — Late arrivals, holds and the no-show workflow.** **Status: partial.** Book a four-top for 7:15, reach the grace time with no arrival, log two unanswered calls and mark the no-show at 7:30 as a host; read the timeline with each step, actor and time; verify the table returns to availability, one PAY-004 fee is recorded and a fitting waiting party receives a table-ready text with its hold window and is seated. Text “running 15 late” for another booking and verify its table is held to the stated time; refuse an extension that would clash with the next booking on that table. **Current evidence:** `src/placemat/commands.ts`; `src/placemat/availability.ts`; `tests/api/flows.test.mjs`. **Remaining:** A person can mark a booked party no-show, which frees its capacity so a waiting party can be seated into it; late flags, grace times, contact-attempt logging, lateness holds, fee policy and offers with a hold window do not exist.

- **FLOOR-012 — Printable pre-shift sheet.** **Status: missing.** Prepare a Friday with a shellfish-allergic anniversary regular, an eight-top with a deposit and a chef’s-counter booking; open the pre-shift sheet as manager and print it to PDF; read each guest’s flags, deposit and section; change a booking and reopen to see the change and a new generated time; open it as a server and find restricted notes absent; erase one guest and prove a new sheet holds none of their values. **Remaining:** No pre-shift sheet, print view or PDF exists; the staff app lists bookings and covers for one service without flags, deposits, sections or notes.

- **FLOOR-013 — Service notes and kitchen notes.** **Status: missing.** As manager add the kitchen note “Halibut: 12 portions” and a shift note; as host open the floor on a second device and read both; collect a halibut pre-order on three bookings and see the item total with its source; record a shellfish allergy for the Table 12 booking and read it in the kitchen view beside the arrival pacing limit; edit the note and read author, time and history; open the kitchen view as a server and find only that server’s section allergies. **Remaining:** No service-date notes, kitchen view, pre-order counts or per-table allergy list exist; guest notes are free text on the guest only.

### Waitlist and cancellation demand

- **WAIT-002 — Remote and walk-up joining.** **Status: partial.** Join by phone QR and staff intake, refuse a duplicate, change party size and pause online intake while allowing a host entry. **Current evidence:** `src/placemat/commands.ts`; `tests/api/flows.test.mjs`. **Remaining:** Staff intake and seating exist; public joining, guest management links, duplicate rules and pause controls do not.

- **WAIT-003 — Quoted waits and queue updates.** **Status: missing.** Quote 20–30 minutes, delay a turn, revise the range and inspect the delivered update and guest status; seat a later fitting two-top while documenting the six-top’s retained priority. **Remaining:** No implementation of this journey exists.

- **WAIT-004 — Table-ready conversations and offer expiry.** **Status: missing.** Notify two matching parties sequentially; let the first expire and have both reply yes together, proving only the still-valid offer seats and the other receives a clear response. **Remaining:** No implementation of this journey exists.

- **WAIT-005 — Future cancellation notifications.** **Status: missing.** Request Saturday experience availability, cancel one ticket, notify eligible guests in the configured order and turn the accepted offer into one paid reservation. Cancel a same-day table and verify the freed table is offered to fitting waiting parties and notify requests in the configured order, and the book shows how many tables were offered and how many were filled. **Remaining:** No implementation of this journey exists.

- **WAIT-006 — Waitlist accountability.** **Status: partial.** Close a shift containing an unanswered offer, a no-phone party and a seated party; inspect dispositions, actual waits and assigned follow-up with no unresolved ghost offers. **Current evidence:** `src/placemat/model.ts`; `src/placemat/commands.ts`; `tests/api/flows.test.mjs`. **Remaining:** Waiting/seated states exist; offers, abandoned/expired disposition, reasons and wait history do not.

### Delivered communications and follow-up

- **MSG-002 — Twilio SMS and WhatsApp connection.** **Status: missing.** Connect approved test senders, send a table-ready SMS and WhatsApp template, ingest signed delivery/reply events and reject a forged webhook; surface unregistered sender failure to the manager. **Remaining:** No implementation of this journey exists.

- **MSG-003 — Resend email connection.** **Status: missing.** Verify the domain, send a booking email to a controlled mailbox, reply to it and process bounce/complaint callbacks; show the guest thread and delivery state without leaking secrets. **Remaining:** No implementation of this journey exists.

- **MSG-004 — Booking and cancellation delivery.** **Status: missing.** Book online, modify and cancel; inspect three distinct provider receipts and the guest’s messages, then fail one delivery and find a staff follow-up without a duplicate booking. **Remaining:** No implementation of this journey exists.

- **MSG-005 — Scheduled reminders and reconfirmations.** **Status: partial.** Schedule a 24-hour reconfirmation and 2-hour reminder, confirm one booking by link and another by replying C, cancel a third by replying X and restart the scheduler; verify correct recipients, no repeats and an owned unanswered task. **Current evidence:** `src/placemat/commands.ts`; `src/placemat/downloads.ts`; `tests/api/flows.test.mjs`. **Remaining:** Reviewed reminder CSV preparation exists; scheduled provider delivery, reconfirmation links and reply/failure follow-up do not.

- **MSG-006 — Unified two-way guest inbox.** **Status: missing.** Receive a late-arrival text, assign it to a host, reply from the inbox, receive an email follow-up and resolve it; verify both channels and reservation context in one history. **Remaining:** No implementation of this journey exists.

- **MSG-007 — Delivery retry and failed-contact ownership.** **Status: missing.** Timeout after a provider accepts a send, replay its callback and restart the job; prove one message, then bounce another address and complete the assigned phone-contact task. **Remaining:** No implementation of this journey exists.

- **MSG-008 — Consent and US messaging policy.** **Status: missing.** Book without marketing consent, attempt a campaign, then opt in and send; reply STOP while another job is queued and prove the queued send is suppressed without losing booking management. **Remaining:** No implementation of this journey exists.

- **MSG-009 — Templates and guest communication preferences.** **Status: missing.** Preview and deliver an English/Spanish reminder with long names and special characters, then change the template; prior messages retain their actual rendered content and policy version. **Remaining:** No implementation of this journey exists.

- **MSG-010 — Guest text actions: confirm, reschedule and captured requests.** **Status: missing.** Send a reminder; reply “C! It’s our anniversary, candle on dessert” and verify the booking is confirmed with an anniversary tag and candle-on-dessert note sourced to the guest reply; reply R on another booking and complete a reschedule through the link; reply “I’m allergic to shellfish” on a third and verify it reaches the host as an unresolved request rather than a structured allergy; reply STOP and verify no further send (MSG-008). **Remaining:** No provider delivery or inbound reply handling exists; reminders are approved CSV rows for the venue’s own sender.

- **MSG-011 — Instagram and Facebook direct messages.** **Status: missing.** Connect a Meta test page, receive a DM asking for a table for two, reply from the inbox with 9:15 at the bar and book it; see one booking assigned to the bar with source Instagram and the confirmation in the thread. Let the window lapse and verify the reply is refused with a booking-link fallback; deliver a replayed webhook and find one message; revoke the connection and find an owned task. **Remaining:** No Meta connection, inbound message handling or inbox exists.

### Payments and table protection

- **PAY-001 — Stripe merchant connection and token custody.** **Status: missing.** Connect a Stripe test merchant, collect a hosted payment method, inspect redacted product records and disconnect; existing obligations stay visible while new charges are blocked. **Remaining:** No implementation of this journey exists.

- **PAY-002 — Deposits and partial prepayment.** **Status: missing.** Require a $25-per-person deposit for four guests, pay $100, retry the callback and inspect one paid booking; fail another payment and verify its table becomes bookable. Each deposit held shows on the booking, the confirmation and the pre-shift sheet (FLOOR-012) with its amount, per-guest rate and the card’s last four digits, and states what happens at seating; seating the booking applies it to the check (PAY-008) or releases the hold exactly once and shows which. **Remaining:** No implementation of this journey exists.

- **PAY-003 — Card guarantees and authorization expiry.** **Status: missing.** Create a guaranteed reservation, expire an authorization and request renewed collection; prove an expired hold is not reported as protected and inspect guest consent to a permitted later fee. **Remaining:** No implementation of this journey exists.

- **PAY-004 — No-show and late-cancellation fees.** **Status: missing.** Cancel before and after a DST-aware cutoff, mark a no-show, waive one fee and charge another through Stripe; replay requests and inspect one charge plus the deciding person and policy. **Remaining:** No implementation of this journey exists.

- **PAY-005 — Full and partial refunds with notices.** **Status: missing.** Refund $40 of a $100 deposit, replay its webhook, refund the remaining $60 and refuse a further cent; verify processor references, delivery receipts and failed-refund follow-up. **Remaining:** No implementation of this journey exists.

- **PAY-006 — Money ledger and processor reconciliation.** **Status: missing.** Deliver refund before charge callbacks, duplicate both and reconcile a Stripe payout to its bookings, fees and net amount; correct an unmatched item with a new adjustment record. **Remaining:** No implementation of this journey exists.

- **PAY-007 — Tax gratuity and service-charge disclosure.** **Status: missing.** Buy two $95 tickets with add-ons, tax, service charge and tip, inspect line-level USD totals and partially refund one ticket including its allocated tax and eligible charges. **Remaining:** No implementation of this journey exists.

- **PAY-008 — Deposit redemption at the POS.** **Status: missing.** Seat a $100-deposit booking, apply $60 to one check and $40 to a second, void one check and reconcile; prove the guest never receives duplicate credit. **Remaining:** No implementation of this journey exists.

- **PAY-009 — Disputes and payment operations.** **Status: missing.** Open a test dispute, assemble the booking/policy/message evidence, approve a response and export its ledger to accounting; trace a rejected sync back to an owned task. **Remaining:** No implementation of this journey exists.

- **PAY-010 — Staff-requested card and deposit links.** **Status: missing.** As a host, book a six-top by phone under a $25-per-person deposit policy; read the delivered SMS and email provider receipts carrying a link to Stripe-hosted test collection with a deadline; pay and see the booking marked protected with its receipt. Book a second party and leave it unpaid: see the unprotected flag and the staff reminder task, advance past the deadline and verify the table is released, the booking cancelled and the guest notified; replay a late payment callback and verify the booking is not resurrected without a person and the payment is refunded or flagged. Waive a third party’s requirement with a reason and read its audit row. **Remaining:** No payment request, Stripe collection, deadline, unprotected state, auto-release or waiver exists.

### Experiences and ticketed dining

- **EXP-001 — Experience catalog and event inventory.** **Status: missing.** Publish a tasting dinner and a free patio event, book both beside normal reservations and prove the same table cannot be sold through two catalogs. **Remaining:** No implementation of this journey exists.

- **EXP-002 — Ticketed checkout and add-ons.** **Status: missing.** Buy four tasting tickets with two pairings and one limited supplement, race the last supplement from another checkout and verify one sale plus accurate remaining capacity. **Remaining:** No implementation of this journey exists.

- **EXP-003 — Experience guest management.** **Status: missing.** Transfer one ticket to a new attendee, exchange another to a later seating with a price difference, then check in by scoped ticket and refuse a reused ticket. **Remaining:** No implementation of this journey exists.

- **EXP-004 — Experience cancellation and event settlement.** **Status: missing.** Reschedule one seating, refund guests who decline, notify all affected purchasers and reconcile the resulting attendance and settlement report to the Stripe ledger. **Remaining:** No implementation of this journey exists.

- **EXP-005 — Prepaid pickup experiences.** **Status: missing.** Publish a Thanksgiving take-home pickup experience, pay for a 4 p.m. slot, transfer its line items to the connected POS and mark pickup complete; reject a sold-out slot and refund a cancelled order. **Remaining:** No implementation of this journey exists.

### Guest relationships and repeat visits

- **GUEST-002 — Searchable profiles and structured preferences.** **Status: partial.** Find a returning guest by US phone, add a VIP tag and seating preference, then book again and view the preferences and their sources at arrival. **Current evidence:** `src/placemat/guests.ts`; `public/placemat.js`; `src/placemat/model.ts`; `tests/api/flows.test.mjs`. **Remaining:** Contact records, free-text notes and client search exist; normalized search, structured tags/preferences and field provenance are absent.

- **GUEST-003 — Allergy and accessibility handoff.** **Status: missing.** Book a nut-allergic guest requiring step-free seating, acknowledge both at check-in, send the declared facts to POS and correct an outdated note with its author/date retained. **Remaining:** No implementation of this journey exists.

- **GUEST-004 — Duplicate review and household separation.** **Status: partial.** Import two emails for one guest and a shared family phone, review suggestions, merge only the true duplicate and reverse it without losing visits or changing anyone’s marketing permissions. **Current evidence:** `src/placemat/guests.ts`; `src/placemat/import/plan.ts`; `tests/api/flows.test.mjs`. **Remaining:** Exact email reuse and contact-collision diagnostics exist; duplicate suggestions, merge/unmerge and consent reconciliation do not.

- **GUEST-005 — POS-linked visit and item history.** **Status: missing.** Seat a returning party, split its POS bill, refund an item and inspect the payer’s visit/spend history; leave ambiguous companions unassigned until a person resolves them. **Remaining:** No implementation of this journey exists.

- **GUEST-006 — Shared guestbook across restaurant groups.** **Status: missing.** Visit two sister venues, view permitted group history as group manager, deny another venue’s restricted notes to a host and offer rebooking only under the guest’s authorized scope. **Remaining:** No implementation of this journey exists.

- **CRM-001 — Visit-based segments and audiences.** **Status: missing.** Build a lapsed high-spend-diner audience, inspect five inclusion/exclusion explanations and export only its consented email members; a refunded visit updates spend eligibility. **Remaining:** No implementation of this journey exists.

- **CRM-002 — Retention and win-back automation.** **Status: missing.** Approve a post-first-visit workflow, finish two visits and cancel a third, then advance the scheduler and inspect the right delivered messages and repeat bookings; suppress a guest who opts out mid-run. **Remaining:** No implementation of this journey exists.

- **CRM-003 — Campaign creation and conversion reporting.** **Status: missing.** Send a controlled campaign, book from one tracked link, cancel another booking and reconcile delivered count, attended covers and realized revenue without crediting cancelled or unpaid visits. **Remaining:** No implementation of this journey exists.

- **CRM-004 — Mailchimp audience handoff.** **Status: missing.** Sync an opted-in segment, unsubscribe one contact in Mailchimp and erase another in Placemat; retry a failed sync and verify neither contact is reintroduced into a campaign. **Remaining:** No implementation of this journey exists.

- **CRM-005 — Post-visit feedback and manager follow-up.** **Status: missing.** Complete two visits, submit low feedback on one and positive feedback on the other, verify consistent public-review invitation rules and resolve the manager’s recovery case with a delivered reply. **Remaining:** No implementation of this journey exists.

- **CRM-006 — Return offers and loyalty handoff.** **Status: missing.** Approve a $20 return offer after a recovery, book its recipient, redeem on one POS check and refuse reuse; inspect actual repeat visit and net contribution. **Remaining:** No implementation of this journey exists.

### POS and service connections

- **POS-001 — Toast connection.** **Status: missing.** Connect an authorized Toast sandbox, seat a guest, open/pay/void a mapped check and reconcile guest spend and table state; revoke access and show stale data plus an assigned repair task. **Remaining:** No implementation of this journey exists.

- **POS-002 — Square for Restaurants connection.** **Status: missing.** Authorize one Square restaurant location, link a reservation to an order, split/pay/refund it and replay callbacks; inspect reconciled spend and deny access to an unauthorized location. **Remaining:** No implementation of this journey exists.

- **POS-003 — Clover connection.** **Status: missing.** Connect a Clover test merchant, match a table’s open order to its seated booking, settle and refund it; resolve an order lacking table metadata and inspect attributed spend. **Remaining:** No implementation of this journey exists.

- **POS-004 — Lightspeed connection.** **Status: missing.** Connect an eligible Lightspeed test venue, map two tables, seat and close a check, then reconnect after missed events and reconcile its guest spend exactly once. **Remaining:** No implementation of this journey exists.

- **POS-005 — NCR Aloha connection.** **Status: missing.** Disconnect the Aloha bridge during dinner, complete two checks, reconnect and inspect backfill spend while proving yesterday’s close event does not clear today’s occupied table. **Remaining:** No implementation of this journey exists.

- **POS-006 — Guest and check matching controls.** **Status: missing.** Move a party between tables, combine two checks and split payment; review an ambiguous guest match, correct it and compare both profiles’ spend before and after. **Remaining:** No implementation of this journey exists.

- **POS-007 — Live check and kitchen pace.** **Status: missing.** Open, course, pay and clear a check, slow a kitchen signal and inspect suggested availability; drop the POS feed and prove the last observed state is labelled stale instead of assumed ready. **Remaining:** No implementation of this journey exists.

### Service and commercial reporting

- **REPORT-001 — Covers cancellations and no-shows.** **Status: partial.** Run two shifts with cancellations and no-shows, filter one local date, drill a total to its bookings and reconcile its CSV to attended versus booked covers. **Current evidence:** `src/placemat/model.ts`; `public/placemat.js`; `tests/api/flows.test.mjs`. **Remaining:** Current-service totals/statuses exist; historical filtered reports, denominators and row-level downloads do not.

- **REPORT-002 — Turns waits and server performance.** **Status: missing.** Complete a service with two overruns and a waitlist abandonment, inspect turn/wait distributions and server totals and trace an outlier back to its status history. **Remaining:** No implementation of this journey exists.

- **REPORT-003 — Channels spend and repeat business.** **Status: partial.** Book from three sources, attend two, refund one and revisit another month; reconcile source cost, net revenue and repeat cohort to the booking and check ledger. **Current evidence:** `src/placemat/model.ts`; `public/placemat.js`; `tests/api/flows.test.mjs`. **Remaining:** Online/walk-in/waitlist source labels exist; marketing attribution, POS revenue, source fees and retention/cohorts do not.

- **REPORT-004 — Experience and payment performance.** **Status: missing.** Close a partly refunded tasting event, export settlement and inspect drilldowns from net receipts to Stripe transactions and from occupancy to check-ins. **Remaining:** No implementation of this journey exists.

- **REPORT-005 — Scheduled exports and group reporting.** **Status: partial.** Schedule a weekly group cover report for a permitted manager, export future bookings and historical visits, then revoke access before the next scheduled delivery and prove it is blocked. **Current evidence:** `src/placemat/downloads.ts`; `src/placemat/backup.ts`; `tests/api/flows.test.mjs`. **Remaining:** Owner archives and per-booking ICS exist; business CSV reports, schedules and group comparisons are absent.

- **REPORT-006 — Local performance benchmarking.** **Status: missing.** Opt in a controlled cohort, view a sufficiently sized comparison, shrink its cohort below privacy rules and verify suppression, then opt out and retain internal reporting. **Remaining:** No implementation of this journey exists.

- **REPORT-007 — End-of-service report.** **Status: missing.** Run a service with two no-shows, two refills from the waitlist, a walk-in and a no-show fee; close it; reconcile every figure to its bookings and the CSV; verify a refilled table counts as recovered only after its party is seated; correct one status after close and see the original report unchanged with a dated adjustment beside it. **Remaining:** No closed-service report exists; the bookings screen shows one covers-against-limit badge for the open service.

- **COST-001 — Predictable operating costs.** **Status: missing.** Preview 1,000 reminders and a promoted event, inspect projected provider/cover cost, set a budget alert and reconcile the bill to usage and processor fees. **Remaining:** No implementation of this journey exists.

### Migration from each incumbent

- **MIG-002 — OpenTable migration.** **Status: missing.** Dry-run representative customer Guestbook and reservation CSVs, map Friday tables, apply approved imports and compare future-booking/date/cover and consent totals; keep unmapped rows in an actionable exception report. The import summary shows the reconciled guest, future-reservation and tag-and-note counts beside the export’s own totals. **Remaining:** No implementation of this journey exists.

- **MIG-003 — Resy migration.** **Status: missing.** Import real guest and future-reservation extracts, resolve duplicate contacts and a prepaid booking, then reconcile bookings, contacts, consent and financial obligations before directing new demand to Placemat. **Remaining:** No implementation of this journey exists.

- **MIG-004 — SevenRooms migration.** **Status: missing.** Load real client and reservation files for two venues, preserve opt-outs and restricted notes, map tables and reconcile each venue’s future covers and unmapped values before apply. **Remaining:** No implementation of this journey exists.

- **MIG-005 — Tock migration.** **Status: missing.** Dry-run representative CSV plus JSON data, reconcile future bookings separately, map ticket/add-on inventories and minor-unit balances, then process webhook catch-up without duplicate tickets or increased consent. **Remaining:** No implementation of this journey exists.

- **MIG-006 — Eat App migration.** **Status: missing.** Upload real guest and reservation CSVs, map statuses/times and reconcile all three date periods, spend summaries and subscription state; reimport the same files without duplicating guests or covers. **Remaining:** No implementation of this journey exists.

- **MIG-007 — Loman AI handover.** **Status: missing.** Use a real owner-provided export to preview supported conversation/configuration fields and unresolved formats, reconcile its bookings against the connected-system export, port a test number and prove new calls book and transfer without losing existing commitments. **Remaining:** No implementation of this journey exists.

- **MIG-008 — Cutover rehearsal and change catch-up.** **Status: partial.** Rehearse a Friday cutover, change two bookings in the old system, catch up those deltas, approve switch and undo an unchanged batch while refusing rollback over a staff-edited guest. **Current evidence:** `src/placemat/import/plan.ts`; `src/placemat/import/index.ts`; `tests/api/flows.test.mjs`. **Remaining:** Exact dry-run/apply/journal/conflict-safe undo exists for the Tablein shape; multi-source mappings, reconciliation, deltas and channel cutover do not.

- **DATA-003 — Complete portable business records.** **Status: partial.** Export a complete multi-channel paid service, restore supported records into an empty installation and open the CSVs; reconcile counts and references, inspect exclusions and prove erased personal data stays absent. **Current evidence:** `src/placemat/backup.ts`; `src/placemat/archive-policy.mjs`; `tests/api/flows.test.mjs`. **Remaining:** Existing domain archive integrity and empty restore exist; new target records and documented business CSV exports are absent.

### Rights, APIs and daily operation

- **ROLE-001 — Owner and group-administrator rights.** **Status: partial.** As owner connect two venues, grant a scoped group admin, revoke it and prove direct API access stops; deny a venue manager an owner export, erasure and provider credential change. **Current evidence:** `src/placemat/access.ts`; `src/placemat/http.ts`; `tests/api/flows.test.mjs`. **Remaining:** Owner-only keys/import/erase/backups and admin role exist; venue/group scoping, granular grants and provider finance rights do not.

- **ROLE-002 — Manager and shift-lead rights.** **Status: partial.** Give a manager a $100 refund limit and a lead seating-only override; test each direct operation, refuse the excess refund and provider change, and record a permitted decision. **Current evidence:** `src/placemat/access.ts`; `src/placemat/commands.ts`; `tests/api/flows.test.mjs`. **Remaining:** Admin can operate and approve; distinct lead capability, financial limits and scoped reporting do not exist.

- **ROLE-003 — Host server and read-only rights.** **Status: partial.** Sign in as host, server and read-only member, seat, move and swap tables as host without approval, inspect only the server’s section and refuse member mutations and all three actors’ bulk guest exports. **Current evidence:** `src/placemat/access.ts`; `src/placemat/http.ts`; `tests/api/flows.test.mjs`. **Remaining:** Member read-only enforcement exists; host/server roles, section visibility and field/bulk-export permissions are absent.

- **ROLE-004 — Finance marketing and integration rights.** **Status: partial.** Grant finance, marketing and integration identities, run permitted jobs and deny direct unrelated reads/writes; revoke an integration credential during a queued job and prove the job cannot proceed. **Current evidence:** `src/placemat/access.ts`; `src/placemat/http.ts`; `tests/api/flows.test.mjs`. **Remaining:** Owner-issued preparation-only keys and revocation exist; finance/marketing roles and scoped connector/service execution grants do not.

- **SEC-001 — Identity and session lifecycle.** **Status: partial.** Invite and suspend a host, revoke an active session, test direct access, then require step-up for an owner export/refund policy change and provision a scoped SSO user. **Current evidence:** `src/modules/operator-auth/accounts/admin.mjs`; `src/modules/operator-auth/accounts/native.mjs`; `tests/runtime.mjs`; `tests/api/flows.test.mjs`. **Remaining:** Native sessions/invitations and active-role checks exist; MFA, step-up and group SSO journeys are absent.

- **SEC-002 — Shared host-stand device and quick staff switch.** **Status: missing.** Register a host iPad as a venue device, switch between two hosts by PIN, seat and move parties and read audit rows attributed to each host. Let it idle and see it lock; enter wrong PINs until throttled; suspend one host and refuse their PIN; refuse a guest export from a PIN session without step-up; revoke the device and refuse its next request. **Remaining:** Only personal native sessions exist; venue devices, PIN switching, idle lock and per-PIN attribution do not.

- **AUDIT-001 — Reservation and financial change history.** **Status: partial.** Move and cancel a reservation, change consent and refund a deposit; inspect/export their before/after history by actor and verify a guest erasure redacts personal values without losing action accountability. **Current evidence:** `src/placemat/commands.ts`; `src/placemat/model.ts`; `tests/api/flows.test.mjs`. **Remaining:** Actor/action/subject events and proposal decisions exist; before/after records, financial/provider history, filters and audit export do not.

- **API-001 — Documented booking and guest HTTP doors.** **Status: done.** Use documented HTTP requests to publish, read availability, book, inspect guest state and prepare a plan; call the same doors signed out, with a member and with a revoked preparation key. **Current evidence:** `docs/HTTP-CONTRACT.md`; `src/placemat/http.ts`; `tests/api/flows.test.mjs`.

- **API-002 — Versioned integrations and event subscriptions.** **Status: partial.** Register a scoped subscriber, create/change/cancel a booking and replay a failed signed event; use a paginated guest read with denied fields and prove a revoked key cannot resume. **Current evidence:** `docs/HTTP-CONTRACT.md`; `src/placemat/http.ts`; `tests/api/flows.test.mjs`. **Remaining:** Core documented HTTP doors exist; versioning, pagination, granular scopes, event subscriptions and named automation adapters do not.

- **VOICE-001 — Loman AI and telephone booking connection.** **Status: missing.** Place controlled calls for a new booking, change and cancellation, then ask for an unavailable exception; verify inventory, delivered confirmation and human transfer with linked call context. The venue sees counters of calls answered, missed and transferred for each service, each opening its call with the linked booking. **Remaining:** No implementation of this journey exists.

- **MOBILE-001 — Phone and tablet host workflows.** **Status: partial.** Run arrival, seating, table-ready reply, manager approval and shift handover on iPad and iOS/Android phones; revoke a device and prove offline cached personal data is locked. **Current evidence:** `src/placemat/views.ts`; `public/placemat.css`; `public/placemat.js`. **Remaining:** Responsive staff pages exist; native clients, push, device revocation and complete mobile/browser accessibility journeys are absent.

- **OPS-001 — Connection health and business recovery.** **Status: partial.** Interrupt POS and messaging during service, inspect stale-state warnings, recover a backup in an empty install and resume reconciled work; verify incident handoff and one outcome per original action. **Current evidence:** `src/placemat/backup.ts`; `src/placemat/store.ts`; `tests/api/flows.test.mjs`. **Remaining:** Validated domain backup/restore and conflict handling exist; connector health, durable job recovery and Uptime/Oncall handoff do not.

- **DATA-004 — Privacy retention and group data controls.** **Status: partial.** Request a guest access export, correct a dietary note, erase eligible content and trace processor deletion tasks; run retention and restore drills and confirm restricted financial evidence is retained without resurrecting deleted guest text. **Current evidence:** `src/placemat/import/erase.ts`; `src/placemat/backup.ts`; `tests/api/flows.test.mjs`. **Remaining:** Live/import erasure and known-backup fences exist; retention policies, access/correction export and external processor deletion tracking do not.

- **SITE-002 — Hosted demo restaurant.** **Status: partial.** While the hosted demo is live, the built homepage hero (`src/site/landing/hero.ts`) shows Try the demo linking https://demo.run-placemat.com/ at 1440 and 390 widths. From that homepage link at 1440 and 390 widths, reach the demo host stand signed out, book a table on the demo booking page and see it on the floor, seat a waiting party; open two visitor copies at once and prove neither sees the other’s booking; let one go idle past 15 minutes (or the configured limit, read from `src/demo.ts` and Base demo mode) and prove it is gone and a new visit starts from the clean sample; observe that no SMS, email, card or provider call left the demo; follow /run on a fresh local install and find it opens empty; take the demo down and prove the homepage link is gone, not replaced by /run. **Current evidence:** `src/site/landing/hero.ts`; `deploy-demo.json`; `.github/workflows/run-demo.yml`; `src/demo.ts`; `tests/api/demo.test.mjs`. **Remaining:** The demo is deployed and its homepage link is live at 1440 and 390 widths, but its start page is behind a human check that automation cannot pass, so the sample restaurant, booking page, host stand, waitlist, guest history, per-visitor privacy, idle deletion and no-send items are unproven on the live host (the sample venue and its no-send behaviour are covered only by `tests/api/demo.test.mjs`). The link is read from `hosted` in `src/site/run.json`, so taking the demo down is removing that entry, which removes the link from the hero and the card from /run; the take-down step is unproven.

## Push further with service agents

- **AGENT-001 — Live voice and message booking agent.** **Status: missing.** Call and message concurrently for the last accessible four-top, ask a menu question outside the knowledge base and request a fee exception; prove one fitting booking, a delivered confirmation, no invented answer and successful human transfer. **Remaining:** No implementation of this journey exists.

- **AGENT-002 — Cancellation refill through completed conversations.** **Status: partial.** Cancel a six-top, offer to matching guests, let the first timeout and complete a second guest’s reply and booking; race a late first acceptance and report only realized recovered covers. **Current evidence:** `src/placemat/commands.ts`; `src/placemat/availability.ts`; `tests/api/flows.test.mjs`. **Remaining:** Staff can release capacity and seat waitlisted guests; no agent, offer conversation, expiry or recovered-cover attribution exists.

- **AGENT-003 — Honest waits from actual service pace.** **Status: missing.** Slow kitchen progress and extend a six-top’s turn, inspect the changed estimate and proposed move, reject it as host and verify no unauthorized guest promise or extra kitchen load. Each suggestion lists actions a host applies in one step, such as holding named tables to a later time, seating a quoted walk-in at a stated time or sending a waiting party who consented to texts an offer for bar seating, and shows the kitchen signal behind it; applying it records the host as decider. **Remaining:** No implementation of this journey exists.

- **AGENT-004 — Feasible seating and booking improvements.** **Status: partial.** Provide a service with an avoidable stranded four-top, prepare two alternatives, approve one and reject a stale plan after another host seats a walk-in; compare actual utilization without breaking access constraints. **Current evidence:** `src/placemat/availability.ts`; `src/placemat/commands.ts`; `tests/api/flows.test.mjs`. **Remaining:** Deterministic allocation and exact reviewed reassignment exist; demand-aware agent reasoning, forecasts and constraint explanations do not.

- **AGENT-005 — No-show risk and reconfirmation assistance.** **Status: missing.** Flag controlled risky/unconfirmed bookings, inspect cited facts and missing-data caveats, accept a reconfirmation task and decline a policy change; prove the guest retains their table and original terms. **Remaining:** No implementation of this journey exists.

- **AGENT-006 — Evidence-based guest recovery.** **Status: missing.** Receive poor feedback, inspect a fact-cited draft, approve a bounded offer, complete the guest conversation and return booking and track attendance; opt out another guest and prove no contact occurs. **Remaining:** No implementation of this journey exists.

- **AGENT-007 — Permissioned guest enrichment and next visit.** **Status: missing.** Process ambiguous notes and refunded spend, review proposed tags, reject an inferred dietary condition and approve a visit-frequency tag; undo it and verify downstream audience membership changes. **Remaining:** No implementation of this journey exists.

- **AGENT-008 — Measured reversible service experiments.** **Status: missing.** Approve a two-week pacing experiment with a control period, record realized covers/waits and kitchen overload, stop it mid-service and inspect unchanged prior commitments plus a report distinguishing observed improvement from unsupported causal claims. **Remaining:** No implementation of this journey exists.

## End-to-end switching service

Import a US restaurant’s guestbook and past/future bookings from each named incumbent; reconcile identity, consent, tables, covers and payment obligations. Publish the next service, book direct/Google/social/phone traffic against shared inventory, collect a deposit, reconfirm guests, run the waitlist and host floor, match and redeem the POS check, deliver feedback/recovery outreach and reconcile attended covers, refunds and actual repeat revenue. Exercise failed delivery, lost POS feed, late guest reply and duplicate payment events. Owners control policy exceptions and agent plans. The target is complete only when every clause above is done with its public-door evidence.
