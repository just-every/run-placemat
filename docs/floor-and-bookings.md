**Floor & bookings** is where service runs: the room at a chosen time, every booking for the service, and walk-ins. Online bookings, walk-ins and the waitlist all share the same tables.

## How guests book

Every Placemat has a guest booking page at `/book`; the **Guest booking page ↗** link at the top of the staff app opens it. Share that address with guests, for example from your website.

A guest chooses a **Party size**, a **Service** and an **Available arrival time**, gives their name, email and an optional phone number, and presses **Confirm booking**. Placemat shows **Booking confirmed** with a booking reference.

The page lists only 15-minute starts where a whole turn fits. Placemat picks the tables itself, combining tables when one cannot fit the party. A full service, a table clash or the service's cover limit cannot be overridden: when a slot is gone, the guest is asked to choose another time.

## Put booking on your own website

The venue owner chooses which websites may show the booking widget. In **Settings → Website booking widget**, list each website origin on its own line, such as `https://www.example.com`, and press **Save allowed websites**. Only exact `https://` origins are accepted: no `http://`, wildcards, paths or local addresses such as `localhost`. If your site builder places custom code inside its own frame, the browser checks that frame’s origin too, so add it as well. Every change is recorded with who made it and when.

Paste the snippet shown there into a custom HTML or code block on the page (for example a WordPress Custom HTML block, a Squarespace Code block, Wix Embed HTML or your own site). The widget is the booking page itself: the same tables, rules, pacing and times, so a time booked in the widget disappears from `/book` and the other way round. Both pages list a **Booking policy** for each service in the search: the online party sizes, when a larger party sends a group inquiry, how far ahead and how late on the day guests can book, the minimum notice and the arrival interval, taken from the service’s online booking rules. Guests choose a time and press **Confirm booking** themselves; nothing is booked before that. The bookings list shows where each online booking came from: “website widget on https://…” or “booking page”. The widget shows no staff links, and staff pages refuse to open inside another website.

### Booking analytics (GA4 and Meta)

The venue owner can send booking events to Google Analytics 4 and Meta. In **Settings → Booking analytics (GA4 and Meta)**, tick **Send GA4 events** and enter the GA4 measurement ID (G-…) and a Measurement Protocol API secret, and/or tick **Send Meta events** and enter the Meta dataset (Pixel) ID and a Conversions API access token, then press **Save analytics settings**. Keys are write-only: Placemat never shows them again, and backups and CSV exports leave them out, so enter them again after restoring a backup. Leave a key blank to keep the saved one. Switching a provider off stops its events; its saved key stays until you enter a new one. Every change is recorded with who made it and when.

When analytics is on, the booking page and the widget ask each guest once per visit whether to share booking analytics, naming GA4 and/or Meta and what is sent. Nothing is sent unless the guest presses **Accept**. Then Placemat’s server, not a script on your page, sends three events: search, checkout start (choosing a time) and completed booking. Each carries only the party size, where the guest booked (the booking page, or the website showing the widget) and a random visit ID, plus the browser’s user agent for Meta. Guest names, contact details, IP addresses, cookies, booking references and reservation times are never sent. A provider that is slow or down never holds up a booking.

To test, tick **Test mode** for GA4 (events then appear in GA4 DebugView) or enter a Meta **test event code** from Events Manager → Test events. The settings show each provider’s latest answer: GA4 never confirms events, so check DebugView; Meta reports how many events it received.

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

## Guests joining the queue

Under Waitlist, expand **Public queue joining** for the service’s website link and QR. Guests use `/queue`, state their party/preferences and optional queue contact permission, then save the private status link. The link permits updates or leaving that party; **Replace private link** invalidates the old link. No table or message delivery is promised. Shared names/phones never merge people; an active exact-guest/service duplicate directs the guest to their link or the host.

A manager can **Pause online joining** while staff continue **Add a waiting party**. An owner-granted host can add a party or update party size, but cannot pause public joining or approve plans. Staff intake shows a private link once to hand to the guest; Refresh removes that one-time display. Preferred time/area are preferences. Declared required access tags are preserved when seating and moving tables. Guest erasure invalidates the link and clears guest-linked queue preferences/permission/history values.

Open **Reservation reports → Service performance** to compare expected and actual turns, arrival lateness and quoted versus actual waits. Open a distribution observation to read its original status history and corrections. Server and section attendance stays attributed to the server who seated the party; a later move is visible separately. Missing observations are shown, never treated as zero. Seating utilization measures occupied physical table-seat time, with known ongoing observations identified. Queue outcomes, pacing intervals and staff exceptions open their contributing parties.

Choose **Publish current service facts** to retain an attributed snapshot. Saved reports stay fixed after corrections. **Refresh live report** shows the corrected facts; publish again to retain the adjustment beside the original. Reports contain reservation references and staff observations without guest names, contacts or private note text. Owner backups carry the saved reports.
