# Placemat

Restaurant table bookings, a service floor, walk-ins, waitlist and guest history in your own Cloudflare account. Release one has no payments or per-cover network. [ACCEPTANCE.md](ACCEPTANCE.md) names the working scope.

## Clone and run

You need Git and internet access on macOS or Linux. RER selects this project's pinned Node **22.20.0** and pnpm **10.12.4**; you do not need to change your global Node version.

```sh
npx -y @runeditrun/rer@0.2.22 cli install
git clone https://github.com/just-every/run-placemat.git
cd run-placemat
rer dev
```

The first run installs dependencies, applies every D1 migration and creates a local review owner. Give it up to ten minutes. Open the printed `RER_OPEN` link on this computer, check the owner on **Finish setup**, tick its confirmation and click **Finish setup**. You arrive at `/app`. Keep `RER_OPEN` private: it signs you in. Local development sends no email. A fresh installation is empty.

If `rer` is not on your shell's PATH after installation, run `export PATH="$HOME/.local/bin:$PATH"`. Start again with `rer dev`; it resumes a partial launch. The saved port is printed as `RER_READY`; use that address throughout, not a guessed port. Stop with `rer dev --stop` or Ctrl-C.

For an installation belonging to a real person, use `rer install`, then `rer setup` and answer its owner-email prompt before `rer dev`. Setup preserves existing data on reruns. `rer dev --as admin` and `rer dev --as member` provide local manager and read-only personas; `rer dev --as signed-out` opens the guest view. Return to the owner with `rer dev --as owner`.

## Run Friday dinner

1. In **Settings**, save the venue name and an IANA timezone, for example `Australia/Brisbane`. The app displays and accepts venue time even when your computer uses another timezone. Set it before creating a service.
2. In **Services & tables**, add four two-seat tables, T1–T4, at distinct floor positions such as 15%, 38%, 61% and 84% across, 40% down. Create a future **Friday dinner**, 18:00–22:00, 90-minute turns and eight covers. Click **Prepare publication**, follow **Approvals & reminders**, expand **Exact plan**, and **Approve plan**. A draft is private until approved.
3. Open **Guest booking page** (`/book`) in a private browser window. Book three parties of two at 18:00 with distinct guest emails. Each success displays its booking reference. The page lists only available 15-minute starts that fit a complete turn. Staff click **Refresh** to see new bookings.
4. In **Floor & bookings**, expand **Add a walk-in** and seat a fourth party of two at 18:00. Leave Tables empty for automatic assignment. The floor shows booked and seated tables at the selected time. Table combinations are automatic when one table cannot fit a party; table clashes and the service's cumulative cover limit cannot be overridden.
5. In **Waitlist**, add the next party. In the bookings list change one booked party to **no-show**. Seat the waiting party at 18:00. The no-show stays in guest history and its freed capacity is available. Staff can mark a booked guest seated, then completed; cancelled and no-show bookings remain in history.
6. Under **Approvals & reminders**, **Prepare reminder batch**, review its exact bookings and approve it. **Download reminders CSV** gives contacts and approved messages for your venue's own sender. Placemat records approval and export; it does not deliver email or SMS. Cancelled/no-show/erased guests are omitted. Each booking also has a **Calendar** download.
7. Under **Guests**, expand a guest to read visits and save notes. Owners can explicitly erase personal details there. Staff cannot erase guests.

Publication fixes the service's hours, cover limit and turn duration. To offer another sitting, create another service. Draft edits invalidate old publication proposals. Tables with booking history are kept unchanged; add a new table when the physical layout changes. The floor is a functional table layout on Base's theme; visual design comes later.

## Move in and undo

In **Move in**, choose [`fixtures/tablein-guests.csv`](fixtures/tablein-guests.csv), click **Preview import**, inspect guests, diagnostics and counts, then **Apply reviewed import**. No guest is written by the preview. The journal records the exact source and checkpoint; a partial job can be resumed by applying the same reviewed CSV. **Review undo** opens the exact job; type `UNDO` and submit. A guest edited after import blocks strict undo and the staff edit survives.

This is a **Tablein-shaped guest and historical-visit kit**, using invented data. It has not been tested against a real Tablein export. It never creates active future reservations or assumes marketing consent. See [MOVE-IN.md](docs/MOVE-IN.md) for its documented columns, limits and HTTP commands.

