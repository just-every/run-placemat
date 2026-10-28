# Placemat target product contract

Placemat fills restaurant tables and keeps guest relationships from first inquiry to the next attended visit. US owners and general managers switching from OpenTable, Resy, SevenRooms or Tock get direct and distributed booking, the host stand, live queues, guest conversations, deposits and prepaid dining, POS-connected profiles, retention and service economics; Eat App and Loman AI set further automation and voice expectations.

## Product target

| | |
| --- | --- |
| Category | Restaurant reservations, waitlist and guest management |
| Incumbents a buyer switches from | OpenTable, Resy, SevenRooms, Tock |
| Up-and-comers it must also beat | Eat App, Loman AI |
| First buyer | The US owner or general manager of a 30–150 seat independent restaurant, with hosts, servers and finance/marketing staff, operating in USD and US time zones; groups add venues and shared guest relationships |

The primary journey: Bring the guest book in, configure service and capacity, receive demand, confirm feasible reservations, run arrivals and the floor, reconcile payment and guest outcomes, close service and earn the next attended visit.

## How to read this contract

- This follows the RER contract standard; the target keeps the full buyer journey.
- Core, Agent surface and Later are reported separately, alongside full-target DONE.
- DONE means every acceptance point has exact-commit proof through the product’s own doors.
- The Field proof register records qualifications and real-world reviews the seed cannot produce itself.
- ACCEPTANCE.md, docs/CLAIMS.md and the Status counts are generated from this file.

## Door rules

- **D-1.** Empty start. The owner’s restaurant starts empty; fixtures never create production guests or provider records.
- **D-2.** One capacity ledger. Every booking, combination, counter, pool, experience and waitlist hold shares physical inventory. Stale state reconciles before commit. Full-turn, cleanup, setup, access, joins, staffing and locked commitments survive every allocation door.
- **D-3.** Exact decisions. A changed snapshot invalidates the earlier decision. Preparation-only keys have no execution scope. Agent execution carries the action’s computed classes and the company’s policy decides it; under the held policy the named person decides the exact revision.
- **D-4.** Money and custody. Amounts use integer USD minor units with explicit tax, service charge, tip and refund allocations. Stripe holds payment credentials and merchant funds. Creating a link or setup establishes no charge, receipt, consent, settlement or refund; only matched authoritative facts establish the corresponding outcome.
- **D-5.** Booking-bound value. Deposits and prepaid tickets or pickup experiences are balances against one named booking or event, refunded under PAY-005. They are nontransferable, cannot be topped up, and cannot fund another booking or general spending.
- **D-6.** Permission and declared facts. Transactional permission, marketing consent and sensitive guest facts remain distinct by contact, channel, venue and purpose. Unknown consent stays unknown. Declared allergy and access needs constrain decisions without a medical inference or a food-safety claim.

## Shared duties (Base)

| Base duty | Duty | Delta clauses | Base journey |
| --- | --- | --- | --- |
| BASE-ACCESS-001 | Sign-in | none | not run |
| BASE-ACCESS-002 | Sessions | ACCESS-001, SEC-001, SEC-002, MOBILE-001 | not run |
| BASE-ACCESS-003 | Public endpoints | none | not run |
| BASE-ACCESS-004 | Server-side authorisation | ACCESS-001 | not run |
| BASE-INPUT-001 | Validation | BOOK-001, FLOOR-001, SERVICE-001, WAIT-001, MIG-001, SETUP-001, SETUP-002, SERVICE-002, SERVICE-003, SERVICE-004, SERVICE-005, SERVICE-006, SERVICE-007, BOOK-002, BOOK-008, BOOK-009, BOOK-003, BOOK-004, BOOK-005, BOOK-006, BOOK-007, DIST-001, DIST-002, DIST-003, DIST-004, DIST-005, DIST-006, FLOOR-002, FLOOR-003, FLOOR-004, FLOOR-005, FLOOR-006, FLOOR-007, FLOOR-014, FLOOR-008, FLOOR-015, FLOOR-016, FLOOR-017, FLOOR-018, FLOOR-009, FLOOR-010, FLOOR-011, FLOOR-012, FLOOR-013, FLOOR-019, FLOOR-020, WAIT-002, WAIT-003, WAIT-004, WAIT-005, WAIT-006, EXP-001, EXP-002, EXP-003, EXP-004, EXP-005, MIG-002, MIG-003, MIG-004, MIG-005, MIG-006, MIG-007, MIG-008, API-001, API-002 | not run |
| BASE-INPUT-002 | HTML | none | not run |
| BASE-INPUT-003 | Uploads | SETUP-001, SETUP-002 | not run |
| BASE-SECRET-001 | No leakage | PRIVACY-001, DATA-001, DATA-002, BOOK-002, BOOK-009, PAY-001, PAY-002, PAY-003, PAY-004, PAY-005, PAY-006, PAY-007, PAY-008, PAY-009, PAY-010, POS-001, POS-002, POS-003, POS-004, POS-005, POS-006, POS-007, DATA-003, SEC-001, SEC-002, DATA-004 | not run |
| BASE-SECRET-002 | Startup | none | not run |
| BASE-DATA-001 | Export and import | MIG-001, DATA-001, DATA-002, REPORT-001, REPORT-002, REPORT-003, REPORT-004, REPORT-005, REPORT-009, REPORT-008, REPORT-006, REPORT-007, MIG-002, MIG-003, MIG-004, MIG-005, MIG-006, MIG-007, MIG-008, DATA-003, DATA-004 | not run |
| BASE-DATA-002 | Retention | DATA-004 | not run |
| BASE-DATA-003 | Erasure | GUEST-001, DATA-001, DATA-002, GUEST-002, GUEST-003, GUEST-004, GUEST-005, GUEST-006, DATA-003, AUDIT-001, DATA-004 | not run |
| BASE-DATA-004 | Outbound flows | none | not run |
| BASE-DATA-005 | Independence | OSS-001 | not run |
| BASE-PUBLIC-001 | Privacy | PRIVACY-001, BOOK-001, WAIT-001, BOOK-002, BOOK-008, BOOK-009, BOOK-003, BOOK-004, BOOK-005, BOOK-006, BOOK-007, DIST-001, DIST-002, DIST-003, DIST-004, DIST-005, DIST-006, WAIT-002, WAIT-003, WAIT-004, WAIT-005, WAIT-006 | not run |
| BASE-PUBLIC-002 | Origins | BOOK-002, BOOK-009 | not run |
| BASE-PUBLIC-003 | Accessibility | none | not run |
| BASE-OPS-001 | Health | OPS-001 | not run |
| BASE-OPS-002 | Migrations | OPS-001 | not run |
| BASE-OPS-003 | Idempotency | MSG-001, DIST-001, DIST-002, DIST-003, DIST-004, DIST-005, DIST-006, MSG-002, MSG-003, MSG-004, MSG-005, MSG-006, MSG-007, MSG-008, MSG-009, MSG-010, MSG-011, PAY-001, PAY-002, PAY-003, PAY-004, PAY-005, PAY-006, PAY-007, PAY-008, PAY-009, PAY-010, EXP-001, EXP-002, EXP-003, EXP-004, EXP-005, POS-001, POS-002, POS-003, POS-004, POS-005, POS-006, POS-007, API-001, API-002, OPS-001 | not run |
| BASE-OPS-004 | Failure is visible | MSG-001, MSG-002, MSG-003, MSG-004, MSG-005, MSG-006, MSG-007, MSG-008, MSG-009, MSG-010, MSG-011, POS-001, POS-002, POS-003, POS-004, POS-005, POS-006, POS-007, OPS-001 | not run |
| BASE-OPS-005 | Audit | none | not run |
| BASE-ROLE-001 | Roles through every door | ACCESS-001, FLOOR-001, SERVICE-001, MSG-001, WAIT-001, GUEST-001, SERVICE-002, SERVICE-003, SERVICE-004, SERVICE-005, SERVICE-006, SERVICE-007, DIST-001, DIST-002, DIST-003, DIST-004, DIST-005, DIST-006, FLOOR-002, FLOOR-003, FLOOR-004, FLOOR-005, FLOOR-006, FLOOR-007, FLOOR-014, FLOOR-008, FLOOR-015, FLOOR-016, FLOOR-017, FLOOR-018, FLOOR-009, FLOOR-010, FLOOR-011, FLOOR-012, FLOOR-013, FLOOR-019, FLOOR-020, WAIT-002, WAIT-003, WAIT-004, WAIT-005, WAIT-006, MSG-002, MSG-003, MSG-004, MSG-005, MSG-006, MSG-007, MSG-008, MSG-009, MSG-010, MSG-011, PAY-001, PAY-002, PAY-003, PAY-004, PAY-005, PAY-006, PAY-007, PAY-008, PAY-009, PAY-010, EXP-001, EXP-002, EXP-003, EXP-004, EXP-005, GUEST-002, GUEST-003, GUEST-004, GUEST-005, GUEST-006, CRM-001, CRM-002, CRM-003, CRM-004, CRM-005, CRM-006, REPORT-001, REPORT-002, REPORT-003, REPORT-004, REPORT-005, REPORT-009, REPORT-008, REPORT-006, REPORT-007, ROLE-001, ROLE-002, ROLE-003, ROLE-009, ROLE-010, ROLE-004, API-001, API-002 | not run |
| BASE-AUDIT-001 | Searchable, durable audit | FLOOR-001, SERVICE-001, PLAN-001, SERVICE-002, SERVICE-003, SERVICE-004, SERVICE-005, SERVICE-006, SERVICE-007, BOOK-002, BOOK-009, FLOOR-002, FLOOR-003, FLOOR-004, FLOOR-005, FLOOR-006, FLOOR-007, FLOOR-014, FLOOR-008, FLOOR-015, FLOOR-016, FLOOR-017, FLOOR-018, FLOOR-009, FLOOR-010, FLOOR-011, FLOOR-012, FLOOR-013, FLOOR-019, FLOOR-020, PAY-001, PAY-002, PAY-003, PAY-004, PAY-005, PAY-006, PAY-007, PAY-008, PAY-009, PAY-010, REPORT-001, REPORT-002, REPORT-003, REPORT-004, REPORT-005, REPORT-009, REPORT-008, REPORT-006, REPORT-007, AUDIT-001 | not run |
| BASE-BACKUP-001 | Independent backup, restore and rollback | DATA-001, DATA-002, DATA-003, OPS-001, DATA-004 | not run |
| BASE-DATA-006 | Erasure respects retention and legal hold | GUEST-001, DATA-001, DATA-002, PAY-001, PAY-002, PAY-003, PAY-004, PAY-005, PAY-006, PAY-007, PAY-008, PAY-009, PAY-010, GUEST-002, GUEST-003, GUEST-004, GUEST-005, GUEST-006, CRM-001, CRM-002, CRM-003, CRM-004, CRM-005, CRM-006, DATA-003, DATA-004 | not run |
| BASE-SIGNIN-001 | Standards-based SSO and lifecycle | SEC-001, SEC-002 | not run |
| BASE-SIGNIN-002 | Native multi-factor authentication | SEC-001, SEC-002 | not run |
| BASE-INSTALL-001 | Free self-host and removal | SITE-001, OSS-001, COST-001, SITE-002 | not run |
| BASE-MAIL-001 | Truthful mail outcomes | MSG-001, SERVICE-003, DIST-005, MSG-002, MSG-003, MSG-004, MSG-005, MSG-006, MSG-007, MSG-008, MSG-009, MSG-010, MSG-011, CRM-001, CRM-002, CRM-003, CRM-004, CRM-005, CRM-006, REPORT-001, REPORT-002, REPORT-003, REPORT-004, REPORT-005, REPORT-009, REPORT-008, REPORT-006, REPORT-007, VOICE-001 | not run |
| BASE-ACCESSIBILITY-001 | One accessibility bar | BOOK-001, SITE-001, BOOK-002, BOOK-008, BOOK-009, BOOK-003, BOOK-004, BOOK-005, BOOK-006, BOOK-007, MOBILE-001, SITE-002 | not run |
| BASE-DOCS-001 | On-site docs from one contract | SITE-001, SITE-002 | not run |
| BASE-AGENT-001 | One MCP door per seed | SURFACE-005 | not run |
| BASE-AGENT-002 | The seed's jobs are tools, through the UI's own actions | VOICE-001, AGENT-001, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, SURFACE-001 | not run |
| BASE-AGENT-003 | Records are resources | AGENT-001, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, SURFACE-004 | not run |
| BASE-AGENT-004 | Business identity and short-lived, audience-bound tokens | none | not run |
| BASE-AGENT-005 | An agent acts as a person in a role, never more | ACCESS-001, ROLE-001, ROLE-002, ROLE-003, ROLE-009, ROLE-010, ROLE-004, AGENT-001, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, SURFACE-003 | not run |
| BASE-AGENT-006 | Every action declares its risk class | AGENT-001, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, SURFACE-001, SURFACE-002, SURFACE-003 | not run |
| BASE-AGENT-007 | The company's policy decides, at one chokepoint | ACCESS-001, PLAN-001, VOICE-001, AGENT-001, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, SURFACE-002, SURFACE-005 | not run |
| BASE-AGENT-008 | Truthful attribution | PLAN-001, AGENT-001, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, SURFACE-003 | not run |
| BASE-AGENT-009 | Every agent action is audited with its class and decision | none | not run |
| BASE-AGENT-010 | Agents can follow changes | SURFACE-004 | not run |
| BASE-AGENT-011 | Limits are policy, and Pause stops everything | AGENT-001, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006, AGENT-007, AGENT-008, SURFACE-005 | not run |
| BASE-AGENT-012 | Writes are idempotent and conflict-safe | SURFACE-005 | not run |
| BASE-AGENT-013 | Manifest, docs and the conformance journey | SURFACE-001, SURFACE-004, SURFACE-005 | not run |

## Published clauses

- `ACCESS-001`: *Tier:* Core · *Cites:* BASE-ACCESS-002, BASE-ACCESS-004, BASE-ROLE-001, BASE-AGENT-005, BASE-AGENT-007
- `PRIVACY-001`: *Tier:* Core · *Cites:* BASE-PUBLIC-001, BASE-SECRET-001
- `BOOK-001`: *Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ACCESSIBILITY-001 · *Rules:* D-2, D-3
- `FLOOR-001`: *Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3
- `SERVICE-001`: *Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-AUDIT-001 · *Rules:* D-2, D-3
- `PLAN-001`: *Tier:* Core · *Cites:* BASE-AGENT-007, BASE-AGENT-008, BASE-AUDIT-001
- `MSG-001`: *Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6
- `WAIT-001`: *Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3
- `GUEST-001`: *Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-003, BASE-DATA-006 · *Rules:* D-6
- `MIG-001`: *Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-001 · *Register:* R-7
- `DATA-001`: *Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-BACKUP-001, BASE-SECRET-001
- `DATA-002`: *Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-BACKUP-001, BASE-SECRET-001
- `SITE-001`: *Tier:* Core · *Cites:* BASE-DOCS-001, BASE-INSTALL-001, BASE-ACCESSIBILITY-001 · *Register:* R-1, R-2
- `OSS-001`: *Tier:* Core · *Cites:* BASE-INSTALL-001, BASE-DATA-005
- `BOUND-001`: *Tier:* Core

### Published foundations

#### ACCESS-001 — Native sessions and preparation authority

**Requirement.** Owner/admin operate the floor and decide prepared plans; members read only unless granted the host capability in FLOOR-009. That capability permits direct assignment changes, staff service observations and WAIT-002 intake/party updates. A separate SERVICE-007 pacing grant adds walk-in/waitlist seating and reasoned overrides, without venue administration. The owner's personal controls cover preparation keys, move-in, erasure and backups. Preparation keys carry no execution scope. Agent execution tools carry the corresponding access, security, destructive, commitment or live classes; the company's policy decides those calls.

**Acceptance.**
1. Call state, commands, downloads, import and backup directly while signed out, as member, admin and preparation key; refuse unauthorized writes and cross-origin requests; revoke a key and refuse its next read.

#### PRIVACY-001 — Public guest isolation

**Requirement.** Guests see published services and their own new-booking confirmation. Public availability and other guests’ confirmations never expose guest contact data, notes or private history. When BOOK-008 analytics is on, the booking page and widget ask once per visit before anything leaves for GA4 or Meta: nothing is sent before Accept, on Decline or without an answer, the answer is never stored, no provider script loads on the page, and accepted events carry no guest name or contact data, IP address, cookies, booking reference or reservation date/time.

**Acceptance.**
1. Create two guests through the public booking door; inspect availability and both confirmations while signed out and prove neither response contains the other guest’s details.
2. With BOOK-002 analytics on, book once without answering the analytics question and once after Accept; prove the first sends nothing and the second’s provider events carry no guest details.

#### BOOK-001 — Live assigned reservations

**Requirement.** Guests read current published availability and immediately create a booking assigned to a fitting table or combination. Full or concurrently claimed capacity returns a conflict rather than a false confirmation.

**Acceptance.**
1. Publish a service, make three public reservations and race the final fitting combination from two guest requests; exactly one succeeds and the next availability read reflects it.

#### FLOOR-001 — Conflict-safe physical capacity

**Requirement.** Half-open UTC intervals, full-turn fit, starts on the service slot interval (15 minutes by default, configurable under SERVICE-004), distinct table combinations and cumulative service covers protect allocation. A physical table cannot be sold twice across overlapping services. Writes compare the floor version; stale plans require renewed review.

**Acceptance.**
1. Book a combined table through HTTP, reject too few or duplicate tables and over-capacity arrivals, finish a turn and book a later one; attempt a clash across services and require refusal.

#### SERVICE-001 — Reviewed dated service publication

**Requirement.** An owner or manager configures venue timezone, positioned tables, a dated service, turn time and cover limit. A person publishes its exact prepared venue, service and floor snapshot; a later draft edit invalidates approval.

**Acceptance.**
1. Create tables and a Friday service through commands, prepare publication, edit it, refuse stale approval and approve a fresh plan; only the published service becomes bookable.

#### PLAN-001 — Exact plans and accountable decisions

**Requirement.** Publication, prepared table-reassignment and reminder proposals bind exact inputs, preparer, reason and the deciding actor. Direct table moves, swaps and locks use FLOOR-009. A preparation key's grant ends at preparation. Executing a prepared service change carries live and commitment; publishing or exporting reminders to outside recipients carries external. The company's policy decides agent execution of each class. Under the held company policy a manager decides the exact revision; changed inputs and physical clashes invalidate that decision. Readable actor names identify people and preparation keys.

**Acceptance.**
1. Under the held company policy, prepare with an owner-issued preparation-only key, refuse execution outside its scope, change a draft, refuse stale approval, then approve a fresh plan as manager and read its identities; prepare and approve a valid table move.

#### MSG-001 — Approved reminder CSV custody

**Requirement.** People can approve exact reminder batches and download them for their own sender. Exported rows retain approval attribution, render the venue-local time in US format (for example “Sat, Oct 17, 2026, 7:30 PM PDT”) and exclude no-shows and erased guest contact values. A CSV export records preparation and export, never provider delivery.

**Acceptance.**
1. Book guests, mark one no-show, approve remaining reminders and download CSV with US-formatted local times; erase a booked guest and download again, proving the guest’s personal values are absent.

#### WAIT-001 — Staff walk-ins and waiting parties

**Requirement.** Managers seat fitting walk-ins, add a party to the service waitlist and seat it when capacity is released. Booked, seated, completed, canceled and no-show transitions are guarded against impossible state changes.

**Acceptance.**
1. Run the Friday HTTP journey with online bookings, a walk-in, a waiting party and a no-show; seat the waiting party and refuse completion before seating.

#### GUEST-001 — Guest visit history

**Requirement.** Guest contact records, editable service notes, current reservation statuses and imported dated visit history remain linked to the guest, including cancellations and no-shows.

**Acceptance.**
1. Book a guest, change its service status, import dated visits and read guest/state through an authorized session; update notes and find both current and imported history.

#### MIG-001 — Reviewed Tablein-shaped move-in

**Requirement.** The reviewed move-in door accepts the documented eight-column guest/history CSV shape with a no-write dry run, exact fingerprint confirmation, atomic native/journal batches, durable provenance and undo that refuses later edited rows. This existing fixture is explicitly shape-only, not verified against a real customer export.

**Acceptance.**
1. Upload the fixture through dry-run, reject a wrong fingerprint, apply, read the journal, undo unchanged rows and refuse undo after a staff edit while keeping that edit.

#### DATA-001 — Validated empty-destination backups

**Requirement.** A restore brings back BOOK-008 analytics settings but never their GA4 or Meta keys, so the restored venue asks no analytics question and sends nothing until the owner enters the keys again.

**Acceptance.**
1. Export a booked venue through the owner backup endpoint; restore into an empty installation, compare records, then refuse overwrite and a modified archive without changing destination data.
2. Restore a venue with analytics on and prove nothing is offered or sent until the owner re-enters both keys.

#### DATA-002 — Guest erasure and restore fences

**Requirement.** Owner erasure removes live and import-custody personal values, suppresses known erased identities and fences known older backups. An isolated offline restore needs a trusted later erasure journal to learn erasures it has never seen.

**Acceptance.**
1. Import, back up and erase a guest; verify guest and retained archive custody no longer contain personal values, refuse reimport and refuse a pre-erasure restore when given the trusted later journal.

#### SITE-001 — Runnable product and owner guides

**Requirement.** The run site serves its homepage, a Run Placemat action opening /run and all listed owner guides at /docs. The installed root remains the Lobby and a fresh installation starts without sample restaurant data.

**Acceptance.**
1. Build the run site and follow homepage to /run and /docs; open the installed root after fresh setup and reach empty restaurant operations.
2. The homepage’s Run Placemat and Read the docs buttons and its Run it yourself command matches the documented installation command on the homepage, README and Run page exactly; run that command in a clean directory and reach owner setup.

### Honest boundaries and separate products

#### OSS-001 — Free and open source, MIT licensed

**Requirement.** Placemat’s source is MIT licensed in its public repository. Restaurant provider charges are distinct: Stripe processing, Twilio messaging and voice, Google, Meta, POS and partner fees bill the restaurant directly under their own terms. COST-001 presents those provider costs before a channel is enabled.

**Acceptance.**
1. Read the MIT license and the license line on the homepage, README and /run; install with the /run command and run a complete service with no payment, plan or license prompt; enable a provider channel and prove the cost shown is that provider’s own (COST-001) and that Placemat bills nothing.

#### BOUND-001 — Stated boundary: online ordering, gift cards and the POS

**Requirement.** The homepage says “Not in Placemat: online ordering, gift cards or the POS itself”, and the product says the same. Placemat sells no gift cards, stored-value cards or vouchers, takes no online food orders and is not the point of sale. A PAY-002 deposit, an EXP-002 prepaid ticket and an EXP-005 pickup experience are each tied to one named booking or event, shown as a balance against it and refunded under PAY-005; none is transferable, can be topped up or spends as a general balance. Gift cards, online ordering and check taking stay in the restaurant’s POS or its payment provider’s own gift-card and ordering products, and a Toast, Square or Clover loyalty program stays there too (CRM-006 syncs only identity and redemption status). The homepage names no gift-card provider, so the docs give the same line without naming one. Every capability must conform to this boundary. Before their capabilities ship, PAY-002, EXP-002 and EXP-005 each inherit the booking/event-bound balance, PAY-005 refund, nontransferability, no-top-up and no-general-spending obligations and their payment acceptance points. Those payment journeys remain missing in their own clauses;

**Acceptance.**
1. Read the homepage boundary line, this clause and the owner docs and find the same three exclusions and the same pointer to the venue’s POS or payment provider; search the staff app, public booking page, documented HTTP routes and exports for gift-card, stored-value, voucher and ordering surfaces and find none; pay a deposit and a prepaid ticket and prove neither can be transferred, topped up or redeemed outside its booking; a site test fails if the homepage names a gift-card or ordering capability this clause excludes, or this clause names one the page omits.

## Target clauses

### Venue setup and service policy

#### SETUP-001 — US restaurant onboarding

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-INPUT-003

**Requirement.** The owner sets legal/trading name, address, US phone, contact channels, logo, booking policies, USD currency and an IANA venue timezone. Setup previews a realistic service without creating fake production guests; Los Angeles and New York daylight-saving gaps and repeated hours require explicit resolution.

**Acceptance.**
1. Finish onboarding for a 72-seat US restaurant, preview its booking page and create services across both DST changes; refuse nonexistent local times and disambiguate repeated times.
2. Contact channels are the restaurant’s phone, email and optional HTTPS website; saving them claims no provider validation or send.
3. PNG/JPEG/WebP restaurant logos are uploaded locally. USD is the edition currency. A transient preview uses the entered service and real floor through the current search/capacity engine and creates no service, guest, booking or proposal. Service creation and recurring generation refuse a DST gap and name its next valid local minute; repeated start or end times require an actual valid offset choice. Venue-local input resolves on the server and stored timestamps remain unambiguous instants. Restaurant fields, exact policies and acknowledgment export and restore under DATA-003 and DATA-001.

#### SETUP-002 — Acknowledged restaurant service defaults

*Tier:* Core · *From:* SETUP-001 · *Cites:* BASE-INPUT-001, BASE-INPUT-003

**Requirement.** Restaurant onboarding saves an exact, editable service-policy summary for dated and recurring services without changing already configured services.

**Acceptance.**
1. completing restaurant setup saves editable defaults for new dated and recurring services: online parties 1–8 with inquiry above the maximum, 60 inclusive venue-local days ahead, inclusive 16:00 same-day cutoff, 30 elapsed minutes lead and 15-minute slots.
2. Walk-in and waitlist defaults have no cutoff and zero lead.
3. Every rule applies together; owner/admin may override party, horizon and lead with a recorded reason, never a cutoff or physical capacity.
4. The owner acknowledges the exact summary, recorded with a monotonically increasing version, actor and instant; edits require a fresh acknowledgment.
5. Existing services retain their own policies, and pre-onboarding installations retain their existing rules until the owner completes restaurant setup.

#### SERVICE-002 — Recurring shifts and seasonal schedules

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-AUDIT-001 · *Rules:* D-2, D-3

**Requirement.** Managers define weekly breakfast, lunch and dinner templates, seasonal date ranges and special holiday shifts. They preview generated services, conflicts and capacity before publication; editing a template never silently rewrites existing guest commitments. Seasons and preview dates are inclusive venue-local calendar dates; dated exceptions replace the weekly shift, including opening a normally closed day. End time at or before start means the following local day. Nonexistent DST times refuse generation and repeated times require an explicit valid UTC offset. Preview shows physical seats (active tables only; retired tables are history, not seats), service covers and overlapping services, and publication binds the exact schedules, venue, floor, services and bookings. A template edit marks changed future generated services for renewed approval; only explicitly selected unbooked services can be renewed or closed by that reviewed batch. Booked services and historical services remain unchanged and affected bookings require the separately reviewed SERVICE-003 change workflow. Batches cover up to 31 dates each and successive batches cover a longer season.

**Acceptance.**
1. Create a recurring dinner template and Thanksgiving exception, preview and publish a week, then change the template and inspect which future services need renewed approval.

#### SERVICE-003 — Closures and emergency service changes

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-AUDIT-001, BASE-MAIL-001 · *Rules:* D-2, D-3

**Requirement.** Managers close dates, rooms or arrival windows, hold inventory for private use and safely amend a published service. Affected bookings become a named outreach and reaccommodation queue with delivery outcomes and explicit refund decisions; closure cannot make them disappear. Owner or admin reviews each closure or relocation action. A closure message goes only to guests with recorded contact permission and covers only their own booking. Relocation changes a booking only after the guest accepts; unanswered bookings stay unchanged and visible to the owner. Refunds follow PAY-005: owner or admin authority, exact cents, recorded reason and no refund claimed before provider confirmation. Contact details and messages follow existing guest-data retention and erasure; every action records actor and time. Current closure restrictions use half-open intervals: room, full-service and private holds cover setup through cleanup across shared physical tables; arrival-window closures compare arrival instants. Existing reservations retain all commitments. Existing direct, swapped and prepared assignment doors refuse unaccepted changes to an affected booking’s tables; an outstanding follow-up cannot bypass acceptance. A personal manager reviews an exact offer without changing the booking, then explicitly sends once to its recorded permitted email. A scoped digest-only link expires at the earliest of 24 hours or either arrival, rotates on renewed review and is consumed on a decision. Acceptance rechecks the original booking, full turn, cleanup, access, physical capacity, staffing and pacing atomically. opening the private link records guest-opened. Staff follow-up observations remain distinct from these delivery outcomes. Portable history strips live capabilities and guest erasure clears linked permission, free text and personal snapshots.

**Acceptance.**
1. Close a room with three future bookings; preview impacts, confirm the change, relocate one, cancel and refund another and track failed outreach for the third to staff ownership.

#### SERVICE-004 — Party and advance-booking rules

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-AUDIT-001 · *Rules:* D-2, D-3

