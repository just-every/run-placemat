Placemat runs on your own computer with one command, and later in your own Cloudflare account if you want guests to book from anywhere. It is free and open source under the MIT license.

## Product boundary

Not in Placemat: online ordering, gift cards or the POS itself. Placemat sells no gift cards, stored-value cards or vouchers and takes no online food orders. Gift cards, online ordering and check taking stay in the restaurant’s POS or its payment provider’s own products; connected loyalty stays there too. This release has no payment collection or booking balances. A staff-recorded “ordering” or “paid” stage is only a service observation, never an order or processor payment.

## Run it on your computer

You need Git and an internet connection, on macOS, Linux or Windows with WSL2. Placemat uses its own pinned Node 22 and pnpm 10.12.4, so you do not need to change the versions you already have.

Install `rer`, the Run Edit Run command, then start Placemat. These are the same two lines as the [Run page](https://run-placemat.com/run):

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
rer dev just-every/run-placemat
```

The installer adds `rer` for you alone, with its own Node if you have no Node 22 or later. It changes no shell settings: if it prints an `export PATH=…` line, run that line before the second one. Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-placemat` does both steps in one line.

To start it again later, run `cd run-placemat && rer dev`.

The first start installs everything, prepares the local database and makes you the owner. Give it a few minutes. When it is ready it prints two lines:

- `RER_READY`, the address of your Placemat on this computer.
- `RER_OPEN`, a link that opens Placemat signed in as the owner. Keep it private: it signs you in.

Starting again with `rer dev` resumes a launch that stopped part way. Stop Placemat with `rer dev --stop` or Ctrl-C.

## Finish setup

Open the `RER_OPEN` link. Placemat shows **Finish setup** with the owner's name and email. Tick **I confirm this owner account is ready to use.** and press **Finish setup**. You arrive at the staff app, on **Floor & bookings**.

A new Placemat is empty. Nothing is invented for you: the floor says "Start by adding tables and creating a service below."

## Set the venue first

Open **Settings**. Under **Venue & access**, enter your **Venue name** and **Venue timezone**, for example `America/New_York`, and press **Save venue**.

Set the timezone before you create a service. Placemat shows and accepts every time in the venue's timezone, even when your computer uses another one, and the guest booking page tells guests which timezone the times are in.

## Then

1. [Add your tables and create a service](tables-and-services.md).
2. [Run service on the floor](floor-and-bookings.md): online bookings, walk-ins, the waitlist and no-shows.
3. [Bring your guest list](moving-in.md) from your current system.
4. When you are ready for real guests, [deploy to your own Cloudflare account](deploy.md).

## Try another role

`rer dev --as admin` opens Placemat as a manager and `rer dev --as member` as read-only staff, so you can see what each person sees. `rer dev --as signed-out` opens the guest view. Return to the owner with `rer dev --as owner`.
