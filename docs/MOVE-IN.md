# Placemat move-in

The included Tablein kit is **documented-shape only**. It demonstrates a guest and
historical-visit CSV contract using invented `example.test` identities. It is not
verified against a real Tablein customer export. No provider API is called, no
credentials are requested, and no future reservations or consent are inferred.
`fixtures/tablein-guests.csv` is the complete working shape fixture.

The exact header is:

```csv
guest_id,name,email,phone,notes,visit_date,party_size,visit_status
```

Use UTF-8, comma-separated fields, double quotes around fields containing commas
or line breaks, and doubled double quotes within quoted fields. CRLF/LF and one
UTF-8 BOM are accepted. Header spelling/order is exact; extra columns are rejected.
There are at most 100 data rows and 64 KiB of CSV bytes per request. The JSON body
is separately capped at 100 KiB. Empty physical records are ignored.

`guest_id` (up to 100 characters) must remain stable across exports. `name` is
required and at most 200 characters. Email is at most 254 characters, phone 80,
and notes 4,000. Contact fields are trimmed, and email is lowercased. Phone accepts
digits, `+`, parentheses, whitespace, dots and hyphens. Guests without contact
information produce a warning because matching can use only their source ID.
Different guest IDs sharing a normalized email or phone must be consolidated.
The importer also rejects a contact already held by a different native guest.

A row without all three visit fields imports a guest only if all three are empty.
Otherwise `visit_date` must be a real `YYYY-MM-DD` date, `party_size` an integer
from 1 to 100, and `visit_status` one of `booked`, `seated`, `completed`, `cancelled`
or `no-show`. Repeated guest IDs consolidate history, provided their name,
contacts and notes agree exactly after normalization. Identical visits are
consolidated with a warning; distinct visits are sorted. Historical data remains
in `Guest.history`; it never creates an active reservation or triggers reminders.

## HTTP contract

All endpoints require an authenticated owner person. The parent handler must
authenticate and owner-authorize before calling
`importResponse(request, env, actor)`. The importer independently rejects agents,
checks the owner role, resolves the real operator session and binds that session,
operator version, active owner role, revocation and expiry into the real D1 kit's
transaction authority predicates. Every POST also requires `Origin` to equal
`env.AUTH_ORIGIN` exactly. Pass runtime-adjusted bindings in local development.
Responses are private and use `Cache-Control: no-store`.

Errors are `{ "error": "message" }` with a non-2xx status. Successes are
`{ "result": ... }`:

- `POST /api/import/dry-run`, body `{csv}`: result
  `{fingerprint,counts,diagnostics,preview,canApply}`. `preview` is the consolidated
  Guest array, and diagnostics have `severity`, `code`, `message` and optional
  `location` (`artifact`, `row`). CSV/parser failures return a 400/413 error;
  row validation errors are returned as diagnostics with `canApply:false`.
  Dry-run performs only native and kit SELECTs and creates no job or native rows.
- `POST /api/import/apply`, body `{csv,confirm:fingerprint}`: reruns the same
  deterministic review and requires its exact fingerprint. Any error diagnostic
  prevents publication. Result is `{job}`. The kit creates/reuses the fingerprint
  operation, retains the exact CSV bytes, and applies real native writes and kit
  journal/provenance in atomic D1 batches. It never overwrites an existing guest.
  An exact retry may reuse its own unchanged imported guests. A different CSV
  conflicting with an existing guest is rejected.
- `GET /api/import/journal`: result `{jobs}` contains the latest 30 jobs belonging
  to the acting owner in this destination/namespace. Each job is read through
  the kit's authority and integrity boundary.
- `GET /api/import/journal/:jobId`: result `{job}`.
- `POST /api/import/undo`, body
  `{jobId,confirm:"UNDO",fingerprint:job.fingerprint}`: result `{job}`. Completed
  imports use strict undo. Partial imports use rollback. The kit checks exact
  native values and revision, so a guest edited after import blocks reversal
  with a 409 whose `error` names the edited guests, says nothing was undone and that the edit was kept.

