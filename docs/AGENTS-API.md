# Agent preparation

Create a key as the owner in Settings and keep it private. Send it as `Authorization: Bearer …`, plus the venue's exact `Origin` header for POSTs. API responses are private. Never log a key or paste it into a command line. Keys are bound to an active owner and are individually revocable.

Read `GET /api/state`, then POST `/api/commands` with:

```json
{"command":"proposal.prepare","payload":{"kind":"service.publish","plan":{"serviceId":"ID_FROM_STATE"},"reason":"Friday opening hours, tables and covers are ready for review."}}
```

Other plans:

- `table.assign`: `{bookingId,tableIds:[...]}`. All selected tables must fit the party and be free over the entire interval.
- `reminders`: `{serviceId}`. Captures the exact still-booked, not-previously-reminded bookings.

The response is `{result:proposal}` with a pending status, immutable plan, preparedBy and preparedAt. A signed-in owner/admin reviews **Exact plan** and approves or declines. A key cannot make that decision. Approval records approvedBy/approvedAt; publication and table/reminder changes occur under the current floor-version fence. A changed service, table plan, booking or reminder set returns 409; prepare a new proposal. Keys may not bypass the review by calling other commands.

Native person integrations use the same endpoint with their session and exact Origin. Full route and payload names are in [HTTP-CONTRACT.md](HTTP-CONTRACT.md). Invitations and session management remain Base native auth (the People & invitations section).
