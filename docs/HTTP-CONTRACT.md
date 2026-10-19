# Product HTTP contract

All private GETs require a native active owner/admin/member session (or read-only/preparation agent key). All private POSTs require exact Origin and owner/admin, with owner-only keys, erase, backup/restore and move-in. Agents may only read state and prepare proposals; approval always needs a native person session. JSON errors are `{error:message}`; POST success `{result:...}`.

- GET `/api/state`: `{state,guests,actor,version,names}`; `names` maps each person or preparation key that prepared or approved something to a readable name; guest rows are `{id,name,email,phone,notes,history?}`. State types in src/placemat/model.ts.
- POST `/api/commands`: `{command,payload}`. Commands: `venue.update` {name,timezone}; `table.save` {id?,label,seats,x,y}; `service.save` {id?,name,startAt,endAt,turnMinutes,coverLimit}; `proposal.prepare` {kind,plan,reason}. Plans: service.publish {serviceId}; reminders {serviceId}; table.assign {bookingId,tableIds}. `proposal.approve` / `proposal.decline` {proposalId}; `booking.walkin` {serviceId,name,email?,phone?,partySize,startAt,tableIds?}; `booking.status` {bookingId,status}; `waitlist.add` {serviceId,name,email?,phone?,partySize}; `waitlist.seat` {waitlistId,startAt,tableIds?}; `guest.update` {guestId,notes}; `guest.erase` {guestId,confirm:"ERASE"}.
- GET `/api/public/services`: published service objects plus current availability (no guest data).
- POST `/api/public/book`: {serviceId,name,email,phone?,partySize,startAt}; auto-assigns available table or a combination; 409 when full. Response only booking id and confirmation, no other guest data.
- GET `/api/reminders.csv` person owner/admin: approved reminders exported for venue's own sender. No provider calls.
- GET `/api/calendar/:bookingId` private: calendar download.
- POST `/api/agent-keys` {name}: owner-only one-time secret. DELETE `/api/agent-keys/:id`: revoke.
- GET `/api/backup`; POST `/api/restore` {archive,confirm:"RESTORE"}: owner, empty product destination, integrity and erasure fences. A refusal's `error` explains the cause and next step in plain language.
- Move-in endpoints are documented by the importer author in docs/MOVE-IN.md. UI sends CSV text; importer returns dry-run plan then explicit apply, journal and undo.

`/app` floor, operations, guests, approvals and move-in screens share one page with navigation anchors; `/book` is the guest page. Scripts must show server errors and wait for success before updating the screen. Datetimes are ISO UTC; UI labels times in the venue timezone and converts local input via Intl (reject ambiguous/nonexistent times). First setup is empty, never demo data.

### REPORT-001 reservation reports

A signed-in owner/admin reads `GET /api/reports/reservations` or downloads the identical row selection at `GET /api/reports/reservations.csv`. Members and preparation keys cannot export reports. Query filters combine: `venue` (current venue name), `dateFrom` / `dateTo` (inclusive local service-start dates), `serviceId` (shift), `area`, `source`, `status`, `partyMin` / `partyMax` (inclusive 1–20), and `period` (`all`, `past`, `current`, `future`, based on the service interval). Omit a filter for all values. Invalid dates, enums and reversed bounds return 400. Unknown venue, area or shift yields no rows.

Booked covers include every matching reservation, including cancellations and no-shows; attended covers are seated/completed reservations. Cancelled/no-show/attended rates divide their covers by all booked covers; a zero denominator is reported as null. Each total includes its booking IDs; CSV contains those same reservation rows, with no guest contacts or notes. A combined-table booking contributes its covers once even when it includes multiple areas. Tables without an area belong to Dining room. Services and booking instants are stored in UTC and rendered in the venue IANA timezone; service dates follow the service start even across midnight or daylight-saving changes.

### GUEST-002 profiles and normalized search

`GET /api/guests?search=...` uses the same native session or preparation-key read authority as `/api/state`. It omits erased guests and matches case/accent-normalized name/email or phone digits, ignoring US punctuation and an optional leading 1; phone suffix lookup is supported. This search does not merge identities: booking still reuses exact normalized email only.

An owner/admin person submits `guest.profile` to `/api/commands` with `guestId` and any of `tags` (up to 20 unique strings), `vipLevel` (`none`, `regular`, `vip`), `seatingPreference`, or `notes`. Unspecified fields remain unchanged. Each changed fact keeps the staff actor/time and explicit source; note changes retain dated history. The existing `guest.update` command remains a note-edit door. No public booking input writes private profile facts. The guest profile shows current bookings and imported visits together; flags and seating preferences also appear beside arrivals in the booking list.

Guest-supplied contacts, staff-observed fields and Tablein-shaped imports have separate provenance. An import lacking an original date says date not recorded; legacy records lacking provenance say source not recorded. No allergy, access need, diagnosis or consent is inferred. Current owner/admin staff edit and existing member/preparation-key readers see the same fields they may already read as guest notes, as ct approved on 19 October. Restricted facts and finer roles introduced by GUEST-003, ROLE-003, ROLE-004 and DATA-004 must enforce their field scopes in every profile/search/arrival/backup door before shipping. Owner erasure removes the profile, note history and provenance with the guest's other personal values.