A job contains `id`, `fingerprint`, `destination`, `namespace`, `mappingVersion`,
`principalId`, `state`, `checkpoint`, `total`, `fence`, `error`, and optionally
`erasedRecords`. Application is bounded to 10 source records per batch and three
batches per request; D1 may return earlier under its request budget. If state is
`queued` or `applying`, repeat the same apply body to resume. If state is `undoing`
or `rolling_back`, repeat the same undo body until `undone` or `rolled_back`.
An HTTP success alone does not mean a partial job is complete. A failed reversal
may already have durable reversal intent; forward application is then prohibited.

## Erasure and retained custody

The native owner command calls
`eraseImportedGuest(db, guestId, actor, extraSqlDescriptors?)`. It requires an
owner person and fences the current active owner/version in SQL. The parent
must enforce the native session at the HTTP boundary. The optional descriptors
are inert `{sql,params?}` values executed in the same kit transaction.

The helper atomically scrubs the target's retained source records, provenance,
reversal before-images and related matching records; withdraws affected whole
CSV originals; inserts permanent contact tombstones in `pm_erased`; replaces the
native row with an erased pseudonym at the same ID and incremented native version;
and removes its kit revision attachment. The adapter treats that pseudonym as a
logically absent import target, preserving references from historical bookings.
The result is `{erasedRecords,identityHashes}`. Repeating an erase of an already
anonymized row is safe; existing tombstones remain permanent.

`guestIdentityHashes(guest)` returns independent SHA-256 digests of
`"email:" + trim(email).toLowerCase()` and `"phone:" + phone.replace(/\D/g, "")`,
omitting empty contacts. A match on either tombstone prohibits reimport even if
the other contact changed. The kit's own erased target/source identities add
replay protection for records without contacts. Tombstones retain no cleartext
contact. Same-person identification across different IDs and entirely changed
contact details cannot be inferred from this shape.

Native publication checks both permanent tombstones and normalized contact
collisions inside its D1 transaction. Strict undo never restores erased custody.
Erasure withdraws an affected original artifact in full, including bytes belonging
to other guests in that CSV; other non-erased structured guest records remain.
Raw CSV files outside this installation are outside its custody.

Base portability currently returns opaque prepared statements rather than the
kit's inert SQL descriptors. The parent integration fences Base retained backups
and transfer snapshots before and after the kit erasure, and returns success only
after the final checkpoint. This is a shared-module composition gap; this helper
cannot claim a single atomic transaction encompassing opaque portability writes.

## Pinned module and migration evidence

`src/modules/import-kit/src` and `src/modules/d1-transport/index.{mjs,d.mts}` are
copied without application replacements from Base commit
`c7cb0613120074c5ffca63f610533802afbda6bd`. `kit.ts` uses its Worker-safe D1 entry,
never its synchronous SQLite engine. The native adapter writes `pm_guests` and
`pm_import_guest_revisions` in the same real D1 transaction as the journal.
Numeric native versions map to the kit's opaque revisions through the attachment
table; guards compare every JSON field/array position as well as native version.
No fake database, mock adapter, provider fallback or retry engine is used.

The foundation had **no import-kit migrations**, although the pinned module
exports the schema. New migration `0021_import_kit.sql` materializes these
exports verbatim in the initializer's order:

1. `d1Schema` (including preserved-undo evolution, plan/original chunks, ownership
   history and atomic assertions).
2. `d1ErasureSchema`.
3. `d1StreamOriginSchema`.
4. `d1LegacyStreamReceiptUpgrade`.
5. `d1StagingSchema`.
6. `d1NativeStagingSchema`.
7. `d1CustodyStateSchema`.
8. `d1ReversalFenceSchema`.
9. `d1PreparationSchema`.
10. `d1PreparationStepsSchema`.
11. `d1RetirementSchema`.
12. `d1ErasureProgressSchema`.

The migration then adds the product-owned `pm_import_guest_revisions` table.
This closes the missing foundation schema and D1 transport-copy gaps without
rewriting any applied migration or modifying the pinned module. The migration
must run once through the normal numbered migration runner; preserved-undo ALTER
statements are deliberately not reapplied on every HTTP request.