**Requirement.** Per service/channel rules control minimum and maximum party size, advance-booking horizon, same-day cutoff, lead time, slot interval and large-party inquiry routing. Staff overrides of party, horizon and lead-time rules require a permitted role and a reason and cannot violate physical capacity; pacing and cover-limit overrides follow SERVICE-007. online, walk-in and waitlist-seating channels each store their own rules. Horizon is an inclusive count of venue-local calendar days, lead time is elapsed minutes (zero disables the staff-seating lead check; public bookings always require a future time), the same-day cutoff is inclusive HH:MM in venue time, blocked starts are exact UTC instants, and slots align to service start. owner/admin managers may override party, horizon and lead-time checks with a recorded reason; public and preparation-key requests cannot. Large parties above the inquiry threshold are directed to contact the venue and are never falsely confirmed. BOOK-007 inherits the full inquiry workflow; BOOK-002, BOOK-005, DIST-001–DIST-004, WAIT-002, VOICE-001 and AGENT-001 inherit channel rules before their new booking doors ship.

**Acceptance.**
1. Configure different lunch/dinner rules; try early, late, oversized and blocked public requests, then authorize a lead-time override and inspect its audit.

#### SERVICE-005 — Arrival pacing and concurrent covers

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-AUDIT-001 · *Rules:* D-2, D-3

**Requirement.** Managers set covers and parties per arrival interval, total service covers, simultaneous seated covers and kitchen pacing by area. Public, widget, Google, social and partner allocations are refused at these limits with clear reasons. A voice agent's or other agent's pacing exception carries commitment; the company's policy decides it. Staff bookings see the same limits as a warning and proceed past them only through a reasoned, audited SERVICE-007 override. Current limits are per service. Arrival intervals use whole elapsed minutes aligned to service start and half-open bounds; booked, seated and completed arrivals count, cancelled/no-show parties do not. Total service covers use those same statuses. Simultaneous dining covers count overlapping booked/seated dining intervals, with ongoing seated parties counted past their forecast. Each party counts once per arrival interval and once against each configured area containing its assigned tables. Whole-number limits are 1–500 and intervals 5–120 minutes; absent older pacing settings add no arrival or simultaneous limit beyond the existing service-cover and FLOOR-004 kitchen caps. Managers configure the policy at service creation or with an attributed service.pacing command; existing commitments remain, and assignment changes cannot increase an exceeded limit without a new reviewed allocation. online booking, walk-in and waitlist seating, status reacquisition, direct/prepared assignments and retirement replacements retain pacing and every hard physical/server guard. New widget/phone/distribution/voice/agent doors (BOOK-002, BOOK-005, DIST-001–DIST-004, VOICE-001, AGENT-001) inherit these obligations before shipping. WAIT-002 queue intake stays open at pacing caps, labelled “queued only; no table or time promised”; pacing is enforced when a person seats, books or allocates from the queue.

**Acceptance.**
1. Set a 12-cover arrival limit and 48 simultaneous covers, book through two channels concurrently and prove the next public party is refused despite a physically free table, while a staff booking at the same moment receives a warning and needs a SERVICE-007 override.
2. The reservation book shows covers against the limit for each arrival interval and marks a full interval, whose next public request is offered alternatives (BOOK-003).

#### SERVICE-006 — Turn and cleanup rules

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-AUDIT-001 · *Rules:* D-2, D-3

**Requirement.** Managers set turn duration by party size, table, dining area, experience and service, plus cleanup buffers and last-seating rules. Availability fits the whole promised turn and reset; changes preview affected guests and preserve approved reservations. service, party-size, table and dining-area rules apply to every existing booking door. A table rule takes precedence over its area, then the matching non-overlapping party range, then the service default; a combination uses its longest constituent turn. Cleanup occupies the same tables through a separate cleanup end, including a completed booking with a reset, and both the full turn and reset must fit service hours. Last seating is an inclusive offset instant. Reviewed policy edits preview each existing reservation, require renewed review if the service, floor or bookings change, and affect only future bookings; confirmed turns and resets remain unchanged. EXP-001 and EXP-002 inherit experience-specific duration and cleanup before publishing experiences; BOOK-002, BOOK-005, DIST-001–DIST-004, WAIT-002, VOICE-001 and AGENT-001 inherit full-turn/reset allocation before their new booking doors ship.

**Acceptance.**
1. Configure 90-minute two-tops, 120-minute six-tops and a 15-minute reset; search last seating, book both sizes and verify adjacent turns and a policy edit.

#### SERVICE-007 — Staff pacing overrides with warnings

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-AUDIT-001 · *Rules:* D-2, D-3

**Requirement.** Permitted staff (managers by default, hosts when granted) can knowingly book or seat a party past an arrival-interval, simultaneous-cover, area-pacing or service-cover limit, or into a blocked timeslot, from the reservation book, a phone booking, a walk-in or waitlist seating. Before commit the screen and HTTP response name each limit exceeded and by how much; the staff member confirms with a reason. The override is audited with actor, limit, excess and reason, flagged on the booking and timeline, and counted separately in pacing and cover reports (REPORT-002). Public, widget, Google, social and partner allocations cannot override; a voice agent's or other agent's pacing exception carries commitment under the company's policy; WAIT-002 queue intake remains queued-only as SERVICE-005 states. No override can breach physical table capacity, overlapping turns or permitted combinations (FLOOR-001, FLOOR-003). owner/admin managers configure and override by their existing rights. An owner grants or revokes a separate pacing capability for an active FLOOR-009 host; it adds walk-in and waitlist seating with reasoned pacing overrides, never plan approval or venue administration. Each command rechecks the current grant. A native authenticated no-write preview names every limit/current/projected/excess and returns a five-minute HMAC review bound to the actor, command, exact payload, floor version and expiry. Commit needs that unchanged review, an explicit confirmation and a reason, and rechecks live fit. Review tokens are never stored or archived. Booking and audit retain actor/time/limit/excess/reason, the timeline flags the exception, and pacing and cover reports count and drill to overridden reservations separately (including later cancellations). Guest erasure clears linked override reasons in bookings, audit and retained proposal snapshots. Server caps/breaks, physical fit, access, joins and occupied turns always remain hard. BOOK-005 inherits future phone/concierge reservation-book creation; other new doors named in SERVICE-005 inherit these rules before shipping.

**Acceptance.**
1. Under a held company policy whose commitment rule refuses an agent pacing exception, with a full 12-cover 7:30 interval and a physically free four-top, have a public request and an agent request refused.
2. As a host without the grant, be refused.
3. As a granted host, see the warning naming the limit and excess, confirm with a reason and book; read the audit row, the flag on the timeline and the override count in the pacing report.
4. Attempt an override onto an occupied table and be refused.
5. Configured FLOOR-004 concurrent kitchen-area caps are area-pacing warnings eligible for that same signed exception; server cover caps and breaks stay hard.
6. Unrelated roster changes preserve existing reviewed kitchen exceptions; changing the kitchen cap itself still validates existing commitments.

### Booking and distribution

#### BOOK-002 — Branded website booking widget

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ACCESSIBILITY-001, BASE-PUBLIC-002, BASE-SECRET-001, BASE-AUDIT-001 · *Rules:* D-2, D-3 · *Register:* R-1, R-2

