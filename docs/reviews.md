# Verified visit reviews

The public venue page is `/reviews`. The booking page and allowed website widget show the same public reviews. A diner explicitly requests and enters a code sent to the selected booking's current recorded email. An account by itself grants no review authority: the booking must be seated or completed, the contact must still match and the reviewer cannot be recorded venue staff. Each attended booking has one review, enforced in the same transaction as publication. The guest separately confirms publication of the rating, text and visit date. Private feedback is never copied into this review.

Consented completed visits receive the existing rating-independent feedback invitation with an additional Placemat review link. The public invitation is available before any private rating and remains the same after positive or poor feedback. The invitation still needs current booking contact proof. Withdrawal, expiry, changed contact or revoked sending authority closes the old invitation. Provider acceptance does not establish mailbox delivery. A diner may independently verify an attended booking and explicitly publish a review without consenting to future email.

Reviews expose the visit date and publication date. The aggregate appears only once five public reviews exist; smaller cohorts show a count without an average. Public projection includes no guest contact, booking reference, private feedback or report detail. Staff review records and subject access exports preserve the links needed for accountability.

Managers open **Guests → Public reviews and replies**. Each review has one public restaurant reply, editable with a current revision. Reply history records the actor, time and previous and new values. A revoked or unauthorized staff identity cannot reply or read manager review records.

## Published guidelines and moderation

The public page publishes the same rules used by the report form: reviews describe an attended visit; all ratings are welcome; threats, personal information and spam may be reported. A report never automatically hides a review. Managers and readers can report concerns, and only the venue owner records the rating-neutral outcome and reason. Current outcomes are **retained** and **escalated**, both leaving the review visible. The public page shows the category, outcome and decision time. Private report details and the actor and reason stay in the manager record and audit history. There is no manager delete, hide or rating-based suppression action.

This conservative owner-only moderation default remains partial pending policy approval and an independent moderation boundary. Escalation records the need for review; it does not claim a separate service received or resolved the report. Guest privacy erasure is a distinct verified process and removes linked public and private review content regardless of rating.

## Portability and privacy

Owner CSV datasets `reviews`, `review-reports` and `review-events` preserve populated records and relationships. Backups carry the same records without diner devices, booking verification codes or feedback invitation credentials. Restored reviews are historical and do not publish automatically. Fresh booking proof and explicit guest publication are required to expose a restored review. Restore validates review, booking, guest, report and event relationships before any domain record is restored.

Verified guest erasure removes the review, its reply, reports and event content, invalidates prior transfers and closes the old credentials. A pre-erasure archive cannot bypass a trusted later erasure journal. Category retention policy approval remains DATA-004's obligation.

Connected POS eligibility remains unproved until GUEST-005 has an authorized test venue and check, item and refund feed. Native seating records do not stand in for that proof. The controlled provider journey is `scripts/reviews-sandbox.mjs`; it requires the admitted SendGrid sender and controlled receipt account and distinguishes provider acceptance from receipt of the exact invitation and booking code before actual guest submission.
