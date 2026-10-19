Each person signs in with their own account and sees what their role allows. The server checks the role on every request.

## Roles

| Role | In Settings | What they can do |
| --- | --- | --- |
| Owner | Owner | Everything, including move-in, erasing guests, backups and agent keys |
| Manager | Manager | Run the floor, set up tables and services, approve plans, keep notes, invite read-only staff |
| Host | Host (owner-granted capability) | Directly move, swap and lock assignments, record service observations, add waiting parties and update their party preferences; no plan approval, administration or bulk export |
| Read-only staff | Read-only staff | See the floor, bookings, waitlist and guests; change nothing |

## Invite people

Open **Settings** and expand **People & invitations**. Enter the **Person name**, **Email** and **Role**, and press **Invite person**. The person receives a sign-in email from your installation's mail provider; a local Placemat sends no email. Everyone invited is listed with their role and status.

The owner can grant or remove host access beside an active read-only member under **People & invitations**. This is a venue capability; the underlying native member role stays unchanged. Removing the capability takes effect on the next request.

## Agent preparation keys

An agent, such as an assistant you run yourself, can prepare work for a person to approve: a service publication, a table reassignment or a reminder batch. It cannot approve anything, change the floor directly, erase guests, import or back up.

The owner creates a key under **Settings → Agent preparation keys**: enter a **Key name** and press **Create preparation key**. Copy the key at once; it is shown only once. Each key is listed as **Active** until you press **Revoke key**.

What an agent prepares appears under **Approvals & reminders**, where an owner or manager reads the **Exact plan** and presses **Approve plan** or **Decline**. The [agent preparation API](AGENTS-API.md) documents the requests.
