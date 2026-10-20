Your venue's data lives in your own installation. Keep a backup, and restore it onto a new installation when you move. Backups and restores are for the owner.

## Download a backup

Open **Settings**, expand **Backup & restore** and press **Download venue backup**. The file holds the venue, tables, services, bookings, waitlist, guests and their history, approvals and reminders. It does not hold sign-in identities, agent keys or local settings.

Keep backups private: they contain your guests' contact details.

## Restore a backup

A backup restores only into an empty installation, so it can never overwrite a venue in use.

1. Start a fresh Placemat and finish its setup.
2. Open **Settings**, expand **Backup & restore** and choose the **Backup archive**.
3. Type `RESTORE` and press **Restore backup**.

Placemat checks the file's integrity and that it fits together before restoring anything, and refuses a damaged file. Booking analytics keys (the GA4 API secret and Meta access token) are never part of a backup either: the analytics settings come back, but nothing is sent and guests are not asked until you enter the keys again in **Settings → Booking analytics**. People and agent keys are not part of a backup: invite your staff again in the new installation.

## Erased guests and older backups

When you erase a guest, Placemat refuses to restore an older backup it knows still holds that guest. When restoring an older backup somewhere new, also choose a later backup in **Trusted later backup for erasure journal**, so the new installation learns of erasures made since.

## From the command line

For a complete move of a local installation, stop it first, then export and import with `rer`:

```sh
rer dev --stop
rer export --output exports/venue.rer
# in a fresh checkout with no venue data:
rer import --input /absolute/path/venue.rer --yes
rer dev
```

Keep archives outside the project's public and server folders. `rer reset` is not a way to erase guests or move data: it removes the local owner, data and settings.
