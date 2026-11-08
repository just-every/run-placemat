# Placemat Verify shard limit: sx-placemat-ci-limit-1

Repository: just-every/run-placemat
Product branch: cloud/sx-placemat-ci-limit-1
Product head: 07025cc67737b2d127ea1162fc89d49039d95f90
Main at clone: fa262c16d82bd74b2eaef7ff8ba68ac62bc42044
PR: none; this repository's shipped instructions do not require a PR for this fleet branch.

## Plan and result

The complete execution plan is in PLAN.md. The task was limited to increasing push Verify shard time to fit observed runtime. The shallow filtered clone was created from current main. Fleet identity, credential helper, author/committer environment and the co-author cleanup hook were applied. Only the declared repository received product writes. The named product branch was pushed once, successfully on the first attempt, using cloud-push.py.

In .github/workflows/verify.yml, the reusable timeout input default and shard job fallback changed from 12 to 17 minutes. An exact byte comparison verifies those two replacements are the only workflow changes. The explicit Nightly journeys timeout remains 45 minutes so full installation coverage retains its existing budget. Planning and aggregate job timeouts remain one minute. No test, assertion, shard partition or matrix changed.

VERIFY-WORKFLOW.md's existing push timeout statement now says 17 minutes. No speed-tests-ci PLAN.md Appendix A is carried by this checkout. verify.yml is selected as edition-owned local source in edition.json and is not a base-copies.json file. The documented adapt-base command therefore correctly refused it as an unrecorded Base copy; no workflow Base record was added. The CI guide is an acknowledged Base adaptation: node scripts/edition-authoring/cli.mjs adapt-base VERIFY-WORKFLOW.md refreshed only its local acknowledged digest. The documented source lock command regenerated sources.lock.json last, updating only the workflow, CI guide and Base record hashes. All upstream comparison pins and unrelated prose were retained.

Four product files changed: .github/workflows/verify.yml, VERIFY-WORKFLOW.md, base-copies.json and sources.lock.json (7 insertions, 7 deletions). Product commits contain no report/evidence packet files.

## Measured basis

Exactly one gh run view --json jobs request was made for each cited run; raw job metadata is retained in run-42442242811.json, run-42436186939.json and run-42423792776.json. shard-durations.json and shard-durations.md record all measured shard durations.

- Main Verify 42436186939: longest completed shard runtime-ui-2, 10m40s (job 128595433747); api-2, 8m43s (job 128595433746).
- Main Verify 42423792776: longest completed shard runtime-ui-2, 10m34s (job 128557661116); api-2, 8m19s (job 128557661109).
- Candidate Verify 42442242811: the returned rerun attempt cancelled api-2 after 12m15s (job 128617266645). The longest successful sibling was runtime-ui-2, 9m39s. This is a runtime floor, not a completed api-2 duration. The brief separately records the first-attempt cancellation at job 128613752987; this task did not spend another API call retrieving that attempt.

Seventeen minutes adds five minutes to the governing configured limit and 4m45s above the observed cancelled job duration. No shard was rebalanced.

## Validation and custody

Passed checks:

- node scripts/edition-authoring/cli.mjs verify-base --offline: all local copy acknowledgements fresh; upstream origin comparison explicitly not checked offline.
- node scripts/edition-authoring/cli.mjs lock, followed by check: fresh edition source lock.
- node scripts/verify-ci.mjs --matrix push and --matrix all: eight push shards and nine full shards, unchanged.
- node scripts/contract-docs.mjs check REPORT-008 REPORT-005 CRM-005: 148 clauses, projections fresh.
- git diff --check; exact workflow-byte comparison; unchanged nightly caller, shard manifest/partition and contract source/views compared against origin/main.
- Single candidate commit author and committer: Run Edit Run fleet <fleet@runeditrun.com>; no trailers; active repository-preserving cleanup hook; clean product worktree after commit.

No tests were added. No full local app setup, build or browser proof was needed for the workflow-number/documentation change. Exact-SHA hosted Verify performs the normal push shard checks. No UI changed.

CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are byte-identical to the cloned main. Clause totals before and after: 56 done, 45 partial, 47 missing, 148 total. Clause status/gap/evidence changes: none. Tests and shard assignment changes: none. Push matrix before/after: 8/8; full matrix: 9/9; shard job default: 12/17 minutes; nightly override: 45/45 minutes.

Product push succeeded at 07025cc67737b2d127ea1162fc89d49039d95f90. Exact-SHA Verify run: 42446693440, https://github.com/just-every/run-placemat/actions/runs/42446693440. The final CI result is recorded below and in receipt.json and verify-final.json when available. Calls are logged in github-calls.jsonl, with a single watcher and at least 300 seconds between discovery/polls. Infrastructure reruns, if any, are stated explicitly in the final result.

Evidence is published separately, using explicitly selected regular non-secret files, to evidence/sx-placemat-ci-limit-1. That publication is report transport only. The fleet retains responsibility for independent publication scanning, acceptance and landing; this task never pushes main.

## Final result

Exact-SHA Verify 42446693440 completed successfully at 07025cc67737b2d127ea1162fc89d49039d95f90. No exception for generated views was needed. No failed-job rerun was used. GitHub calls used: 7 of 10. No blockers. Product branch/head and index/worktree remain unchanged.

READY branch=cloud/sx-placemat-ci-limit-1 head=07025cc67737b2d127ea1162fc89d49039d95f90