### SERVICE-004 channel rules

`service.save` accepts `bookingRules` with `online`, `walk-in` and `waitlist` objects. Each has `minParty`, `maxParty`, `horizonDays` (inclusive local calendar days), `leadMinutes` (elapsed; zero disables the staff-seating lead check, while public bookings remain future-only), `sameDayCutoff` (inclusive venue HH:MM), `slotMinutes`, `inquiryAbove`, and `blockedStarts` (offset instants). The public services door filters these rules, and public booking checks them again. Slots align to service start. Staff `booking.walkin` and `waitlist.seat` may pass `overrideReason` for party/horizon/lead rules as owner/admin; the resulting booking keeps the exact violations, actor, timestamp and reason with a `booking.rule-override` audit link. An override never bypasses table fit or clashes. Oversized inquiries are directed to contact the venue; this does not submit or confirm an inquiry.

### SERVICE-006 turns and reset

`service.save.turnPolicy` has `cleanupMinutes`, optional offset `lastSeatingAt`, `partyTurns: [{minSize,maxSize,minutes}]`, `tableTurns: {tableId:minutes}` and `areaTurns: {area:minutes}`. Party ranges do not overlap. Table overrides area, then party range, then service duration; a combination uses the longest constituent turn. Confirmations separate guest `endAt` from table `cleanupEndAt`. Full turn and cleanup must fit service hours and last seating is inclusive. A completed booking with a reset still protects that original reset interval.

To change future rules, prepare `service.turns` through `proposal.prepare` with `{serviceId,turnPolicy}`. The exact proposal includes per-reservation current/proposed times and whether the new policy would exclude it; existing bookings are explicitly preserved. A person approves through `proposal.approve`; any intervening service/floor/booking edit requires renewed review. Experience-specific rules are owed by EXP-001/002 before those capabilities ship.

### WAIT-006 accountable queue

`waitlist.add` returns `queued` with intake time, actor history and an owner. Optional `quoteMin`, `quoteMax`, `basis` record a quoted range; a missing phone creates an owned no-contact follow-up with optional `contactReason`. Current owner/admin staff use these additional commands:

- `waitlist.status` `{waitlistId,status,reason}` records offered, accepted, arrived, declined, expired or abandoned transitions; only `waitlist.seat` creates a capacity-checked booking. Offers/replies are staff observations, not provider sends or inventory holds.
- `waitlist.quote` `{waitlistId,quoteMin,quoteMax,basis}` retains quote history.
- `waitlist.priority` `{waitlistId,priority,reason}` records a higher-first numeric priority and current acting owner.
- `waitlist.followup` `{waitlistId,followUpId,outcome}` completes an owned follow-up with actor and time, including after closure.
- `service.close` `{serviceId,reason}` resolves every remaining queue entry, preserves seated history and disables new public bookings, walk-ins and queue intake for that service. Offered/accepted become expired; other active entries become abandoned, with assigned follow-up. Existing reservations remain.

Actual wait is intake-to-seat or terminal disposition in elapsed minutes; UI rounds to a tenth, and missing legacy observations are labelled not recorded. Legacy waiting/cancelled rows display as queued/declined without inventing dates. Erasure removes linked operational free text and copied service-close instructions while retaining anonymous timings and accountability.

### SERVICE-002 recurring schedules

Owner/admin commands use `/api/commands`. `schedule.save` accepts `{id?,name,shift,seasonStart,seasonEnd,weekdays,startTime,endTime,turnMinutes,coverLimit,startOffset?,endOffset?,exceptions}`. Shift is breakfast/lunch/dinner; weekdays use Sunday=0. Seasons are inclusive local dates. Exceptions are `{date,closed:true}` or `{date,closed:false,startTime,endTime,turnMinutes?,coverLimit?,startOffset?,endOffset?}` and replace the weekly day. End at or before start is next-day. DST gaps refuse; repeated times need the actual selected offset.

`schedule.preview` accepts `{fromDate,toDate,reason,scheduleIds?,renewServiceIds?}` for an inclusive batch of up to 31 dates. Success returns a pending `schedule.publish` proposal containing candidates, physical seats/service covers, conflicts, changed services requiring renewed approval and an exact snapshot. Preview successive batches for longer seasons. Approve using `proposal.approve {proposalId}` or `schedule.publish {proposalId}`. Any intervening schedule/venue/table/service/booking edit invalidates publication. Overlaps refuse publication. Unchanged occurrences are never duplicated. Changed unbooked services renew/close only when explicitly selected in a fresh preview; booked and historical services remain unchanged, with affected-booking handling owed by SERVICE-003. The staff page exposes the editor, preview, explicit renewal selection and approval.