**Requirement.** Restaurants embed a responsive, accessible booking widget on their own WordPress, Squarespace, Wix or custom website with venue branding, locale, party/date/time search and policy disclosure. The standalone booking page and embed share inventory and preserve source attribution. Before shipping, this capability must inherit SERVICE-005 arrival/service/concurrent/area pacing and SERVICE-007 warning, reasoned override and hard physical-capacity obligations; public allocations cannot override; an agent's exception carries commitment and the company's policy decides it. Embedding follows ct’s 20 October 2026 ruling: the owner alone manages an explicit list of up to 20 exact `https` website origins for the embedded booking widget (no wildcards, credentials, paths, `http`, `localhost` or loopback addresses, in any environment), and every change is audited with actor, time and the before/after list. Only that widget response names the list in CSP `frame-ancestors`, and it omits `X-Frame-Options`, which cannot express a list; an empty list answers `frame-ancestors 'none'` with `X-Frame-Options: DENY`, as does every other response, so staff pages, the standalone page, the queue and inquiry pages stay unframeable. The widget never submits on its own: a booking needs the guest’s own Confirm booking press. It accepts no messages from the host page, posts only its height to the listed origin and shows no staff link or data. Widget bookings use the public booking door with the online channel’s rules, turn/reset, joins, staffing, pacing and physical capacity, never an override, and record `attribution with the widget door and listed origin (the listed origin the widget reported: attribution, not proof); other public bookings record the booking-page source. The widget uses this installation’s own branding and venue name, US English with venue-local times in the venue’s IANA time zone, and the standalone page’s request terms, availability re-check and inquiry routing; both list each searched service’s online booking rules (party range, large-party inquiry threshold, horizon, same-day cutoff, lead time and arrival interval) before the guest confirms.

**Acceptance.**
1. Embed on an allowed test website, search and book at 1440 and 390 widths, navigate by keyboard and verify the same slot disappears on the standalone page.

#### BOOK-008 — Consent-aware booking analytics

*Tier:* Core · *From:* BOOK-002 · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ACCESSIBILITY-001 · *Rules:* D-2, D-3

**Requirement.** Owners may enable consent-aware Google Analytics 4 and Meta Pixel/Conversions API events for search, checkout start and completed booking. While a provider is on and holds its key, the booking page and the widget ask once per page visit with Accept and Decline, naming each provider that is on and saying what is sent; the answer lives only in that page’s memory and is never stored or carried to another visit. Nothing is sent before Accept, on Decline or without an answer. After Accept the page creates a random visit ID, and Placemat’s server, never a script on the page, sends search (after each search the guest runs), checkout start (when the guest selects a time) and completed booking (after the booking commits) with exactly party size, booking source (`widget` with the listed origin, or `booking-page`) and the visit ID (Meta receives its SHA-256 as `external_id`), plus for Meta the browser user agent, the source page as `event_source_url` and the send time; never guest name or contact data, IP address, cookies, booking reference or reservation date/time. The visit ID is never stored on the booking or anywhere else. Sends run after the guest’s response with no retry queue, so a slow or failing provider never blocks or delays a booking. The owner sees each provider’s latest HTTP answer: GA4 never confirms an event (check DebugView) and Meta reports `events_received`; Placemat never claims a provider verified an event.

**Acceptance.**
1. Observe the GA4 and Meta test events for the completed booking with no guest contact data, then decline analytics consent and observe none.

#### BOOK-009 — Booking analytics credential controls

*Tier:* Core · *From:* BOOK-002 · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ACCESSIBILITY-001, BASE-PUBLIC-002, BASE-SECRET-001, BASE-AUDIT-001 · *Rules:* D-2, D-3

**Requirement.** Only the owner switches Google Analytics 4 (Measurement Protocol: measurement ID and API secret, optional `debug_mode` test mode) and Meta (Conversions API to the owner’s Pixel/dataset ID: access token, optional `test_event_code`) on or off; every change is audited with actor, time and before/after settings. Switching a provider off stops its events; its saved key stays until the owner enters a new one or removes it. Following ct’s 21 October 2026 ruling, the owner alone (as one of the owner’s own controls; no finance or staff role) can press Remove saved key for each provider: it deletes the stored GA4 API secret or Meta access token, leaves that provider’s other settings unchanged and is audited under AUDIT-001 with actor, time and a saved-key state of false, never the key. While a provider is on without a key it sends nothing, the guest is not asked about it, and the settings say a key is needed; restores never bring a key back (DATA-001, DATA-003). The GA4 API secret and Meta access token are write-only: no state response, backup, archive, business CSV, audit row or log contains them (DATA-003 names the exclusion), so a restored installation sends nothing until the owner enters them again (DATA-001).

**Acceptance.**
1. Switch each analytics provider off, replace its key and remove its saved key without changing unrelated settings; inspect the attributed settings history.
2. With a provider enabled but its key absent, see that a key is needed, encounter no analytics question and send no analytics event; restore under DATA-001 and enter the key anew before any sending.
3. Read state, archives, business CSVs, audit and logs and find no analytics credentials.

#### BOOK-003 — Reservation search and availability alternatives

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ACCESSIBILITY-001 · *Rules:* D-2, D-3

**Requirement.** Guests search by date, party size, area and experience and see honest nearby times or approved sister-venue alternatives when full, including accessible seating constraints. Empty and stale results explain the next available action without collecting a false booking. Current search covers every published open service and existing dining area with exact required access tags. Dates are venue-local arrival dates; nearby alternatives include the requested date through seven later calendar days, inclusive, ordered by actual arrival instant. A selected area and every access tag are required fit constraints at search, booking and later reassignment; availability is not a hold, and a failed commit preserves contact inputs but requires an explicit new selection. Empty results ask the guest to change date or filters or contact the venue, without making a booking. EXP-001 inherits experience filtering and ROLE-001 inherits approved sister-venue alternatives in these same search and commit doors before those capabilities ship.

**Acceptance.**
1. Search a full Friday for an accessible four-top, select a Saturday alternative and complete it; race a stale result and receive a clear reselect path.

#### BOOK-004 — Secure guest modification and cancellation

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ACCESSIBILITY-001 · *Rules:* D-2, D-3

**Requirement.** A scoped expiring manage-booking link lets a guest change time, size or contact details, reconfirm or cancel only their reservation. Show fee/refund consequences before consent and replace inventory atomically; changed links and replays cannot expose other guests.

**Acceptance.**
1. Use a delivered link to move a two-top to four, fail an unavailable move without losing the old booking, cancel with policy acknowledgment and refuse an expired or foreign token.
2. an owner or a native admin manager holding reservation authority explicitly sends or reissues to the reservation's recorded email, with an actor audit on every issue.
3. Hosts and shared-device sessions have no issue scope. An agent issuing a guest link carries external and commitment, under the company's policy.
4. At most five issues per reservation per venue-local calendar day, including reissues and failed-delivery attempts; refusal happens before email.
5. A 32-byte random bearer is stored only as a digest, expires at the earlier of 24 hours and service start, and rotates on successful writes without extending expiry.
6. Reissue or a changed reservation invalidates the prior link.
7. Changing the recorded email closes link access; sending to the new address requires the same explicit issue action.
8. This door sends email only; MSG-008 must establish SMS consent before any future SMS send. No automatic payment, refund or outbound retry occurs. Reservations with payment obligations remain unchanged in manager review until PAY-004 (fee/cancellation policy) and PAY-005 (refund execution) ship their financial-consequence duties.

#### BOOK-005 — Staff telephone and concierge reservations

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ACCESSIBILITY-001 · *Rules:* D-2, D-3

**Requirement.** Hosts create future reservations for phone callers, hotel concierges and offline inquiries with source, contact preference and special requests. A permitted role can override party, lead-time or pacing rules with a reason (SERVICE-004, SERVICE-007). When a deposit or card-guarantee policy covers the booking, it sends the PAY-010 payment request link with a deadline. They search existing guests and quote live rules; booking confirmation reaches the guest in the selected channel. Before shipping, this capability must inherit SERVICE-005 arrival/service/concurrent/area pacing and SERVICE-007 warning, reasoned override and hard physical-capacity obligations; public allocations cannot override; an agent's exception carries commitment and the company's policy decides it.

**Acceptance.**
1. As host, book next Friday for a returning caller, identify the concierge source, confirm by SMS and read the booking in the same floor schedule as online guests; book a six-top under a deposit policy and see the PAY-010 request delivered.

#### BOOK-006 — Booking holds and duplicate submissions

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ACCESSIBILITY-001 · *Rules:* D-2, D-3

**Requirement.** Short-lived checkout/experience holds reserve scarce inventory across channels, display expiry and release on abandonment or failed payment. Stable request identity ensures reloads and retried submits return the same reservation; no guest can be charged for a lost slot.

**Acceptance.**
1. Two guests start checkout for the final four-top, expire one hold, complete the other and retry its booking/payment request after a network interruption; find one booking and one charge.
2. public checkout holds last at most five minutes, bind an exact booking payload to a client-generated random capability, and count against current channel, physical, turn/reset, pacing, staffing and seat-inventory allocators.
3. Expiry does not renew on replay.
4. Explicit abandonment releases a hold; conversion atomically saves the reservation and consumes its allocation.
5. Reload and interrupted-response recovery return that same reservation.
6. Recovery records contain no guest contact or request text and never travel in archives; guest erasure ends recovery.
7. Payments start only after the reservation exists.
8. An unresolved Checkout attempt protects its reservation until a personal owner or manager recovers the stable processor request and observes an authoritative terminal state; local deadlines and uncertain expiry acknowledgments cannot release it. Closing collection and cancelling a reservation remain separate explicit actions. EXP-002 inherits this hold and duplicate-submission obligation before experience checkout ships.

#### BOOK-007 — Special requests and group inquiries

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ACCESSIBILITY-001 · *Rules:* D-2, D-3

**Requirement.** Booking captures occasion, stroller/highchair, wheelchair access, dietary/allergy notes and seating preferences with explicit required versus requested distinctions. Large groups and private-dining inquiries have an owner, status, reply due date and conversion to a capacity-checked reservation. The approved guest door shows a cryptographically random 32-byte inquiry token once, stores only its SHA-256 digest, and scopes reads/replies/offer acceptance to that inquiry. Replies are posted on the guest page with no delivery claim; conversion requires explicit guest acceptance of the current exact offer and a fresh physical, access, turn, staffing, pacing and channel-rule check. The token expires on closure or conversion. inquiries begin owned by an active venue owner, due 24 elapsed hours after submission; owner/admin managers may reassign to an active native owner/admin and set a future offset-timestamp deadline. Converted inquiries bypass only the large-party inquiry-routing threshold; every other online rule and hard fit remains. Offered party size and required area/access cannot be weakened; changed timing or required guarantees require a new offer and guest acceptance. Only required area/access, party size and offered timing are guaranteed; occasion, stroller/highchair, wheelchair accommodation, dietary/allergy notes and seating preferences are recorded guest requests, with no claim that food is safe. Direct booking displays and records acknowledgment of the required-versus-requested distinction.

**Acceptance.**
1. Book with a required accessible table and requested patio, submit a 16-person inquiry, have a manager reply and convert it; verify guest acknowledgment of what is guaranteed.

#### DIST-001 — Reserve with Google

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-OPS-003, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3 · *Register:* R-3

**Requirement.** Placemat completes eligible Actions Center partner onboarding and certification, publishes availability to Google Search/Maps, receives bookings/modifications/cancellations and reconciles inventory with channel attribution. A link alone is labeled a link until the actual end-to-end integration is live. Before shipping, this capability must inherit SERVICE-005 arrival/service/concurrent/area pacing and SERVICE-007 warning, reasoned override and hard physical-capacity obligations; public allocations cannot override; an agent's exception carries commitment and the company's policy decides it.

**Acceptance.**
1. Through the official-schema Google partner fixture journey, publish a venue, book on Google, change and cancel there, and verify matching reservation IDs and released local inventory; exercise feed rejection and outage recovery.

#### DIST-002 — Instagram and Facebook booking

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-OPS-003, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3 · *Register:* R-4

**Requirement.** Owners connect Instagram/Facebook booking actions where partner support permits and publish trackable profile links elsewhere. Bookings preserve social/referrer/campaign provenance and real inventory; revoked profiles and unsupported account types receive actionable setup guidance. Before shipping, this capability must inherit SERVICE-005 arrival/service/concurrent/area pacing and SERVICE-007 warning, reasoned override and hard physical-capacity obligations; public allocations cannot override; an agent's exception carries commitment and the company's policy decides it.

**Acceptance.**
1. Connect a supported profile, follow its reservation action at phone width, book and inspect social attribution; disconnect and prove existing bookings remain manageable.

#### DIST-003 — Diner discovery and partner distribution

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-OPS-003, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** Searchable venue pages expose location, cuisine, menus, images, experiences and live availability; diner discovery and approved concierge/travel/marketplace distribution bring bookable demand. Partners use allocated inventory or the shared live ledger, with source fees visible and no assumption of inherited OpenTable/Resy network reach. Before shipping, this capability must inherit SERVICE-005 arrival/service/concurrent/area pacing and SERVICE-007 warning, reasoned override and hard physical-capacity obligations; public allocations cannot override; an agent's exception carries commitment and the company's policy decides it.

**Acceptance.**
1. Find a venue by neighborhood and cuisine, book an experience from a partner listing and reconcile its source, fee and remaining tables; reject a duplicate partner callback.

#### DIST-004 — Channel inventory and attribution

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-OPS-003, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** Managers allocate protected tables/covers by direct, Google, social, discovery, phone and partner channels, with release times, direct-booking priority and source/campaign attribution that survives modification. A channel outage cannot oversell shared physical inventory. Before shipping, this capability must inherit SERVICE-005 arrival/service/concurrent/area pacing and SERVICE-007 warning, reasoned override and hard physical-capacity obligations; public allocations cannot override; an agent's exception carries commitment and the company's policy decides it.

**Acceptance.**
1. Reserve two four-tops for direct until 5 p.m., exhaust partner allocation, release it on schedule and inspect original source after a guest changes time.
2. The reservation book shows each party’s channel and totals covers by channel (website, Google, Instagram, phone) that reconcile to its rows, including after a guest changes time.

#### DIST-005 — Guest accounts and repeat booking

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-OPS-003, BASE-PUBLIC-001, BASE-ROLE-001, BASE-MAIL-001 · *Rules:* D-2, D-3

**Requirement.** Diners can optionally keep verified contact details, favorite restaurants, manage upcoming reservations and rebook prior visits across devices, with saved preferences controlled per restaurant. Guest checkout remains available and identity never merges distinct people solely because they share a phone. A diner explicitly proves access to the selected booking’s current recorded email before attaching that booking. Thirty-two-byte random one-use codes are stored only as digests and expire after fifteen minutes; independent device bearers are stored only as digests and expire after twenty-four hours. Each additional booking needs its own current-contact proof. Shared phone numbers confer no identity, booking or account authority. Favorites and preferences are controlled per restaurant; verification grants no staff role, marketing permission, review eligibility or group-sharing permission. Logout revokes the selected device; account forget revokes all account sessions without cancelling reservations. DATA-003 portability, DATA-002 erasure fences and AUDIT-001 accountability apply to these records, while verification and device custody remain excluded from archives. The complete diner-facing favorite, repeat-booking and upcoming-reservation management target across devices remains binding. Group sharing remains the separate GUEST-006 target. The earlier DIST-005 ruling remains binding. Pending email proof may retain the private booking, guest and current-contact references needed to validate that single booking, while storing the random code only as a digest, expiring it after fifteen minutes and consuming it once. An independent digest-only device session expires after twenty-four hours and grants management only for individually verified bookings whose current recorded contact still matches. Every change, reconfirmation or cancellation requires a fresh booking-specific preview and explicit diner confirmation; the preview is bound to that device, booking and current state, is revocable and is excluded from archives. Capacity failure, stale state, replay, revoked access or changed contact grants no mutation authority. Recorded payment obligations require manager review and remain unchanged through this diner door; this grants no charge, refund, fee waiver or automatic message authority. Current-contact, custody, audit, portability and erasure riders remain binding.

**Acceptance.**
1. Book without an account, verify a diner account, attach only the verified booking, rebook a favorite on another device and revoke saved preferences.

#### DIST-006 — Verified diner reviews and restaurant replies

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-OPS-003, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** Diners whose reservation was seated or completed (or matched to a POS check) can rate and review the venue once per attended visit on its Placemat venue page and booking widget; no-shows, cancellations and staff cannot review. Reviews show the visit date, averages show only above a minimum count, and the restaurant can post and edit one public reply per review and report abuse for moderation under published guidelines. Neither the restaurant nor Placemat removes or hides a review because of its rating, and review invitations follow CRM-005’s no-gating rule. Before shipping, DIST-006 inherits DIST-005’s explicit current-contact proof for each attached booking. A verified diner account alone establishes neither an attended visit nor review eligibility and authorizes no review invitation or publication. Prove booking identity separately from this clause’s attended-visit, once-only review and invitation-permission requirements.

**Acceptance.**
1. Complete a visit, receive the review invitation, submit a four-star review and see it with its visit date on the venue page and widget.
2. Refuse a review for a no-show and a second review for the same visit.
3. Reply as manager and see the reply public; report an abusive review and read the moderation outcome; prove a manager cannot delete a one-star review.

### The host stand and floor

#### FLOOR-002 — Rooms and editable floor plans

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Managers arrange rooms, indoor/outdoor areas, bars and numbered tables with shapes, seats, accessibility and joinable combinations. Changes are previewed against future commitments; retired tables retain history and live occupancy is visible without manual page reload. Before richer table attributes ship, preserve FLOOR-009 direct move/swap/lock fit, access and history obligations. Rooms have indoor, outdoor or bar types; numbered tables use round, square, rectangle or bar shapes, exact access tags and percentage positions within a room. A floor-change preview lists every affected commitment, replacement, conflict and disabled combination; a manager approves the exact venue, rooms, floor, services, observations and bookings snapshot. Active commitments retain their room, confirmed times, fit and access needs. Locked assignments must be unlocked explicitly; arrived, seated or unbussed parties must be resolved before retirement. Retirement removes a table from new availability and selection, disables its joins and keeps the table plus historical bookings and attributed replacement history. Open host devices check the authorized floor version every three seconds and update without a page reload; focused or unsaved forms defer replacement and show the pending change, and failed checks show an unavailable warning. FLOOR-008 inherits offline reconciliation and richer synchronization; FLOOR-004 inherits sections, server capacity and serving history. and future allocation doors inherit retirement, fit and access guards before shipping (BOOK-002, BOOK-005, DIST-001–DIST-004, VOICE-001, AGENT-001).

**Acceptance.**
1. Draw dining room and patio, retire a booked table with an approved replacement, book both areas and watch occupancy update on a second host device.

#### FLOOR-003 — Approved table combinations

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Managers explicitly permit which adjacent tables can join, their combined capacity, accessible fit and setup buffer. Allocation cannot combine distant or incompatible tables merely because their seats sum to the party size. Before explicit join definitions ship, enforce FLOOR-009 permitted combinations on direct and prepared moves as well as all booking doors. Managers confirm adjacency explicitly for an exact set; joins can cross named areas only when explicitly approved, while a booking’s required area must match every constituent. Approved capacity is an integer no greater than the constituent seats, and every approved access tag must exist on every constituent. Setup is 0–120 whole elapsed minutes immediately before arrival, within the service, with half-open occupancy from setup start through the preserved turn/reset and any ongoing overrun; single tables need no setup. public search/booking, staff walk-ins, waitlist seating, direct move/swap/lock and prepared assignments all enforce these definitions. Active booked/seated commitments freeze join settings and setup; disabling prevents new assignments while preserving those commitments, and structural edits wait until they finish. Changes to join configuration invalidate prepared publication or reassignment review. Future booking doors (BOOK-002, BOOK-005, DIST-001–DIST-004, VOICE-001, AGENT-001) inherit exact joins and full setup before shipping.

**Acceptance.**
1. Permit T1+T2 but prohibit T1+T8; request six guests, verify the permitted join is used and reject a host attempting the prohibited join.

#### FLOOR-004 — Server sections and fair covers

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Managers create shift-specific sections, assign servers and tables, record breaks and cap covers per server. Hosts see seated/expected covers and rotation, while reassignment preserves the serving history and checks kitchen and server capacity. Before server sections ship, expose assigned server filtering in the FLOOR-005 timeline and enforce FLOOR-009 server capacity and serving history on moves. Servers are named shift roster entries, not new sign-in roles. Each table belongs to at most one section per service, and an assignment or join must fit wholly within one section once sections are configured. Server and configured kitchen-area caps count overlapping booked or seated dining covers in half-open arrival-to-forecast-departure intervals; setup and cleanup still reserve physical tables separately. Ongoing seated parties remain counted past forecast departure. Expected covers total the shift’s booked and seated parties; seated covers total its currently seated parties, with exact booking drilldowns and missing seating history labeled. Each party counts against every kitchen area containing its assigned tables. Breaks exclude new assignments and seating, while an existing seated party can retain its server during a same-section move. Rotation considers a requested party size and live fitting tables, breaks and caps, then orders eligible servers by seated covers, oldest last seating (never seated first) and stable server id. Active section mappings cannot silently change; move or finish affected parties before changing their mapping. New reservations, walk-ins, waitlist seating, status reacquisition, direct moves/swaps, reviewed proposals and retirement replacements all enforce these capacities and retain attributed serving events. FLOOR-008 inherits offline staffing reconciliation, ROLE-003 inherits server-specific sign-in visibility, and SERVICE-005/007 inherit wider interval pacing and permitted overrides; BOOK-002/005, DIST-001–DIST-004, VOICE-001 and AGENT-001 inherit staffing constraints before their new doors ship.

**Acceptance.**
1. Assign two sections and servers, seat uneven parties, put one server on break and move a table; verify cover totals, suggested rotation and attributed service history.
2. SERVICE-007 carries signed, reasoned exceptions to the configured concurrent kitchen-area cap; server caps and breaks remain hard.

#### FLOOR-005 — Timeline and overdue turns

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** A searchable day/service timeline shows arrivals, assigned tables, expected/actual seating and departure, cleanup, late arrivals and overdue turns. Hosts zoom or filter by room/server and resolve an overrun by moving the next arrival in one host action (FLOOR-009) or accepting a proposed replacement, never silently moving a confirmed reservation. observations are staff-recorded, not POS verification. An extension changes only the expected departure, retains the originally confirmed seating/departure/reset and appends actor, receipt time, prior/new forecast and reason; no reservation moves until a separate direct host command or agent proposal runs under the company's policy for commitment. The original cleanup duration follows the extended forecast, and an ongoing seated party remains physically occupied even past its forecast. Late means an actual arrival after the promised start, or an unarrived booked party past that start; overdue means an ongoing seated party past expected departure. Raw elapsed minutes are returned, while labels round to the nearest minute. The inclusive next window is now through now plus the selected elapsed minutes; seated/due/average totals use the displayed filtered parties. Average actual turn is the mean corrected seating-to-completed duration for parties actually completed today in venue time; missing actual timestamps are excluded and an empty mean stays unknown. Each total opens its exact party ids. Search matches guest name/contact, reservation id, service and tables without changing identity. The selected date is the venue-local service-start date. room/area and time-scale filters work on existing tables; FLOOR-004 inherits populated server assignments and server filtering before sections ship. Corrections retain both original observations and restored facts.

**Acceptance.**
1. Seat a late six-top, extend its actual turn and inspect the collision with the next arrival; move the next arrival to a fitting replacement as a host in one action and read both histories.
2. The host header shows seated covers now, covers due within a configurable next window and the average actual turn so far today, each opening its parties.

#### FLOOR-006 — Service statuses and handover

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Hosts manage confirmed, reconfirmed, arrived, partially arrived, seated, ordering, check open, paid, clearing, completed, late, canceled and no-show states. Status changes carry timestamps and actor; POS observations cannot falsely mark a dirty table ready. owner/admin staff and owner-granted FLOOR-009 hosts record service observations; ROLE-003 carries further host/server rights before those roles ship. observations are explicitly staff-recorded, including paid, which does not claim a POS payment. POS-007 inherits all status, timestamp, dirty-table and correction obligations before connected observations ship. Service and floor histories append the actor and server receipt time; a correction requires a reason, restores only the latest observation’s prior state and retains both rows, refusing physical clashes. Paid and completed leave the table needing bussing; only staff ready permits another seating. Future online reservations still use the promised turn/reset, and ready never shortens that protected interval. Floor timers show elapsed whole minutes since the last course/floor change; missing legacy observations are labeled not recorded. A read of shift handover shows current stages and their full observations, including corrections.

**Acceptance.**
1. Run a reservation from arrival through paid and clearing to ready, correct an accidental state with a reason and inspect the next shift’s handover.
2. The floor plan marks each table reserved, seated, mains, dessert, check dropped or needs bussing with a timer since its last transition, from host taps or POS signals (POS-007), and a legend names the same states.

#### FLOOR-007 — Busy-service search and shift handover

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Hosts find guests, bookings, phone numbers and table labels quickly, filter by service/source/status and see VIP, allergy, access and unpaid-policy alerts with PAY-010 deadlines.

**Acceptance.**
1. Find an arriving guest by phone suffix.
2. Current timeline search uses GUEST-002 case/accent-normalized name/email and normalized US phone suffix matching, plus case-insensitive booking-ID, service-name and table-label substrings.
3. Venue-local service-start date, service, source and booking-status filters combine; an empty filter includes every value.
4. It displays existing VIP/regular facts, guest-supplied allergy/accommodation requests and required table access/area, without certifying food safety or claiming a payment.

#### FLOOR-014 — Owned guest requests and shift callbacks

*Tier:* Core · *From:* FLOOR-007 · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** A handover lists unresolved guest requests, late parties and promised callbacks with owners and due times. Completing a follow-up records an operational outcome without marking a deposit paid.

**Acceptance.**
1. Resolve an arriving guest’s access request, hand over an unpaid deposit exception and prove the next host can complete the promised callback.
2. An active owner-granted host or a manager creates a follow-up and assigns it to themself or another active host or manager.
3. A host reassigns only items they hold; a manager reassigns any.
4. The current assignee or a manager completes it.
5. Every active host and manager sees each open item's kind, booking, guest, due time, assignee and state. Free text is shown only to managers and the current assignee; preparation keys have no free-text scope, while an agent's sensitive read remains bounded by its sponsor's assignment and the company's policy, and leaves the SEC-002 stand page on lock or switch.

#### FLOOR-008 — Concurrent devices and operational outage

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Host devices reconcile live changes, identify stale edits and show the last successful sync. Live reservation-book updates keep a page-local new-arrivals baseline. Outage sheets, captured work, expiry and offline restart are FLOOR-015 to FLOOR-018.

**Acceptance.**
1. With the reservation book open on one device, make a booking from the guest page and see it arrive within seconds with a “new since” count and marker, without a reload and without overwriting a stale edit.
2. The live reservation book counts and marks reservations absent from the first successful state snapshot of that open staff page, scoped to the selected service.
3. Unrelated updates, assignment changes and explicit refresh retain that baseline; reopening the page starts a fresh baseline.
4. The count includes every current reservation status and source, with no persistent guest or browser tracking.
5. Focused or unsaved forms defer replacement and show the pending change; sync failures show an unavailable warning and the last successful sync remains visible.

#### FLOOR-015 — Per-person encrypted outage service sheet

*Tier:* Core · *From:* FLOOR-008 · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Under the owner’s explicit, audited, revocable venue setting, owners, active managers, granted hosts and ROLE-002 seating leads use outage mode on a personal session or registered SEC-002 stand. Owner-only mode remains available. Servers, finance, plain members and group admins have no outage-sheet scope. Offline device interaction is not an agent tool; preparation keys have no execution scope.

**Acceptance.**
1. Enrol a separate outage passphrase of at least 16 characters while online; wrap the sheet key for that person and audit enrolment. No shared passphrase or stand PIN supplies an offline key.
2. Read no more than the host projection: booked guest name, short booking reference, last four US-phone digits, party size, arrival/reset end, tables, section, server, status, required access and unverified guest-supplied allergy/dietary/access requests.
3. Find no email, full phone, guest notes, tags, VIP level, visit count, occasion, preferences, deposit/payment state or other-service values. An erased guest is only “Erased guest”.
4. Attribute offline unlock, capture and discard to the unlocking person as device-attributed until a person with live authority signs reconciliation.
5. Record each sheet preparation’s person, device, service, expiry and field-scope version; offline reads themselves cannot be server-audited.

#### FLOOR-016 — Captured outage actions and exact reconciliation

*Tier:* Core · *From:* FLOOR-008 · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Staff retain pending outage work without changing live inventory. Reconnection is a separate exact decision against the live floor and normal authority; capture time remains a device observation.

**Acceptance.**
1. Seat from two tablets, disconnect one, record a pending walk-in and reconnect after its table is sold; refuse silent overwrite and reconcile to a different table.
2. Capture walk-ins, pending reservations, waitlist adds, seat-existing and arrived/finished/no-show actions with a unique action id, device time and capturing person. Pending reservation/queue names and one typed contact use the same encryption and expiry.
3. Under the held company policy, a person with current authority reviews the floor and exact alternatives and signs a five-minute review bound to actor, action and floor version. Agent reconciliation carries commitment under the company’s policy.
4. Recheck seating, access, turn, combination, hold, pacing and staffing, then commit atomically through the normal door once, including replay after lost response or erasure. Hard conflicts remain refused.
5. Only SERVICE-007 grant holders may use its reviewed pacing exception. Record an already-departed party only through an exact “already finished during outage” decision with labelled device-observed times.
6. Read commit history with action id, capturing and reconciling people, capture time, original/final tables and conflict; retain reconnect discard and expired-unreviewed counts.

#### FLOOR-017 — Outage sheet expiry and key clearing

*Tier:* Core · *From:* FLOOR-008 · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** An outage sheet expires at the earlier of twelve hours or one hour after service end, with a visible unresolved-work warning and truthful expiry history.

**Acceptance.**
1. Delete at the next activity or unlock after expiry, when the last action is reconciled/discarded, and at the next online contact after sign-out, session revocation, host-grant removal, device revocation or owner disablement.
2. While online, show a persistent warning before unreviewed work expires; the next online contact after such expiry records only its count and creates a manager-visible FLOOR-014 follow-up.
3. Lock after five idle minutes on a personal session; on a stand apply SEC-002’s stricter two-minute lock and every switch. Leaving the page clears its key.

#### FLOOR-018 — Offline restart of the locked service sheet

*Tier:* Core · *From:* FLOOR-008 · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** An installed offline application shell can open the locked service sheet without a connection.

**Acceptance.**
1. Reload and restart with no connection, open the locked sheet, unlock through FLOOR-015 and capture work without applying it to the live floor.

#### FLOOR-009 — Direct host table moves, swaps and locks

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** A host or manager moves a booked, arrived or seated party to a free fitting table or permitted combination, swaps two parties’ tables, or locks an assignment, each in one direct action (drag on the floor plan or timeline, or Change assignment on the reservation) on tablet, phone and web. No manager approval is needed. At commit each action checks the live floor version, physical fit, overlapping turns, permitted joins and required access needs, refuses a move into an occupied or clashing table with the reason, and writes one audit row with actor, before/after tables, time and optional reason. A locked assignment is never changed by automatic allocation, reflow or agent proposals until a person unlocks it. Preparation keys keep PLAN-001 preparation scope; an agent's execution of a move carries commitment and the company's policy decides it. The owner grants or revokes the venue host capability for an active native member; native account roles remain unchanged. Hosts use direct assignment, service-observation and WAIT-002 intake/party-update commands, never proposal approval, venue administration or bulk guest export. Every direct assignment command requires the exact current floor version. Current combinations must stay in one dining area and each selected table must contain every exact required access tag recorded on the booking. FLOOR-002 and GUEST-003 inherit richer table/access attributes; FLOOR-003 inherits explicit permitted adjacent joins and setup buffers; FLOOR-004 inherits server capacity and serving-history constraints before those capabilities ship. and future allocation and agent doors must retain locked assignments until a separately authorized unlock; an agent unlock carries commitment under the company's policy, and direct moves or swaps also need an unlocked assignment. An atomic swap validates the final two-party floor, then writes one audit row containing both parties. Assignment reasons and guest-linked access tags follow DATA-002 erasure.

**Acceptance.**
1. Signed in as a host, not a manager, move a seated four-top to a free fitting table, swap two booked parties and lock a third assignment, each in one HTTP command and one floor-screen gesture at 1440 and 390 widths; read the three audit rows.
2. Refuse a move into an occupied table and into a table whose next turn clashes.
3. Book a new party and prove automatic allocation leaves the locked assignment untouched.
4. Prove a preparation key can still only prepare a `table.assign` proposal.

#### FLOOR-010 — Counter seats and unassigned bar pools

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Managers define bars and chef’s counters as seat-level inventory (a 10-seat counter where a two-top takes 2 seats, adjacent where required) and lounge or bar areas as unassigned cover pools with their own pacing and turn times. Counter seats are chosen at booking or assigned at arrival; a pool reservation holds covers without a table until the host seats it. Seats and pools share the one capacity ledger, turns and pacing with tables, and hosts can move a pool or counter party to a table under FLOOR-009. Before counter seats or pools ship, include their assignments on FLOOR-012 screen, print and PDF and assert the chef’s-counter acceptance there.

**Acceptance.**
1. Define a 10-seat counter and a 20-cover lounge pool; book five two-tops at the counter and refuse a sixth for the same turn; seat two adjacent counter guests and prove those seats are not sold twice across overlapping turns.
2. Book a lounge reservation, seat it at assigned bar seats on arrival and then move it to a table, reading pool and table occupancy after each step.
3. inventory settings and identities are immutable for history.
4. Counter units are physical one-person seats; pool units are anonymous cover holds, not physical seats.
5. Pool inventory requires explicit area selection; hosts assign physical seats before seating, then may transfer to a table while retaining confirmed times and required access.
6. Transfers refuse a destination requiring a longer turn.
7. Counters count individually in physical-seat utilization; anonymous pool capacity is reported separately. Existing correction histories and immutable report publication apply.

#### FLOOR-011 — Late arrivals, holds and the no-show workflow

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Past a configurable grace time a booked party shows as late on the floor and timeline. A host (or the service agent inside a company's policy) logs each contact attempt, an outbound call or text, against the booking with its outcome: answered, no answer, voicemail, delivered or failed. When a guest says they are running late, the table is held to a stated time only if the next turn on it allows; otherwise the host sees the clash and the fitting alternatives. A person marks the no-show; the timeline records each step with actor and time, the party’s capacity returns to the shared ledger, the PAY-004 fee policy runs on recorded consent and the freed table is offered to fitting waiting parties under WAIT-004 with a stated hold window. A guest who arrives after release is seated at the next fitting table, never over a reassigned one.

**Acceptance.**
1. Book a four-top for 7:15, reach the grace time with no arrival, log two unanswered calls and mark the no-show at 7:30 as a host; read the timeline with each step, actor and time; verify the table returns to availability, one PAY-004 fee is recorded and a fitting waiting party receives a table-ready text with its hold window and is seated.
2. Text “running 15 late” for another booking and verify its table is held to the stated time; refuse an extension that would clash with the next booking on that table.

#### FLOOR-012 — Printable pre-shift sheet

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Before service a host or manager opens one sheet for the service date, printable from the browser, downloadable as PDF and readable on host devices. It lists the guests to know (VIP and regular status with visit count, occasion, declared allergies and access needs from GUEST-003, seating preference and the notes the viewer’s role may see), deposits and card guarantees held with amounts (PAY-002, PAY-003) and unpaid PAY-010 deadlines, the server sections with their tables and expected covers (FLOOR-004), the pacing limits (SERVICE-005) and the kitchen notes of FLOOR-019. It reflects bookings and changes up to the moment it is opened and shows when it was generated. Roles without rights (ROLE-003, ROLE-004) never see restricted notes or contact details on it, and erased guests (DATA-002) never appear with personal values.

**Acceptance.**
1. Prepare a Friday with a shellfish-allergic anniversary regular, an eight-top with a deposit and a chef’s-counter booking; open the pre-shift sheet as manager and print it to PDF; read each guest’s flags, deposit and section; change a booking and reopen to see the change and a new generated time; open it as a server and find restricted notes absent; erase one guest and prove a new sheet holds none of their values.
2. owner/admin get the full current sheet; owner-granted hosts get names, VIP/regular level, recorded attended visit count, occasion, unverified guest-supplied dietary/allergy/access requests, seating preferences, table/section/server and pacing only.
3. Hosts receive no contact, guest notes or tags.
4. Plain members and preparation keys are refused.
5. One server-side projection feeds HTML, print and on-demand PDF; no sheet or PDF is stored.
6. The date is venue-local; every service starting on that date is included, with current non-canceled/non-no-show bookings and a generated instant.
7. Erased guests show only “Erased guest”, time, party size and table.
8. Saved deposit requests show protection state and their pay-by deadline in the live sheet, print and PDF for managers and hosts; only server-verified paid state establishes protection. No card guarantee or held-deposit amount is inferred; PAY-002 and PAY-003 retain their amount/guarantee duties. Before their capabilities ship, PAY-002, PAY-003, PAY-010, FLOOR-013, GUEST-003, FLOOR-010, ROLE-003 (server acceptance step) and ROLE-004 each inherit their full sheet duties and acceptance in both documents. The deposit eight-top, chef’s-counter and server acceptance steps remain binding in those receivers; proof uses an ordinary eight-top, guest-supplied requests and a granted host.

#### FLOOR-013 — Service notes and kitchen notes

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Managers attach free-text shift notes (for example “regular booked Thursday, seat in Ana’s section”) and kitchen notes to a service date. Every host device and the pre-shift sheet (FLOOR-012) show them, and edits keep author, time and history. Before service notes ship, feed current authorized shift/kitchen notes into FLOOR-012 through its one server-filtered projection for screen, print and PDF.

**Acceptance.**
1. As manager add the kitchen note “Halibut: 12 portions” and a shift note; as host open the floor on a second device and read both; edit the note and read author, time and history.
2. FLOOR-013 must add DATA-003 CSV/archive coverage, DATA-001 restore validation and DATA-002 erasure before shipping.
3. Service-date notes use the venue-local date on which the service starts. Owner/admin write notes; owner/admin and granted hosts read shift notes. Note edits append text, actor and instant history; hosts receive live changes.
4. Notes and history export in business CSVs and structured archives with validated dates, shapes and relationships. Erasure clears shared note text and history on the erased guest’s booked service dates and redacts corresponding audit snapshots; anonymous dates, actors and instants remain.

#### FLOOR-019 — Kitchen workload and declared needs

*Tier:* Core · *From:* FLOOR-013 · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** The kitchen view of a service shows the arrival pacing limit and covers expected per interval (SERVICE-005), large parties, counts of dishes, add-ons or tasting choices that guests supplied at booking (BOOK-007, EXP-002) totaled by item, and each declared allergy and access need by table (GUEST-003) with no diagnosis and no statement that food is safe. Counts come only from guest-supplied booking data or manager entry and say which; Placemat never estimates portions.

**Acceptance.**
1. Read each declared allergy and access need by table beside the arrival pacing limit; open the kitchen as a server and find only that server’s section allergies.
2. Kitchen totals and covers include booked, seated and completed reservations, excluding cancelled/no-show parties; large parties are eight or more.
3. Owner/admin, granted hosts and plain members read the identity-free kitchen view; preparation-only keys have no kitchen scope. The kitchen offers live updates and explicit refresh.
4. Kitchen allergy/access fields are unverified guest-supplied requests by table, with no guest identity/contact fields, diagnosis or safety claim. GUEST-003 supplies declared and acknowledged sources.
5. Paid/ticketed add-ons and tasting choices receive item/source totals and sheet coverage through EXP-002; ROLE-003 supplies server sign-in with own-section allergies.

#### FLOOR-020 — Unpaid dish pre-orders and source totals

*Tier:* Core · *From:* FLOOR-013 · *Cites:* BASE-ROLE-001, BASE-AUDIT-001, BASE-INPUT-001 · *Rules:* D-2, D-3

**Requirement.** Ordinary reservations capture unpaid dish pre-orders from a manager-published per-service list. Paid or ticketed add-ons belong to EXP-002.

**Acceptance.**
1. Publish halibut, collect a pre-order on three bookings and see the item total with its source.
2. Withdraw a dish, refuse new requests for it and retain previous quantities and the original item name.
3. Guest-supplied integer quantities and manager-entered counts are shown separately, never estimated or treated as a paid order.
4. Owner/admin publish dishes and counts; lists, counts and quantities export in CSVs and structured archives with relationship validation.
5. Erase a guest and clear their booking quantities and needs while retaining anonymous stock facts.

### Waitlist and cancellation demand

#### WAIT-002 — Remote and walk-up joining

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** Guests join by QR, website or host intake, state party size, preferred time/area, access needs and contact consent, receive a secure queue-status link and leave or update their party. Duplicate active entries are explained; online joining can be paused independently of staff intake. The QR and website open the same queue public door; joining reserves no table. An online join requires email for the existing normalized exact-email guest lookup, while staff intake can record a guest without email. Same name or phone never merges people. An active duplicate means the same existing guest id in the same service in queued, offered, accepted or arrived state (including legacy waiting); public refusals give one generic next action without disclosing contact existence. Each intake returns a new private status link once; 32 random bytes form the bearer and only its SHA-256 digest is persisted. The fragment link scopes read, update and leave to that one entry, never guestbook/contact/history reads; rotation replaces its hash and immediately invalidates the old link. The guest saves/copies the link: no email or text send is claimed. Online pause is an owner/admin service setting and affects new public joins only; owner-granted hosts can add a staff party or change its party preferences while paused, but cannot pause intake, approve plans, administer the venue or export guests. Public-created entries and no-phone follow-ups have an active native owner; guest actions are labeled guest-supplied, not verified identity. Preferred times are offset instants inside the service (start inclusive, end exclusive), preferred areas name existing areas, and declared required access tags are exact case-sensitive strings carried into capacity-checked seating and FLOOR-009 assignment. Preferences do not promise a table. Contact permission is an explicit optional boolean for this queue, independent of marketing and of joining; changes keep source, actor and receipt time. SERVICE-004 channel checks govern public join/update and SERVICE-006 full-turn/reset checks still govern actual seating. Resolved entries remain readable by their link but cannot be changed or rotated. DATA-002 erasure clears the link hash and guest-linked preference/contact-permission/history values; the link then returns the same generic unavailable response as an unknown link, while anonymous timing and accountability remain behind existing restore fences.

**Acceptance.**
1. Join by phone QR and staff intake, refuse a duplicate, change party size and pause online intake while allowing a host entry.
2. WAIT-002 queue intake stays open at pacing caps, labelled “queued only; no table or time promised”; pacing is enforced when a person seats, books or allocates from the queue.

#### WAIT-003 — Quoted waits and queue updates

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** Hosts quote a range with timestamp and basis, distinguish reservation requests from same-day walk-ins and update guests when the estimate changes. Queue order accounts for fit and promises with a visible reason; never label a forecast as a guaranteed table.

**Acceptance.**
1. Quote 20–30 minutes, delay a turn, revise the range and inspect the delivered update and guest status; seat a later fitting two-top while documenting the six-top’s retained priority.

#### WAIT-004 — Table-ready conversations and offer expiry

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** A fitting party receives a table-ready SMS with reply/arrival window and status link. Yes, no, late, free-text and unanswered replies reach the host; expiring an offer releases its hold before the next party is offered it.

**Acceptance.**
1. Notify two matching parties sequentially; let the first expire and have both reply yes together, proving only the still-valid offer seats and the other receives a clear response.

#### WAIT-005 — Future cancellation notifications

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** Guests request alerts for sold-out dates, party sizes and experiences separately from the live queue. Managers control offer priority, eligible inventory and response windows; notify requests expire or stop on opt-out and fulfilled requests close automatically.

**Acceptance.**
1. Request Saturday experience availability, cancel one ticket, notify eligible guests in the configured order and turn the accepted offer into one paid reservation.
2. Cancel a same-day table and verify the freed table is offered to fitting waiting parties and notify requests in the configured order, and the book shows how many tables were offered and how many were filled.

#### WAIT-006 — Waitlist accountability

*Tier:* Core · *Cites:* BASE-INPUT-001, BASE-PUBLIC-001, BASE-ROLE-001 · *Rules:* D-2, D-3

**Requirement.** Hosts see queued, offered, accepted, arrived, seated, declined, expired and abandoned states with wait quoted versus realized. Manual priority changes, no-contact parties and missed offers have reasons and owners; service close resolves every remaining entry. owner/admin staff manage queue statuses, quotes, priority, seating and close; owner-granted WAIT-002 hosts may add intake and update party preferences. ROLE-003 carries broader host queue rights before they ship. Offers and replies here are explicitly staff-recorded observations, never claimed provider sends or table holds; WAIT-004 inherits actual delivery and expiring inventory holds before shipping. New entries record intake time; quoted ranges retain basis and observation time. Actual wait is elapsed intake-to-seat or intake-to-terminal-disposition minutes (shown rounded to the nearest tenth); legacy missing intake times remain unknown. Higher numeric priority sorts first and changes keep the acting manager, reason and prior value. Closing the service expires offered/accepted entries and abandons other unresolved parties, retaining seated history and assigning follow-up; new booking/intake doors refuse the closed service. Queue text follows DATA-002 erasure.

**Acceptance.**
1. Close a shift containing an unanswered offer, a no-phone party and a seated party; inspect dispositions, actual waits and assigned follow-up with no unresolved ghost offers.

### Delivered communications and follow-up

#### MSG-002 — Twilio SMS and WhatsApp connection

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6 · *Register:* R-5

**Requirement.** Owners connect a venue’s Twilio sender with US A2P registration and WhatsApp business/template approval where required. Signed inbound/status webhooks attach provider IDs to guest threads; sender setup distinguishes pending, failed and usable channels.

**Acceptance.**
1. Connect approved test senders, send a table-ready SMS and WhatsApp template, ingest signed delivery/reply events and reject a forged webhook; surface unregistered sender failure to the manager.

#### MSG-003 — Resend email connection

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6

**Requirement.** Owners verify a sending domain with Resend, configure reply routing and receive signed delivery, bounce and complaint events. Transactional guest mail uses the restaurant’s identity, safe templates and recorded provider outcomes; authentication mail alone does not count as booking delivery.

**Acceptance.**
1. Verify the domain, send a booking email to a controlled mailbox, reply to it and process bounce/complaint callbacks; show the guest thread and delivery state without leaking secrets.

#### MSG-004 — Booking and cancellation delivery

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6

**Requirement.** Reservation creation, meaningful changes and cancellation automatically enqueue the selected SMS/email notices with local time, party size, policy, location and manage-booking link. Capture queued/sent/delivered/failed outcomes independently; a booking stays visible if delivery fails.

**Acceptance.**
1. Book online, modify and cancel; inspect three distinct provider receipts and the guest’s messages, then fail one delivery and find a staff follow-up without a duplicate booking.

#### MSG-005 — Scheduled reminders and reconfirmations

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6

**Requirement.** Managers set reminder offsets, preferred channels, quiet hours and reconfirmation deadlines per service. Guests reconfirm or cancel by link or by replying C or X to the SMS; replies resolve against that guest’s active booking through MSG-006 and an ambiguous reply goes to the host. Jobs stop for cancellation, avoid repeats after restart and record confirmed/unanswered/failed outcomes with a host queue before service.

**Acceptance.**
1. Schedule a 24-hour reconfirmation and 2-hour reminder, confirm one booking by link and another by replying C, cancel a third by replying X and restart the scheduler; verify correct recipients, no repeats and an owned unanswered task.

#### MSG-006 — Unified two-way guest inbox

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6

**Requirement.** Hosts read and reply to email, SMS and WhatsApp in one guest/reservation thread, assign conversations, set due times, use templates and resolve/reopen them. Incoming replies to old bookings are clearly labeled; two staff cannot unknowingly answer the same active claim.

**Acceptance.**
1. Receive a late-arrival text, assign it to a host, reply from the inbox, receive an email follow-up and resolve it; verify both channels and reservation context in one history.

#### MSG-007 — Delivery retry and failed-contact ownership

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6

**Requirement.** Provider timeouts, throttling, bounces and unknown outcomes have bounded retry and idempotency rules. Unknown sends are reconciled before retry, permanent failures create an assigned contact task, and alternate channels require appropriate permission rather than bypassing opt-out.

**Acceptance.**
1. Timeout after a provider accepts a send, replay its callback and restart the job; prove one message, then bounce another address and complete the assigned phone-contact task.

#### MSG-008 — Consent and US messaging policy

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6

**Requirement.** Store transactional and marketing permissions separately by channel, venue, purpose, source and time. Honor STOP/HELP, unsubscribe, suppression and quiet hours immediately across imports, jobs and agents; keep policy evidence and never infer marketing consent from a reservation.

**Acceptance.**
1. Book without marketing consent, attempt a campaign, then opt in and send; reply STOP while another job is queued and prove the queued send is suppressed without losing booking management.
2. GUEST-004 inheritance: permissions remain tied to their own email/phone and channel, venue and purpose; a merge never grants unknown permission or overrides the more restrictive value or suppression.
3. Prove this on every future provider/job/agent send door.

#### MSG-009 — Templates and guest communication preferences

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6

**Requirement.** Managers preview and version restaurant-branded templates in supported guest languages with accessible text, US date/phone conventions, exact cancellation terms and safe substitutions. Guests can select supported channels; missing translations and unusable contacts become explicit tasks.

**Acceptance.**
1. Preview and deliver an English/Spanish reminder with long names and special characters, then change the template; prior messages retain their actual rendered content and policy version.

#### MSG-010 — Guest text actions: confirm, reschedule and captured requests

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6

**Requirement.** Reminder and confirmation texts carry plain reply actions: C confirms, R starts a reschedule and X cancels (MSG-005 defines C and X; this clause adds R). Replies resolve against the guest’s active booking. R sends a scoped manage-booking link (BOOK-004) offering nearby times (BOOK-003) and reaches a host when none fits. A free-text reply that states an occasion or request (“It’s our anniversary, candle on dessert”) is stored on the booking as a guest-supplied tag and note with source, time and the original text, shown to hosts and on the pre-shift sheet (FLOOR-012); a host can correct or remove it. A reply that states an allergy or access need goes to the host as an unresolved request to acknowledge and record under GUEST-003, never as a silent tag, and no reply creates a diagnosis or marketing consent. Anything ambiguous goes to the host inbox (MSG-006).

**Acceptance.**
1. Send a reminder; reply “C! It’s our anniversary, candle on dessert” and verify the booking is confirmed with an anniversary tag and candle-on-dessert note sourced to the guest reply; reply R on another booking and complete a reschedule through the link; reply “I’m allergic to shellfish” on a third and verify it reaches the host as an unresolved request rather than a structured allergy; reply STOP and verify no further send (MSG-008).

#### MSG-011 — Instagram and Facebook direct messages

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-OPS-003, BASE-OPS-004, BASE-ROLE-001 · *Rules:* D-6 · *Register:* R-4

**Requirement.** Owners connect their Instagram professional account and Facebook Page messaging through Meta’s approved messaging API. Direct messages arrive in the guest and reservation thread of MSG-006 with the account, time and provider message ids. Hosts, and under the company's policy for external and commitment calls the service agent (AGENT-001), answer inside Meta’s messaging window. A booking made in a DM uses the shared live inventory, carries the social source (DIST-004) and is confirmed in the same thread and the guest’s chosen channel. Outside the window, or where the account type lacks access, the sender gets an explanation and a booking link rather than silence; a revoked or unauthorized connection shows as an owned setup task.

**Acceptance.**
1. Connect a Meta test page, receive a DM asking for a table for two, reply from the inbox with 9:15 at the bar and book it; see one booking assigned to the bar with source Instagram and the confirmation in the thread.
2. Let the window lapse and verify the reply is refused with a booking-link fallback; deliver a replayed webhook and find one message; revoke the connection and find an owned task.

### Payments and table protection

#### PAY-001 — Stripe merchant connection and token custody

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006, BASE-OPS-003 · *Rules:* D-4, D-5 · *Register:* R-10

**Requirement.** The restaurant connects its own Stripe account for USD charges, deposits and refunds, completes merchant onboarding and sees capability/revocation state. Hosted fields/Checkout collect payment details; Placemat stores references and never raw PAN/CVC or merchant funds. The connection/capability fence follows RL-103 in RULINGS.md and PAY-003’s exact mandate and expiry rider.

**Acceptance.**
1. Connect a Stripe test merchant, collect a hosted payment method, inspect redacted product records and disconnect; existing obligations stay visible while new charges are blocked.
2. Under RL-103, explicitly connect the merchant, read verified capability state and revoke it; fence new collection and charge operations immediately. Connection or ownership supplies no guest mandate or later fee authority; restored records restore neither executable credentials nor consent.

#### PAY-002 — Deposits and partial prepayment

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006, BASE-OPS-003 · *Rules:* D-4, D-5

**Requirement.** Managers require fixed or per-person deposits by service, party size, experience or channel, disclose terms before checkout and link the receipt to one capacity-held reservation. Failures and abandoned checkout release holds; deposit balance is available for POS settlement. Before shipping, this capability inherits BOUND-001: each payment is tied to one named booking or event, shown as a balance against it and refunded under PAY-005; it is nontransferable, cannot be topped up and cannot be redeemed outside that booking or event or spent as a general balance. The interim workflow uses existing personal owner or native admin-manager authority to create fixed-USD or per-person booking-bound deposit requests and explicitly close collection. For a per-person request, preserve the original booking reference, party count, integer-cent USD rate, total and saved deadline; later booking or policy changes do not rewrite that request or authorize another collection through its original scope. Existing PAY-010 host authority, including a live authorized host PIN session, may issue or copy the saved request and use existing status-verification doors without acquiring request-setting, waiver, refund, payment-administration or ledger authority. Stripe retains payment credentials and money movement; Placemat retains restricted references and recorded outcomes, not PAN/CVC or merchant funds. Creating or copying a hosted link establishes neither delivery nor guest receipt or consent, collected money, bank settlement, POS credit, seating release or refund. Paid/protected claims require matching authenticated provider facts. PAY-002 pre-checkout disclosure, BOOK-004 financial-consequence consent, applicable PAY-003/PAY-004 agreement and MSG-008 channel-permission duties remain separate and binding. This slice authorizes no automatic send, reservation release, refund or seating settlement. Unresolved Checkout collection preserves the reservation; collection closure and any permitted booking cancellation remain separate explicit actions under BOOK-006. The complete original payment, refund, capacity, display and seating acceptance remains binding. Before deposits ship, FLOOR-012 shows held deposit amounts on its manager sheet and only amounts permitted by the receiving role policy; assert the deposited eight-top in its screen, print and PDF.

**Acceptance.**
1. Require a $25-per-person deposit for four guests, pay $100, retry the callback and inspect one paid booking; fail another payment and verify its table becomes bookable.
2. Each deposit held shows on the booking, the confirmation and the pre-shift sheet (FLOOR-012) with its amount, per-guest rate and the card’s last four digits, and states what happens at seating; seating the booking applies it to the check (PAY-008) or releases the hold exactly once and shows which.
3. Prove the inherited BOUND-001 boundary: inspect the booking/event-bound balance and PAY-005 refund, and refuse transfer, top-up, redemption against another booking/event and general-balance spending.

#### PAY-003 — Card guarantees and authorization expiry

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006, BASE-OPS-003 · *Rules:* D-4, D-5 · *Register:* R-9, R-10

**Requirement.** Guests provide a tokenized card guarantee or supported authorization with explicit no-show terms. The venue sees authorization expiry and recollection tasks; a saved card is not described as an indefinite card hold and the restaurant must use the approved mandate for later charging. Expiry restricts authority and creates none: ownership, owner attestation, a saved card or a successful setup alone never authorize a fee. The original booking, guest, dated service, arrival, party count, immutable policy, USD-cent amount and fixed or per-person basis remain binding; material changes need matching fresh agreement. Save a finite deadline no later than that dated service's absolute end instant and display it in venue time. Earlier revocation or an applicable guest or provider limit wins. Shortening the service permanently shortens authority; extending or rescheduling never extends saved authority. A violation before expiry permits no new charge attempt after expiry. A previously submitted reserved decision may reconcile its known provider operation after expiry without a replacement decision, key or charge; an uncertain operation without a known provider reference needs manual reconciliation once authority expires. Legacy unbounded authority expires on upgrade; missing or invalid expiry is refused or conservatively expired on restore. Historical archives restore neither credentials nor charging authority. Explicit recollection is attributable owner-held work for an upcoming active retained booking; it sends nothing, changes no expiry and establishes no renewal. Erasure fences, attributable history, role-safe sheets and DATA-001 through DATA-004 remain binding. BOOK-004, BOOK-006, PAY-004, PAY-010, MSG-008, FLOOR-012, GUEST-004 and AUDIT-001 retain their receiving duties. The merchant collection, guest mandate, manual authorization and explicit capture default is approved subject to the 25 October expiry riders. A personal owner explicitly enables collection; the guest accepts exact immutable booking-bound terms before hosted setup or authorization. Integer-cent USD authorization cannot exceed the agreed maximum fee. Authority ends at the earliest saved guest limit, dated service end, owner revocation or verified provider deadline, and later changes never extend it. A fresh explicit owner decision for a matching actual violation may capture only the original verified authorization within its permitted amount and deadline. Uncertainty reserves the original operation; it permits observation, not a replacement charge. Unconfirmed release retains the last verified held amount, and renewed authorization waits for confirmed release of the earlier hold and fresh applicable agreement. Recollection remains attributable owner-held work without an automatic message or renewed authority. Personal-owner restrictions on staff financial projections remain in force. The complete guarantee and permitted-fee acceptance remains binding; this ruling grants no completion or legal certification. Before card guarantees ship, FLOOR-012 shows held guarantee amounts only to permitted roles in the live sheet, print and PDF, without card credentials.

**Acceptance.**
1. Create a guaranteed reservation, expire an authorization and request renewed collection; prove an expired hold is not reported as protected and inspect guest consent to a permitted later fee.

#### PAY-004 — No-show and late-cancellation fees

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006, BASE-OPS-003 · *Rules:* D-4, D-5

**Requirement.** Versioned policies define cutoffs in venue local time, per-person/fixed fees, grace, exemptions and required evidence. Authorized people approve exceptional fees, waivers and disputes; normal policy execution uses recorded consent and cannot charge the same violation twice. Before shipping, PAY-004 adds charged and waived fee figures, with reservation drilldowns and CSV/PDF columns, to the REPORT-007 end-of-service snapshot fixed at close.

**Acceptance.**
1. Cancel before and after a DST-aware cutoff, mark a no-show, waive one fee and charge another through Stripe; replay requests and inspect one charge plus the deciding person and policy.
2. Close the service and reconcile the charged and waived fees in its REPORT-007 report, CSV and PDF.

#### PAY-005 — Full and partial refunds with notices

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006, BASE-OPS-003 · *Rules:* D-4, D-5

**Requirement.** Authorized staff preview refundable balances, select full/partial amounts and reasons, follow manager limits and submit one processor refund. Pending, succeeded and failed states reconcile from signed events; guest SMS/email receipts name amount, remaining balance and actual outcome. Before shipping, PAY-005 adds refunded fee figures, with reservation drilldowns and CSV/PDF columns, to the REPORT-007 end-of-service snapshot fixed at close. PAY-005 inherits ROLE-002: A limit is integer USD cents. No recorded limit means no refund authority, and owners are uncapped. It caps the sum of pending and succeeded refunds that person submits against one booking's charges, so splitting cannot exceed it. PAY-005 refuses an excess before any processor call. Only an owner sets limits, with AUDIT-001 before/after history.

**Acceptance.**
1. Refund $40 of a $100 deposit, replay its webhook, refund the remaining $60 and refuse a further cent; verify processor references, delivery receipts and failed-refund follow-up.
2. Refund a no-show fee and reconcile it in the closed service’s REPORT-007 report, CSV and PDF.

#### PAY-006 — Money ledger and processor reconciliation

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006, BASE-OPS-003 · *Rules:* D-4, D-5

**Requirement.** An immutable minor-unit USD ledger relates reservation, charge, deposit, fee, transfer, refund, dispute and payout references. Signed webhooks are deduplicated and out-of-order events reconciled; finance can resolve unmatched settlements without changing historical amounts. This neither enlarges nor withdraws ROLE-004's existing limited charge/refund finance read/export authority; scoped finance settlement reconciliation remains a contracted target. Payout import retrieves the complete provider settlement through read-only provider requests and reconciles USD gross, fees and net; incomplete or inconsistent retrieval establishes no reconciled payout. An attribution correction appends a separately identifiable human decision linking an existing unmatched transaction to an existing booking. It may change derived attribution, never historical amounts, currency, fees, net, processor references, payout snapshots or economic-event history. The original provider facts and the actor/time/source of the human decision remain distinguishable and inspectable, with AUDIT-001 before/after and reason-when-recorded duties. Attribution is not provider confirmation of an absent booking reference. It cannot hide an amount or lifecycle discrepancy, manufacture a balancing entry or make a financial difference disappear by marking an item matched. These doors grant no charge, refund, send, deletion or automatic provider-write authority. The complete original reference relationships, signed-event deduplication, out-of-order reconciliation, finance delegation, audit, portability, correction and DATA-004 retention obligations remain binding.

**Acceptance.**
1. Deliver refund before charge callbacks, duplicate both and reconcile a Stripe payout to its bookings, fees and net amount; correct an unmatched item with a new adjustment record.

#### PAY-007 — Tax gratuity and service-charge disclosure

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006, BASE-OPS-003 · *Rules:* D-4, D-5

**Requirement.** Experience checkout itemizes base price, add-ons, discounts, US sales tax through Stripe Tax or configured approved tax rules, mandatory service charge and optional gratuity. Guests see total before payment and receipts preserve the applied rates/basis; refunds reverse allocated amounts correctly.

**Acceptance.**
1. Buy two $95 tickets with add-ons, tax, service charge and tip, inspect line-level USD totals and partially refund one ticket including its allocated tax and eligible charges.

#### PAY-008 — Deposit redemption at the POS

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006, BASE-OPS-003 · *Rules:* D-4, D-5

**Requirement.** A seated guest’s eligible deposit/prepaid balance is handed to the mapped POS check with a stable redemption reference. Partial use, split checks, check voids and provider outages reconcile without double credit; unreconciled amounts remain in a finance queue.

**Acceptance.**
1. Seat a $100-deposit booking, apply $60 to one check and $40 to a second, void one check and reconcile; prove the guest never receives duplicate credit.

#### PAY-009 — Disputes and payment operations

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006, BASE-OPS-003 · *Rules:* D-4, D-5

**Requirement.** Managers receive failed-card, dispute and chargeback tasks with deadlines, consent/attendance/message evidence and processor links. They approve responses, review refunds and fee exposure, and export finance records for QuickBooks Online or the separate Pantry accounting product. Exact packet and submission authority follows RL-104 in RULINGS.md; DATA-004 governs evidence retention and PAY-003/PAY-006 govern financial authority.

**Acceptance.**
1. Open a test dispute, assemble the booking/policy/message evidence, approve a response and export its ledger to accounting; trace a rejected sync back to an owned task.
2. Under RL-104, approve the exact frozen packet revision and export least-data accounting facts. Restore leaves execution inert; response submission, refund, charge and retry each require their separately authorized current operation. Manager delegation and the full dispute and fee lifecycle remain required.

#### PAY-010 — Staff-requested card and deposit links

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-ROLE-001, BASE-AUDIT-001, BASE-DATA-006, BASE-OPS-003 · *Rules:* D-4, D-5

**Requirement.** When a host or manager creates or changes a phone, concierge, in-house or inquiry-converted reservation that a deposit or card-guarantee policy covers (PAY-002, PAY-003), Placemat sends the guest a scoped, expiring link by SMS and/or email to Stripe-hosted collection, showing the amount or guarantee terms, the policy text and a pay-by deadline in venue local time. Staff can resend, change channel or copy the link, and never key card numbers into Placemat. Until collected the booking shows as unprotected with its deadline on the floor, timeline and reservation list; a staff reminder task is created at a set lead time and an optional guest reminder is sent. At the deadline the venue policy either releases the table and cancels the booking with a delivered guest notice, or flags it for a person to decide. Paying before release marks the booking protected and links the receipt. A permitted role can waive the requirement with a recorded reason, and waivers are reported. Before payment requests ship, FLOOR-012 shows unpaid deadlines and protection state only to permitted roles in its live sheet, print and PDF.

**Acceptance.**
1. As a host, book a six-top by phone under a $25-per-person deposit policy; read the delivered SMS and email provider receipts carrying a link to Stripe-hosted test collection with a deadline; pay and see the booking marked protected with its receipt.
2. Book a second party and leave it unpaid: see the unprotected flag and the staff reminder task, advance past the deadline and verify the table is released, the booking canceled and the guest notified; replay a late payment callback and verify the booking is not resurrected without a person and the payment is refunded or flagged.
3. Waive a third party’s requirement with a reason and read its audit row.

### Experiences and ticketed dining

#### EXP-001 — Experience catalog and event inventory

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-OPS-003 · *Rules:* D-2, D-3, D-4, D-5

**Requirement.** Restaurants publish free, deposit-backed or fully prepaid dining experiences, tasting menus and one-off events with images, menu, dates, seating areas, ticket classes, quantity limits and cancellation rules. Experience inventory shares physical tables and pacing with ordinary reservations. Experience-specific turn duration, cleanup and last seating conform to SERVICE-006 before publication. Before this capability ships, its experience filter inherits BOOK-003 search, exact fit and stale-result reselect. catalog pricing describes required terms; free experiences book through the shared guest reservation and hold doors, while deposit and prepaid listings explicitly take no payment or reservation until EXP-002 supplies checkout. Class limits count guest covers per dated service, including active and completed reservations and live checkout holds. Experience dining time is a minimum with longer table, area and party rules preserved; cleanup uses the longer reset and last seating respects both policies. Frozen booking terms survive catalog edits. EXP-002 inherits these allocation, full-turn, reset, quantity and checkout-hold semantics before paid tickets ship.

**Acceptance.**
1. Publish a tasting dinner and a free patio event, book both beside normal reservations and prove the same table cannot be sold through two catalogs and that its experience-specific turn and reset fit SERVICE-006.

#### EXP-002 — Ticketed checkout and add-ons

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-OPS-003 · *Rules:* D-2, D-3, D-4, D-5

**Requirement.** Guests select ticket quantities and per-person dietary choices, wine pairings or other prepaid add-ons, see availability and an itemized USD checkout, pay through Stripe and receive a scoped ticket receipt. Limited add-ons have their own inventory and cannot be oversold. Ticket checkout fits its experience-specific SERVICE-006 turn and cleanup in the shared physical inventory. Before shipping, this capability inherits BOUND-001: each payment is tied to one named booking or event, shown as a balance against it and refunded under PAY-005; it is nontransferable, cannot be topped up and cannot be redeemed outside that booking or event or spent as a general balance. zero-charge ticket options use manager-published stable add-on identities, per-service stock shared across classes, and optional numbered guest dietary choices. Active holds and booked, seated and completed reservations consume stock; expiry, explicit abandonment and cancellation release it. Confirmed carts keep original quantities and names; erasure clears personal choices while retaining anonymous stock facts. Kitchen and pre-shift projections retain current role and server-section boundaries. Paid checkout authority follows RL-102 in RULINGS.md and PAY-001/PAY-003; publication alone grants none. EXP-002 retains its full paid acceptance and PAY-007 money allocation, BOUND-001 financial limits, PAY-005 refund and BOOK-006 processor recovery duties. Before experience checkout ships, it inherits BOOK-006 short-lived inventory holds, visible expiry, safe release and stable booking and payment recovery.

**Acceptance.**
1. Buy four tasting tickets with two pairings and one limited supplement, race the last supplement from another checkout and verify one sale plus accurate remaining capacity and an experience-specific SERVICE-006 turn and reset.
2. Prove the inherited BOUND-001 boundary: inspect the booking-bound or event-bound balance and PAY-005 refund, and refuse transfer, top-up, redemption against another booking or event and general-balance spending.
3. Paid or ticketed pre-order add-ons inherit guest-supplied item totals in FLOOR-013 and the authorized FLOOR-012 sheet before shipping; unpaid ordinary-reservation dish pre-orders remain FLOOR-013’s current duty.
4. Under RL-102, keep payment off until an authorized venue administrator explicitly enables a capable merchant connection and paid checkout policy. After enablement the guest creates and confirms the exact booking-bound hosted payment through checkout without a new personal-owner action for every cart; a catalog alone never authorizes charging.

#### EXP-003 — Experience guest management

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-OPS-003 · *Rules:* D-2, D-3, D-4, D-5

**Requirement.** Hosts see attendee names, purchaser versus attendee contacts, questionnaire answers, tickets, dietary constraints and paid balances, check guests in and manage authorized transfers or exchanges without duplicating seats or broadening consent.

**Acceptance.**
1. Transfer one ticket to a new attendee, exchange another to a later seating with a price difference, then check in by scoped ticket and refuse a reused ticket.

#### EXP-004 — Experience cancellation and event settlement

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-OPS-003 · *Rules:* D-2, D-3, D-4, D-5

**Requirement.** Managers cancel or reschedule an event with a preview of affected guests, refund/credit choices and outreach. Reports reconcile ticket sales, discounts, taxes, gratuities, fees, refunds, attendance and net receipts by event and seating.

**Acceptance.**
1. Reschedule one seating, refund guests who decline, notify all affected purchasers and reconcile the resulting attendance and settlement report to the Stripe ledger.

#### EXP-005 — Prepaid pickup experiences

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-OPS-003 · *Rules:* D-2, D-3, D-4, D-5

**Requirement.** Tock-style packaged dining/take-home experiences can sell a bounded pickup slot and optional add-ons with prepaid capacity, confirmation and pickup status, handing item fulfillment to the venue’s POS/order system. Full kitchen ordering and delivery dispatch remain separate systems. Before shipping, this capability inherits BOUND-001: each payment is tied to one named booking or event, shown as a balance against it and refunded under PAY-005; it is nontransferable, cannot be topped up and cannot be redeemed outside that booking or event or spent as a general balance.

**Acceptance.**
1. Publish a Thanksgiving take-home pickup experience, pay for a 4 p.m. slot, transfer its line items to the connected POS and mark pickup complete; reject a sold-out slot and refund a canceled order.
2. Prove the inherited BOUND-001 boundary: inspect the booking/event-bound balance and PAY-005 refund, and refuse transfer, top-up, redemption against another booking/event and general-balance spending.

### Guest relationships and repeat visits

#### GUEST-002 — Searchable profiles and structured preferences

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-003, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Hosts search normalized phone, email and name, maintain guest tags, VIP level, seating preferences and dated service notes, and see reservation/visit history in one profile. Imported versus guest-supplied versus staff-observed facts keep provenance and restricted notes obey role rights. owner/admin operations staff perform the host workflow until ROLE-003 adds the host role; current member/preparation-key readers retain ACCESS-001 guest-note visibility. Explicit facts keep guest-supplied, imported or staff-observed provenance; missing legacy source or original import date is labeled not recorded. Search normalization does not change exact-email identity matching. Every future restricted fact, role and access scope introduced by GUEST-003, ROLE-003, ROLE-004 and DATA-004 must conform in profile, search, arrival and backup doors before shipping.

**Acceptance.**
1. Find a returning guest by US phone, add a VIP tag and seating preference, then book again and view the preferences and their sources at arrival.

#### GUEST-003 — Allergy and accessibility handoff

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-003, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Guest-declared allergies, dietary and access needs are separate explicit fields with date/source and staff acknowledgment. Host/server handover and the connected POS show the relevant facts without an AI inventing a diagnosis or declaring food safe; stale or conflicting notes require clarification. Before richer access needs ship, enforce FLOOR-009 required access constraints on direct/prepared moves, swaps and booking allocation. Before acknowledged allergy/access facts ship, feed them with their declared/acknowledged source into FLOOR-012 screen, print and PDF; keep the guest-supplied/unverified distinction and no safety claim. Before this capability ships, FLOOR-019’s kitchen view inherits declared/acknowledged allergy and access sources by table, retaining the no-diagnosis/no-safety-claim distinction; assert the acknowledged-needs kitchen step as well as its pre-shift receivers.

**Acceptance.**
1. Book a nut-allergic guest requiring step-free seating, acknowledge both at check-in, send the declared facts to POS and correct an outdated note with its author/date retained.

#### GUEST-004 — Duplicate review and household separation

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-003, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Potential duplicate profiles are suggested from normalized identities and visit context, with a preview of conflicts, linked bookings, consent and spend before an authorized merge. Shared household numbers do not auto-merge people; merges are traceable and mistaken merges can be reversed safely.

**Acceptance.**
1. Import two emails for one guest and a shared family phone, review suggestions, merge only the true duplicate and reverse it without losing visits or changing anyone’s marketing permissions.
2. Matching rules: email is trimmed/lowercased only; US phone is normalized to +1; names compare exactly after accent/case normalization.
3. Suggest only the same email or the same phone plus name; shared phone with a different name is a household and is never mergeable.
4. Imports retain distinct source IDs with collision warnings, never automatic merging.
5. Owner/admin previews choose the surviving profile; typed confirmation and current profile/linked-record versions fence each atomic mutation.
6. Selected profile fields remain selected; both originals, provenance, notes and visits remain in the manager-only journal, alternate contacts retain their source identity, and approved reminders retain their original recipients.
7. Queue consent stays bound to the original phone; the most restrictive recorded value wins for a shared phone, unknown never grants, and unrelated household permission stays separate.
8. Marketing permission and spend remain not recorded. Unmerge restores only unchanged records and lists later edits/new records for manual assignment without overwriting them or restoring more permissive consent. Journal CSV and structured archives include snapshots, aliases, contact provenance and pending assignments with relationship validation. Erasing a merged identity erases its reviewed aliases and unresolved profiles still carrying that identity pending assignment, purges related journal snapshots and linked audit/operational personal values, and permanently blocks reversal and pre-erasure restore. MSG-008 inherits contact/channel/purpose-specific consent and suppression; GUEST-005 inherits POS visit/payment relationship reassignment before those capabilities ship.

#### GUEST-005 — POS-linked visit and item history

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-003, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Profiles link attended reservations to checks, item/category spend, discounts, tips and refunds, distinguishing payer from companions and ambiguous matches. Historical imports preserve their original source; unmatched or split checks never inflate guest lifetime spend.

**Acceptance.**
1. Seat a returning party, split its POS bill, refund an item and inspect the payer’s visit/spend history; leave ambiguous companions unassigned until a person resolves them.
2. GUEST-004 inheritance: POS visits, split checks, item/refund links and spend follow reviewed merge/unmerge with unchanged-record guards, later-record assignment, contact-specific consent and erasure-safe journal/export coverage.

#### GUEST-006 — Shared guestbook across restaurant groups

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-003, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Groups manage venue-specific and group-shared guest profiles, tags, visit/spend summaries and preferences with per-venue access and purpose-specific consent. Cross-venue suggestions never reveal restricted notes or treat a venue opt-in as a group-wide opt-in. DIST-005 supplies explicit booking identity and per-restaurant preference custody. A venue account or booking proof grants no cross-venue sharing: group access, shared preferences and rebooking require separate purpose-specific consent and per-venue permissions, with restricted notes inaccessible.

**Acceptance.**
1. Visit two sister venues, view permitted group history as group manager, deny another venue’s restricted notes to a host and offer rebooking only under the guest’s authorized scope.

#### CRM-001 — Visit-based segments and audiences

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Managers build saved segments from visit frequency, recency, experience, source, VIP tags, no-shows, feedback and POS spend, previewing inclusion reasons and channel eligibility. Segment counts show unknown data and excluded/suppressed guests rather than silently treating them as zero.

**Acceptance.**
1. Build a lapsed high-spend-diner audience, inspect five inclusion/exclusion explanations and export only its consented email members; a refunded visit updates spend eligibility.

#### CRM-002 — Retention and win-back automation

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Owner-approved workflows trigger welcome, birthday/anniversary, first-to-second visit, lapsed-guest and experience invitations from recorded guest facts and completed visits. Frequency caps, quiet hours, stop conditions and campaign attribution apply; draft preview names recipients and the exact offer.

**Acceptance.**
1. Approve a post-first-visit workflow, finish two visits and cancel a third, then advance the scheduler and inspect the right delivered messages and repeat bookings; suppress a guest who opts out mid-run.

#### CRM-003 — Campaign creation and conversion reporting

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Managers compose branded campaigns, test renders, preview recipients/cost, schedule send and pause/cancel remaining sends. Delivery, clicks, unsubscribes, attributed reservations, attended covers and actual POS revenue are separate measures with explicit attribution windows.

**Acceptance.**
1. Send a controlled campaign, book from one tracked link, cancel another booking and reconcile delivered count, attended covers and realized revenue without crediting canceled or unpaid visits.

#### CRM-004 — Mailchimp audience handoff

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Owners connect Mailchimp and map only permissioned guest fields, tags and segments. Subscribe/unsubscribe and deletion changes reconcile both ways with source/timestamps and failure tasks; syncing a list cannot upgrade an unknown consent state or resend suppressed guests.

**Acceptance.**
1. Sync an opted-in segment, unsubscribe one contact in Mailchimp and erase another in Placemat; retry a failed sync and verify neither contact is reintroduced into a campaign.

#### CRM-005 — Post-visit feedback and manager follow-up

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Completed visits trigger consent-appropriate surveys; feedback links are scoped to the visit and duplicate responses are handled. Poor feedback creates an assigned recovery case with SLA, guest reply thread and closure outcome; public-review requests avoid filtering guests by sentiment.

**Acceptance.**
1. Complete two visits, submit low feedback on one and positive feedback on the other, verify consistent public-review invitation rules and resolve the manager’s recovery case with a delivered reply.

#### CRM-006 — Return offers and loyalty handoff

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-MAIL-001, BASE-DATA-006 · *Rules:* D-6

**Requirement.** Managers create bounded, dated return offers and redemption terms, attribute them to recovery or campaigns and sync loyalty identity/status with the venue’s Toast/Square loyalty program where connected. Redemptions reconcile to a visit/check and cannot be duplicated or invent consent.

**Acceptance.**
1. Approve a $20 return offer after a recovery, book its recipient, redeem on one POS check and refuse reuse; inspect actual repeat visit and net contribution.

### POS and service connections

#### POS-001 — Toast connection

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-OPS-003, BASE-OPS-004 · *Rules:* D-2, D-3 · *Register:* R-6

**Requirement.** The owner completes Toast partner/merchant authorization and maps restaurant, service areas, tables, checks and guest identities. Signed or provider-authenticated events/readback provide open/paid/void checks, items, spend and table progress; rejected access and revoked authorization are actionable.

**Acceptance.**
1. Connect an authorized Toast sandbox, seat a guest, open/pay/void a mapped check and reconcile guest spend and table state; revoke access and show stale data plus an assigned repair task.

#### POS-002 — Square for Restaurants connection

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-OPS-003, BASE-OPS-004 · *Rules:* D-2, D-3

**Requirement.** The owner connects Square OAuth locations, table/check context, orders, customers, payments and refunds with minimum required permissions. Event deduplication and location/table mapping preserve one attended visit and exact spend despite split checks or repeated callbacks.

**Acceptance.**
1. Authorize one Square restaurant location, link a reservation to an order, split/pay/refund it and replay callbacks; inspect reconciled spend and deny access to an unauthorized location.

#### POS-003 — Clover connection

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-OPS-003, BASE-OPS-004 · *Rules:* D-2, D-3 · *Register:* R-6

**Requirement.** Owners connect their Clover merchant account and map dining tables, orders, customers, payments and refunds. Missing table identifiers become explicit reconciliation tasks; staff can confirm a candidate match without importing unrelated merchant/customer data.

**Acceptance.**
1. Connect a Clover test merchant, match a table’s open order to its seated booking, settle and refund it; resolve an order lacking table metadata and inspect attributed spend.

#### POS-004 — Lightspeed connection

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-OPS-003, BASE-OPS-004 · *Rules:* D-2, D-3 · *Register:* R-6

**Requirement.** Placemat supports the restaurant’s declared Lightspeed Restaurant edition through its approved API/partner access, maps floor/check identities and consumes item, payment and table progress. Edition/region prerequisites and unsupported permissions are visible during setup.

**Acceptance.**
1. Connect an eligible Lightspeed test venue, map two tables, seat and close a check, then reconnect after missed events and reconcile its guest spend exactly once.

#### POS-005 — NCR Aloha connection

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-OPS-003, BASE-OPS-004 · *Rules:* D-2, D-3 · *Register:* R-6

**Requirement.** An approved NCR Aloha restaurant adapter securely bridges restaurant check/table and payment events, maps shifts and guests and handles on-premise connectivity outages. Backfilled checks retain original service times and cannot mark tables ready from old events.

**Acceptance.**
1. Disconnect the Aloha bridge during dinner, complete two checks, reconnect and inspect backfill spend while proving yesterday’s close event does not clear today’s occupied table.

#### POS-006 — Guest and check matching controls

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-OPS-003, BASE-OPS-004 · *Rules:* D-2, D-3

**Requirement.** Deterministic links use reservation/table/time/location and verified guest identity; probable matches show confidence/reasons for human review. Split/combined checks, multiple payers, table moves and walk-ins preserve provenance, with reversible corrections and unmatched-check queues.

**Acceptance.**
1. Move a party between tables, combine two checks and split payment; review an ambiguous guest match, correct it and compare both profiles’ spend before and after.

#### POS-007 — Live check and kitchen pace

*Tier:* Core · *Cites:* BASE-SECRET-001, BASE-OPS-003, BASE-OPS-004 · *Rules:* D-2, D-3

**Requirement.** POS check/course status, actual turn progress, server staffing and permitted kitchen-load signals inform availability and proposed pacing. Stale signals are clearly aged, paid does not mean clean, and kitchen/host limits always constrain an automatic status update.

**Acceptance.**
1. Open, course, pay and clear a check, slow a kitchen signal and inspect suggested availability; drop the POS feed and prove the last observed state is labeled stale instead of assumed ready.

### Service and commercial reporting

#### REPORT-001 — Covers cancellations and no-shows

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** Managers filter historical/current/future reservations by venue, local service date, shift, area, source, status and party size (inclusive bounds from 1 to 500, the largest supported party; no bound means every size); reports distinguish booked, attended, canceled and no-show covers and rates with visible denominators and downloadable row drilldown. Dates are inclusive venue-local service-start dates; period uses the service interval, with end ≤ now past and start ≤ now < end current. Booked covers include every reservation status, attended means seated/completed, and canceled/no-show/attended rates use all filtered booked covers as denominator (zero gives no rate). A combined-table booking counts once. Every existing venue, area and source is included; additional venues (ROLE-001), floor areas (FLOOR-002) and channels (DIST-001–DIST-004, BOOK-005, VOICE-001, AGENT-001) inherit these filters and reports before shipping.

**Acceptance.**
1. Run two shifts with cancellations and no-shows, filter one local date, drill a total to its bookings and reconcile its CSV to attended versus booked covers.

#### REPORT-002 — Turns waits and server performance

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** Reports compare expected/actual turns, arrival lateness, quoted/actual waits, abandoned queues, seating utilization, interval pacing, staff pacing overrides and server/section covers, with sample sizes and missing observations shown. Staff corrections remain traceable rather than rewriting prior published results. Current staff-recorded observations use raw elapsed minutes; labels round to two decimals. Missing facts stay unknown and carry sample/missing counts; distributions show mean, median, nearest-rank p90 and exact observation drilldowns. Expected turn preserves the original confirmed interval; actual turn uses corrected seating-to-completion, and departure delay separately compares completion (or an ongoing party at report generation) to the original departure. Quotes are recorded ranges; deviation is negative below the lower bound, zero within it and positive above the upper bound. Historical attended covers belong to the server and section recorded at the corrected seating instant; current assigned expected covers are separate, and missing seating assignments are explicit. Utilization is unioned occupied physical table-seat minutes divided by available physical table-seat minutes within service bounds, with known ongoing observations identified and setup/cleanup excluded. Managers publish immutable, attributed snapshots and can compare later live corrections or publish a new snapshot; histories retain original and correcting events without guest names, contacts, notes or reasons. Existing observations all conform; WAIT-003 provider estimates, POS-007 observations and FLOOR-010 seat/pool inventory inherit these reporting and correction obligations before shipping.

**Acceptance.**
1. Complete a service with two overruns and a waitlist abandonment, inspect turn/wait distributions and server totals and trace an outlier back to its status history.

#### REPORT-003 — Channels spend and repeat business

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** Owners compare direct/Google/social/partner campaign conversion, cover/source fees, average check, spend per cover, repeat-visit cohorts, retention and realized revenue. Paid, refunded and merely reserved revenue remain distinct; attribution rules and unmatched POS data are visible.

**Acceptance.**
1. Book from three sources, attend two, refund one and revisit another month; reconcile source cost, net revenue and repeat cohort to the booking and check ledger.

#### REPORT-004 — Experience and payment performance

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** Event/seating dashboards reconcile ticket inventory, sold/held/refunded tickets, add-ons, attendance, deposits, no-show recovery, processor fees and outstanding liabilities with the immutable payment ledger.

**Acceptance.**
1. Close a partly refunded tasting event, export settlement and inspect drilldowns from net receipts to Stripe transactions and from occupancy to check-ins.

#### REPORT-005 — Scheduled exports and group reporting

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** Managers download reservation, guest and finance CSV reports across past, and future periods. Groups compare locations using consistent local dates and timezones, under ROLE-001 per-venue read ceilings.

**Acceptance.**
1. Export future bookings and historical visits for a permitted manager across the selected venues.
2. Group comparisons use identical inclusive local service-date labels in each venue timezone. A disconnected or unreachable venue refuses the comparison.
3. Operational CSVs retain current manager service scopes; guest-personal and finance fields retain their restricted export doors, consent and erasure.

#### REPORT-009 — Weekly group report delivery

*Tier:* Core · *From:* REPORT-005 · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** An authorized schedule sends its selected native recipient an authenticated live group-cover report link. Restoring the restaurant cannot resume a send.

**Acceptance.**
1. Schedule a weekly group cover report for a permitted manager, then revoke access before the next scheduled delivery and prove it is blocked.
2. a personal venue-wide owner or admin explicitly approves each native group recipient.
3. External recipients require owner approval of that exact address through an owner-created schedule; an admin may only reuse that recorded identity and address approval.
4. Changed addresses require renewed owner approval.
5. Current schedule-owner authority, recipient identity and every selected venue grant are checked on each delivery attempt and authenticated download; removal, changed recipient email, disconnection or an unreachable venue refuses.
6. Email contains only an authenticated link, never an anonymous or bearer link or report snapshot.
7. No report snapshot is retained.
8. Private schedule and attempt metadata is owner-exportable but excluded from restorable archives, so restore cannot resume sends. Uncertain submission remains “delivery unconfirmed” for explicit manual resend. Recipient approval, attempts and every recheck or foreign-identity refusal are audited. Group comparisons use ROLE-001 read-only tokens with member-to-home checks on every call and identical inclusive local service-date labels in each venue timezone. Operational CSVs inherit current manager service scopes; guest personal and finance fields retain their existing restricted export doors, consent and erasure. DATA-001, DATA-002 and DATA-003 continue to govern these records; MSG-003 and MSG-007 inherit authenticated report custody and uncertain-send handling before richer delivery receipts or retries ship.

#### REPORT-008 — Scheduled recurring report delivery

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** Authorized recurring reservation, guest and finance reports are delivered with current field permissions, consent, erasure and access revocation applied on each delivery.

**Acceptance.**
1. Schedule authorized recurring reservation, guest and finance reports; prove field permissions, consent, erasure and access revocation on each delivery.

#### REPORT-006 — Local performance benchmarking

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** Restaurants optionally contribute de-identified aggregates to comparable-market benchmarks for covers, demand, no-shows and turns, with cohort size/date freshness shown and small cohorts suppressed. A venue can opt out without losing its own history.

**Acceptance.**
1. Opt in a controlled cohort, view a sufficiently sized comparison, shrink its cohort below privacy rules and verify suppression, then opt out and retain internal reporting.

#### REPORT-007 — End-of-service report

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-DATA-001, BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** Closing a service produces a report fixed at close and never rewritten by later edits: covers booked, walk-in and waitlist-seated, attended, canceled and no-show covers with visible denominators, fees charged, waived and refunded (PAY-004, PAY-005), average actual turn against expected, quoted versus actual waits (WAIT-003), covers recovered from cancellations and no-shows (counted only once the replacement party is seated, whether by the agent or by staff), and pacing-override counts (SERVICE-007). Each figure drills to its reservations and the report prints and downloads as PDF and CSV. A correction after close is a new traceable adjustment beside the original. operational snapshots commit atomically with service.close in the existing performance archive. The original CSV keeps its exact close-time population and statuses; later service observations are identified by event IDs, retaining actor, time and before/after facts without rewriting the snapshot. Missing financial and recovery facts are never inferred from attendance. Recovered covers follow one exact rule. A freed reservation is a cancelled or no-show reservation of the service, released at the latest staff observation that recorded that status; without such an observation its release is not recorded and nothing is attributed to it. A replacement is another reservation of the same service created at or after that release, sharing at least one of its tables, whose reserved interval overlaps the freed one (half-open), and which is seated or completed; offered, booked and waiting parties never count. Each replacement counts once, for the earliest-starting freed reservation it matches (then booking id), and a freed reservation recovers at most its own party size. The report shows recovered against freed covers, split into cancellations and no-shows, and drills to both reservations; the CSV gives each row its recovered covers and the reservation it recovers, and managers see the same figure live on the performance report before close. Every current seating is staff-recorded; AGENT-002 inherits agent-seated recovery attribution before an agent seats anyone. PAY-004/PAY-005 now record charged, waived, succeeded-refund and pending fee amounts with reservation drilldowns and CSV/PDF columns inside the close transaction. Older snapshots keep their original absent or not-recorded financial state; no historical fee is inferred. The fixed report also downloads as a PDF and prints from the browser with every drilldown open.

**Acceptance.**
1. Run a service with two no-shows, two refills from the waitlist, a walk-in and a no-show fee; close it; reconcile every figure to its bookings and the CSV; verify a refilled table counts as recovered only after its party is seated; correct one status after close and see the original report unchanged with a dated adjustment beside it.
2. Until payments ship no fee can be taken: the report states fees were not recorded, and PAY-004 and PAY-005 carry this journey’s fee step into their own acceptance.

#### COST-001 — Predictable operating costs

*Tier:* Core · *Cites:* BASE-INSTALL-001

**Requirement.** Owners see USD subscription/hosting, per-cover distribution, messaging, voice, payment and optional provider costs with actual usage, budget alerts and forecasts before enabling a channel or campaign. Direct guest records remain exportable regardless of channel pricing.

**Acceptance.**
1. Preview 1,000 reminders and a promoted event, inspect projected provider/cover cost, set a budget alert and reconcile the bill to usage and processor fees.

### Migration from each incumbent

#### MIG-002 — OpenTable migration

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-001 · *Register:* R-7

**Requirement.** Owners upload OpenTable Guestbook CSV and reservation/group-report CSV exports, with available notes, tags, opt-in status, visits, future reservations, experiences and payment references. Preserve source IDs and local times, map services/tables and reconcile guest/booking/cover counts; status-only consent never becomes invented proof and card credentials require provider-supported recollection.

**Acceptance.**
1. Dry-run representative Guestbook and reservation CSVs, map Friday tables, apply approved imports and compare future-booking/date/cover and consent totals; keep unmapped rows in an actionable exception report.
2. The import summary shows the reconciled guest, future-reservation and tag-and-note counts beside the export’s own totals.

#### MIG-003 — Resy migration

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-001 · *Register:* R-7

**Requirement.** Owners import Resy guestbook CSV and support-supplied reservation files, including encrypted email-delivered CSV after owner decryption, plus notes/tags, VIP, visit and POS metrics when exported. Preview future booking/table mapping and exceptions; prepayments remain tracked against the original processor until refunded, honored or recollected with consent.

**Acceptance.**
1. Import representative guest and future-reservation fixtures, resolve duplicate contacts and a prepaid booking, then reconcile bookings, contacts, consent and financial obligations before directing new demand to Placemat.

#### MIG-004 — SevenRooms migration

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-001 · *Register:* R-7

**Requirement.** Owners import SevenRooms client/guest and date-filtered past/future reservation CSV exports, retaining available client/reservation tags, table assignments, group scope and marketing opt-out. Approved provisioned API access can supplement exports; unavailable API access never blocks the owner’s CSV move-in or fabricates missing fields.

**Acceptance.**
1. Load representative client and reservation fixtures for two venues, preserve opt-outs and restricted notes, map tables and reconcile each venue’s future covers and unmapped values before apply.

#### MIG-005 — Tock migration

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-001 · *Register:* R-7

**Requirement.** Owners import Tock guest-directory/marketing CSV and future-reservation CSV or support-assisted multi-file exports, with optional plan-authorized historical JSON Data Exports API and reservation/guest webhook catch-up. Preserve stable Patron IDs, available consent source/date, experiences, questionnaires, payments/refunds and table assignments; delayed historical feeds are never assumed to contain every future booking.

**Acceptance.**
1. Dry-run representative CSV plus JSON data, reconcile future bookings separately, map ticket/add-on inventories and minor-unit balances, then process webhook catch-up without duplicate tickets or increased consent.

#### MIG-006 — Eat App migration

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-001 · *Register:* R-7

**Requirement.** Owners import Eat App emailed Reservation List CSV for past/current/future periods and guest-report CSV with available contacts, tags, visit/no-show/cancellation counts, spend and marketing state. Column mappings are versioned per actual export; unsupported fields and absent consent provenance remain explicit exceptions.

**Acceptance.**
1. Upload representative guest and reservation CSVs, map statuses/times and reconcile all three date periods, spend summaries and subscription state; reimport the same files without duplicating guests or covers.

#### MIG-007 — Loman AI handover

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-001 · *Register:* R-7

**Requirement.** The target handover requires the connected reservation system’s named importer to migrate bookings, and customer-owned recordings, transcripts, phone numbers, menus, routing and approved booking policies requested from Loman. Discover and document the actual owner-provided formats before mapping; no public native Loman CSV or API schema is assumed. Number porting and a tested human transfer are part of cutover.

**Acceptance.**
1. Use a representative owner-format export fixture to preview supported conversation and configuration fields and unresolved formats, reconcile its bookings against the connected-system export, port a test number and prove new calls book and transfer without losing existing commitments.

#### MIG-008 — Cutover rehearsal and change catch-up

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-INPUT-001 · *Register:* R-7

**Requirement.** Migration is a reviewed plan with source fingerprints, row-level errors, service/table/guest identity mappings, count/spend/consent reconciliation and a no-write rehearsal. A timed cutover captures changes after the snapshot, switches channels without duplicate reminders/fees, and supports safe rollback while preserving post-import staff edits.

**Acceptance.**
1. Rehearse a Friday cutover, change two bookings in the old system, catch up those deltas, approve switch and undo an unchanged batch while refusing rollback over a staff-edited guest.

#### DATA-003 — Complete portable business records

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-BACKUP-001, BASE-SECRET-001

**Requirement.** Owners export documented CSV and versioned structured archives of guests, consent, notes, reservations, waitlists, experiences, payments/references, messages/outcomes, policies and audit, with field definitions and attachments where retained. The BOOK-008 GA4 API secret and Meta access token are such named exclusions (`analytics credential storage`, listed in each archive manifest’s excluded-table list), so a restore needs them entered again; the venue CSV carries only the non-secret analytics settings. Before new record kinds ship, PAY-001–PAY-010, EXP-001–EXP-005, MSG-002–MSG-011, CRM-001–CRM-006, DIST-001–DIST-006, POS-001–POS-007, ROLE-001, FLOOR-013, GUEST-004 and VOICE-001 inherit complete documented CSV and structured-archive coverage, relationship validation, declared exclusions and erasure-safe restore. Their missing paid-service/provider acceptance remains in those introducing clauses; exports never fabricate it.

**Acceptance.**
1. Export a complete multi-channel paid service, restore supported records into an empty installation and open the CSVs; reconcile counts and references, inspect exclusions and prove erased personal data stays absent.
2. Find the analytics keys in no CSV or archive and named among the archive’s excluded tables.
3. The CSV and archive doors cover all existing venues, floor inventory, service/channel policies, reservations and requests, queue contact permission/history, guest profiles/notes/history, inquiries, no-show review tasks, proposals, reminder preparation, audit/service observations and published performance reports.

### Rights, APIs and daily operation

#### ROLE-001 — Owner and group-administrator rights

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-005

**Requirement.** Owners control restaurant configuration, billing/provider connections, people and capability grants, exports, erasure and backup/restore. Group central management is deferred to ROLE-010. Group admins get explicit per-venue rights without becoming owner; sensitive access and financial changes require recorded personal authority. Before additional venues ship, approved sister-venue alternatives inherit BOOK-003 search, exact fit and stale-result reselect.

**Acceptance.**
1. As owner connect two venues, grant a scoped group admin, revoke it and prove direct API access stops; deny a venue manager an owner export, erasure and provider credential change.
2. each venue stays its own installation.
3. An owner issues a one-use invitation and the other venue's owner joins with it, choosing the most any group admin may read there; the home owner grants a native member explicit per-venue rights, read-only and never above that ceiling (reservation report, host pre-shift projection).
4. A short-lived token is checked by the member venue against its home on every call, so revocation or disconnection stops access at once and an unreachable home refuses.
5. Group rights cannot write in this slice, and every grant, export, erasure, refund, person and provider-credential change stays the venue's own owner or manager's personal authority, recorded in the audit history with before/after visible to the owner only.
6. Connections, grants and tokens are never restored from a backup; DATA-003 exports links and grants without secrets.
7. Central management, group-wide configuration and billing (ROLE-010), sister-venue alternatives (BOOK-003), shared guest profiles (GUEST-006) and group reports (REPORT-005) are deferred, not excluded, and inherit this model.

#### ROLE-002 — Manager and shift-lead rights

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-005

**Requirement.** Managers configure approved shifts, publish services, assign sections, resolve guest recovery, approve policy exceptions and refunds within limits, and see allowed reports. Shift leads may resolve operational exceptions without changing payment credentials, owners or guest export rights.

**Acceptance.**
1. Give a manager a $100 refund limit and a lead seating-only override; test each direct operation, refuse the excess refund and provider change, and record a permitted decision.
2. owner-issued separate seating-lead grant, reviewed seating/rule/pacing exceptions with hard conflicts never bypassed, no owner/provider/guest-export/financial mutation rights for leads, and explicit service scopes for lead report reads.
3. Leads receive reservation/performance JSON only, no exports or publication.
4. Existing managers keep venue-wide reports until explicitly scoped; explicit scopes cover every report door and immutable snapshots.
5. Owner-recorded refund authority uses USD cents ($100 = 10000).
6. A limit is integer USD cents.
7. No recorded limit means no refund authority, and owners are uncapped.
8. It caps the sum of pending and succeeded refunds that person submits against one booking's charges, so splitting cannot exceed it. PAY-005 refuses an excess before any processor call. Only an owner sets limits, with AUDIT-001 before/after history.

#### ROLE-003 — Host server and read-only rights

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-005

**Requirement.** Hosts manage reservations, arrivals and queues within their venue, directly move, swap and lock table assignments (FLOOR-009) and, when granted, override pacing (SERVICE-007); servers see their section and service-relevant dietary/access notes; read-only staff can view permitted operations but never mutate. Guest exports, bulk marketing and sensitive notes are separately permissioned. Before server sign-in ships, enforce own-section FLOOR-012 and FLOOR-013 visibility on the server; assert the pre-shift server step with restricted notes/contact absent from HTML, print and PDF. Before server sign-in ships, assert FLOOR-019’s full server acceptance: open the kitchen as a server and find only that server’s own-section allergy/access requests, with no other section, guest identity/contact or shift-note values in the response or page.

**Acceptance.**
1. Sign in as host, server and read-only member, seat, move and swap tables as host without approval, inspect only the server’s section and refuse member mutations and all three actors’ bulk guest exports.
2. owner-granted hosts receive only FLOOR-012’s enumerated host projection; ordinary read-only members are refused the sheet.
3. only the owner grants a native member the separate server capability (never together with host or shift-lead; revoking removes every shift link), and a manager links that person to one shift server.
4. A signed-in server reaches only their own pre-shift sheet (HTML, print, PDF) and kitchen view for shifts they are linked to, limited to their own sections' tables and parties; no contact, guest notes, tags, payments, shift notes, other sections, pacing or dish totals.
5. Every other door answers 403.
6. Hosts keep reservation, arrival, queue and assignment rights. Host guest conversations are carried by ROLE-009. Restored grants and links remain inactive until the owner confirms the native identity and shift link. MSG-006, GUEST-003 and POS-007 inherit the server view; DATA-003 covers the grant and link.

#### ROLE-009 — Host guest conversations

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-005

**Requirement.** Hosts manage guest conversations within their venue. Beyond BOOK-007 inquiries, conversations use MSG-006; extending inquiry replies to hosts retains BOOK-007 exact offer and consent requirements.

**Acceptance.**
1. As a permitted host, read and answer the venue’s guest conversation through MSG-006, and exercise inquiry-reply authority without changing another venue’s conversation or weakening BOOK-007 commitments.

#### ROLE-010 — Group central management

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-005

**Requirement.** Group central management provides one shared directory of several venues inside one installation, group-wide configuration and billing. Explicit per-venue consent bounds any group write grant.

**Acceptance.**
1. Use one shared directory of several venues inside an installation for group-wide configuration and billing; require explicitly consented per-venue rights for group writes.

#### ROLE-004 — Finance marketing and integration rights

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-AGENT-005

**Requirement.** Finance users reconcile charges/refunds/settlements and export finance reports without private allergy notes; marketing users manage consented segments/campaigns without seating or charging rights. Integration and agent credentials are least-privilege, venue/purpose scoped, revocable and narrower than the sponsor’s current rights; executing a proposal carries its action's classes under the company's policy. Before finance, marketing or execution identities ship, enforce FLOOR-012 field and sheet access for each scoped identity on the server across HTML, print and PDF; preparation keys remain refused.

**Acceptance.**
1. Grant finance, marketing and integration identities, run permitted jobs and deny direct unrelated reads/writes; revoke an integration credential during a queued job and prove the job cannot proceed.
2. Under RL-105 in RULINGS.md, the finance identity has this interim grant: only the owner grants a native member the separate read-only finance capability (never with host, shift-lead or server); it reaches only reconciliation of charges against pending and succeeded refunds in USD cents, the payment-request, refund-charge, refund and refund-event CSVs (the owner export schema) and its own page, never guest notes, requests, the floor, sheets, writes or refunds, and every other door answers 403.
3. Marketing identities, scoped integration or execution credentials with job-time revocation, and settlement reconciliation await CRM-001 to CRM-003, PAY-006 and a job queue, which do not exist.
4. Every finance, marketing, integration and agent door resolves its current venue and purpose scope and revocation. FLOOR-012 governs field and sheet projection; full settlement reconciliation and delegated workflows remain required under RL-105.

#### SEC-001 — Identity and session lifecycle

*Tier:* Core · *Cites:* BASE-ACCESS-002, BASE-SIGNIN-001, BASE-SIGNIN-002, BASE-SECRET-001 · *Register:* R-11

**Requirement.** Restaurant teams support native invitation, suspension and recovery, with step-up for high-impact owner and finance changes. Group identity providers include Google Workspace and Microsoft Entra; their standards path uses run-auth under the cited Base duties.

**Acceptance.**
1. Invite and suspend a host, revoke an active session, test direct access, then require step-up for an owner export/refund policy change and provision a scoped SSO user.

#### SEC-002 — Shared host-stand device and quick staff switch

*Tier:* Core · *Cites:* BASE-ACCESS-002, BASE-SIGNIN-001, BASE-SIGNIN-002, BASE-SECRET-001

**Requirement.** An owner registers a host-stand tablet as a venue device that stays available with limited rights. Each staff member switches in with a personal PIN or badge in seconds; every action is attributed to that person, the device locks after inactivity or on switch, and restricted notes, refunds, waivers, payment settings, exports and administration require the individual’s full session or step-up (SEC-001). PINs are per person, throttled after failed attempts and revoked with the person or the device.

**Acceptance.**
1. Register a host iPad as a venue device, switch between two hosts by PIN, seat and move parties and read audit rows attributed to each host.
2. Let it idle and see it lock; enter wrong PINs until throttled; suspend one host and refuse their PIN; refuse a guest export from a PIN session without step-up; revoke the device and refuse its next request.
3. owner-only one-use registration (10 minutes), 30-day installation-local device lease, personal 6–12 digit PIN and two-minute inactivity lock.
4. A PIN session carries the person's live host authority: FLOOR-009, WAIT-002, SERVICE-007 when granted, FLOOR-007, phone and walk-in booking create/change, and sending PAY-010 links.
5. It never carries restricted notes, refunds, waivers, payment settings, exports or administration.
6. Staff tap their name on a roster of active enrolled hosts, then enter the PIN.
7. PINs are HMAC-SHA256-keyed with a versioned Worker-secret pepper, then PBKDF2-SHA256 at the platform maximum with a per-PIN salt.
8. Pepper version and iterations are stored per PIN and upgraded on successful unlock. Common, repeated and sequential PINs are refused. Ten consecutive failures disable a PIN until a full-session reset, with an owner/manager security event. The owner renews a lease for at most 30 more days, warned from day 23. Claim, switch and lock sign out personal sessions left in the browser; PIN mode also refuses native account-administration and sign-in/setup routes and has no full-session fallback. Device credentials and personal PIN credentials remain excluded from archives. PIN replacement, native suspension/version changes, host-grant removal and device revocation invalidate authority, including in-write invalidation fences.

#### AUDIT-001 — Reservation and financial change history

*Tier:* Core · *Cites:* BASE-AUDIT-001, BASE-DATA-003

**Requirement.** Authorized people can inspect before/after changes to bookings, guest merges, seating, consent, policies, sends and payments with actor, reason, source and timestamp. Switching BOOK-008 analytics on or off and changing its IDs or test modes is audited with actor, time and before/after settings; the audit records whether a key was saved, entered or removed (BOOK-008 Remove saved key: actor, time, a saved-key state of false), never the key. Historical events without snapshots remain explicitly not recorded. Before GUEST-004 adds merges, MSG-002–MSG-011 add sends or provider observations, and PAY-001–PAY-010 add money workflows, each inherits the same before/after, source, actor, reason when recorded, timestamp, filtered-export and erasure obligations, including the deposit-refund acceptance in PAY-005. Analytics page-visit consent and its random visit ID remain memory-only under BOOK-008 and are never added to persistent audit.

**Acceptance.**
1. Move and cancel a reservation, change consent and refund a deposit; inspect/export their before/after history by actor and verify a guest erasure redacts personal values without losing action accountability.
2. Switch analytics on and off and remove a saved key; inspect each change’s actor, time and settings (a saved-key state of false after the removal) with no key in the history.

#### API-001 — Documented booking and guest HTTP doors

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-OPS-003

**Requirement.** Custom websites and authorized clients can use documented availability, booking, guest-state and restaurant-command doors over the same capacity actions. Preparation-only keys retain their narrower scope.

**Acceptance.**
1. Use documented HTTP requests to publish, read availability, book, inspect guest state and prepare a plan; call the same doors signed out, with a member and with a revoked preparation key.

#### API-002 — Versioned integrations and event subscriptions

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-INPUT-001, BASE-OPS-003

**Requirement.** A documented versioned availability/reservation/guest API with scoped keys, pagination, idempotency, rate limits and signed event subscriptions supports custom sites, concierge tools, Zapier, Make and the separate Crank workflow product. Replayed events, failed subscribers and schema changes are visible and recoverable.

**Acceptance.**
1. Register a scoped subscriber, create/change/cancel a booking and replay a failed signed event; use a paginated guest read with denied fields and prove a revoked key cannot resume.

#### VOICE-001 — Loman AI and telephone booking connection

*Tier:* Core · *Cites:* BASE-MAIL-001, BASE-AGENT-002, BASE-AGENT-007 · *Rules:* D-2, D-3, D-6

**Requirement.** Owners connect a venue’s Loman AI or approved Twilio voice service to scoped live availability and booking actions with approved hours, policies and human transfer numbers. Calls can create/modify/cancel within those rules, record channel attribution and hand off payment collection through hosted links, never spoken card retention. Before shipping, this capability must inherit SERVICE-005 arrival/service/concurrent/area pacing and SERVICE-007 warning, reasoned override and hard physical-capacity obligations; public allocations cannot override; an agent's exception carries commitment and the company's policy decides it.

**Acceptance.**
1. Place controlled calls for a new booking, change and cancellation, then ask for an unavailable exception; verify inventory, delivered confirmation and human transfer with linked call context.
2. The venue sees counters of calls answered, missed and transferred for each service, each opening its call with the linked booking.

#### MOBILE-001 — Phone and tablet host workflows

*Tier:* Core · *Cites:* BASE-ACCESSIBILITY-001, BASE-ACCESS-002 · *Register:* R-1, R-2, R-8

**Requirement.** Responsive web plus installed iOS/Android host clients support tablet floor work and phone booking lookup, queues, conversations, approvals and alerts with secure session/device revocation. Touch/keyboard/screen-reader workflows, long names and busy shifts work at 390 and 1440 widths; push notifications expose no sensitive note text on lock screens.

**Acceptance.**
1. Run arrival, seating, table-ready reply, manager approval and shift handover on iPad and iOS/Android phones; revoke a device and prove offline cached personal data is locked.

#### OPS-001 — Connection health and business recovery

*Tier:* Core · *Cites:* BASE-OPS-001, BASE-OPS-002, BASE-OPS-003, BASE-OPS-004, BASE-BACKUP-001

**Requirement.** Owners see booking/message/payment/POS/voice feed health, aged data, failed jobs and service-impacting outages with assigned repair tasks. Backup/recovery exercises verify usable booking history and restart pending work without duplicate sends, seats or charges; monitoring integrates with separate Uptime and Oncall products.

**Acceptance.**
1. Interrupt POS and messaging during service, inspect stale-state warnings, recover a backup in an empty install and resume reconciled work; verify incident handoff and one outcome per original action.

#### DATA-004 — Privacy retention and group data controls

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-BACKUP-001, BASE-SECRET-001, BASE-DATA-002 · *Register:* R-9

**Requirement.** Owners set retention by guest notes, message/call content, imports and financial evidence, answer guest access/correction/deletion requests and track processor deletion requests. Allergies/access notes have restricted access and purpose; consent and legally retained finance references survive only under documented retention grounds. Category-specific disposal follows RL-101 in RULINGS.md, with DATA-002 erasure fences and restore duties.

**Acceptance.**
1. Request a guest access export, correct a dietary note, erase eligible content and trace processor deletion tasks; run retention and restore drills and confirm restricted financial evidence is retained without resurrecting deleted guest text.
2. Under RL-101, erase or de-identify each eligible personal-data category when its purpose or retention expires or an applicable verified deletion request requires it. Retain only specific financial or held records with documented current grounds, review dates and restricted access; track each processor’s actual response separately.

#### SITE-002 — Hosted demo restaurant

*Tier:* Core · *Cites:* BASE-DOCS-001, BASE-INSTALL-001, BASE-ACCESSIBILITY-001

**Requirement.** The homepage’s Try the demo opens a hosted Placemat demo venue that anyone can use signed out, with nothing to install: a labeled sample restaurant with a booking page, host stand, waitlist and guest history. Built in Base demo mode, each visitor gets a private copy of that sample restaurant, so no visitor sees another’s entries; messages, charges and provider calls are simulated and never sent, and the copy and anything the visitor typed are deleted after an hour or 15 idle minutes. It is hosted apart from any installation, so a fresh Placemat still starts empty (Operating rules). The homepage shows Try the demo, linking https://demo.run-placemat.com/, while that hosted demo is live; if the demo is taken down the link goes, and the page never substitutes a /run link for it.

**Acceptance.**
1. While the hosted demo is live, the built homepage hero shows Try the demo linking https://demo.run-placemat.com/ at 1440 and 390 widths.
2. From that homepage link at 1440 and 390 widths, reach the demo host stand signed out, book a table on the demo booking page and see it on the floor, seat a waiting party; open two visitor copies at once and prove neither sees the other’s booking; let one go idle past 15 minutes (or the configured demo limit) and prove it is gone and a new visit starts from the clean sample; observe that no SMS, email, card or provider call left the demo; follow /run on a fresh local install and find it opens empty; take the demo down and prove the homepage link is gone, not replaced by /run.

### Agent surface

**Specialist: restaurant service coordinator.** It turns demand into feasible attended covers, runs guest follow-up and reconciles the restaurant’s service evidence.

Inherits BASE-AGENT-001 to BASE-AGENT-013. The company's policy decides every call; this surface presets no disposition.

**How Placemat computes each class.**

- **standard:** reversible internal drafts, read projections and operational edits; facts name the item count.

- **external:** a call sends to a guest or partner, publishes discovery/reviews or exports outside the venue; facts name recipient count and internal, known, new or public counterparty from current venue records.

- **money:** a charge, deposit, refund, redemption or incentive changes what the venue pays or charges; facts name integer USD cents, currency and payee.

- **commitment:** a call confirms a booking or seating promise, changes its terms, makes a binding compensation offer or submits a dispute response; facts name the booking or offer, value and counterparty.

- **accounts:** connection creates or buys a merchant, sender or other provider resource; facts name that provider.

- **gated:** Stripe hosted card entry, merchant identity verification, Meta consent or another provider-kept personal step needs a person; facts name provider and step, including a provider answer newly identifying it.

- **access:** staff, venue, device, integration and agent grants change standing rights; facts name affected people or devices and widening or narrowing.

- **security:** a call changes session/factor protections, signing or provider credentials; facts name the setting.

- **destructive:** guest/category disposal, irreversible record removal or replacement restore cannot be undone in Placemat; facts name affected items.

- **sensitive:** a projection or action touches declared health/allergy facts, card, bank or identity data; facts name records and data kind.

- **live:** a call changes published inventory, running service timing/pacing, connections or recovery behavior; facts name the affected service.

| Tool | Does | Core clauses | Risk class | Today |

| --- | --- | --- | --- | --- |

| `placemat.keys.manage` | Native sessions and preparation authority | ACCESS-001 | access (+ security) | not served over MCP |

| `placemat.guests.public_confirmation` | Public guest isolation | PRIVACY-001 | standard (+ sensitive) (+ external) | not served over MCP |

| `placemat.bookings.create` | Live assigned reservations | BOOK-001 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.capacity.check` | Conflict-safe physical capacity | FLOOR-001 | standard (+ sensitive) | not served over MCP |

