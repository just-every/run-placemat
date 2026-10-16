# First release

- A venue owner or manager sets its timezone, floor tables, turn times and cover limit, then approves an exact Friday service for publication.
- Guests make three online bookings; staff seat a walk-in on the floor, waitlist another party, record a no-show and seat the waiting party. Guest history and approved reminder CSVs remain available.
- Owner, manager and read-only staff permissions apply directly to the server. An agent prepares service, table-assignment and reminder proposals; a person approves them and the decision is recorded.
- An owner moves Tablein-shaped guest/history CSV data in with a dry run, exact-plan apply, durable journal and conflict-safe undo.
- An owner backs up and restores into an empty product installation, and erases guest details and retained import custody. Corrupt, overwriting and known pre-erasure restores are refused.

- The run site (`rer build --site`) serves the homepage, whose Run Placemat opens `/run`, and the owner guides from `docs/` at `/docs`; the installed `/` stays the Lobby.

Not needed: deposits, card holds, payments, POS, ordering, delivery, marketplace listings, real reminder-provider calls or a purchased domain (the run site's `run-placemat.com` is not registered yet, and its deploy workflow stays off). The Tablein fixture proves a documented shape; it is not a verified customer export.
