# Guest retention

Open Settings, then **Guest retention workflows**. The current authority floor is a personal owner account with a separate, explicit marketing grant. Managers, hosts, servers, read-only staff, shared host stands and preparation keys cannot approve or send marketing. Delegated marketing authority awaits its contract ruling.

Guests choose email marketing separately from reservations, closure notices and service feedback. The public **Guest email preferences** page sends a private confirmation link only to a uniquely recorded guest address. The guest must prove control of that address and explicitly confirm the venue's marketing purpose. A booking, an import or a staff-entered date never establishes marketing consent. Development and demo installations suppress mail.

Create a draft with one trigger: welcome, birthday, anniversary, first to second visit, lapsed guest or experience invitation. Record birthday and anniversary as month and day under Guest dates, with owner attribution. First-to-second and lapsed workflows use completed native bookings whose dining interval has ended. Cancelled and no-show bookings never count as visits. An upcoming or seated booking stops those two invitations. Experience invitations require a currently published experience.

Preview shows the exact offer and the fixed, currently opted-in audience by name and address. Approving it does not authorize new recipients. A new consent identity, a changed guest contact or a changed date requires a fresh preview and approval. The scheduler checks the trigger, current permission and identity again before every provider attempt. The workflow ends at its saved expiry, on Stop workflow or on revocation of its owner's grant. Revoking and restoring the owner's account does not restore an old approval.

Quiet hours use the venue timezone. Frequency caps apply across workflows to both the guest and the normalized address. Each trigger occurrence is claimed before the provider call; duplicate ticks and uncertain provider responses never resend automatically. The owner sees provider-accepted and unconfirmed attempts separately. Provider acceptance alone does not establish mailbox delivery.

Each delivered offer has a private link to the real booking page. A booking is attributed only when that link and the current guest identity match a booking created after the accepted message. A completed return visit appears in the workflow and delivery totals. A cancellation changes the live attribution outcome rather than remaining a completed return visit.

Unsubscribe is immediate, including during a running workflow. Every marketing message also contains a separate unsubscribe link that outlives the offer. Unsubscribing leaves booking management available. Contact changes, merges and erasure remove the identity-bound sending permission and private links. Erasure removes personal retention records and opens follow-up tasks for recorded provider references; it does not claim provider deletion.

The owner can export retention facts, workflow history, delivery attempts and booking attribution as CSV or in the business archive. Archives contain history with workflows stopped and no sending grant, consent authority, recipient preview or bearer link. A restored archive cannot send or revive an erased identity.

## Public doors

The owner page is `/retention/settings`; guest preferences and private links use `/retention`. Owner writes use the grant, facts, draft, preview, approve and stop operations beneath `/api/retention`. Public request, confirm, status, unsubscribe and attribution operations live beneath `/api/public/retention`. Writes require the venue origin. Private credentials travel in request bodies, never in HTTP URLs.

The ordinary push Verify runs `tests/api/retention.test.mjs` and `tests/retention-ui.mjs`. The controlled SendGrid journey is `scripts/retention-sandbox.mjs`; it uses held credentials through the fleet injector and keeps recipient addresses and private links in memory.