| `placemat.services.publish` | Reviewed dated service publication | SERVICE-001 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.plans.execute` | Exact plans and accountable decisions | PLAN-001 | standard (+ sensitive) | not served over MCP |

| `placemat.reminders.export` | Approved reminder CSV custody | MSG-001 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.waitlist.seat` | Staff walk-ins and waiting parties | WAIT-001 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.guests.history` | Guest visit history | GUEST-001 | standard (+ sensitive) (+ external) | not served over MCP |

| `placemat.backups.restore` | Validated empty-destination backups | DATA-001 | destructive · security | not served over MCP |

| `placemat.guests.erase` | Guest erasure and restore fences | DATA-002 | destructive (+ sensitive) | not served over MCP |

| `placemat.venue.configure` | US restaurant onboarding | SETUP-001 | standard (+ sensitive) | not served over MCP |

| `placemat.venue.defaults` | Acknowledged restaurant service defaults | SETUP-002 | standard (+ sensitive) | not served over MCP |

| `placemat.services.generate` | Recurring shifts and seasonal schedules | SERVICE-002 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.services.close_or_relocate` | Closures and emergency service changes | SERVICE-003 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.services.booking_rules` | Party and advance-booking rules | SERVICE-004 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.services.pacing` | Arrival pacing and concurrent covers | SERVICE-005 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.services.turns` | Turn and cleanup rules | SERVICE-006 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.bookings.override_pacing` | Staff pacing overrides with warnings | SERVICE-007 | standard (+ sensitive) | not served over MCP |

