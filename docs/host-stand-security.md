# Shared host stands

The owner creates a one-use registration code under Settings → Shared host stands.
Open `/hoststand` on the dedicated tablet and claim that code within ten minutes.
Each active enrolled host taps their name and enters their personal PIN. Staff
set or reset a PIN from their full personal session under Settings. A reset
locks their active stands and records a security event visible to managers.
Ten consecutive failures disable that person's PIN until this reset; waiting
for a rate window does not re-enable it. Common, repeated and sequential PINs
are refused.

The stand carries current host grants for floor operations, follow-up, queue
intake, phone reservations and, when granted, pacing and seating. It can issue
manager-defined deposit links. Payment links must be shared by a person; an
issued link does not establish delivery or payment. Staff-recorded service
stages are observations, including paid; they do not execute a payment.
Refunds, waivers, provider settings, restricted guest notes, administration and
exports require a separate full personal session. Switch staff or Lock stand
clears follow-up text immediately. Two minutes without an operation also locks
it; background status reads never extend that time.

The owner renews a claimed, unrevoked device for one to thirty days from the
renewal. A warning appears when seven days remain. A renewal retains the device
identity; the stand refreshes its device cookie on floor reads. Only the owner renewal
extends server authorization; reads never extend the lease. Revoking it immediately invalidates its authority.

## PIN pepper configuration and rotation

New installations generate `HOST_PIN_PEPPER_V1` as a managed Worker secret during
`rer setup`. Existing installations rerun setup to provision it before enrolling
PINs. Unpeppered credentials from an older release are disabled by migration and
must be reset through a full personal session. No pepper or credential enters a
venue backup.

PINs are HMAC-SHA256 keyed with that secret, then PBKDF2-SHA256 with a random
per-PIN salt and workerd's maximum 100,000 iterations. For rotation, configure
`HOST_PIN_PEPPERS` as a Worker-secret JSON object mapping version names to random
secrets, and `HOST_PIN_PEPPER_VERSION` as the active version. Include every
version still needed to unlock existing PINs. The initial version is `v1`.
A successful unlock upgrades an older pepper version or work factor. Remove a
retired pepper only after its PINs have upgraded or been reset. Missing security
configuration refuses PIN enrollment/unlock; it never substitutes a public or
database-stored pepper. Never paste either secret into an issue, screenshot or
application form.

## Narrow payment foundation

Configure `STRIPE_SECRET_KEY` as a Worker secret to issue Stripe-hosted deposit
links and reconcile captured charges. Managers define the booking's USD amount,
deadline and follow-up owner. Hosts issue the saved request; they cannot set its
amount, waive it or refund it. Links are issued explicitly with a Stripe-supported
deadline between 31 minutes and 24 hours away. A server retrieval of matching
Stripe data establishes payment; browser redirects do not.

Only the owner sets manager refund limits, in integer USD cents per booking.
No recorded limit means no manager refund authority; owners are uncapped within
the charge's remaining balance. Pending and succeeded refunds submitted by that
person across the booking's charges consume the limit before any processor call.
The owner synchronizes actual captured USD charges with matching booking
metadata before a refund. An uncertain result retains its reservation and exact
request ID for reconciliation. Payment onboarding, delivered notices, no-show
fees and the complete PAY-005/PAY-010 journeys remain partial.
