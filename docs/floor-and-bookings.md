**Floor & bookings** is where service runs: the room at a chosen time, every booking for the service, and walk-ins. Online bookings, walk-ins and the waitlist all share the same tables.

## How guests book

Every Placemat has a guest booking page at `/book`; the **Guest booking page ↗** link at the top of the staff app opens it. Share that address with guests, for example from your website.

A guest chooses a **Party size**, a **Service** and an **Available arrival time**, gives their name, email and an optional phone number, and presses **Confirm booking**. Placemat shows **Booking confirmed** with a booking reference.

The page lists only 15-minute starts where a whole turn fits. Placemat picks the tables itself, combining tables when one cannot fit the party. A full service, a table clash or the service's cover limit cannot be overridden: when a slot is gone, the guest is asked to choose another time.

## Read the floor

Choose the **Service** and a time in **View at**. While a service is running, **View at** starts at the current time; otherwise it starts when the service opens. The floor plan shows every table with its label and seats, marked:

- **Available**: free at that time.
- **Booked**: a booking holds the table, with the guest's name.
- **Seated**: the party is at the table.

Booked and seated parties hold their tables until their booking ends. Press **Refresh** at the top to load bookings made since you opened the page.

## The bookings list

Under the floor, **Bookings** lists the service's bookings with the covers taken against the cover limit, for example "6 / 8 covers". Each row shows the guest and where the booking came from (online or walk-in), the arrival and end time, party size and tables. Explicit VIP status, tags and seating preferences appear with their recorded sources; open **Guests** for the complete profile and visit history.

Change a booking's status from its **Status** menu:

- booked → **seated** when the party arrives, then **completed** when they leave.
- booked → **cancelled**, or **no-show** when they do not come.

Cancelled and no-show bookings stay in the guest's history and free their tables and covers for the rest of the service. **Calendar** downloads the booking as a calendar file. **Change assignment** lets a host or manager move, swap or lock an assignment directly. Choose the exact tables and submit once; the live floor, fit, access needs and overlapping turns are checked before the move. A stale floor requires Refresh. Unlock before moving a locked party. Assignment history records each actor, time, before/after tables and optional reason. Preparation keys still prepare exact proposals for a manager to approve.

## Seat a walk-in

Expand **Add a walk-in**, enter the guest's name and party size (email and phone are optional) and the arrival time, and press **Seat walk-in**. Leave **Tables** empty and Placemat assigns the tables, or choose them yourself. The walk-in is seated straight away.

## The waitlist

When the room is full, add the party under **Waitlist**: expand **Add a waiting party**, enter their details and press **Add to waitlist**. When a table frees up, for example after a no-show, choose the arrival time and press **Seat party**. As with walk-ins, leave Tables empty to have them assigned.

## Who can do what

Owners and managers run the floor. An owner can grant or remove host access for an active member under Settings → People & invitations. Hosts can change assignments and record service observations; they cannot approve plans, administer the venue or export guests. Read-only staff see the same floor and bookings but cannot change them. See [People and agent keys](people-and-access.md).

## Timeline and an overdue turn

The service timeline shows original commitments beside expected times and actual staff observations. Search a party/contact/table, select a venue day/service or room, and change the time division to zoom. Late arrivals, overdue seated parties and collisions name the affected reservations. Server filters gain populated assignments with FLOOR-004 sections.

For a seated party, expand **Extend turn**, record a later expected departure and a reason. The original booking and reset stay in history; no other party moves. Open **Change assignment** for the next arrival to move it directly to a fitting replacement, then read both assignment/turn histories. Cleanup follows the extended forecast; an ongoing seated party keeps its physical table occupied even after the forecast.

The header opens the parties behind seated covers now, covers due in the configurable inclusive next window, and average actual turn today. The average uses actual corrected seating-to-completed observations in venue time; missing times are not invented. Labels round elapsed minutes to the nearest minute. Use **Update service** for the full append-only observation history and corrections.