| `placemat.widget.configure` | Branded website booking widget | BOOK-002 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.analytics.inspect` | Consent-aware booking analytics | BOOK-008 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.analytics.configure` | Booking analytics credential controls | BOOK-009 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.availability.search` | Reservation search and availability alternatives | BOOK-003 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.bookings.manage_link` | Secure guest modification and cancellation | BOOK-004 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.bookings.phone` | Staff telephone and concierge reservations | BOOK-005 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.checkout.hold` | Booking holds and duplicate submissions | BOOK-006 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.inquiries.manage` | Special requests and group inquiries | BOOK-007 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.discovery.publish` | Diner discovery and partner distribution | DIST-003 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.channels.allocate` | Channel inventory and attribution | DIST-004 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.diners.manage` | Guest accounts and repeat booking | DIST-005 | standard (+ sensitive) | not served over MCP |

| `placemat.reviews.respond` | Verified diner reviews and restaurant replies | DIST-006 | standard (+ sensitive) | not served over MCP |

| `placemat.floor.configure` | Rooms and editable floor plans | FLOOR-002 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.joins.configure` | Approved table combinations | FLOOR-003 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.staffing.configure` | Server sections and fair covers | FLOOR-004 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.timeline.inspect` | Timeline and overdue turns | FLOOR-005 | standard (+ sensitive) | not served over MCP |

| `placemat.service.observe` | Service statuses and handover | FLOOR-006 | standard (+ sensitive) | not served over MCP |

| `placemat.bookings.search` | Busy-service search and shift handover | FLOOR-007 | standard (+ sensitive) | not served over MCP |

| `placemat.callbacks.manage` | Owned guest requests and shift callbacks | FLOOR-014 | standard (+ sensitive) | not served over MCP |

| `placemat.devices.reconcile` | Concurrent devices and operational outage | FLOOR-008 | standard (+ sensitive) | not served over MCP |

| `placemat.outage.reconcile` | Captured outage actions and exact reconciliation | FLOOR-016 | standard (+ sensitive) | not served over MCP |

| `placemat.outage.expire` | Outage sheet expiry and key clearing | FLOOR-017 | standard (+ sensitive) | not served over MCP |

| `placemat.assignments.change` | Direct host table moves, swaps and locks | FLOOR-009 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.inventory.configure` | Counter seats and unassigned bar pools | FLOOR-010 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.arrivals.follow_up` | Late arrivals, holds and the no-show workflow | FLOOR-011 | standard (+ sensitive) | not served over MCP |

| `placemat.preshift.read` | Printable pre-shift sheet | FLOOR-012 | standard (+ sensitive) (+ external) | not served over MCP |

| `placemat.notes.update` | Service notes and kitchen notes | FLOOR-013 | standard (+ sensitive) | not served over MCP |

| `placemat.kitchen.read` | Kitchen workload and declared needs | FLOOR-019 | standard (+ sensitive) (+ external) | not served over MCP |

| `placemat.dishes.configure` | Unpaid dish pre-orders and source totals | FLOOR-020 | standard (+ sensitive) | not served over MCP |

| `placemat.waitlist.intake` | Remote and walk-up joining | WAIT-002 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.waitlist.quote` | Quoted waits and queue updates | WAIT-003 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.waitlist.offer` | Table-ready conversations and offer expiry | WAIT-004 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.notify.manage` | Future cancellation notifications | WAIT-005 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.waitlist.close` | Waitlist accountability | WAIT-006 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.notices.send` | Booking and cancellation delivery | MSG-004 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.reminders.schedule` | Scheduled reminders and reconfirmations | MSG-005 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.inbox.reply` | Unified two-way guest inbox | MSG-006 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.delivery.recover` | Delivery retry and failed-contact ownership | MSG-007 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.consent.update` | Consent and US messaging policy | MSG-008 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.templates.update` | Templates and guest communication preferences | MSG-009 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.replies.resolve` | Guest text actions: confirm, reschedule and captured requests | MSG-010 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.social.reply` | Instagram and Facebook direct messages | MSG-011 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.merchant.connect` | Stripe merchant connection and token custody | PAY-001 | accounts · security (+ gated) | not served over MCP |

