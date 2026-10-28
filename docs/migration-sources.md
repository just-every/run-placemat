# Migration source formats

These sources establish starting formats, not shipped importers or universal field guarantees. Real customer exports, current headers and account permissions must be verified during each importer’s acceptance. Preserve absent fields as unknown and report exceptions. No source establishes portable raw card credentials.

MIG-002: OpenTable documents [Guestbook export](https://support.opentable.com/s/article/Export-your-Guestbook?language=en_US) and [reservation/group exports](https://support.opentable.com/s/article/Group-reporting-reservations?language=en_US).

MIG-003: Resy documents [guestbook downloads](https://helpdesk.resy.com/en_us/guestbook-download-faq-rkHePTch) and [analytics exports](https://helpdesk.resy.com/advanced-analytics-faq-S1zUFF61C); Tock documents [support-supplied Resy migration files](https://tock.zendesk.com/hc/en-us/articles/34628828437140-Data-Transfer-Instructions).

MIG-004: SevenRooms’ [export guide](https://go.sevenrooms.com/rs/519-YNM-008/images/SevenRooms%20Help%20Guide%20-%20March%202020.pdf) and Resy’s [migration instructions](https://helpdesk.resy.com/en_us/data-transfer-instructions-BkD17zouu) describe client and reservation exports; [API access](https://api-docs.sevenrooms.com/) requires provisioned accounts.

MIG-005: Tock documents [guest exports](https://tock.zendesk.com/hc/en-us/articles/36511532364436-Understanding-Guest-Profiles-in-Tock), its [API capabilities and delays](https://tock.zendesk.com/hc/en-us/articles/25447494175508-API-FAQ), [guest JSON model](https://api.exploretock.com/docs/latest/guest_profile.html) and [reservation JSON model](https://api.exploretock.com/docs/latest/reservation.html). Resy’s [migration instructions](https://helpdesk.resy.com/en_us/data-transfer-instructions-BkD17zouu) describe CSV/support files and retaining prior-system prepayment obligations.

MIG-006: Eat App documents [reservation-list CSV](https://restaurant.eatapp.co/migration/knowledge/reservation-list) and [guest/report fields](https://restaurant.eatapp.co/knowledge/how-to-generate-reservation-and-guest-report).

MIG-007: Loman describes [customer-owned conversation/configuration data](https://loman.ai/terms-and-conditions) and [connected OpenTable booking operations](https://loman.ai/blog/loman-ai-announces-integration-with-opentable-enabling-full-voice-ai-powered-reservation-management-for-restaurants). Its native customer export format is unconfirmed; acceptance requires the real owner-provided format instead of inventing one.
