Every booking, walk-in, waitlist entry and import adds to a guest's history. **Guests** keeps that history beside your notes, in your own installation.

## Find a guest

Type a name, email or phone number into **Find a guest**. Search ignores case and accents in names, and punctuation or a leading US country code in phone numbers; a phone suffix also works. Search does not merge people who share a number. Expand a guest to see their contact details, how many visits Placemat has recorded, and each visit with its date, party size and status.

## Keep preferences and notes

Add explicit **Tags**, choose a **VIP level**, enter a **Seating preference** and write **Guest notes**, then press **Save profile**. Owners and managers edit these facts; read-only staff and authorized preparation keys read them under the same rules as guest notes.

Each changed field shows who recorded it and when. **Contact and note sources** distinguishes imported, guest-supplied and staff-observed facts. Missing historical sources and original import dates say they were not recorded. **Dated service notes** keeps actual staff edits with their author and time. Placemat does not infer allergies, access needs or consent.

When the guest books again with the same email, their preferences and sources appear beside their booking at arrival. The profile combines imported visits with current reservations.

## Review duplicates

Expand a guest and press **Review possible duplicates**. Placemat suggests matching email addresses or the same full US phone and name. A shared family phone with a different name appears separately as a household. Imports preserve separate source identities even when contacts match.

Owners and managers can **Preview merge**, inspect the conflicting fields, visits and original-contact permissions, then type `MERGE` to keep the selected profile. The merge journal keeps both originals and their sources. Marketing permission remains not recorded; a merge cannot grant unknown permission or remove a recorded restriction. Approved reminders keep their original recipients.

**Review merge journal** offers **Preview unmerge**. Type `UNMERGE` to restore unchanged records. Later edits and newly created records stay in place and are listed for a person to assign; inspect those before reconciling visits. Reversal never restores more permissive contact consent. The owner can export the journal and its snapshots with the other portable business records.

## Erase a guest

When a guest asks you to remove their details, the owner expands **Erase personal details** on that guest, types `ERASE` and presses **Erase guest**.

Placemat removes the guest's name, contact details, profile preferences, dated notes and their sources, and their details held for an import. Their bookings stay, without anything that identifies them, so your covers and history still add up. The same contact details cannot be imported again. Erasure cannot reach files that were already downloaded and kept outside Placemat, such as an exported reminders CSV.

Erasure includes reviewed aliases and any later-edited profile that still retains that merged identity pending assignment. It removes the merge snapshots and permanently prevents reversal. Previously reversed profiles stay separate; their shared journal snapshots are still removed.

Only the owner can erase guests.

## Optional diner account

Guests can keep booking without an account. From the booking confirmation or the **Your diner account** link on the booking page, they can request a private code using one booking reference and its recorded email. The email code expires after 15 minutes and attaches only that booking. Another booking with the same email or a shared phone never appears without its own verification.

Each device verifies a booking independently and stays signed in for up to 24 hours in that tab. The account shows upcoming and previous verified reservations, a favorite for this restaurant and separately saved preferences. **Book again** opens a fresh guest booking; contact details and preferences are not copied automatically.

**Manage reservation** opens the existing reviewed change flow for an upcoming verified visit. The diner reviews exact time, party size or contact changes, reconfirmation or cancellation and acknowledges the consequences before confirmation. Failed availability checks preserve the original reservation. Financial obligations require the venue manager’s review; no automatic payment or refund occurs. Changing the reservation email ends the old account’s access to that booking.

**Revoke saved preferences** clears this restaurant’s saved text on every signed-in device when refreshed. It leaves the favorite and restaurant reservations in place. **Sign out this device** ends only that device session. Under **Account settings**, **Forget diner account** removes this restaurant’s account records and signs out every device while preserving the restaurant’s reservations. Accounts and preferences are never shared between installations.

Diner verification and account changes retain guest attribution, timestamps, source and explicit before-and-after audit values. Account forget redacts saved preference values copied into that history. An older archive is refused when the destination knows the later forget checkpoint or receives its trusted later journal; an isolated destination cannot infer an unseen forget.


## Reviewed native enrichment

A personal venue owner or administrator can expand **Review guest enrichment**
inside a guest profile. Preparation keys can prepare the same deterministic
proposal but cannot approve, reject, undo or edit profiles. Preparation alone
changes no profile. Every decision rechecks current authority and commits with
its audit and guest version guards.

The command door is `POST /api/commands`. Prepare with
`guest.enrichment.prepare` and a `guestId`. Read the manager-only journal with
`GET /api/guests/enrichment?guestId=<id>`. The proposal contains its own ID,
review digest, supported tag candidates, fact references, source attribution,
confidence explanation and explicit unknowns. Approve with
`guest.enrichment.approve`, the exact `proposalId` and `review`, and
`confirm: "APPROVE"`; reject with `guest.enrichment.reject` and the same exact
proposal reference. Request bodies cannot supply replacement candidates.
Changed profile facts, attendance or identity history require a new proposal.
An already decided proposal cannot run again, including concurrent requests.

Only exact recognized structured occasions and seating preferences qualify.
Repeat-visit tags use native staff-recorded attended bookings whose visit has
started; cancelled, no-show, future and imported visits do not establish that
attendance. Free notes never establish a dietary, health, religious or access
condition. Unsupported text and missing provenance remain unknown. Connected
POS spend and refunded spend remain unproved; no spend segment is proposed.

`guest.enrichment.undo` requires the exact proposal reference and
`confirm: "UNDO"`. It removes only tags still attributed to that enrichment.
Later independent tags, re-added staff facts, notes and other profile fields
remain intact. The journal names the person and time, removed tags and later
edits it preserved. Merged identities and subsequent reversals cannot replay an
old decision. Erasure removes linked proposal facts and audit snapshots.

The owner business export includes `guest-enrichments.csv` alongside the audit
CSV. Structured backups preserve historical facts and person attribution, but
export enrichment proposals as inert historical records. Restore never restores
approval or undo authority, and the existing erasure journal fences older
backups. No enrichment grants consent, group sharing, campaign admission,
outbound sending or unattended execution. Those duties remain in AGENT-007's
Gap and its named prerequisite clauses.
