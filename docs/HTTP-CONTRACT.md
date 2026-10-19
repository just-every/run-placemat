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