## People and agents

The owner can invite people under **Settings → People & invitations**. **Owner** controls move-in, erasure, backups and agent keys; **admin** is the floor manager; **member** can read venue operations. Every private server handler checks its session and role. Guests can only read published availability and create their own booking.

An owner creates a preparation key under **Settings → Agent preparation keys**, copies it once into private agent storage, and can revoke it there. A bearer key can read `/api/state` and POST `/api/commands` with `proposal.prepare`. It cannot approve, change the floor directly, erase, import or back up. Plans are `service.publish`, `table.assign` and `reminders`. A native owner/admin approves from the UI; changed plans or clashes require another proposal. [AGENTS-API.md](docs/AGENTS-API.md) documents the requests.

## Backup, restore and erasure

**Settings → Backup & restore** downloads a Base portability JSON archive. On an empty product installation, choose it, type `RESTORE` and submit. Restores check integrity, schema, relationships, emptiness and erasure fences. If restoring an older backup elsewhere, also choose a trusted later backup in the optional journal field. Auth identities, agent secrets, rate-limit state, local settings and mail outboxes are excluded. Set up a fresh owner separately.

For a complete native local transfer, stop the server first:

```sh
rer dev --stop
rer export --output exports/venue.rer
# In a fresh checkout with no product data:
rer import --input /absolute/path/venue.rer --yes
rer dev
```

Both interfaces use the same product policy. Keep archives private and outside public/server folders. Erasure anonymizes a guest's live history, notes and import custody, withdraws affected original CSVs, and records contact hashes that block reimport. Known older backups are refused. When restoring an offline backup elsewhere, supply a trusted later archive via `rer import --journal /path/to/later.rer`; an isolated old backup cannot know later erasures. Erasure cannot delete files already downloaded outside the installation. Do not use `rer reset` as an erasure or migration workflow: it removes local owner/data/settings after confirmation.

## Deploy to your Cloudflare account

No domain purchase is needed for the Worker app. `rer deploy` uses Base's owner-account deploy kit, creates its declared D1, applies numbered migrations and checks the deployed health and assets. It does not run tests. Deployment needs your Cloudflare account/token and a verified mail sender; no credentials are included here.

1. Stop local dev. In `deploy.json`, set `vars.MAIL_FROM` to your verified sending address and select the matching `MAIL_PROVIDER` (default `resend`). Keep the declared project, Worker and D1 identities. Commit source changes before a real deployment.
2. Create a private mode-0600 `.env.deploy` using an editor, with `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `OWNER_EMAIL`, `SESSION_SECRET`, `SETUP_TOKEN` and `MAIL_API_KEY`. Session and setup secrets must be separate strong random values of at least 32 characters. The Cloudflare token must be scoped to your intended account with Worker and D1 deployment permissions. Never commit this file or put values into CLI arguments.
3. Run:

```sh
rer deploy --dry-run --env-file .env.deploy
rer deploy --env-file .env.deploy
rer signin --env-file .env.deploy
```

The dry run builds and validates without provider calls. The real deploy prints its Worker URL. Open the one-time owner link printed by `rer signin`, complete **Finish setup**, and use `/app`. Keep the link private. Ordinary sign-in uses your configured email provider; confirm its sending-domain setup first. Provider setup is described in [OPERATIONS.md](OPERATIONS.md) and the installed `node_modules/@runeditrun/rer/modules/deploy-kit` documentation. A local passing check does not claim real provider delivery.

## Development checks

```sh
rer dev --stop
pnpm test:api
rer verify
```

The six HTTP integration tests run the real workerd/D1 implementation, with only the paid mail boundary faked. They cover the Friday flow, direct auth and CSRF, person approvals, concurrent table claims, import/undo, erasure and restore. The emitted-Worker smoke check also runs on pushes. GitHub **Verify** runs source, API and built-runtime shards in parallel; installer journeys run on release tags and nightly. No tests run during build or deploy. The suite remains below the 200-test budget.

Pinned RER: **0.2.22**. Foundation: [`runeditrun/base@c7cb0613`](https://github.com/runeditrun/base/tree/c7cb0613120074c5ffca63f610533802afbda6bd). Reuse and known shared-module gaps are documented in [SOURCES.md](docs/SOURCES.md).