| `placemat.deposits.request` | Deposits and partial prepayment | PAY-002 | money (+ external) (+ commitment) | not served over MCP |

| `placemat.guarantees.manage` | Card guarantees and authorization expiry | PAY-003 | money · commitment (+ sensitive) · external | not served over MCP |

| `placemat.fees.decide` | No-show and late-cancellation fees | PAY-004 | money (+ external) (+ commitment) | not served over MCP |

| `placemat.refunds.create` | Full and partial refunds with notices | PAY-005 | money (+ external) (+ commitment) | not served over MCP |

| `placemat.ledger.reconcile` | Money ledger and processor reconciliation | PAY-006 | money (+ external) (+ commitment) | not served over MCP |

| `placemat.checkout.totals` | Tax gratuity and service-charge disclosure | PAY-007 | money (+ external) (+ commitment) | not served over MCP |

| `placemat.deposits.redeem` | Deposit redemption at the POS | PAY-008 | money (+ external) (+ commitment) | not served over MCP |

| `placemat.disputes.respond` | Disputes and payment operations | PAY-009 | commitment · external (+ money) | not served over MCP |

| `placemat.payment_links.send` | Staff-requested card and deposit links | PAY-010 | money (+ external) (+ commitment) | not served over MCP |

| `placemat.experiences.publish` | Experience catalog and event inventory | EXP-001 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.tickets.purchase` | Ticketed checkout and add-ons | EXP-002 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.tickets.manage` | Experience guest management | EXP-003 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.experiences.settle` | Experience cancellation and event settlement | EXP-004 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.pickup.purchase` | Prepaid pickup experiences | EXP-005 | standard or commitment (+ external) (+ money) | not served over MCP |

| `placemat.guests.update` | Searchable profiles and structured preferences | GUEST-002 | standard (+ sensitive) (+ external) | not served over MCP |

| `placemat.needs.acknowledge` | Allergy and accessibility handoff | GUEST-003 | standard (+ sensitive) (+ external) | not served over MCP |

| `placemat.guests.merge` | Duplicate review and household separation | GUEST-004 | standard (+ sensitive) (+ external) | not served over MCP |

| `placemat.visits.match` | POS-linked visit and item history | GUEST-005 | standard (+ sensitive) (+ external) | not served over MCP |

| `placemat.guestbook.share` | Shared guestbook across restaurant groups | GUEST-006 | standard (+ sensitive) (+ external) | not served over MCP |

| `placemat.audiences.build` | Visit-based segments and audiences | CRM-001 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.campaigns.automate` | Retention and win-back automation | CRM-002 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.campaigns.send` | Campaign creation and conversion reporting | CRM-003 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.mailchimp.sync` | Mailchimp audience handoff | CRM-004 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.feedback.follow_up` | Post-visit feedback and manager follow-up | CRM-005 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.offers.create` | Return offers and loyalty handoff | CRM-006 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.checks.match` | Guest and check matching controls | POS-006 | standard (+ sensitive) | not served over MCP |

| `placemat.pace.observe` | Live check and kitchen pace | POS-007 | standard (+ sensitive) | not served over MCP |

| `placemat.reports.covers` | Covers cancellations and no-shows | REPORT-001 | standard (+ external) (+ sensitive) | not served over MCP |

| `placemat.reports.performance` | Turns waits and server performance | REPORT-002 | standard (+ external) (+ sensitive) | not served over MCP |

| `placemat.reports.retention` | Channels spend and repeat business | REPORT-003 | standard (+ external) (+ sensitive) | not served over MCP |

| `placemat.reports.payments` | Experience and payment performance | REPORT-004 | standard (+ external) (+ sensitive) | not served over MCP |

| `placemat.reports.group` | Scheduled exports and group reporting | REPORT-005 | standard (+ external) (+ sensitive) | not served over MCP |

| `placemat.reports.schedule_group` | Weekly group report delivery | REPORT-009 | standard (+ external) (+ sensitive) | not served over MCP |

| `placemat.reports.schedule_native` | Scheduled recurring report delivery | REPORT-008 | standard (+ external) (+ sensitive) | not served over MCP |

| `placemat.benchmarks.contribute` | Local performance benchmarking | REPORT-006 | standard (+ external) (+ sensitive) | not served over MCP |

| `placemat.reports.close` | End-of-service report | REPORT-007 | standard (+ external) (+ sensitive) | not served over MCP |

| `placemat.costs.forecast` | Predictable operating costs | COST-001 | standard (+ sensitive) | not served over MCP |

| `placemat.records.export` | Complete portable business records | DATA-003 | standard (+ sensitive) | not served over MCP |

| `placemat.venues.grant` | Owner and group-administrator rights | ROLE-001 | access (+ security) | not served over MCP |

| `placemat.managers.grant` | Manager and shift-lead rights | ROLE-002 | access (+ security) | not served over MCP |

| `placemat.staff.grant` | Host server and read-only rights | ROLE-003 | access (+ security) | not served over MCP |

| `placemat.conversations.assign` | Host guest conversations | ROLE-009 | access (+ security) | not served over MCP |

| `placemat.groups.configure` | Group central management | ROLE-010 | access (+ security) | not served over MCP |

| `placemat.finance.grant` | Finance marketing and integration rights | ROLE-004 | access (+ security) | not served over MCP |

| `placemat.identity.configure` | Identity and session lifecycle | SEC-001 | access · security | not served over MCP |

| `placemat.stands.register` | Shared host-stand device and quick staff switch | SEC-002 | access · security | not served over MCP |

| `placemat.audit.search` | Reservation and financial change history | AUDIT-001 | standard (+ sensitive) | not served over MCP |

| `placemat.bookings.command` | Documented booking and guest HTTP doors | API-001 | standard (+ sensitive) | not served over MCP |

| `placemat.integrations.configure` | Versioned integrations and event subscriptions | API-002 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.voice.configure` | Loman AI and telephone booking connection | VOICE-001 | standard or external (+ commitment) (+ money) (+ accounts) (+ gated) | not served over MCP |

| `placemat.recovery.run` | Connection health and business recovery | OPS-001 | standard or live (+ commitment) (+ external) | not served over MCP |

| `placemat.retention.dispose` | Privacy retention and group data controls | DATA-004 | destructive (+ sensitive) | not served over MCP |

| `placemat.service_agent.book` | Live voice and message booking agent | AGENT-001 | standard (+ external) (+ money) (+ commitment) (+ sensitive) (+ live) | not served over MCP |

| `placemat.refill.run` | Cancellation refill through completed conversations | AGENT-002 | standard (+ external) (+ money) (+ commitment) (+ sensitive) (+ live) | not served over MCP |

| `placemat.waits.advise` | Honest waits from actual service pace | AGENT-003 | standard (+ external) (+ money) (+ commitment) (+ sensitive) (+ live) | not served over MCP |

| `placemat.allocation.advise` | Feasible seating and booking improvements | AGENT-004 | standard (+ external) (+ money) (+ commitment) (+ sensitive) (+ live) | not served over MCP |

| `placemat.risk.advise` | No-show risk and reconfirmation assistance | AGENT-005 | standard (+ external) (+ money) (+ commitment) (+ sensitive) (+ live) | not served over MCP |

| `placemat.recovery.advise` | Evidence-based guest recovery | AGENT-006 | standard (+ external) (+ money) (+ commitment) (+ sensitive) (+ live) | not served over MCP |

| `placemat.enrichment.apply` | Permissioned guest enrichment and next visit | AGENT-007 | standard (+ external) (+ money) (+ commitment) (+ sensitive) (+ live) | not served over MCP |

| `placemat.experiments.apply` | Measured reversible service experiments | AGENT-008 | standard (+ external) (+ money) (+ commitment) (+ sensitive) (+ live) | not served over MCP |

**Resources.** `placemat://venues/{venue}`, `placemat://services/{service}`, `placemat://bookings/{booking}`, `placemat://guests/{guest}`, `placemat://queue/{entry}`, `placemat://inquiries/{inquiry}`, `placemat://experiences/{experience}`, `placemat://payments/{operation}`, `placemat://reports/{report}` and `placemat://tasks/{task}` name restaurant records.

**Events.** Venue service publication/closure, booking created/changed/cancelled/seated, queue intake/offer/expiry, guest request, payment reconciled, delivery failed, report published and task decided events carry the affected record URI. **Prompts.** Prepare the shift (SERVICE-002, FLOOR-012, FLOOR-019); fill a cancellation (AGENT-002, WAIT-004); close and reconcile (REPORT-007, PAY-006); recover a guest (CRM-005, AGENT-006).

**Not tools, and why.** SITE-001: Installation and public documentation are installation facts and a person’s navigation screens. OSS-001: Source licensing and absence of a product fee are installation facts. BOUND-001: Product scope and the public exclusion statement are installation facts. SITE-002: A visitor’s isolated interactive demo is a person’s screen. FLOOR-015: Encrypted service-sheet unlock is a device-only interaction. FLOOR-018: Offline restart runs on the host device. MOBILE-001: Native host and offline device interaction runs on the device. MIG-001: Reviewed move-in belongs to the import door. MIG-002: OpenTable move-in belongs to the import door. MIG-003: Resy move-in belongs to the import door. MIG-004: SevenRooms move-in belongs to the import door. MIG-005: Tock move-in belongs to the import door. MIG-006: Eat App move-in belongs to the import door. MIG-007: Conversation/number cutover belongs to the import door and voice connector. MIG-008: Cutover rehearsal belongs to the import door. POS-001: Toast event ingestion belongs to its connector. POS-002: Square event ingestion belongs to its connector. POS-003: Clover event ingestion belongs to its connector. POS-004: Lightspeed event ingestion belongs to its connector. POS-005: The on-premise Aloha bridge belongs to its connector. DIST-001: Google partner feed transport belongs to its connector; resulting booking actions use booking tools. DIST-002: Meta profile actions belong to its connector; resulting booking actions use booking tools. MSG-002: Sender registration and inbound provider transport belong to its connector. MSG-003: Domain verification and inbound provider transport belong to its connector.

**Limits.** Capacity limits for request rate, body size, import batch size, date-batch size and response bytes are documented with the door. They protect installation capacity. Business thresholds and provider spend caps are the company's policy.

**Handoffs.** Listen for POS check and course observations, consent changes and provider outcomes; emit booking, guest-request, payment-discrepancy and recovery-task events for Business specialists, Pantry accounting, Crank automation, Uptime and Oncall. Untrusted guest text supplies evidence, never routing authority.

#### SURFACE-001 — Restaurant registry and Core coverage

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-013

**Requirement.** The restaurant registry equals this surface’s tool table, with the stated non-tool reasons and existing UI actions as the implementation doors.

**Acceptance.**
1. The discovered Core ids equal the tool-table ids plus the non-tool list, including provider connections, roles, money jobs and embedded service agents.
2. Each restaurant tool result agrees with its staff action on the same venue, booking and floor fixture.
3. Preparation-only credentials remain distinct from execution tools; specialist calls use the same registry as embedded service agents.

#### SURFACE-002 — Booking and guest-contact risk computation

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006, BASE-AGENT-007

**Requirement.** Server facts classify booking, contact and payment work from the exact reservation and current recipient records.

**Acceptance.**
1. A reversible internal plan is standard with its item count; confirming a guest booking or exact seating promise adds commitment with booking, value and counterparty.
2. A guest or partner send, public review, discovery publication or outside export is external with exact recipient count and known, new or public counterparty.
3. Deposits, fees, refunds, redemption and monetary recovery offers carry money with integer USD cents, currency and counterparty.
4. Guest text or agent arguments claiming an internal recipient or prior consent change none of these restaurant classifications.

#### SURFACE-003 — Restaurant authority and provider risk computation

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-008

**Requirement.** Restaurant administration, regulated guest facts and provider steps carry their actual classes without a prescribed company disposition.

**Acceptance.**
1. A staff, group, device or execution grant is access with affected people/devices and widening or narrowing.
2. A factor, protective setting or provider credential change is security with its setting.
3. Irreversible guest/category disposal and replacement restore are destructive with affected item count.
4. Declared allergy/health, identity, bank or card data adds sensitive with record count and data kind.
5. Changing published inventory, running timing/pacing, connection behavior or recovery adds live with the service.
6. Creating or buying a merchant, sender or other outside resource adds accounts with its provider.
7. Hosted card entry, merchant verification and provider consent kept for a person add gated with provider and step, including when the provider response identifies that step.

#### SURFACE-004 — Restaurant resources and service handoffs

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-003, BASE-AGENT-010, BASE-AGENT-013

**Requirement.** Restaurant resources, events and specialist prompts identify the records and service jobs listed above.

**Acceptance.**
1. Read the listed venue, service, booking, guest, queue, inquiry, experience, payment, report and task templates on populated restaurant fixtures.
2. A booking change and its payment or guest-follow-up handoff point to the same reservation and preserve venue, service and source.
3. A POS course observation supplies evidence for a pacing suggestion without itself promising capacity or declaring a table ready.
4. The shift, cancellation refill, close/reconcile and recovery prompts identify their clause-backed jobs.

#### SURFACE-005 — A stranger specialist runs a restaurant week

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-001, BASE-AGENT-007, BASE-AGENT-011, BASE-AGENT-012, BASE-AGENT-013 · *Register:* R-12

**Requirement.** A stranger agent given only the venue URL completes a seeded restaurant week through MCP under two company policies.

**Acceptance.**
1. Under the all-autonomous company policy for every class, prepare and publish shifts, receive direct and phone demand, hold and confirm the last accessible table, and update the host stand with no call waiting for a person or refused by policy.
2. Under that same policy, contact the consented waiting party, confirm a refill, reconcile a deposit/refund and close the service; recovered covers require actual seating and payment facts remain reconciled.
3. Repeat the same week under the held company policy: standard calls enter review and every other declared class waits for the policy’s named approver; changed inputs need a fresh decision and a refusal leaves no effect.
4. Run the booking, guest-data, staffing, paid-experience and financial doors on realistic restaurant records and retain full fit, consent, field and attribution constraints under both policies.
5. Recover the same operation after a dropped response without a duplicate booking, send, seat or money effect; finish with the report and resource links matching the restaurant records.
6. Before policy setup, the first call returns the setup link with no restaurant effect; after setup the company’s answers govern the week.

## Push further

### Push further with service agents

#### AGENT-001 — Live voice and message booking agent

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · *Rules:* D-2, D-3, D-6

**Requirement.** A disclosed service agent answers phone, SMS, WhatsApp and permitted email inquiries using the restaurant’s accepted menu and policies and current shared inventory. Booking, changing or cancelling carries commitment, outside conversation carries external, and any money movement carries money. The company's policy decides each call. Contact and booking-policy consent remain guest facts, not agent assertions. Unknowns, urgent safety concerns and exceptions hand off to people with context. Preparation-only keys cannot execute. The dispatcher uses the same tool registry and policy decision as outside specialists. SERVICE-005/007 pacing and hard physical-capacity rules apply.

**Acceptance.**
1. Call and message concurrently for the last accessible four-top, ask a menu question outside the knowledge base and request a fee exception; prove one fitting booking, a delivered confirmation, no invented answer and successful human transfer.

#### AGENT-002 — Cancellation refill through completed conversations

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · *Rules:* D-2, D-3, D-6

**Requirement.** The agent watches cancellations, table combinations and opted-in preferences, ranks eligible waitlist and Notify requests under the venue’s fairness rules, converses with guests and completes a replacement reservation. Outside offers carry external and commitment; incentives add money. The company's policy decides those calls and its budgets. Holds and expiry protect competing accepts; MSG-008 consent still applies. REPORT-007’s recovered-cover rule applies, with agent-seated recovery distinguished from staff-recorded recovery.

**Acceptance.**
1. Cancel a six-top, offer to matching guests, let the first timeout and complete a second guest’s reply and booking; race a late first acceptance and report only realized recovered covers.

#### AGENT-003 — Honest waits from actual service pace

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · *Rules:* D-2, D-3, D-6

**Requirement.** The agent combines seated and arrival timestamps, POS course/check progress, staffing, kitchen-load limits and fitting tables to estimate wait ranges with confidence and source freshness. Quotes, moves and promises carry commitment; outside offers add external and changes to running capacity add live. The company's policy decides whether these calls run or wait for a person. A person declining a suggestion leaves it unapplied.

**Acceptance.**
1. Under the held company policy for commitment and live calls, slow kitchen progress and extend a six-top’s turn, inspect the changed estimate and proposed move, reject it as host and verify no unauthorized guest promise or extra kitchen load.
2. Each suggestion lists actions a host applies in one step, such as holding named tables to a later time, seating a quoted walk-in at a stated time or sending a waiting party who consented to texts an offer for bar seating, and shows the kitchen signal behind it; after a host applies it, the record identifies that host as decider; agent execution carries commitment and external where it contacts the waiting party, under the company's policy.

