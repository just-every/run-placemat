# sx-placemat-f54fix1: original MSG-003 A1 repair

Repository: just-every/run-placemat
Product branch: cloud/sx-placemat-f54fix1
Product head: cbbb34241e8d86bd7a846de6002b88a1f7f9563b
Original source: eea85727b2402f116b6579db85ec1eb47906db66
Fresh main incorporated: 9e6bb6147a834849683f30973a45a814a0ee0139
Mechanical lander candidate a63b9227dd19b111656adbaf47a07eb969ce9691 was not treated as a product repair or passing gate.

## Outcome and scope

The exact supplied probe reproduced the original blocker on the clean immutable source, using Node v22.20.0 and the real public HTTP harness with workerd/D1 and only outbound mail controlled. Before repair: booking-mail read HTTP 200 with 1 delivery before merge and 0 after merge; genuine unmodified owner backup restored into an empty installation returned HTTP 500; probe exit 1. On the clean committed repair head: 1 delivery before and after the reviewed merge, genuine backup restore HTTP 200, probe exit 0. See before/after raw logs and receipts and the byte-identical original-probe.mjs.

The runtime change adds one SQL update in the existing fenced guest.merge/guest.unmerge save batch. It follows each changed booking's native guest identity, updating only pm_booking_mail.guest_id where both booking_id and the prior guest_id match. Original delivery ID, booking ID, provider, installation, namespace, recipient, actor, message ID, acceptance time and historical flag remain untouched. Existing manager authorization and state/guest/version fences still govern the atomic transaction. The same path handles reviewed reversal. No archive validation, provider authorization, signature validation, erasure trigger, send endpoint or role/scope rule was changed.

Repair changes relative to the immutable source are limited to:

- src/placemat/commands.ts: native identity reconciliation in the existing atomic merge/reversal flow.
- tests/api/booking-rules.test.mjs: extend the existing signed-delivery registration with the original ordinary merge scenario and reversal. Retain source owner/admin history and subject export; preserve original-recipient facts; reject changed and multiple recipients; restore genuine backups with historical facts, no private link authority, no event authority and no send; erase restored merged history and refuse late callbacks; prove no resend.
- sources.lock.json: regenerated last using the documented edition authoring command, then checked.

Every original booking-rules assertion is byte-identical after removing the new helper call and appended helper. Registrations remain 4 -> 4 in that file, zero added. The original source probe file stays outside the product tree; the product regression adds equivalent native-door assertions inside the existing signed-delivery journey. Existing guest and feedback journeys are also run because they share this merge transaction. No UI/homepage/brand, acceptance prose, provider qualification, policy, workflow or other feature changes were made by this repair. No full local suite or baseline was run.

## Contract, counts and holds

MSG-003 remains PARTIAL. Its entire original Status/Evidence/Gap row is retained byte-identically. Every other fresh-main full row is retained byte-identically, including all newer judgments and provenance. The generator was run with the documented REPORT-008 REPORT-005 CRM-005 arguments plus MSG-003, and its check passed before restoring both generated views from fresh main. Neither ACCEPTANCE.md nor docs/CLAIMS.md is committed by this repair. The source lock was then generated and checked last.

Fresh main counts: 56 DONE / 43 PARTIAL / 49 MISSING (148 total).
Original candidate counts: 56 / 44 / 48.
Repaired candidate counts: 56 / 44 / 48.
Repair status changes: none. DONE credit: zero. The inherited MSG-003 missing -> partial proposal is not a new repair promotion. No lifetime reset: one lifetime FIX verdict consumed, 1 of 2.

All original provider qualification, domain/reply/real mailbox/thread, uncertain-send/retry, ct/Base/authority/device/planning and other holds in the full Gap remain. The repair owes ONE independent re-gate against original A1 and ordinary regressions before landing. No hold was released, no self-submission/tag/release occurred, and main was not pushed or fast-forwarded.

## Commands, provenance and validation

Actual command receipts and raw outputs are selected explicitly in this packet. All product commits, including inherited candidate parents, passed the author/committer/trailer audit. Four candidate commits use Run Edit Run fleet <fleet@runeditrun.com>; no trailers survived. Hooks preserved repository hooks, and no hook was disabled. The exact staged repair diff had no credential-shaped values.

