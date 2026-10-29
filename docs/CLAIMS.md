# Clause claims

Generated from CONTRACT.md. The acceptance journeys are in ACCEPTANCE.md.

Inventory: 57 done, 42 partial, 49 missing; 148 total.

| Clause | Status | Evidence |
| --- | --- | --- |
| ACCESS-001 | done | `src/placemat/access.ts`; `src/placemat/http.ts`; `tests/api/flows.test.mjs` |
| PRIVACY-001 | done | `src/placemat/http.ts`; `src/placemat/commands.ts`; `tests/api/privacy.test.mjs`; `public/placemat-analytics.js`; `tests/api/embed.test.mjs` |
| BOOK-001 | done | `src/placemat/http.ts`; `src/placemat/availability.ts`; `tests/api/flows.test.mjs` |
| FLOOR-001 | done | `src/placemat/availability.ts`; `src/placemat/store.ts`; `tests/api/flows.test.mjs` |
| SERVICE-001 | done | `src/placemat/commands.ts`; `tests/api/flows.test.mjs` |
| PLAN-001 | done | `src/placemat/commands.ts`; `src/placemat/people.ts`; `tests/api/flows.test.mjs`; `tests/api/reminders.test.mjs` |
| MSG-001 | done | `src/placemat/commands.ts`; `src/placemat/downloads.ts`; `tests/api/reminders.test.mjs` |
| WAIT-001 | done | `src/placemat/commands.ts`; `tests/api/flows.test.mjs` |
| GUEST-001 | done | `src/placemat/guests.ts`; `src/placemat/import/plan.ts`; `tests/api/flows.test.mjs` |
| MIG-001 | done | `src/placemat/import/index.ts`; `src/placemat/import/plan.ts`; `tests/api/flows.test.mjs` |
| DATA-001 | done | `src/placemat/backup.ts`; `src/placemat/archive-policy.mjs`; `tests/api/flows.test.mjs`; `tests/api/embed.test.mjs` |
| DATA-002 | done | `src/placemat/import/erase.ts`; `src/placemat/backup.ts`; `tests/api/flows.test.mjs` |
| SITE-001 | done | `tests/site.mjs`; `tests/install.mjs`; `src/placemat/model.ts` |
| OSS-001 | done | `LICENSE`; `tests/site.mjs`; `tests/install.mjs`; `tests/api/flows.test.mjs` |
| BOUND-001 | done | `tests/api/flows.test.mjs`; `tests/site.mjs`; `tests/boundary-ui.mjs`; `docs/getting-started.md`; `docs/HTTP-CONTRACT.md` |
| SETUP-001 | done | `src/placemat/onboarding.ts`; `src/placemat/onboarding-preview.ts`; `src/placemat/local-time.ts`; `src/placemat/service-input.ts`; `public/placemat-onboarding.js`; `tests/api/onboarding.test.mjs`; `tests/onboarding-ui.mjs` |
| SERVICE-002 | done | `src/placemat/schedules.ts`; `public/placemat-schedules.js`; `tests/api/schedules.test.mjs`; `tests/schedules-ui.mjs` |
| SERVICE-003 | done | `tests/api/service-changes.test.mjs`; `tests/service-changes-ui.mjs`; `tests/search-ui.mjs`; `scripts/service-change-sandbox.mjs` |
| SERVICE-004 | done | `src/placemat/booking-rules.ts`; `src/placemat/commands.ts`; `src/placemat/availability.ts`; `public/placemat-rules.js`; `tests/api/booking-rules.test.mjs` |
| SERVICE-005 | done | `src/placemat/pacing.ts`; `src/placemat/pacing-review.ts`; `src/placemat/commands.ts`; `public/placemat-pacing.js`; `tests/api/pacing.test.mjs`; `tests/pacing-ui.mjs` |
| SERVICE-006 | done | `src/placemat/turn-policy.ts`; `src/placemat/turn-fit.ts`; `src/placemat/capacity.ts`; `src/placemat/commands.ts`; `public/placemat-turns.js`; `tests/api/turns.test.mjs` |
| SERVICE-007 | done | `src/placemat/pacing.ts`; `src/placemat/pacing-review.ts`; `src/placemat/commands.ts`; `public/placemat-pacing.js`; `tests/api/pacing.test.mjs`; `tests/pacing-ui.mjs` |
| BOOK-002 | done | `src/placemat/embed.ts`; `src/placemat/views.ts`; `src/server.ts`; `public/placemat-embed.js`; `public/placemat-widget.js`; `src/placemat/analytics.ts`; `src/placemat/analytics-events.ts`; `migrations/core/0024_analytics.sql`; `public/placemat-analytics.js`; `public/placemat-analytics-settings.js`; `tests/api/embed.test.mjs`; `tests/embed-ui.mjs` |
| BOOK-003 | done | `src/placemat/reservation-search.ts`; `src/placemat/http.ts`; `src/placemat/commands.ts`; `public/placemat-search.js`; `tests/api/booking-rules.test.mjs`; `tests/search-ui.mjs` |
| BOOK-004 | partial | `tests/api/booking-rules.test.mjs`; `tests/search-ui.mjs`; `scripts/booking-management-sandbox.mjs` |
| BOOK-005 | partial | `src/placemat/phone-bookings.ts`; `public/placemat-phone.js`; `tests/api/flows.test.mjs`; `tests/api/phone-booking-journeys.mjs`; `tests/phone-bookings-ui.mjs` |
| BOOK-006 | done | `tests/api/flows.test.mjs`; `tests/api/booking-holds-journeys.mjs`; `tests/api/checkout-payment-journeys.mjs`; `tests/checkout-ui.mjs`; `scripts/checkout-sandbox.mjs` |
| BOOK-007 | done | `src/placemat/inquiries.ts`; `src/placemat/booking-requests.ts`; `src/placemat/inquiry-views.ts`; `public/placemat-inquiry.js`; `public/placemat-inquiries.js`; `public/placemat-requests.js`; `tests/api/inquiries.test.mjs`; `tests/inquiries-ui.mjs` |
| DIST-001 | missing |  |
| DIST-002 | missing |  |
| DIST-003 | missing |  |
| DIST-004 | partial | `tests/api/assignments.test.mjs`; `tests/allocation-ui.mjs`; `tests/api/embed.test.mjs`; `tests/api/flows.test.mjs` |
| DIST-005 | done | `tests/diner-ui.mjs`; `tests/api/guests.test.mjs`; `tests/api/diner-journeys.mjs`; `tests/api/diner-management-journey.mjs`; `tests/api/diner-custody-journey.mjs`; `tests/api/diner-journeys.mjs`; `tests/api/diner-portability.mjs`; `docs/data-portability.md` |
| DIST-006 | missing |  |
| FLOOR-002 | done | `src/placemat/floor-plan.ts`; `src/placemat/combinations.ts`; `public/placemat-floor-plan.js`; `tests/api/combinations.test.mjs`; `tests/floor-plan-ui.mjs` |
| FLOOR-003 | done | `src/placemat/combinations.ts`; `src/placemat/capacity.ts`; `src/placemat/assignments.ts`; `public/placemat-combinations.js`; `tests/api/combinations.test.mjs`; `tests/combinations-ui.mjs` |
| FLOOR-004 | done | `src/placemat/staffing.ts`; `src/placemat/staffing-capacity.ts`; `public/placemat-staffing.js`; `tests/api/staffing.test.mjs`; `tests/staffing-ui.mjs` |
| FLOOR-005 | done | `src/placemat/timeline.ts`; `src/placemat/capacity.ts`; `public/placemat-timeline.js`; `tests/api/timeline.test.mjs`; `tests/floor-ui.mjs` |
| FLOOR-006 | done | `src/placemat/service-status.ts`; `public/placemat-service-status.js`; `tests/api/service-status.test.mjs` |
| FLOOR-007 | done | `tests/api/timeline.test.mjs`; `tests/timeline-search-ui.mjs`; `tests/floor-ui.mjs` |
| FLOOR-008 | partial | `tests/api/assignments.test.mjs`; `tests/floor-plan-ui.mjs` |
| FLOOR-009 | done | `src/placemat/assignments.ts`; `src/placemat/commands.ts`; `src/placemat/access.ts`; `public/placemat-assignments.js`; `tests/api/assignments.test.mjs`; `tests/floor-ui.mjs` |
| FLOOR-010 | done | `tests/api/assignments.test.mjs`; `tests/preshift-ui.mjs` |
| FLOOR-011 | partial | `tests/api/flows.test.mjs`; `tests/operations-ui-journey.mjs`; `tests/queue-ui.mjs` |
| FLOOR-012 | done | `src/placemat/preshift.ts`; `src/placemat/preshift-view.ts`; `src/placemat/http.ts`; `tests/api/preshift.test.mjs`; `tests/preshift-ui.mjs` |
| FLOOR-013 | done | `src/placemat/service-notes.ts`; `src/placemat/service-notes-archive.mjs`; `src/placemat/kitchen-view.ts`; `public/placemat-service-notes.js`; `tests/api/service-notes.test.mjs`; `tests/service-notes-ui.mjs` |
| WAIT-002 | done | `src/placemat/wait-join.ts`; `src/placemat/queue-views.ts`; `src/placemat/queue-qr.ts`; `public/placemat-queue-join.js`; `tests/api/wait-join.test.mjs`; `tests/queue-ui.mjs` |
| WAIT-003 | partial | `tests/api/queue.test.mjs`; `tests/operations-ui-journey.mjs`; `tests/queue-ui.mjs` |
| WAIT-004 | missing |  |
| WAIT-005 | missing |  |
| WAIT-006 | done | `src/placemat/queue.ts`; `src/placemat/commands.ts`; `src/placemat/people.ts`; `public/placemat-queue.js`; `tests/api/queue.test.mjs` |
| MSG-002 | missing |  |
| MSG-003 | missing |  |
| MSG-004 | missing |  |
| MSG-005 | partial | `src/placemat/commands.ts`; `src/placemat/downloads.ts`; `tests/api/flows.test.mjs` |
| MSG-006 | missing |  |
| MSG-007 | missing |  |
| MSG-008 | partial | `src/placemat/wait-join.ts`; `src/placemat/guest-state-erasure.ts`; `tests/api/wait-join.test.mjs`; `tests/api/audit.test.mjs`; `tests/api/guests.test.mjs` |
| MSG-009 | missing |  |
| MSG-010 | missing |  |
| MSG-011 | missing |  |
| PAY-001 | partial | `tests/api/fee-journeys.mjs`; `tests/guarantees-ui.mjs`; `scripts/merchant-sandbox.mjs` |
| PAY-002 | partial | `tests/api/checkout-payment-journeys.mjs` |
| PAY-003 | partial | `tests/api/card-hold-journey.mjs`; `tests/api/fee-expiry-journeys.mjs`; `tests/api/fee-journeys.mjs`; `tests/guarantees-ui.mjs`; `scripts/merchant-sandbox.mjs` |
| PAY-004 | partial | `src/placemat/fee-policy.ts`; `src/placemat/fees.ts`; `tests/api/fee-journeys.mjs`; `tests/fees-ui.mjs`; `tests/pacing-ui.mjs`; `scripts/fees-sandbox.mjs` |
| PAY-005 | partial | `src/placemat/refunds.ts`; `tests/api/flows.test.mjs`; `tests/pacing-ui.mjs`; `tests/api/flows.test.mjs`; `scripts/refund-sandbox.mjs`; `scripts/refund-webhook-sandbox.mjs`; `tests/api/refund-notice-journeys.mjs`; `tests/refund-notices-ui.mjs` |
| PAY-006 | partial | `tests/api/money-ledger-journeys.mjs` |
| PAY-007 | missing |  |
| PAY-008 | missing |  |
| PAY-009 | partial | `tests/api/money-ledger-journeys.mjs`; `tests/payment-operations-ui.mjs`; `docs/payment-operations.md`; `scripts/payment-operations-sandbox.mjs` |
| PAY-010 | partial | `src/placemat/payment-links.ts`; `tests/api/timeline.test.mjs`; `tests/api/preshift.test.mjs`; `tests/floor-ui.mjs`; `tests/preshift-ui.mjs` |
| EXP-001 | done | `tests/api/experience-journeys.mjs`; `tests/experiences-ui.mjs`; `docs/experiences.md`; `docs/data-portability.md` |
| EXP-002 | partial | `tests/api/experience-journeys.mjs`; `tests/experiences-ui.mjs`; `docs/experiences.md`; `docs/data-portability.md` |
| EXP-003 | missing |  |
| EXP-004 | missing |  |
| EXP-005 | missing |  |
| GUEST-002 | done | `src/placemat/profiles.ts`; `src/placemat/guests.ts`; `public/placemat-profiles.js`; `tests/api/guests.test.mjs` |
| GUEST-003 | partial | `tests/api/guests.test.mjs`; `tests/api/assignments.test.mjs`; `tests/operations-ui-journey.mjs`; `tests/queue-ui.mjs` |
| GUEST-004 | done | `tests/api/guests.test.mjs`; `tests/guest-review-ui.mjs` |
| GUEST-005 | missing |  |
| GUEST-006 | missing |  |
| CRM-001 | missing |  |
| CRM-002 | missing |  |
| CRM-003 | missing |  |
| CRM-004 | missing |  |
| CRM-005 | done | `tests/api/feedback.test.mjs`; `tests/api/feedback-portability.mjs`; `tests/feedback-ui.mjs`; `scripts/feedback-sandbox.mjs` |
| CRM-006 | missing |  |
| POS-001 | missing |  |
| POS-002 | missing |  |
| POS-003 | missing |  |
| POS-004 | missing |  |
| POS-005 | missing |  |
| POS-006 | missing |  |
| POS-007 | missing |  |
| REPORT-001 | done | `src/placemat/reports.ts`; `src/placemat/http.ts`; `public/placemat-reports.js`; `tests/api/reports.test.mjs`; `tests/service-close-report-ui.mjs` |
| REPORT-002 | done | `src/placemat/performance.ts`; `src/placemat/performance-store.ts`; `public/placemat-performance.js`; `tests/api/reports.test.mjs`; `tests/api/pacing.test.mjs`; `tests/performance-ui.mjs` |
| REPORT-003 | partial | `src/placemat/model.ts`; `public/placemat.js`; `tests/api/flows.test.mjs` |
| REPORT-004 | missing |  |
| REPORT-005 | done | `tests/api/reports.test.mjs`; `tests/group-ui.mjs`; `tests/api/business-export.test.mjs`; `tests/api/finance-role.test.mjs`; `scripts/report-schedule-sandbox.mjs`; `tests/api/reports.test.mjs`; `tests/group-ui.mjs`; `scripts/recurring-reports-sandbox.mjs` |
| REPORT-008 | done | `tests/api/reports.test.mjs`; `tests/group-ui.mjs`; `scripts/recurring-reports-sandbox.mjs` |
| REPORT-006 | missing |  |
| REPORT-007 | done | `src/placemat/service-close-report.ts`; `src/placemat/recovery.ts`; `src/placemat/pdf.ts`; `public/placemat-close-report.js`; `tests/api/service-close-report.test.mjs`; `tests/service-close-report-ui.mjs` |
| COST-001 | partial | `tests/api/costs.test.mjs`; `tests/costs-ui.mjs` |
| MIG-002 | missing |  |
| MIG-003 | missing |  |
| MIG-004 | missing |  |
| MIG-005 | missing |  |
| MIG-006 | missing |  |
| MIG-007 | missing |  |
| MIG-008 | partial | `src/placemat/import/plan.ts`; `src/placemat/import/index.ts`; `tests/api/flows.test.mjs` |
| DATA-003 | done | `src/placemat/business-export.ts`; `src/placemat/business-export-store.ts`; `src/placemat/backup.ts`; `src/placemat/archive-policy.mjs`; `docs/data-portability.md`; `tests/api/business-export.test.mjs`; `tests/business-export-ui.mjs`; `tests/api/embed.test.mjs` |
| ROLE-001 | done | `src/placemat/access.ts`; `src/placemat/http.ts`; `src/placemat/group.ts`; `src/placemat/group-access.ts`; `src/placemat/group-store.ts`; `tests/api/group.test.mjs`; `tests/group-ui.mjs` |
| ROLE-002 | done | `tests/api/flows.test.mjs`; `tests/pacing-ui.mjs` |
| ROLE-003 | done | `src/placemat/access.ts`; `src/placemat/http.ts`; `src/placemat/preshift.ts`; `src/placemat/service-notes.ts`; `tests/api/server-role.test.mjs`; `tests/api/preshift.test.mjs`; `tests/server-ui.mjs`; `tests/api/pacing.test.mjs`; `tests/pacing-ui.mjs` |
| ROLE-009 | missing |  |
| ROLE-010 | missing |  |
| ROLE-004 | partial | `src/placemat/access.ts`; `src/placemat/http.ts`; `src/placemat/finance.ts`; `src/placemat/finance-view.ts`; `tests/api/finance-role.test.mjs`; `tests/finance-ui.mjs` |
| SEC-001 | partial | `src/modules/operator-auth/accounts/admin.mjs`; `src/modules/operator-auth/accounts/native.mjs`; `tests/runtime.mjs`; `tests/api/flows.test.mjs` |
| SEC-002 | done | `tests/api/flows.test.mjs`; `tests/api/timeline.test.mjs`; `tests/floor-ui.mjs` |
| AUDIT-001 | done | `src/placemat/audit.ts`; `src/placemat/store.ts`; `src/placemat/commands.ts`; `src/placemat/guest-state-erasure.ts`; `public/placemat-audit.js`; `tests/api/audit.test.mjs`; `tests/api/embed.test.mjs`; `tests/audit-ui.mjs` |
| API-001 | done | `docs/HTTP-CONTRACT.md`; `src/placemat/http.ts`; `tests/api/flows.test.mjs`; `tests/api/privacy.test.mjs` |
| API-002 | partial | `docs/HTTP-CONTRACT.md`; `tests/api/flows.test.mjs`; `tests/api/integration-schema.test.mjs`; `tests/api/reservation-api.test.mjs` |
| VOICE-001 | missing |  |
| MOBILE-001 | partial | `src/placemat/views.ts`; `public/placemat.css`; `public/placemat.js` |
| OPS-001 | partial | `src/placemat/backup.ts`; `src/placemat/store.ts`; `tests/api/flows.test.mjs` |
| DATA-004 | partial | `tests/api/privacy.test.mjs`; `tests/privacy-ui.mjs` |
| SITE-002 | partial | `src/site/landing/hero.ts`; `deploy-demo.json`; `.github/workflows/run-demo.yml`; `src/demo.ts`; `tests/api/demo.test.mjs` |
| AGENT-001 | missing |  |
| AGENT-002 | partial | `src/placemat/commands.ts`; `src/placemat/availability.ts`; `tests/api/flows.test.mjs` |
| AGENT-003 | missing |  |
| AGENT-004 | done | `src/placemat/allocation-advisor.ts`; `src/placemat/inventory-advisor.ts`; `src/placemat/shift-advisor.ts`; `src/placemat/direct-inventory.ts`; `public/placemat-allocation.js`; `public/placemat-allocation-policy.js`; `tests/api/assignments.test.mjs`; `tests/allocation-ui.mjs` |
| AGENT-005 | done | `src/placemat/no-show.ts`; `public/placemat-risk.js`; `tests/api/risk.test.mjs`; `tests/risk-ui.mjs` |
| AGENT-006 | missing |  |
| AGENT-007 | missing |  |
| AGENT-008 | missing |  |
| BASE-AGENT-001 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-002 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-003 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-004 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-005 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-006 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-007 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-008 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-009 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-010 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-011 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-012 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
| BASE-AGENT-013 | partial | `agent-surface.json`; `tests/agent-fixtures.mjs`; `tests/agent-native-journey.mjs` |
