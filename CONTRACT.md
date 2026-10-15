# Placemat first-release contract

The public acceptance scope is ACCEPTANCE.md. Base's required command behavior is SEED-COMMAND-CONTRACT.md.

- Private product routes require an active native session or an owner-issued, unrevoked preparation key. Owner/admin may run floor operations and approve plans. Member may read. Move-in, erasure, backups and keys require the owner person.
- Guests can read published services and create an assigned booking. Guest contact data is never included in public availability or confirmations for other bookings.
- Tables use half-open UTC intervals, full-turn fit, 15-minute starts, distinct table combinations and cumulative service covers. Writes compare the floor version; a changed floor returns a conflict.
- Publication and reassignment/reminder proposals capture exact drafts. Agents cannot approve. A person's approval and identity are recorded. Changed drafts or physical table clashes refuse the decision.
- Reminders are approved CSV exports for the venue's own sender. No deposits, card holds, payments or provider sends occur.
- Tablein-shaped move-in uses Base import-kit with dry-run, confirmed fingerprint, atomic native/journal batches and strict edited-row undo protection.
- Owner backups use Base portability with integrity, relationship and empty-destination checks. Erasure removes live and import-custody personal values and fences known older backups. A trusted later journal is needed to convey erasures to an isolated offline restore.