The fresh main merge command returned “Already up to date”; fresh main is already an ancestor of the original source. No rebase, published rewrite, force push, duplicate Verify or workflow dispatch occurred. Product push used cloud-push.py once and succeeded on attempt 1. Product branch custody is distinct from report-only evidence transport. No PR was created: this seed's fleet guarded landing contract consumes the named cloud branch.

The cloud cannot run the fleet's full-history COMPLETE publication scan; the Mac lander must run it, exact final Verify, guarded main and exact-main site gates before landing. Diff hygiene is not a claim of COMPLETE publication clearance. Generated-view-only Verify failure has the task's standing exception, and views must remain lander-generated.

## Separate pre-existing finding observed while refining the test fixture

An initial uncommitted regression extension combined a prior guest contact edit with the later merge and was rejected on restore. It was replaced with an isolated instance of the supplied ordinary A1 scenario so the repair remains within its sole assigned blocker. No original assertion or registration was removed or weakened. The failed development attempt remains in touched-initial.log and its receipt.

A separate one-off public-door control confirmed the contact-edit composition already fails on unmodified fresh main 9e6bb6147a834849683f30973a45a814a0ee0139: ordinary management-link contact update -> reviewed guest merge leaves pm_booking_contacts.guest_id different from the merged booking guestId, then genuine empty restore returns HTTP 500. Source was extracted read-only with git archive; its temporary directory was removed. The observation probe exited 0 because it asserted the existing failure. See contact-merge-control.mjs, raw log and receipt. This is a separate pre-existing main defect (D, potentially B/data restore) for the lane, outside original A1. No contact-table, archive-validator or broader feature repair was attempted.

## Cleanup and remaining custody

Every harness instance closes/disposes its workerd runtime and removes its own temporary D1 directory in finally. The separate main-control extraction was removed. Setup completed through cloud_run, whose subreaper waited for owned children; no broad process stop was used. No long-lived dev server or browser was started by the repair. Node modules have been deleted after all exact-head checks completed (cleanup-receipt.json). The successfully pushed clone will be deleted after evidence publication; the packet stays outside the product clone. Terminal cleanup is reported separately because evidence publication needs the clone.

## Exact-head local result

On cbbb34241e8d86bd7a846de6002b88a1f7f9563b, the supplied original probe exits 0; all 14 journeys across booking-rules, guests and feedback pass with zero skips; pnpm typecheck exits 0; edition source lock check exits 0. See exact-checks-receipt.json and the three exact-head logs. Final extended booking-rules registrations remain 4, and the repair adds zero registrations.

## Exact-SHA CI disposition

Verify 42194869705 completed on cbbb34241e8d86bd7a846de6002b88a1f7f9563b. Plan and all seven product/test shards (site, api-1, api-2, runtime, runtime-ui-1, runtime-ui-2, shared-hoststand) passed. The source shard failed solely at `node scripts/contract-docs.mjs check REPORT-008 REPORT-005 CRM-005` with `Error: Regenerate docs/CLAIMS.md`; its prior first-party check passed. The final aggregate consequently failed. This is the task's explicit generated-view-only exception and qualifies for READY; it is not a claim that GitHub's overall conclusion is success. No generated views were committed to bypass it.

Source job 127815531666's one allowed archive command, `gh run view 42194869705 --repo just-every/run-placemat --job 127815531666 --log-failed`, exited 1 with `failed to get run log: unexpected EOF`; no HTTP status/body was supplied. It was not retried. The aggregate job 127820011442 command succeeded and downloaded the workflow archive. The source failed-step log was read directly from that existing local archive with no further network call. See ci-source-cached.log, ci-cache-receipt.json, the original transport-error file, ci-aggregate-failed.log, job/status receipts and the call ledger. Total GitHub CLI invocations: 7, within the ten-call budget; status/discovery polls were at least 300 seconds apart.

READY under the generated-view exception. Remaining: one independent original-A1/ordinary-regression re-gate, all original holds, full-history COMPLETE publication scan, guarded landing with regenerated views, exact final/main Verify and exact-main site. No product blocker was introduced or remains in this repair's original A1 scope.
