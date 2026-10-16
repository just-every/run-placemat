# Source and scope

The runnable edition was generated from the committed Base foundation at **c7cb0613120074c5ffca63f610533802afbda6bd**, then composed and converted to package mode with the maintained exporter. `composition.lock.json` records copied Base source. `@runeditrun/rer` is pinned to the newest published version, **0.2.26** (moved from 0.2.22 with the style pass on 16 Oct 2026). The installer/deploy/Worker/D1 identities assigned by that generation are retained.

Adapted sibling source, read without modifying its repository:

- Dial `de8b07eabe4f5ed9c74dc5a9af71c7b00db170e4`: availability/engine.ts UTC-first, half-open slot arithmetic → `availability.ts`; bookings/calendar-file.ts escaping, UTC timestamps and UTF-8 folding → `downloads.ts`; reminder-commands.ts once-only booking reminder selection → `commands.ts` (approved CSV delivery boundary).
- Glove `1b13d601922a3d9d0e0ddd149bef21f166862973`: commands/dispatch.ts conflict inspection and prepare/person-approve split → table assignment proposals. Placemat refuses a physical table clash rather than permitting an override.
- Lanyard `5316693371c149ffd3eb398a796ba66d83affa03`: domain/roster.ts exact draft publication → service publication proposals. Current Satchel, Barrow and Lanyard package-mode mains were read as implementation examples.

The original sibling and Base MIT licenses remain applicable. Placemat's covers, table combinations, floor, waitlist and documented-shape Tablein guest/history adapter are product-owned. Market research is not part of this repository.

Shared Base gaps with the chosen local default:

- `foundation/README.md:140`: the optional import-kit has no single complete foundation migration. Default: materialize the pinned D1 module's exported schema sequence as new migration `0021_import_kit.sql`, plus the native revision attachment. No Base source is changed.
- `modules/portability/journal.mjs:13` and `modules/import-kit/src/d1/erasure.ts:35`: portability returns opaque prepared statements while kit erasure accepts SQL descriptors. Default: fence and invalidate portability before and after atomic kit erasure; report success only after the final checkpoint. No claim of one cross-module atomic batch.
- `foundation/template/wrangler.jsonc:12` and `foundation/template/scripts/installer/local.mjs:12`: generated editions retain the template database identity `foundation`. Default: preserve that assigned identity and do not rename resources.

No payments, card data or payment-provider integration exists. Reminder CSV export is explicit and approved; the venue sends it using its own service. No real Tablein sample or provider call was used.