#### AGENT-004 — Feasible seating and booking improvements

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · *Rules:* D-2, D-3, D-6

**Requirement.** Using demand, approved table joins, access needs, turns, staffing and pacing, the agent proposes explainable table allocations, protected direct inventory and shift adjustments. It previews affected bookings and expected covers and waits. Moving a committed guest carries commitment; changing a published service adds live. The company's policy decides those calls. direct inventory protects exact half-open table intervals (setup through cleanup) for the website booking channel; walk-in, waitlist and their reassignment doors must use other inventory until an authorized release or the interval ends; an agent release carries commitment under the company's policy. DIST-004 and every future distribution door inherit that protection before shipping. Protection previews preserve all current bookings and do not reduce recorded queue feasibility. shift suggestions extend the end by 30, 60 or 90 minutes, keep total service duration within 24 hours, refuse overlap with another open published service, and retain existing bookings, staffing, turns and pacing. The decision binds evidence that the recorded team and kitchen remain available through the displayed end; an agent decision carries live and commitment under the company's policy. Projections use recorded queue order and current constraints and are conditional feasibility, not guest promises or unrecorded demand.

**Acceptance.**
1. Under the held company policy for commitment and live calls, provide a service with an avoidable stranded four-top, prepare two alternatives, approve one and reject a stale plan after another host seats a walk-in; compare actual utilization without breaking access constraints.

#### AGENT-005 — No-show risk and reconfirmation assistance

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · *Rules:* D-2, D-3, D-6

**Requirement.** The agent uses this venue’s observed booking/attendance history, lead time and reconfirmation outcomes to explain uncertain no-show risk and suggest contact or policy review. It infers no protected traits and imposes no unconsented fee. Cancellation and changes to booking terms carry commitment, a fee adds money, and running-service policy changes add live; the company's policy decides those agent calls. Managers monitor false positives. The assistant uses deterministic, fact-cited review prompts, never a probability: a prior recorded no-show or a booked reservation without a recorded reconfirmation raises a flag. Lead time is the raw elapsed minutes from booking creation to arrival (displayed to two decimals) and remains context rather than evidence of nonattendance. Attendance and reconfirmation references distinguish native observations from imported dated history; missing facts remain unknown. Only existing booking, attendance and reconfirmation facts are assessed, with no protected traits or free-text profile inference. Under the held company policy for external and live calls, owner/admin managers accept or decline contact or policy-review work with an attributed reason; accepted work has a manager owner and an explicit-offset due time. Completion records a staff-reported outcome and claims no provider delivery. Accepting a policy-review task does not approve or apply a policy change: the existing company's policy workflow remains required, and this assistant never changes a guest’s table, terms, consent or fees. Managers monitor distinct bookings with flagged reviews against later attended, no-show and pending outcomes; attendance is a potential false positive, with no causal claim. Guest erasure clears linked task reasons and outcomes and excludes the guest from new assistance reads. MSG-005 and PAY-004 inherit these fact, uncertainty, approval and unchanged-commitment obligations before adding provider reconfirmation or fee-policy assistance.

**Acceptance.**
1. Under the held company policy for external, commitment and live calls, flag controlled risky/unconfirmed bookings, inspect cited facts and missing-data caveats, accept a reconfirmation task and decline a policy change; prove the guest retains their table and original terms.

#### AGENT-006 — Evidence-based guest recovery

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · *Rules:* D-2, D-3, D-6

**Requirement.** The agent reads verified feedback, visit notes, consent and POS check facts to draft recovery outreach, propose compensation, arrange a return visit and chase follow-up. Outside replies carry external, binding offers carry commitment, compensation carries money and regulated guest information carries sensitive. The company's policy decides each call. No invented apology facts, inferred allergy or unsubscribed outreach is allowed.

**Acceptance.**
1. Under the held company policy for external, commitment and money calls, receive poor feedback, inspect a fact-cited draft, approve a bounded offer, complete the guest conversation and return booking and track attendance; opt out another guest and prove no contact occurs.

#### AGENT-007 — Permissioned guest enrichment and next visit

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · *Rules:* D-2, D-3, D-6

**Requirement.** The agent derives tags and repeat-visit segments from recorded preferences, declared occasions and spend with per-fact provenance, confidence and sensitive-field exclusions. Reversible internal enrichment carries standard; contacting a campaign audience carries external and regulated personal facts add sensitive. The company's policy decides execution, review and approval. A person may reject or undo an enrichment and inspect the audience before sending.

**Acceptance.**
1. Under the held company policy for standard and sensitive calls, process ambiguous notes and refunded spend, review proposed tags, reject an inferred dietary condition and approve a visit-frequency tag; undo it and verify downstream audience membership changes.

#### AGENT-008 — Measured reversible service experiments

*Tier:* Core · *Cites:* BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · *Rules:* D-2, D-3, D-6

**Requirement.** The agent designs reversible pacing, deposit or reminder experiments from accepted bookings, attended and recovered covers, quoted and actual waits, no-shows, refunds, complaints and POS contribution. Running-service changes carry live, binding terms and offers carry commitment, charges carry money and outside reminders carry external. The company's policy decides each call. Experiment dates, terms, audiences and controls remain inspectable; people can stop or roll back. Reports show sample sizes, uncertainty and harms alongside gains.

**Acceptance.**
1. Under the held company policy for live and commitment calls, approve a two-week pacing experiment with a control period, record realized covers/waits and kitchen overload, stop it mid-service and inspect unchanged prior commitments plus a report distinguishing observed improvement from unsupported causal claims.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Human screen-reader review of the operator and public journeys | SITE-001, BOOK-002, MOBILE-001 | not run | | |
| R-2 | An independent VPAT for the operator and public product | SITE-001, BOOK-002, MOBILE-001 | not run | | |
| R-3 | Google Actions Center partner eligibility and certification | DIST-001 | not run | | |
| R-4 | Approved Meta booking and messaging account/partner eligibility | DIST-002, MSG-011 | not run | | |
| R-5 | US A2P registration and WhatsApp business/template approval | MSG-002 | not run | | |
| R-6 | Approved Toast, Clover, Lightspeed and NCR Aloha partner or merchant access | POS-001, POS-003, POS-004, POS-005 | not run | | |
| R-7 | Customer-authorized OpenTable, Resy, SevenRooms, Tock, Eat App and Loman export validation and live cutover | MIG-001, MIG-002, MIG-003, MIG-004, MIG-005, MIG-006, MIG-007, MIG-008 | not run | | |
| R-8 | iOS and Android store approval for native host clients | MOBILE-001 | not run | | |
| R-9 | Venue-specific legal review of retained finance evidence and payment terms | DATA-004, PAY-003 | not run | | |
| R-10 | Production Stripe merchant eligibility and provider mandate acceptance | PAY-001, PAY-003 | not run | | |
| R-11 | Real Google Workspace or Microsoft Entra group SSO tenant qualification | SEC-001 | not run | | |
| R-12 | Receipts in Claude, ChatGPT, Codex and Copilot MCP clients | SURFACE-005 | not run | | |

## Boundaries

- Placemat takes no online food orders, issues no gift cards, stored-value cards or vouchers, and is not the POS. Gift cards, ordering and check taking remain with the restaurant’s POS or payment provider; Toast, Square and Clover loyalty remain there. CRM-006 exchanges identity and redemption status only.
- Acquisition, certification, approved POS access, US messaging registration, native clients and payment onboarding remain product work. The register separates their real-world qualifications from native fixtures and sandboxes.
- Guest checkout does not imply marketing permission, a verified identity does not establish an attended visit or review eligibility, and a provider acknowledgement does not establish a person’s receipt.
- Analytics provider-test events are observed at the outbound edge in each provider’s test mode, with the edge faked in native tests. That is sandbox proof, not hosted or production qualification.
- The contract retains the published foundation journeys, the first-release reminder CSV mode and every later provider/payment receiver obligation. A restricted interim implementation does not narrow its target.

## Homepage claims

| # | Claim | Clauses |
| --- | --- | --- |
| 1 | Hero · "Placemat takes reservations from your site" | `BOOK-001`, `BOOK-002`, `BOOK-008`, `BOOK-009` |
| 2 | Hero · "…Google…" (reservations from Google) | `DIST-001` |
| 3 | Hero · "…and Instagram" | `DIST-002` |
| 4 | Hero · "runs the host stand" | `FLOOR-002`, `FLOOR-006`, `WAIT-001` |
| 5 | Hero · "…and waitlist" | `WAIT-001` |
| 6 | Hero · "remembers every guest" | `GUEST-001` |
| 7 | Hero · "100% free, open source alternative to OpenTable, Resy and SevenRooms" | `OSS-001`, `COST-001` |
| 8 | Hero · "Run Placemat →" opens /run; "Read the docs" opens /docs | `SITE-001` |
| 9 | Hero · "Try the demo" | `SITE-002` |
| 10 | Hero tags · "Table 12 · Priya +3 · 7:30 · anniversary" | `BOOK-001`, `BOOK-007`, `GUEST-002` |
| 11 | Hero tags · "Regular · 15th visit · likes the window" | `GUEST-001`, `GUEST-002` |
| 12 | Hero tags · "Waitlist · Marco, 2 · 15 min · text sent" | `WAIT-003`, `WAIT-004` |
| 13 | Hero tags · "Deposit $50 · held" | `PAY-002`, `PAY-003` |
| 14 | Hero tags · "Cancellation · 8:00 → filled from waitlist" | `WAIT-005`, `AGENT-002` |
| 15 | Hero tablet · Floor plan, Waitlist (5) and Reservations on the host-stand tablet | `FLOOR-002`, `WAIT-001`, `MOBILE-001` |
| 16 | Day one · "Bring your book from OpenTable." Guests 18,402, future reservations 2,113, tags and notes 41,960 | `MIG-002`, `MIG-001` |
| 17 | Day one · "Resy and SevenRooms too" | `MIG-003`, `MIG-004` |
| 18 | Day one · "Reserve with Google switched" | `DIST-001`, `MIG-008` |
| 19 | Day one · "Run it yourself": `npx -y @runeditrun/rer dev just-every/run-placemat` | `SITE-001` |
| 20 | Day one · "Not in Placemat: online ordering, gift cards or the POS itself" | `BOUND-001` |
| 21 | 3:05 PM · The book · "Guests book on Google, Instagram and your site" | `BOOK-001`, `DIST-001`, `DIST-002` |
| 22 | 3:05 PM · The book · "Pacing keeps the kitchen even" (covers per half-hour slot, 16/16 full) | `SERVICE-005` |
| 23 | 3:05 PM · The book · A full slot offers nearby times ("offered 6:45 or 8:30") | `BOOK-003` |
| 24 | 3:05 PM · The book · Channel per party and totals (Website 44, Google 38, Instagram 21, Phone 9) | `DIST-004`, `REPORT-003` |
| 25 | 3:05 PM · The book · "3 new since 3:00 PM" (new bookings arrive in the open book) | `FLOOR-008` |
| 26 | 4:10 PM · Confirmations · "Reminders go out by text" | `MSG-005`, `MSG-002` |
| 27 | 4:10 PM · Confirmations · "Guests reply" (reply C or R, auto-tag "anniversary · candle on dessert") | `MSG-010`, `MSG-006`, `GUEST-002` |
| 28 | 4:10 PM · Confirmations · "Deposits hold the big tables" ($25 per guest, $200 held on card ending 4242, released at seating) | `PAY-002`, `PAY-003` |
| 29 | 4:10 PM · Confirmations · Confirmed 25 · Awaiting reply 5 · Canceled 4 | `MSG-005`, `FLOOR-006` |
| 30 | 4:10 PM · Confirmations · "4 tables offered to the waitlist" | `WAIT-005`, `AGENT-002` |
| 31 | 4:45 PM · Pre-shift · Pre-shift sheet: guests to know with allergy and occasion, deposits held | `FLOOR-012`, `GUEST-003`, `GUEST-002` |
| 32 | 4:45 PM · Pre-shift · Server sections Ana / Ben / Cole with their tables | `FLOOR-004`, `FLOOR-012` |
| 33 | 4:45 PM · Pre-shift · Kitchen notes (halibut 12 portions, pace 16 covers per half hour, allergy at Table 12) | `FLOOR-013`, `FLOOR-019`, `FLOOR-020`, `SERVICE-005`, `GUEST-003` |
| 34 | 6:40 PM · Host stand · Floor plan by section with combined tables (21+22) | `FLOOR-002`, `FLOOR-003`, `FLOOR-004` |
| 35 | 6:40 PM · Host stand · Six table states with timers (seated, mains, dessert, check dropped, reserved, needs bussing) | `FLOOR-006`, `FLOOR-005` |
| 36 | 6:40 PM · Host stand · Waitlist of five with quotes and minutes waiting | `WAIT-001`, `WAIT-003` |
| 37 | 6:40 PM · Host stand · Seated 34 covers · Due by 7:15 16 covers · Avg turn 1h 28m | `REPORT-001`, `REPORT-002`, `FLOOR-005` |
| 38 | 6:40 PM · Host stand · "Quoted vs actual tonight ±3 min" | `WAIT-003`, `REPORT-002` |
| 39 | 6:52 PM · Service agent · "The agent takes calls … and books into live tables" (call booked Lee, 6 · 8:45 · Table 42) | `AGENT-001`, `VOICE-001` |
| 40 | 6:52 PM · Service agent · Texts answered, table held to 7:45 | `AGENT-001`, `MSG-006`, `FLOOR-011` |
| 41 | 6:52 PM · Service agent · Instagram DM booked (Sofia M., 2 · 9:15 · bar) | `AGENT-001`, `MSG-011`, `DIST-002`, `FLOOR-010` |
| 42 | 6:52 PM · Service agent · "Tonight: 23 calls answered · 0 missed" | `VOICE-001` |
| 43 | 7:15 PM · No-show · "The card on file covers the no-show" ($80 fee, 4 × $20) | `PAY-004` |
| 44 | 7:15 PM · No-show · No-show marked, "The waitlist fills the table" (Nguyen seated 7:39) | `FLOOR-006`, `FLOOR-011`, `WAIT-001`, `AGENT-002` |
| 45 | 7:15 PM · No-show · Calls to the guest and the table-ready text ("Your table is ready. We'll hold it 10 minutes.") | `FLOOR-011`, `WAIT-004`, `AGENT-005` |
| 46 | 7:15 PM · No-show · "Nguyen, 4 · quoted 35 · waited 34m" | `WAIT-003` |
| 47 | 7:48 PM · Kitchen pace · "Placemat reads tickets from Toast, Square or Clover" (mains ticket time from Toast) | `POS-001`, `POS-002`, `POS-003`, `POS-007` |
| 48 | 7:48 PM · Kitchen pace · "…and spaces the next seatings": agent suggestion applied by the host | `AGENT-003`, `AGENT-004` |
| 49 | 10:40 PM · Close · "Each check from your POS lands on the guest" (average check $186, tonight $238, usually orders) | `GUEST-005`, `POS-006` |
| 50 | 10:40 PM · Close · Guest profile: Regular · 15 visits, anniversary, shellfish allergy, window table | `GUEST-001`, `GUEST-002`, `GUEST-003` |
| 51 | 10:40 PM · Close · "Texts: opted in" | `MSG-008` |
| 52 | 10:40 PM · Close · Post-visit text ("How was tonight?" · "Perfect, thank you!") | `CRM-005` |
| 53 | 10:40 PM · Close · Service report: covers booked and walk-in, no-shows, fees, average turn, quote accuracy, covers recovered | `REPORT-007`, `REPORT-001`, `REPORT-002`, `PAY-004` |
| 54 | 11:00 PM · Closing · "Free and open source, MIT licensed." | `OSS-001` |

## Status

Judged from the code and tests at commit `6263325b615bfed2cc3d724bf6b896ce87b1c4fd` (28 October 2026).

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 15 | 0 | 0 | 15 |
| Target and push further | 48 | 32 | 56 | 136 |
| All | 63 | 32 | 56 | 151 |

