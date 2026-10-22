# Private reservation management

The venue owner explicitly sends a transactional email from the existing production mail configuration. The recipient is the reservation's recorded contact; the command accepts no destination override. The response reports provider acceptance, never mailbox delivery, and contains no management bearer. Development and demo installations refuse this outbound action.

The email carries `/manage-booking#token=…`. The fragment is removed from browser history as the page opens, is never sent in the document request, and is held only in page memory. Requests post it to the same origin. A random 32-byte capability addresses exactly one reservation. Only its SHA-256 digest is stored. It expires at the earlier of 24 hours after issue and service start. An owner reissue invalidates its predecessor. A successful change, reconfirmation or cancellation rotates the bearer without extending that expiry. Failed availability checks leave both reservation and link intact.

Every write requires an exact saved preview and an affirmative acknowledgment of its fee/refund consequences. A changed reservation, stale preview, expired token or replay cannot authorize another reservation. D1 guards bind the current reservation, guest, contact, token and preview to the inventory update and rotation. Existing area/access constraints, physical inventory, staffing and locked assignments remain binding.

Contact edits belong to one reservation and do not rewrite the guest profile or another reservation. Staff can read the reservation contact; booking CSVs and validated archives preserve it. Guest erasure removes the contact and its history. Bearer records are excluded from archives; restoring a venue requires the owner to issue new links.

The current zero-money path discloses a zero fee and zero refund. Any recorded payment request, captured charge or refund requires manager review before guest mutation. PAY-004/PAY-005 retain fee/refund policy and execution obligations; no payment is taken and no refund is automatically submitted here.

The owner-only issue rule, 24-hour lifetime, reissue/rotation semantics and financial-review default are conservative defaults awaiting ct approval. BOOK-004 remains PARTIAL until that ruling and the remaining financial-consequence journey pass.
