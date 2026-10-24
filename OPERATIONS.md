# Placemat operations

Run all first-party operations from the composed, runnable edition checkout
with `rer`. Without it, start with
`npx -y @runeditrun/rer dev just-every/run-placemat` (set up only:
`npx -y @runeditrun/rer setup just-every/run-placemat`; without Node:
`curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-placemat`). `rer dev` alone launches
a fresh checkout for review. The detailed flags and effects are in
`RUN-LOCALLY.md` and `SEED-COMMAND-CONTRACT.md`.

```sh
rer install
rer setup --owner-email you@example.com
rer dev
```

Use the setup prompt instead of the owner-email flag when entering the real
mailbox. Open the printed `RER_OPEN` link to sign in as the owner. Development
and demo mail is silently suppressed. Stop `dev` with
`rer dev --stop` or Ctrl-C, and stop `preview` with
`rer preview --stop` before build or verification.

```sh
rer verify
rer reset --yes
rer export --output exports/installation.rer
rer import --input exports/installation.rer --yes
rer deploy
rer describe
```

Use `rer describe` to inspect the checkout's actual
capabilities. `rer check --profile first-party` validates the
declared command contract; it does not run application journeys or contact a
provider.

## Local data and recovery

Setup and development use explicit owner identity and real local migrations.
Dev and preview use the same owner and canonical `.wrangler/state`. Local dev
sign-in uses the checkout’s private key; keep `RER_OPEN` private. Private
settings are kept in `.dev.vars` with mode 0600 and are not copied into build output.

Local export creates a private archive with an integrity receipt and explicit
exclusions. Placemat archives its floor, services, bookings, guests, decisions and move-in
journal through the same policy used by the owner backup screen. Owner/auth, outbox, bookkeeping, private settings and
transient runtime state are excluded. Import validates and restores atomically
into an empty destination; confirmed reset preserves export archives. Run setup
after restore to establish a fresh owner. Each first-party seed verifies local
export/import/export equivalence across its supported resources. Remote transfer
is available only when the adapter declares complete resource coverage.

Preserve ambiguous state and applied migration history. Never place a remote
credential, owner secret or local resource ID in source. A schema change needs
a forward migration and verified transition/recovery.

## Deployment

`rer deploy --dry-run` validates the real owner-account
deployment declaration and builds locally without provider requests. Real
deployment requires privately supplied `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, the declared owner/session/setup secrets, and a real
verified mail sender in `deploy.json`. Follow the owner-account deploy-kit
instructions under `node_modules/@runeditrun/rer/modules/deploy-kit`; account scope,
resource ownership, migrations, receipt and health checks are defined there.
Local validation does not prove hosted acceptance, provider delivery or remote
health.

## Hosted installation

`packaging.json` declares Placemat's build, verification, recovery, D1 migration
sources and production mail inputs. After `pnpm run build`, run
`pnpm delivery:spec` to update the committed deployment specification and
`pnpm check:deployment-spec` to check it against the real output. The delivery
producer packages the Worker and assets without deploying or publishing them:

```sh
node scripts/delivery/base/cli.mjs package --config packaging.json --output rer-package
node scripts/delivery/base/cli.mjs artifact --config packaging.json
```

Generated packages and delivery artifacts are disposable. The committed project
identifier remains `just-every/run-placemat`. Managed installations retain only
the dispatch-only workflow `.github/workflows/rer-managed.yml`.

Production mail supports RER managed mail, Resend, SendGrid and Cloudflare.
Assisted setup asks for the selected provider's sender address and private API
key, plus the relay URL for RER or account ID for Cloudflare. Managed hosting
supplies `MAIL_PROVIDER`, `MAIL_FROM`, `MAIL_RELAY_URL` and the private
`MAIL_API_KEY`. The application passes the assigned relay URL to the RER sender.
Development and demo sessions continue to suppress external mail. A provider's
acceptance is distinct from delivery; preserve uncertain results for human review.