| Clause | Title | Kind | Status | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `ACCESS-001` | Native sessions and preparation authority | published | done | `src/placemat/access.ts`; `src/placemat/http.ts`; `tests/api/flows.test.mjs` |  |
| `PRIVACY-001` | Public guest isolation | published | done | `src/placemat/http.ts`; `src/placemat/commands.ts`; `tests/api/privacy.test.mjs`; `public/placemat-analytics.js`; `tests/api/embed.test.mjs` |  |
| `BOOK-001` | Live assigned reservations | published | done | `src/placemat/http.ts`; `src/placemat/availability.ts`; `tests/api/flows.test.mjs` |  |
| `FLOOR-001` | Conflict-safe physical capacity | published | done | `src/placemat/availability.ts`; `src/placemat/store.ts`; `tests/api/flows.test.mjs` |  |
| `SERVICE-001` | Reviewed dated service publication | published | done | `src/placemat/commands.ts`; `tests/api/flows.test.mjs` |  |
| `PLAN-001` | Exact plans and accountable decisions | published | done | `src/placemat/commands.ts`; `src/placemat/people.ts`; `tests/api/flows.test.mjs`; `tests/api/reminders.test.mjs` |  |
| `MSG-001` | Approved reminder CSV custody | published | done | `src/placemat/commands.ts`; `src/placemat/downloads.ts`; `tests/api/reminders.test.mjs` |  |
| `WAIT-001` | Staff walk-ins and waiting parties | published | done | `src/placemat/commands.ts`; `tests/api/flows.test.mjs` |  |
| `GUEST-001` | Guest visit history | published | done | `src/placemat/guests.ts`; `src/placemat/import/plan.ts`; `tests/api/flows.test.mjs` |  |
| `MIG-001` | Reviewed Tablein-shaped move-in | published | done | `src/placemat/import/index.ts`; `src/placemat/import/plan.ts`; `tests/api/flows.test.mjs` |  |
| `DATA-001` | Validated empty-destination backups | published | done | `src/placemat/backup.ts`; `src/placemat/archive-policy.mjs`; `tests/api/flows.test.mjs`; `tests/api/embed.test.mjs` |  |
| `DATA-002` | Guest erasure and restore fences | published | done | `src/placemat/import/erase.ts`; `src/placemat/backup.ts`; `tests/api/flows.test.mjs` |  |
| `SITE-001` | Runnable product and owner guides | published | done | `tests/site.mjs`; `tests/install.mjs`; `src/placemat/model.ts` |  |
| `OSS-001` | Free and open source, MIT licensed | published | done | `LICENSE`; `tests/site.mjs`; `tests/install.mjs`; `tests/api/flows.test.mjs` |  |
| `BOUND-001` | Stated boundary: online ordering, gift cards and the POS | published | done | `tests/api/flows.test.mjs`; `tests/site.mjs`; `tests/boundary-ui.mjs`; `docs/getting-started.md`; `docs/HTTP-CONTRACT.md` |  |
| `SETUP-001` | US restaurant onboarding | target | done | `src/placemat/onboarding.ts`; `src/placemat/onboarding-preview.ts`; `src/placemat/local-time.ts`; `src/placemat/service-input.ts`; `public/placemat-onboarding.js`; `tests/api/onboarding.test.mjs`; `tests/onboarding-ui.mjs` |  |
| `SETUP-002` | Acknowledged restaurant service defaults | target | done | `src/placemat/onboarding.ts`; `src/placemat/onboarding-preview.ts`; `src/placemat/local-time.ts`; `src/placemat/service-input.ts`; `public/placemat-onboarding.js`; `tests/api/onboarding.test.mjs`; `tests/onboarding-ui.mjs` |  |
| `SERVICE-002` | Recurring shifts and seasonal schedules | target | done | `src/placemat/schedules.ts`; `public/placemat-schedules.js`; `tests/api/schedules.test.mjs`; `tests/schedules-ui.mjs` |  |
| `SERVICE-003` | Closures and emergency service changes | target | done | `tests/api/service-changes.test.mjs`; `tests/service-changes-ui.mjs`; `tests/search-ui.mjs`; `scripts/service-change-sandbox.mjs` |  |
| `SERVICE-004` | Party and advance-booking rules | target | done | `src/placemat/booking-rules.ts`; `src/placemat/commands.ts`; `src/placemat/availability.ts`; `public/placemat-rules.js`; `tests/api/booking-rules.test.mjs` |  |
| `SERVICE-005` | Arrival pacing and concurrent covers | target | done | `src/placemat/pacing.ts`; `src/placemat/pacing-review.ts`; `src/placemat/commands.ts`; `public/placemat-pacing.js`; `tests/api/pacing.test.mjs`; `tests/pacing-ui.mjs` |  |
| `SERVICE-006` | Turn and cleanup rules | target | done | `src/placemat/turn-policy.ts`; `src/placemat/turn-fit.ts`; `src/placemat/capacity.ts`; `src/placemat/commands.ts`; `public/placemat-turns.js`; `tests/api/turns.test.mjs` |  |
| `SERVICE-007` | Staff pacing overrides with warnings | target | done | `src/placemat/pacing.ts`; `src/placemat/pacing-review.ts`; `src/placemat/commands.ts`; `public/placemat-pacing.js`; `tests/api/pacing.test.mjs`; `tests/pacing-ui.mjs` |  |
| `BOOK-002` | Branded website booking widget | target | done | `src/placemat/embed.ts`; `src/placemat/views.ts`; `src/server.ts`; `public/placemat-embed.js`; `public/placemat-widget.js`; `src/placemat/analytics.ts`; `src/placemat/analytics-events.ts`; `migrations/core/0024_analytics.sql`; `public/placemat-analytics.js`; `public/placemat-analytics-settings.js`; `tests/api/embed.test.mjs`; `tests/embed-ui.mjs` |  |
| `BOOK-008` | Consent-aware booking analytics | target | done | `src/placemat/embed.ts`; `src/placemat/views.ts`; `src/server.ts`; `public/placemat-embed.js`; `public/placemat-widget.js`; `src/placemat/analytics.ts`; `src/placemat/analytics-events.ts`; `migrations/core/0024_analytics.sql`; `public/placemat-analytics.js`; `public/placemat-analytics-settings.js`; `tests/api/embed.test.mjs`; `tests/embed-ui.mjs` |  |
| `BOOK-009` | Booking analytics credential controls | target | done | `src/placemat/embed.ts`; `src/placemat/views.ts`; `src/server.ts`; `public/placemat-embed.js`; `public/placemat-widget.js`; `src/placemat/analytics.ts`; `src/placemat/analytics-events.ts`; `migrations/core/0024_analytics.sql`; `public/placemat-analytics.js`; `public/placemat-analytics-settings.js`; `tests/api/embed.test.mjs`; `tests/embed-ui.mjs` |  |
| `BOOK-003` | Reservation search and availability alternatives | target | done | `src/placemat/reservation-search.ts`; `src/placemat/http.ts`; `src/placemat/commands.ts`; `public/placemat-search.js`; `tests/api/booking-rules.test.mjs`; `tests/search-ui.mjs` |  |
| `BOOK-004` | Secure guest modification and cancellation | target | partial | `tests/api/booking-rules.test.mjs`; `tests/search-ui.mjs`; `scripts/booking-management-sandbox.mjs` | Zero-money management is implemented and proven through public HTTP and the guest page. Ct approved as adopted with riders (22 October 2026, 18:30Z): an owner or a native admin manager holding reservation authority explicitly sends or reissues to the reservation's recorded email, with an actor audit on every issue. Hosts, shared-device sessions and agents cannot issue. At most five issues per reservation per venue-local calendar day, including reissues and failed-delivery attempts; refusal happens before email. A 32-byte random bearer is stored only as a digest, expires at the earlier of 24 hours and service start, and rotates on successful writes without extending expiry. Reissue or a changed reservation invalidates the prior link. Changing the recorded email closes link access; sending to the new address requires the same explicit issue action. This door sends email only; MSG-008 must establish SMS consent before any future SMS send. No automatic payment, refund or outbound retry occurs. Reservations with payment obligations remain unchanged in manager review until PAY-004 (PARTIAL fee/cancellation policy) and PAY-005 (PARTIAL refund execution) ship their financial-consequence duties. Unproved: fee/refund consequences for financially implicated bookings — PAY-004 and PAY-005 remain PARTIAL. The ct-approved zero-money path and all five riders are implemented; BOOK-004 stays PARTIAL under rider 5. The complete acceptance remains binding. |
| `BOOK-005` | Staff telephone and concierge reservations | target | partial | `src/placemat/phone-bookings.ts`; `public/placemat-phone.js`; `tests/api/flows.test.mjs`; `tests/api/phone-booking-journeys.mjs`; `tests/phone-bookings-ui.mjs` | Future staff reservations, explicit returning-guest selection, phone/concierge/offline attribution, contact preference and confirmation permission, special requests and existing reviewed staff rule/pacing exceptions are built. Named Gaps: delivered selected-channel confirmation, policy-triggered PAY-010 request delivery and its deadline, broader host delegation for SERVICE-004 exceptions. External delivery prerequisite: held Twilio account is active with an owned SMS-capable sender, but current controlled-receiver consent and destination eligibility are not proven; no SMS is sent. Existing sender registration/consent requirements remain MSG-002/MSG-008 work. |
| `BOOK-006` | Booking holds and duplicate submissions | target | done | `tests/api/flows.test.mjs`; `tests/api/booking-holds-journeys.mjs`; `tests/api/checkout-payment-journeys.mjs`; `tests/checkout-ui.mjs`; `scripts/checkout-sandbox.mjs` |  |
| `BOOK-007` | Special requests and group inquiries | target | done | `src/placemat/inquiries.ts`; `src/placemat/booking-requests.ts`; `src/placemat/inquiry-views.ts`; `public/placemat-inquiry.js`; `public/placemat-inquiries.js`; `public/placemat-requests.js`; `tests/api/inquiries.test.mjs`; `tests/inquiries-ui.mjs` |  |
| `DIST-001` | Reserve with Google | target | missing |  | No implementation of this journey exists. |
| `DIST-002` | Instagram and Facebook booking | target | missing |  | No implementation of this journey exists. |
| `DIST-003` | Diner discovery and partner distribution | target | missing |  | No implementation of this journey exists. |
| `DIST-004` | Channel inventory and attribution | target | partial | `tests/api/assignments.test.mjs`; `tests/allocation-ui.mjs`; `tests/api/embed.test.mjs`; `tests/api/flows.test.mjs` | Reviewed direct-website protection now includes independently selected release deadlines, retained archive history and current physical-capacity guards. Original widget attribution survives an actual guest time change. Google, social, discovery, phone and partner allocations, campaign attribution, other-channel attribution through guest modification and reconciled channel totals remain unproved. |
| `DIST-005` | Guest accounts and repeat booking | target | done | `tests/diner-ui.mjs`; `tests/api/guests.test.mjs`; `tests/api/diner-journeys.mjs`; `tests/api/diner-management-journey.mjs`; `tests/api/diner-custody-journey.mjs`; `tests/api/diner-portability.mjs`; `docs/data-portability.md` |  |
| `DIST-006` | Verified diner reviews and restaurant replies | target | missing |  | No diner reviews, ratings, replies or moderation exist. |
| `FLOOR-002` | Rooms and editable floor plans | target | done | `src/placemat/floor-plan.ts`; `src/placemat/combinations.ts`; `public/placemat-floor-plan.js`; `tests/api/combinations.test.mjs`; `tests/floor-plan-ui.mjs` |  |
| `FLOOR-003` | Approved table combinations | target | done | `src/placemat/combinations.ts`; `src/placemat/capacity.ts`; `src/placemat/assignments.ts`; `public/placemat-combinations.js`; `tests/api/combinations.test.mjs`; `tests/combinations-ui.mjs` |  |
| `FLOOR-004` | Server sections and fair covers | target | done | `src/placemat/staffing.ts`; `src/placemat/staffing-capacity.ts`; `public/placemat-staffing.js`; `tests/api/staffing.test.mjs`; `tests/staffing-ui.mjs` |  |
| `FLOOR-005` | Timeline and overdue turns | target | done | `src/placemat/timeline.ts`; `src/placemat/capacity.ts`; `public/placemat-timeline.js`; `tests/api/timeline.test.mjs`; `tests/floor-ui.mjs` |  |
| `FLOOR-006` | Service statuses and handover | target | done | `src/placemat/service-status.ts`; `public/placemat-service-status.js`; `tests/api/service-status.test.mjs` |  |
| `FLOOR-007` | Busy-service search and shift handover | target | done | `tests/api/timeline.test.mjs`; `tests/timeline-search-ui.mjs`; `tests/floor-ui.mjs` |  |
| `FLOOR-014` | Owned guest requests and shift callbacks | target | done | `tests/api/timeline.test.mjs`; `tests/timeline-search-ui.mjs`; `tests/floor-ui.mjs` |  |
| `FLOOR-008` | Concurrent devices and operational outage | target | partial | `tests/api/assignments.test.mjs`; `tests/floor-plan-ui.mjs` | Live state refresh and new-since markers exist; complete two-device interruption and reconciliation is carried by FLOOR-016, and the offline application shell is FLOOR-018. |
| `FLOOR-015` | Per-person encrypted outage service sheet | target | partial | `tests/api/assignments.test.mjs`; `tests/floor-plan-ui.mjs` | Only anonymous encrypted owner sheets exist. Host/manager/lead and stand access, per-person key wrapping, named minimised projection and device attribution remain unproved. |
| `FLOOR-016` | Captured outage actions and exact reconciliation | target | partial | `tests/api/assignments.test.mjs`; `tests/floor-plan-ui.mjs` | Pending walk-ins and explicit physical-fit reconciliation exist. Pending reservations, waitlist adds, seat-existing/status changes, finished-during-outage, full actor/time history and SERVICE-007 grant-holder override remain unproved. |
| `FLOOR-017` | Outage sheet expiry and key clearing | target | partial | `tests/api/assignments.test.mjs`; `tests/floor-plan-ui.mjs` | Twelve-hour logical expiry and deletion on activity are implemented; the additional deletion triggers, per-person/stand key clearing and expired-unreviewed audit/follow-up remain unproved. |
| `FLOOR-018` | Offline restart of the locked service sheet | target | missing | `tests/api/assignments.test.mjs`; `tests/floor-plan-ui.mjs` | The offline application shell is absent; reloading still needs a connection. |
| `FLOOR-009` | Direct host table moves, swaps and locks | target | done | `src/placemat/assignments.ts`; `src/placemat/commands.ts`; `src/placemat/access.ts`; `public/placemat-assignments.js`; `tests/api/assignments.test.mjs`; `tests/floor-ui.mjs` |  |
| `FLOOR-010` | Counter seats and unassigned bar pools | target | done | `tests/api/assignments.test.mjs`; `tests/preshift-ui.mjs` |  |
| `FLOOR-011` | Late arrivals, holds and the no-show workflow | target | partial | `tests/api/flows.test.mjs`; `tests/operations-ui-journey.mjs`; `tests/queue-ui.mjs` | Automatic fee integration, inbound running-late SMS, and delivered table-ready offers with a guest hold window remain Gaps under PAY-004, MSG-002, MSG-006 and WAIT-004. Explicit host grace, contact outcomes and running-late holds now ship. Holds protect the full delayed turn through the existing allocation engine and refuse clashes. No-show refuses during recorded grace or an active hold. No automatic status change or outbound action occurs. |
| `FLOOR-012` | Printable pre-shift sheet | target | done | `src/placemat/preshift.ts`; `src/placemat/preshift-view.ts`; `src/placemat/http.ts`; `tests/api/preshift.test.mjs`; `tests/preshift-ui.mjs` |  |
| `FLOOR-013` | Service notes and kitchen notes | target | done | `src/placemat/service-notes.ts`; `src/placemat/service-notes-archive.mjs`; `src/placemat/kitchen-view.ts`; `public/placemat-service-notes.js`; `tests/api/service-notes.test.mjs`; `tests/service-notes-ui.mjs` |  |
| `FLOOR-019` | Kitchen workload and declared needs | target | done | `src/placemat/service-notes.ts`; `src/placemat/service-notes-archive.mjs`; `src/placemat/kitchen-view.ts`; `public/placemat-service-notes.js`; `tests/api/service-notes.test.mjs`; `tests/service-notes-ui.mjs` |  |
| `FLOOR-020` | Unpaid dish pre-orders and source totals | target | done | `src/placemat/service-notes.ts`; `src/placemat/service-notes-archive.mjs`; `src/placemat/kitchen-view.ts`; `public/placemat-service-notes.js`; `tests/api/service-notes.test.mjs`; `tests/service-notes-ui.mjs` |  |
| `WAIT-002` | Remote and walk-up joining | target | done | `src/placemat/wait-join.ts`; `src/placemat/queue-views.ts`; `src/placemat/queue-qr.ts`; `public/placemat-queue-join.js`; `tests/api/wait-join.test.mjs`; `tests/queue-ui.mjs` |  |
| `WAIT-003` | Quoted waits and queue updates | target | partial | `tests/api/queue.test.mjs`; `tests/operations-ui-journey.mjs`; `tests/queue-ui.mjs` | Delivered revisions remain a Gap requiring registered SMS delivery under MSG-002 and MSG-007. Table-ready conversations and reserved offer windows belong to WAIT-004. Only explicitly shared quotes and bases appear on private guest links; old staff-only quotes remain private. All estimates remain forecasts. The real allocation engine checks fit at the next service slot. Within fitting and non-fitting groups, order follows explicit priority, quoted upper-bound deadline, then joining time. Bypassed parties retain their priority and promise, with the reason visible to staff. |
| `WAIT-004` | Table-ready conversations and offer expiry | target | missing |  | No implementation of this journey exists. |
| `WAIT-005` | Future cancellation notifications | target | missing |  | No implementation of this journey exists. |
| `WAIT-006` | Waitlist accountability | target | done | `src/placemat/queue.ts`; `src/placemat/commands.ts`; `src/placemat/people.ts`; `public/placemat-queue.js`; `tests/api/queue.test.mjs` |  |
| `MSG-002` | Twilio SMS and WhatsApp connection | target | missing |  | No implementation of this journey exists. |
| `MSG-003` | Resend email connection | target | missing |  | No implementation of this journey exists. |
| `MSG-004` | Booking and cancellation delivery | target | missing |  | No implementation of this journey exists. |
| `MSG-005` | Scheduled reminders and reconfirmations | target | partial | `src/placemat/commands.ts`; `src/placemat/downloads.ts`; `tests/api/flows.test.mjs` | Reviewed reminder CSV preparation exists; scheduled provider delivery, reconfirmation links and reply/failure follow-up do not. |
| `MSG-006` | Unified two-way guest inbox | target | missing |  | No implementation of this journey exists. |
| `MSG-007` | Delivery retry and failed-contact ownership | target | missing |  | No implementation of this journey exists. |
| `MSG-008` | Consent and US messaging policy | target | partial | `src/placemat/wait-join.ts`; `src/placemat/guest-state-erasure.ts`; `tests/api/wait-join.test.mjs`; `tests/api/audit.test.mjs`; `tests/api/guests.test.mjs` | Optional queue-specific contact permission is stored separately from unknown marketing permission, with guest/staff updates, source/time history and erasure. General channel/purpose permission policies, marketing opt-in, STOP/HELP/unsubscribe, suppression, quiet hours and send-time enforcement across imports, jobs and agents remain missing. |
| `MSG-009` | Templates and guest communication preferences | target | missing |  | No implementation of this journey exists. |
| `MSG-010` | Guest text actions: confirm, reschedule and captured requests | target | missing |  | No provider delivery or inbound reply handling exists; reminders are approved CSV rows for the venue’s own sender. |
| `MSG-011` | Instagram and Facebook direct messages | target | missing |  | No Meta connection, inbound message handling or inbox exists. |
| `PAY-001` | Stripe merchant connection and token custody | target | partial | `tests/api/fee-journeys.mjs`; `tests/guarantees-ui.mjs`; `scripts/merchant-sandbox.mjs` | Merchant connection and capability fencing are implemented; guest mandate, held amounts, complete capture, production eligibility and bank settlement remain unproved. RL-103 records the adopted authority. |
| `PAY-002` | Deposits and partial prepayment | target | partial | `tests/api/checkout-payment-journeys.mjs` | Current documented slice: immutable original per-person request scope, explicit copied Stripe-hosted collection and authenticated status observation. Ct approved the interim default WITH RIDERS on 25 October 2026; PAY-002 stays PARTIAL. Still unproved: automatic fixed/per-person policy selection by service, party size, experience and channel; the complete original payment/callback journey; capacity-held checkout failure and abandonment release consistent with BOOK-006; complete pre-checkout terms and applicable consent evidence; booking and guest-confirmation amount, rate, card-last-four and seating-outcome displays; role-permitted deposited eight-top amounts in live, print and PDF pre-shift sheets; exactly-once seating hold release; booking-bound PAY-005 refund and explicit refusal of transfer, top-up, cross-booking redemption and general spending. Connected POS application remains PAY-008. AUDIT-001 and DATA-001–DATA-004 inheritance remains binding. The complete acceptance remains binding. |
| `PAY-003` | Card guarantees and authorization expiry | target | partial | `tests/api/card-hold-journey.mjs`; `tests/api/fee-expiry-journeys.mjs`; `tests/api/fee-journeys.mjs`; `tests/guarantees-ui.mjs`; `scripts/merchant-sandbox.mjs` | Remaining PAY-003 scope and proof: The original guarantee, expiry, recollection, permitted later fee and role-permitted sheet acceptance remains binding. A controlled provider receipt on the reviewed SHA has not established the complete guest mandate and original manual-authorization capture journey. Production processor eligibility, provider mandate acceptance and applicable US fee-term authority remain unestablished. Native proof remains absent for charging after material booking changes without fresh agreement, capture at the authorization deadline, preservation of the last verified held amount during unconfirmed release, and past-booking recollection refusal. Existing expiry, renewal, legacy migration, inert restore, erasure and held-amount assertions retain their stated native scope. PAY-003 remains PARTIAL. |
| `PAY-004` | No-show and late-cancellation fees | target | partial | `src/placemat/fee-policy.ts`; `src/placemat/fees.ts`; `tests/api/fee-journeys.mjs`; `tests/fees-ui.mjs`; `tests/pacing-ui.mjs`; `scripts/fees-sandbox.mjs` | Ct approved this first slice on 23 October 2026: full personal owners publish immutable venue-local policies, record evidence of the guest’s exact prior agreement verified against a matching successful off-session Stripe setup, and explicitly preview and charge or waive an actual recorded cancellation/no-show. A saved decision reserves the violation before Stripe with a stable processor key; no automatic retry or send. Named Gaps, not cuts: automatic normal policy execution under recorded consent; manager/host delegation through ROLE-002 exception approval; guest-captured consent through PAY-003; disputes through PAY-009. PAY-004 stays PARTIAL. |
| `PAY-005` | Full and partial refunds with notices | target | partial | `src/placemat/refunds.ts`; `tests/api/flows.test.mjs`; `tests/pacing-ui.mjs`; `scripts/refund-sandbox.mjs`; `scripts/refund-webhook-sandbox.mjs`; `tests/api/refund-notice-journeys.mjs`; `tests/refund-notices-ui.mjs` | Ct approved this first slice on 23 October 2026: a full personal owner explicitly emails a reviewed saved outcome once per refund/outcome to the current recorded contact, with amount, remaining balance and provider acceptance distinguished from mailbox delivery. Changed or erased contacts refuse before sending. Every attempt atomically creates exactly one sender-owned callback due immediately while mailbox delivery is unconfirmed, including accepted or bounced mail, with a named human next action; duplicate requests cannot resend, recreate or reopen it. Captured charges, cumulative manager limits, signed-event reconciliation, processor references, failed-refund ownership, CSV/archive/erasure and fixed-close fee refund figures remain proven. Named Gaps: SMS delivery through MSG-002, manager-run and automatic notices, and provider delivery-status/bounce webhook ingestion. Human callback completion records the person’s outcome rather than asserting provider delivery. Retained refund records inherit DATA-004. PAY-005 stays PARTIAL. |
| `PAY-006` | Money ledger and processor reconciliation | target | partial | `tests/api/money-ledger-journeys.mjs` | Current documented slice: append-only successful charge/refund facts, out-of-order association, deduplication, explicit complete payout reconciliation and appended unmatched attribution. Ct approved personal-owner-only interim authority WITH RIDERS on 25 October 2026; PAY-006 stays PARTIAL. Still unproved: an actual held-key Stripe payout receipt; native scoped finance settlement delegation and its review screen; complete deposit, fee, transfer and dispute relationships and lifecycle reversals; and discrepancy-preserving attribution evidence where a provider item conflicts with an existing financial fact. An attribution adjustment changes no historical amount or provider reference and is not provider proof of a missing association. AUDIT-001, DATA-001–DATA-003 and DATA-004 retention duties remain binding. The complete acceptance remains binding. |
| `PAY-007` | Tax gratuity and service-charge disclosure | target | missing |  | No implementation of this journey exists. |
| `PAY-008` | Deposit redemption at the POS | target | missing |  | No implementation of this journey exists. |
| `PAY-009` | Disputes and payment operations | target | partial | `tests/api/money-ledger-journeys.mjs`; `tests/payment-operations-ui.mjs`; `docs/payment-operations.md`; `scripts/payment-operations-sandbox.mjs` | Frozen test-mode evidence approval and QuickBooks sandbox gross-principal handoff are implemented. Manager delegation, failed-card and chargeback lifecycle, full fee/net reconciliation, production accounting and Pantry handoff remain unproved. RL-104 resolves custody authority. |
| `PAY-010` | Staff-requested card and deposit links | target | partial | `src/placemat/payment-links.ts`; `tests/api/timeline.test.mjs`; `tests/api/preshift.test.mjs`; `tests/floor-ui.mjs`; `tests/preshift-ui.mjs` | Manager-defined booking-bound USD requests, explicit host/PIN link issuance, provider-verified status, floor/timeline/handover deadlines, pre-shift screen/print/PDF, CSV/archive and erasure exist. Policy-triggered requests, delivered SMS/email receipts, scheduled reminders, release/cancellation notices, late-payment outcomes, waivers and live sandbox proof remain unproved. |
| `EXP-001` | Experience catalog and event inventory | target | done | `tests/api/experience-journeys.mjs`; `tests/experiences-ui.mjs`; `docs/experiences.md`; `docs/data-portability.md` |  |
| `EXP-002` | Ticketed checkout and add-ons | target | partial | `tests/api/experience-journeys.mjs`; `tests/experiences-ui.mjs`; `docs/experiences.md`; `docs/data-portability.md` | Default ADOPTED pending ct: paid self-service remains disabled; publishing a catalog does not authorize a public guest or unattended service to create a payment request. Existing personally created payment requests retain their current authority. The implemented cart is zero-charge only. Still unproved: purchase of paid tickets and paid add-ons through Stripe, a provider-confirmed paid ticket and scoped receipt, paid stock race and exact remaining capacity, booking-bound financial balance and PAY-005 refund, refusal of transfer and top-up and cross-booking redemption and general spending, allocated money facts under PAY-007, paid kitchen and sheet facts, failed-payment release and stable processor recovery under BOOK-006, and live sandbox proof. No paid acceptance is claimed. |
| `EXP-003` | Experience guest management | target | missing |  | No implementation of this journey exists. |
| `EXP-004` | Experience cancellation and event settlement | target | missing |  | No implementation of this journey exists. |
| `EXP-005` | Prepaid pickup experiences | target | missing |  | No implementation of this journey exists. |
| `GUEST-002` | Searchable profiles and structured preferences | target | done | `src/placemat/profiles.ts`; `src/placemat/guests.ts`; `public/placemat-profiles.js`; `tests/api/guests.test.mjs` |  |
| `GUEST-003` | Allergy and accessibility handoff | target | partial | `tests/api/guests.test.mjs`; `tests/api/assignments.test.mjs`; `tests/operations-ui-journey.mjs`; `tests/queue-ui.mjs` | Connected POS handoff requires an authorized POS test venue. Booking declarations remain separate from append-only staff acknowledgment and guest-confirmed corrections. Stale or conflicting facts flagged by staff require clarification before acknowledgment. Descriptive corrections never remove required table access constraints. Acknowledgment makes no diagnosis or safe-preparation claim. Shared PIN stands retain the existing restriction on allergy text; personal host sessions and authorized pre-shift and kitchen views carry reviewed facts. |
| `GUEST-004` | Duplicate review and household separation | target | done | `tests/api/guests.test.mjs`; `tests/guest-review-ui.mjs` |  |
| `GUEST-005` | POS-linked visit and item history | target | missing |  | No implementation of this journey exists. |
| `GUEST-006` | Shared guestbook across restaurant groups | target | missing |  | No implementation of this journey exists. |
| `CRM-001` | Visit-based segments and audiences | target | missing |  | No implementation of this journey exists. |
| `CRM-002` | Retention and win-back automation | target | missing |  | No implementation of this journey exists. Inherited ROLE-003 requirement: bulk marketing separately permissioned; this first marketing-send door must enforce a separate explicit grant. |
| `CRM-003` | Campaign creation and conversion reporting | target | missing |  | No implementation of this journey exists. |
| `CRM-004` | Mailchimp audience handoff | target | missing |  | No implementation of this journey exists. |
| `CRM-005` | Post-visit feedback and manager follow-up | target | missing |  | No implementation of this journey exists. |
| `CRM-006` | Return offers and loyalty handoff | target | missing |  | No implementation of this journey exists. |
| `POS-001` | Toast connection | target | missing |  | No implementation of this journey exists. |
| `POS-002` | Square for Restaurants connection | target | missing |  | No implementation of this journey exists. |
| `POS-003` | Clover connection | target | missing |  | No implementation of this journey exists. |
| `POS-004` | Lightspeed connection | target | missing |  | No implementation of this journey exists. |
| `POS-005` | NCR Aloha connection | target | missing |  | No implementation of this journey exists. |
| `POS-006` | Guest and check matching controls | target | missing |  | No implementation of this journey exists. |
| `POS-007` | Live check and kitchen pace | target | missing |  | No implementation of this journey exists. |
| `REPORT-001` | Covers cancellations and no-shows | target | done | `src/placemat/reports.ts`; `src/placemat/http.ts`; `public/placemat-reports.js`; `tests/api/reports.test.mjs`; `tests/service-close-report-ui.mjs` |  |
| `REPORT-002` | Turns waits and server performance | target | done | `src/placemat/performance.ts`; `src/placemat/performance-store.ts`; `public/placemat-performance.js`; `tests/api/reports.test.mjs`; `tests/api/pacing.test.mjs`; `tests/performance-ui.mjs` |  |
| `REPORT-003` | Channels spend and repeat business | target | partial | `src/placemat/model.ts`; `public/placemat.js`; `tests/api/flows.test.mjs` | Online/walk-in/waitlist source labels exist; marketing attribution, POS revenue, source fees and retention/cohorts do not. |
| `REPORT-004` | Experience and payment performance | target | missing |  | No implementation of this journey exists. |
| `REPORT-005` | Scheduled exports and group reporting | target | done | `tests/api/reports.test.mjs`; `tests/group-ui.mjs`; `tests/api/business-export.test.mjs`; `tests/api/finance-role.test.mjs`; `scripts/report-schedule-sandbox.mjs`; `scripts/recurring-reports-sandbox.mjs` |  |
| `REPORT-009` | Weekly group report delivery | target | done | `tests/api/reports.test.mjs`; `tests/group-ui.mjs`; `tests/api/business-export.test.mjs`; `tests/api/finance-role.test.mjs`; `scripts/report-schedule-sandbox.mjs`; `scripts/recurring-reports-sandbox.mjs` |  |
| `REPORT-008` | Scheduled recurring report delivery | target | done | `tests/api/reports.test.mjs`; `tests/group-ui.mjs`; `scripts/recurring-reports-sandbox.mjs` |  |
| `REPORT-006` | Local performance benchmarking | target | missing |  | No implementation of this journey exists. |
| `REPORT-007` | End-of-service report | target | done | `src/placemat/service-close-report.ts`; `src/placemat/recovery.ts`; `src/placemat/pdf.ts`; `public/placemat-close-report.js`; `tests/api/service-close-report.test.mjs`; `tests/service-close-report-ui.mjs` |  |
| `COST-001` | Predictable operating costs | target | partial | `tests/api/costs.test.mjs`; `tests/costs-ui.mjs` | Published Twilio SMS, Stripe domestic-card and Cloudflare prices plus dated owner quotes are planning data. Invoices and processor fees are owner-entered, not authenticated bills. Complete provider usage and bill reconciliation needs authorized provider accounts or authentic billing exports. Channel enablement and campaign journeys, voice, distribution and optional provider prices remain unproved. This planner enables no channel and sends no message. |
| `MIG-002` | OpenTable migration | target | missing |  | No implementation of this journey exists. |
| `MIG-003` | Resy migration | target | missing |  | No implementation of this journey exists. |
| `MIG-004` | SevenRooms migration | target | missing |  | No implementation of this journey exists. |
| `MIG-005` | Tock migration | target | missing |  | No implementation of this journey exists. |
| `MIG-006` | Eat App migration | target | missing |  | No implementation of this journey exists. |
| `MIG-007` | Loman AI handover | target | missing |  | No implementation of this journey exists. |
| `MIG-008` | Cutover rehearsal and change catch-up | target | partial | `src/placemat/import/plan.ts`; `src/placemat/import/index.ts`; `tests/api/flows.test.mjs` | Exact dry-run/apply/journal/conflict-safe undo exists for the Tablein shape; multi-source mappings, reconciliation, deltas and channel cutover do not. |
| `DATA-003` | Complete portable business records | target | done | `src/placemat/business-export.ts`; `src/placemat/business-export-store.ts`; `src/placemat/backup.ts`; `src/placemat/archive-policy.mjs`; `docs/data-portability.md`; `tests/api/business-export.test.mjs`; `tests/business-export-ui.mjs`; `tests/api/embed.test.mjs` |  |
| `ROLE-001` | Owner and group-administrator rights | target | done | `src/placemat/access.ts`; `src/placemat/http.ts`; `src/placemat/group.ts`; `src/placemat/group-access.ts`; `src/placemat/group-store.ts`; `tests/api/group.test.mjs`; `tests/group-ui.mjs` |  |
| `ROLE-002` | Manager and shift-lead rights | target | done | `tests/api/flows.test.mjs`; `tests/pacing-ui.mjs` |  |
| `ROLE-003` | Host server and read-only rights | target | done | `src/placemat/access.ts`; `src/placemat/http.ts`; `src/placemat/preshift.ts`; `src/placemat/service-notes.ts`; `tests/api/server-role.test.mjs`; `tests/api/preshift.test.mjs`; `tests/server-ui.mjs`; `tests/api/pacing.test.mjs`; `tests/pacing-ui.mjs` |  |
| `ROLE-009` | Host guest conversations | target | missing |  | Guest conversations beyond BOOK-007 inquiries stay with MSG-006, and inquiry replies stay manager-only until MSG-006 / BOOK-007 reply authority is built. |
| `ROLE-010` | Group central management | target | missing |  | Deferred: one shared directory of several venues inside one installation, group-wide configuration and billing; later explicitly consented per-venue write rights. |
| `ROLE-004` | Finance marketing and integration rights | target | partial | `src/placemat/access.ts`; `src/placemat/http.ts`; `src/placemat/finance.ts`; `src/placemat/finance-view.ts`; `tests/api/finance-role.test.mjs`; `tests/finance-ui.mjs` | The exclusive owner-granted read-only finance slice is implemented under RL-105. Marketing identities, scoped integration and execution credentials, job-time revocation and settlement reconciliation remain unbuilt. |
| `SEC-001` | Identity and session lifecycle | target | partial | `src/modules/operator-auth/accounts/admin.mjs`; `src/modules/operator-auth/accounts/native.mjs`; `tests/runtime.mjs`; `tests/api/flows.test.mjs` | Native sessions/invitations and active-role checks exist; MFA, step-up and group SSO journeys are absent. |
| `SEC-002` | Shared host-stand device and quick staff switch | target | done | `tests/api/flows.test.mjs`; `tests/api/timeline.test.mjs`; `tests/floor-ui.mjs` |  |
| `AUDIT-001` | Reservation and financial change history | target | done | `src/placemat/audit.ts`; `src/placemat/store.ts`; `src/placemat/commands.ts`; `src/placemat/guest-state-erasure.ts`; `public/placemat-audit.js`; `tests/api/audit.test.mjs`; `tests/api/embed.test.mjs`; `tests/audit-ui.mjs` |  |
| `API-001` | Documented booking and guest HTTP doors | target | done | `docs/HTTP-CONTRACT.md`; `src/placemat/http.ts`; `tests/api/flows.test.mjs`; `tests/api/privacy.test.mjs` |  |
| `API-002` | Versioned integrations and event subscriptions | target | partial | `docs/HTTP-CONTRACT.md`; `tests/api/flows.test.mjs`; `tests/api/integration-schema.test.mjs`; `tests/api/reservation-api.test.mjs` | Ct approved the first slice on 23 October 2026 at 14:15Z: personal-owner grants and explicit delivery only, expiring digest-only keys, encrypted signing secrets, audited consent, no integration domain writes or automatic sends or retries, integration custody excluded from business archives. Anonymous-read scope and guest-ID lifetime remain Gaps. Scoped-key reservation writes, richer field grants, tested schema upgrades and named automation adapters remain unproved. Schema compatibility diagnostics do not claim an upgrade or rewrite signed history. Native personal-owner reservation mutations now have atomic idempotency; integration-key writes remain denied. |
| `VOICE-001` | Loman AI and telephone booking connection | target | missing |  | No implementation of this journey exists. |
| `MOBILE-001` | Phone and tablet host workflows | target | partial | `src/placemat/views.ts`; `public/placemat.css`; `public/placemat.js` | Responsive staff pages exist; native clients, push, device revocation and complete mobile/browser accessibility journeys are absent. |
| `OPS-001` | Connection health and business recovery | target | partial | `src/placemat/backup.ts`; `src/placemat/store.ts`; `tests/api/flows.test.mjs` | Validated domain backup/restore and conflict handling exist; connector health, durable job recovery and Uptime/Oncall handoff do not. |
| `DATA-004` | Privacy retention and group data controls | target | partial | `tests/api/privacy.test.mjs`; `tests/privacy-ui.mjs` | Whole-identity reviewed erasure and recorded finance grounds/manual processor receipts exist. Separate category disposal, expired-finance disposal, complete processor census and purpose-specific field controls across every door remain unproved under RL-101. |
| `SITE-002` | Hosted demo restaurant | target | partial | `src/site/landing/hero.ts`; `deploy-demo.json`; `.github/workflows/run-demo.yml`; `src/demo.ts`; `tests/api/demo.test.mjs` | The demo is deployed and its homepage link is live at 1440 and 390 widths, but its start page is behind a human check that automation cannot pass, so the sample restaurant, booking page, host stand, waitlist, guest history, per-visitor privacy, idle deletion and no-send items are unproven on the live host (the sample venue and its no-send behavior are covered only by tests/api/demo.test.mjs). The link is a fixed href in hero.ts, not tied to the demo being live, so taking the demo down leaves the link until that line is removed. |
| `AGENT-001` | Live voice and message booking agent | push-further | missing |  | No implementation of this journey exists. |
| `AGENT-002` | Cancellation refill through completed conversations | push-further | partial | `src/placemat/commands.ts`; `src/placemat/availability.ts`; `tests/api/flows.test.mjs` | Staff can release capacity and seat waitlisted guests; no agent, offer conversation, expiry or recovered-cover attribution exists. |
| `AGENT-003` | Honest waits from actual service pace | push-further | missing |  | No implementation of this journey exists. |
| `AGENT-004` | Feasible seating and booking improvements | push-further | done | `src/placemat/allocation-advisor.ts`; `src/placemat/inventory-advisor.ts`; `src/placemat/shift-advisor.ts`; `src/placemat/direct-inventory.ts`; `public/placemat-allocation.js`; `public/placemat-allocation-policy.js`; `tests/api/assignments.test.mjs`; `tests/allocation-ui.mjs` |  |
| `AGENT-005` | No-show risk and reconfirmation assistance | push-further | done | `src/placemat/no-show.ts`; `public/placemat-risk.js`; `tests/api/risk.test.mjs`; `tests/risk-ui.mjs` |  |
| `AGENT-006` | Evidence-based guest recovery | push-further | missing |  | No implementation of this journey exists. |
| `AGENT-007` | Permissioned guest enrichment and next visit | push-further | missing |  | No implementation of this journey exists. |
| `AGENT-008` | Measured reversible service experiments | push-further | missing |  | No implementation of this journey exists. |
| `SURFACE-001` | Restaurant registry and Core coverage | target | missing |  | No remote restaurant MCP registry, server classifiers, company-policy conformance journey or specialist-week proof exists. |
| `SURFACE-002` | Booking and guest-contact risk computation | target | missing |  | No remote restaurant MCP registry, server classifiers, company-policy conformance journey or specialist-week proof exists. |
| `SURFACE-003` | Restaurant authority and provider risk computation | target | missing |  | No remote restaurant MCP registry, server classifiers, company-policy conformance journey or specialist-week proof exists. |
| `SURFACE-004` | Restaurant resources and service handoffs | target | missing |  | No remote restaurant MCP registry, server classifiers, company-policy conformance journey or specialist-week proof exists. |
| `SURFACE-005` | A stranger specialist runs a restaurant week | target | missing |  | No remote restaurant MCP registry, server classifiers, company-policy conformance journey or specialist-week proof exists. |
