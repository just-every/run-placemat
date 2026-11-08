# Measured shard durations

Durations are completedAt minus startedAt from each requested gh run view --json jobs response. The failed candidate response is the latest (rerun) attempt, not attempt 1. A cancelled timeout is a lower bound on required runtime, not a completed measurement.

| Run | Job | Shard | Outcome | Elapsed |
| --- | --- | --- | --- | --- |
| 42423792776 | 128557661116 | shards (runtime-ui-2, true) | success | 10m34s |
| 42423792776 | 128557661111 | shards (shared-hoststand, true) | success | 8m43s |
| 42423792776 | 128557661109 | shards (api-2, false) | success | 8m19s |
| 42423792776 | 128557661072 | shards (runtime-ui-1, true) | success | 7m25s |
| 42423792776 | 128557661086 | shards (api-1, false) | success | 7m21s |
| 42423792776 | 128557661048 | shards (runtime, true) | success | 5m43s |
| 42423792776 | 128557661063 | shards (site, false) | success | 0m23s |
| 42423792776 | 128557661169 | shards (source, false) | success | 0m22s |
| 42436186939 | 128595433747 | shards (runtime-ui-2, true) | success | 10m40s |
| 42436186939 | 128595433867 | shards (shared-hoststand, true) | success | 8m50s |
| 42436186939 | 128595433746 | shards (api-2, false) | success | 8m43s |
| 42436186939 | 128595433692 | shards (api-1, false) | success | 7m25s |
| 42436186939 | 128595433761 | shards (runtime, true) | success | 6m44s |
| 42436186939 | 128595433759 | shards (runtime-ui-1, true) | success | 6m31s |
| 42436186939 | 128595433683 | shards (site, false) | success | 0m29s |
| 42436186939 | 128595433745 | shards (source, false) | success | 0m22s |
| 42442242811 | 128617266645 | shards (api-2, false) | cancelled | 12m15s |
| 42442242811 | 128617266850 | shards (runtime-ui-2, true) | success | 9m39s |
| 42442242811 | 128617296290 | shards (shared-hoststand, true) | success | 8m50s |
| 42442242811 | 128617296132 | shards (runtime-ui-1, true) | success | 7m37s |
| 42442242811 | 128617293063 | shards (api-1, false) | success | 7m26s |
| 42442242811 | 128617287911 | shards (runtime, true) | success | 6m41s |
| 42442242811 | 128617267424 | shards (site, false) | success | 0m28s |
| 42442242811 | 128617295601 | shards (source, false) | success | 0m27s |

The longest successful main shard was runtime-ui-2 at 10m40s (42436186939); the other main run reached 10m34s. Main api-2 completed in 8m43s and 8m19s. The candidate rerun api-2 was cancelled after 12m15s. A 17-minute limit gives 4m45s above this observed cancellation floor. The brief records the first attempt cancellation separately (job 128613752987); no extra request was made for that historical attempt.
