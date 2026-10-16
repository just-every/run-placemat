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
