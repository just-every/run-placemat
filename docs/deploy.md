To take bookings from guests anywhere, deploy Placemat to your own Cloudflare account. You do not need to buy a domain for it.

## Before you start

You need a Cloudflare account and an API token scoped to that account with Worker and D1 deployment permissions, and a verified sender address with an email provider, so staff can receive sign-in emails.

1. Stop local Placemat with `rer dev --stop`.
2. In `deploy.json`, set `vars.MAIL_FROM` to your verified sending address and choose the matching `MAIL_PROVIDER` (`resend` by default). Keep the declared project, Worker and database names. Commit your changes.
3. Create a private file `.env.deploy` (readable only by you) with `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `OWNER_EMAIL`, `SESSION_SECRET`, `SETUP_TOKEN` and `MAIL_API_KEY`. The session and setup secrets must be different strong random values of at least 32 characters. Never commit this file or type its values on the command line.

## Deploy

```sh
rer deploy --dry-run --env-file .env.deploy
rer deploy --env-file .env.deploy
rer signin --env-file .env.deploy
```

The dry run builds and checks everything without contacting Cloudflare. The deploy creates the database, applies its migrations, publishes Placemat and checks that it answers, then prints its address.

`rer signin` prints a one-time sign-in link for the owner. Open it, complete **Finish setup**, and you are in the staff app. After that, staff sign in with an email link.

## After deploying

Share the guest booking page, `/book` on your Placemat's address, with guests. Back up regularly from **Settings → Backup & restore**. [OPERATIONS.md](../OPERATIONS.md) describes provider setup and routine operations.
