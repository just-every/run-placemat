<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Placemat homepage claims

A claim is done when every clause behind it is done, missing when every one is missing, and partial otherwise.

| # | Claim | Clauses | Status |
| --- | --- | --- | --- |
| 1 | Hero · "Placemat takes reservations from your site" | `BOOK-001` done; `BOOK-002` done; `BOOK-008` done; `BOOK-009` done | done |
| 2 | Hero · "…Google…" (reservations from Google) | `DIST-001` missing | missing |
| 3 | Hero · "…and Instagram" | `DIST-002` missing | missing |
| 4 | Hero · "runs the host stand" | `FLOOR-002` done; `FLOOR-006` partial; `WAIT-001` done | partial |
| 5 | Hero · "…and waitlist" | `WAIT-001` done | done |
| 6 | Hero · "remembers every guest" | `GUEST-001` done | done |
| 7 | Hero · "100% free, open source alternative to OpenTable, Resy and SevenRooms" | `OSS-001` partial; `COST-001` partial | partial |
| 8 | Hero · "Run Placemat →" opens /run; "Read the docs" opens /docs | `SITE-001` done | done |
| 9 | Hero · "Try the demo" | `SITE-002` partial | partial |
| 10 | Hero tags · "Table 12 · Priya +3 · 7:30 · anniversary" | `BOOK-001` done; `BOOK-007` done; `GUEST-002` partial | partial |
| 11 | Hero tags · "Regular · 15th visit · likes the window" | `GUEST-001` done; `GUEST-002` partial | partial |
| 12 | Hero tags · "Waitlist · Marco, 2 · 15 min · text sent" | `WAIT-003` partial; `WAIT-004` missing | partial |
| 13 | Hero tags · "Deposit $50 · held" | `PAY-002` partial; `PAY-003` partial | partial |
| 14 | Hero tags · "Cancellation · 8:00 → filled from waitlist" | `WAIT-005` missing; `AGENT-002` partial | partial |
| 15 | Hero tablet · Floor plan, Waitlist (5) and Reservations on the host-stand tablet | `FLOOR-002` done; `WAIT-001` done; `MOBILE-001` partial | partial |
| 16 | Day one · "Bring your book from OpenTable." Guests 18,402, future reservations 2,113, tags and notes 41,960 | `MIG-002` missing; `MIG-001` done | partial |
| 17 | Day one · "Resy and SevenRooms too" | `MIG-003` missing; `MIG-004` missing | missing |
| 18 | Day one · "Reserve with Google switched" | `DIST-001` missing; `MIG-008` partial | partial |
| 19 | Day one · "Run it yourself": `npx -y @runeditrun/rer dev just-every/run-placemat` | `SITE-001` done | done |
| 20 | Day one · "Not in Placemat: online ordering, gift cards or the POS itself" | `BOUND-001` partial | partial |
| 21 | 3:05 PM · The book · "Guests book on Google, Instagram and your site" | `BOOK-001` done; `DIST-001` missing; `DIST-002` missing | partial |
| 22 | 3:05 PM · The book · "Pacing keeps the kitchen even" (covers per half-hour slot, 16/16 full) | `SERVICE-005` done | done |
| 23 | 3:05 PM · The book · A full slot offers nearby times ("offered 6:45 or 8:30") | `BOOK-003` done | done |
| 24 | 3:05 PM · The book · Channel per party and totals (Website 44, Google 38, Instagram 21, Phone 9) | `DIST-004` partial; `REPORT-003` partial | partial |
| 25 | 3:05 PM · The book · "3 new since 3:00 PM" (new bookings arrive in the open book) | `FLOOR-008` partial | partial |
| 26 | 4:10 PM · Confirmations · "Reminders go out by text" | `MSG-005` partial; `MSG-002` missing | partial |
| 27 | 4:10 PM · Confirmations · "Guests reply" (reply C or R, auto-tag "anniversary · candle on dessert") | `MSG-010` missing; `MSG-006` missing; `GUEST-002` partial | partial |
| 28 | 4:10 PM · Confirmations · "Deposits hold the big tables" ($25 per guest, $200 held on card ending 4242, released at seating) | `PAY-002` partial; `PAY-003` partial | partial |
| 29 | 4:10 PM · Confirmations · Confirmed 25 · Awaiting reply 5 · Canceled 4 | `MSG-005` partial; `FLOOR-006` partial | partial |
| 30 | 4:10 PM · Confirmations · "4 tables offered to the waitlist" | `WAIT-005` missing; `AGENT-002` partial | partial |
| 31 | 4:45 PM · Pre-shift · Pre-shift sheet: guests to know with allergy and occasion, deposits held | `FLOOR-012` partial; `GUEST-003` partial; `GUEST-002` partial | partial |
| 32 | 4:45 PM · Pre-shift · Server sections Ana / Ben / Cole with their tables | `FLOOR-004` partial; `FLOOR-012` partial | partial |
| 33 | 4:45 PM · Pre-shift · Kitchen notes (halibut 12 portions, pace 16 covers per half hour, allergy at Table 12) | `FLOOR-013` partial; `FLOOR-019` partial; `FLOOR-020` partial; `SERVICE-005` done; `GUEST-003` partial | partial |
| 34 | 6:40 PM · Host stand · Floor plan by section with combined tables (21+22) | `FLOOR-002` done; `FLOOR-003` partial; `FLOOR-004` partial | partial |
| 35 | 6:40 PM · Host stand · Six table states with timers (seated, mains, dessert, check dropped, reserved, needs bussing) | `FLOOR-006` partial; `FLOOR-005` partial | partial |
| 36 | 6:40 PM · Host stand · Waitlist of five with quotes and minutes waiting | `WAIT-001` done; `WAIT-003` partial | partial |
| 37 | 6:40 PM · Host stand · Seated 34 covers · Due by 7:15 16 covers · Avg turn 1h 28m | `REPORT-001` done; `REPORT-002` done; `FLOOR-005` partial | partial |
| 38 | 6:40 PM · Host stand · "Quoted vs actual tonight ±3 min" | `WAIT-003` partial; `REPORT-002` done | partial |
| 39 | 6:52 PM · Service agent · "The agent takes calls … and books into live tables" (call booked Lee, 6 · 8:45 · Table 42) | `AGENT-001` missing; `VOICE-001` missing | missing |
| 40 | 6:52 PM · Service agent · Texts answered, table held to 7:45 | `AGENT-001` missing; `MSG-006` missing; `FLOOR-011` partial | partial |
| 41 | 6:52 PM · Service agent · Instagram DM booked (Sofia M., 2 · 9:15 · bar) | `AGENT-001` missing; `MSG-011` missing; `DIST-002` missing; `FLOOR-010` partial | partial |
| 42 | 6:52 PM · Service agent · "Tonight: 23 calls answered · 0 missed" | `VOICE-001` missing | missing |
| 43 | 7:15 PM · No-show · "The card on file covers the no-show" ($80 fee, 4 × $20) | `PAY-004` partial | partial |
| 44 | 7:15 PM · No-show · No-show marked, "The waitlist fills the table" (Nguyen seated 7:39) | `FLOOR-006` partial; `FLOOR-011` partial; `WAIT-001` done; `AGENT-002` partial | partial |
| 45 | 7:15 PM · No-show · Calls to the guest and the table-ready text ("Your table is ready. We'll hold it 10 minutes.") | `FLOOR-011` partial; `WAIT-004` missing; `AGENT-005` partial | partial |
| 46 | 7:15 PM · No-show · "Nguyen, 4 · quoted 35 · waited 34m" | `WAIT-003` partial | partial |
| 47 | 7:48 PM · Kitchen pace · "Placemat reads tickets from Toast, Square or Clover" (mains ticket time from Toast) | `POS-001` missing; `POS-002` missing; `POS-003` missing; `POS-007` missing | missing |
| 48 | 7:48 PM · Kitchen pace · "…and spaces the next seatings": agent suggestion applied by the host | `AGENT-003` missing; `AGENT-004` partial | partial |
| 49 | 10:40 PM · Close · "Each check from your POS lands on the guest" (average check $186, tonight $238, usually orders) | `GUEST-005` missing; `POS-006` missing | missing |
| 50 | 10:40 PM · Close · Guest profile: Regular · 15 visits, anniversary, shellfish allergy, window table | `GUEST-001` done; `GUEST-002` partial; `GUEST-003` partial | partial |
| 51 | 10:40 PM · Close · "Texts: opted in" | `MSG-008` partial | partial |
| 52 | 10:40 PM · Close · Post-visit text ("How was tonight?" · "Perfect, thank you!") | `CRM-005` missing | missing |
| 53 | 10:40 PM · Close · Service report: covers booked and walk-in, no-shows, fees, average turn, quote accuracy, covers recovered | `REPORT-007` partial; `REPORT-001` done; `REPORT-002` done; `PAY-004` partial | partial |
| 54 | 11:00 PM · Closing · "Free and open source, MIT licensed." | `OSS-001` partial | partial |

Claims: 54; 7 done, 39 partial, 8 missing.
