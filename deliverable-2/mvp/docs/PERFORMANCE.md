# NFR2 performance — load test results

> **NFR2:** The system should remain responsive under the expected peak submission workload.

Deliverable 1 does not define the expected peak, so the MVP uses this assumption. **The team should confirm or change it.**

- **Expected peak:** 200 teams all submit (with a 200 KB file each) during the final 10 seconds before the deadline, while also refreshing their dashboards.
- **Responsive** means no request fails and 95% of requests finish within 2 seconds (p95 ≤ 2000 ms).

## How to run

```bash
npm run load-test                 # 200 teams, 200 KB files, 10 s rush
npm run load-test -- 500 500 30   # teams, file size in KB, rush length in seconds
```

The script starts its own server on a temporary database and upload folder, so it never touches real data. Account and team setup is not measured.

## Scenarios

1. **Deadline rush (the NFR2 target).** Each team submits once at a random moment within the rush window and refreshes its dashboard once.
2. **Worst-case burst (stress test).** All teams replace their submission at the same instant. The requirement here is that **no submission is lost**; latency is reported for information. This also exercises version history, because every request archives the previous version.

## Results

Ubuntu 24.04, Node.js 22.23.5, local SSD, single server process.

| Scenario | Requests | Failed | p50 | p95 | p99 | Max | Result |
|---|---|---|---|---|---|---|---|
| Rush: submit | 200 | 0 | 19 ms | 29 ms | 39 ms | 66 ms | **PASS** |
| Rush: dashboard refresh | 200 | 0 | 5 ms | 20 ms | 26 ms | 28 ms | **PASS** |
| Burst: 200 simultaneous re-submits | 200 | 0 | 1466 ms | 2020 ms | 2064 ms | 2082 ms | **PASS** (none lost) |

Throughput during the burst was about **83 submissions per second**, roughly four times the rush rate.

## Change made because of this test

The first run took 3.4 s per submission at the median during the burst, and about 30 submissions per second overall. Profiling showed that almost all of the time went on SQLite waiting for the disk on every commit (about 12 ms each). Upload parsing, decoding, and scanning took only about 1.3 ms per submission.

The database now uses **write-ahead logging** (`journal_mode = WAL`) with `synchronous = FULL`. That cut the commit wait to about 4 ms and more than doubled throughput. `synchronous = FULL` was kept on purpose: every submission that receives a receipt (NFR3) is on disk, even after a power cut.

## Limits

- The server is a single Node.js process. Submissions are processed one after another, so the burst latency grows with the number of simultaneous requests: about 10 ms per waiting request.
- If the real peak turns out to be much larger than 200 simultaneous teams, the next steps would be batching the audit-log write into the submission transaction, storing artifacts in object storage, or running more than one process with a server database.
