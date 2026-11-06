# Native public-door probes

Head: eea85727b2402f116b6579db85ec1eb47906db66.

PROBE MSG-003 accepted binding: public reservation creation, personal manager booking.management.send and GET /api/booking-mail -> one accepted message with its provider ID and original recipient; no management token in the read.
PROBE MSG-003 authentication and recipient refusal: signed callback intake with forged signature, tampered signed body, expired signed timestamp, wrong or extra recipient and foreign message -> 401 or 403, zero facts and unchanged reservation, link and send custody; absent provider and runtime configuration -> 503.
PROBE MSG-003 durability: authentic delivered, bounce and complaint callbacks, concurrent duplicates, conflicting event ID, old and equal timestamps, workerd restart and replay -> eight distinct facts, conflict 409, stable complaint state and unchanged native booking, link, audit and send counts.
PROBE MSG-003 personal authority: current owner and admin GET -> populated history; host, member, server, agent and shared-device GET -> refusal; revoked key and inactive manager -> 401 with no history.
PROBE MSG-003 export and restore: owner CSV and guest access export -> original message, recipient and facts; empty-destination backup restore -> historical facts, no sends and 403 for callback against the restored binding.
PROBE MSG-003 erasure: reviewed owner erasure racing a signed callback, then replay -> empty delivery list and zero binding, receipt and state rows; open Resend processor follow-up; old archive with trusted later journal refused. A provider response arriving after erasure -> one outbound call already made, zero recreated bindings and callback 403.
PROBE MSG-003 screen: real admin service screen after explicit send and authentic signed observations -> accepted, receiving-server delivery, bounced and complaint labels with retained facts at 1440 and 390; no automatic resend.

The actual API journey and browser logs accompany these observed results. Provider network calls alone are controlled; production HTTP handlers, workerd, D1, native sessions, booking commands and shipped browser code execute. No live-provider qualification is claimed.
