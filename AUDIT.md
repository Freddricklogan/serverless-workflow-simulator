# AUDIT — Serverless Workflow Simulator (pre-refactor)

Audit of the previous build: one 383-line `index.html` carrying the
markup, the CSS and a 228-line inline script; no tests, no CI, no data
files. The page described itself as an "event-driven architecture
simulation with Lambda, API Gateway, SQS & Step Functions". What it ran
was a linear list of boxes with random sleeps. Findings are grouped by
what the copy claimed, what the arithmetic did, and what a strict policy
could not run. Line numbers refer to the old `index.html`.

---

## A. Honesty of the copy

### A1 — "Step Functions" with no state machine
Each template was a flat array (`WORKFLOWS`, lines 161–194) walked
`for(let i=0;i<workflow.length;i++)`. No Choice, no Parallel, no Map,
no Retry, no Catch — none of the things Step Functions exists for.
**Fix:** the presets are Amazon States Language documents in
`data/workflows.json`, executed by `src/asl.js`, which implements
Task, Choice, Wait, Parallel, Map with MaxConcurrency, Pass, Succeed,
Fail, Retry with BackoffRate and Catch with ResultPath. Paste your own
definition; the validator names each problem before it runs.

### A2 — Prices with no provenance
Line 271: `// Cost: $0.20 per 1M requests + $0.0000166667 per GB-second`.
Two hard-coded numbers, no region, no date, no other service. **Fix:**
`scripts/fetch-pricing.mjs` pulls the first on-demand tier for Lambda,
Step Functions, SQS, SNS, API Gateway and DynamoDB from the AWS Price
List Bulk API into `data/pricing.json` with the fetch date, and the page
prints the source and date beside the cost table.

### A3 — "DLQ" that was a list of strings
`stats.dlqMessages` (line 257) collected a random error string when a
Lambda box "failed"; no queue, no redrive, no relation to what the
workflow would do. Worse, `randomError()` was called twice per failure
(lines 256–257), so the log and the "DLQ" showed different errors for
the same event. **Fix:** failures are States-language errors raised by
the model; what happens next is whatever the definition's Retry and
Catch say. The API preset catches into a `RecordFailure` task and a
`Fail` state, which is the honest shape of a dead-letter path.

## B. Correctness of the arithmetic

### B1 — Every node billed as Lambda time
Line 272: `gbSec=(memory/1024)*(totalDuration/1000)` used the whole
workflow duration — API Gateway, SQS, DynamoDB and S3 boxes included —
as Lambda GB-seconds, and charged one Lambda request per run regardless
of how many Lambda tasks the template had. **Fix:** `executionCost()`
bills each Task by its service ARN: Lambda requests and GB-seconds per
invocation attempt, DynamoDB read or write units, SQS and SNS requests,
and Step Functions state transitions (Standard) or requests plus
duration (Express). Every line is tested against hand arithmetic.

### B2 — Memory scaled the latency of services that have no memory
Line 245: `dur=Math.round(dur*(1024/memory))` applied to every node.
Doubling Lambda memory halved the modelled latency of DynamoDB. **Fix:**
the memory factor applies to Lambda tasks only, and the page says
latencies are stated assumptions, not measurements.

### B3 — A concurrency bar that could never throttle
`activeSlots` (line 231) was incremented at the start of each sequential
run and decremented at its end, so it was 1 whenever anything was
running and the "throttled" class was unreachable for any limit above
1. **Fix:** an Erlang-B calculation (`throttling()`) from the arrival
rate, the measured median duration and the reserved concurrency,
returning the blocking probability and mean occupancy; tested against
the textbook value for one server.

### B4 — `Math.random` everywhere
Lines 232, 253, 370, 373: durations, cold starts, errors and error
messages were all unseeded. Two runs with the same settings gave
different numbers, so no figure on the page could be reproduced.
**Fix:** one `mulberry32` stream from the seed field; the model draws
from it in a fixed order, and the tests assert exact values.

### B5 — Cold start was a per-run coin toss
Line 232 decided once per run (`isCold`, 15 % hard-coded) whether every
Lambda in the pipeline cold-started together. **Fix:** cold start is
drawn per Lambda invocation at the configured rate, and a retry after a
failure is a new invocation with its own draw.

### B6 — Fifty runs, always
`const totalRuns=50` (line 222); no way to run enough executions for a
p95 to mean anything. **Fix:** 50, 200 or 1000 executions with p50 and
p95 from a real percentile function.

## C. Security and structure

### C1 — No CSP, seven `onclick` and two `oninput` attributes, 28 `style=`
`Content-Security-Policy` was absent; the handlers and styles would have
been blocked by any policy worth having. **Fix:** `default-src 'none'`
with a script allow-list; every handler is `addEventListener`; every
style is a class; every string reaches the DOM through `textContent`.

### C2 — Chart.js from a CDN without SRI
Line 7 loaded `chart.js@3.9.1` with no `integrity` attribute. **Fix:**
SRI hash computed against the artifact, plus a vendored copy the page
falls back to when the CDN or its hash fails.

### C3 — `innerHTML` with interpolated strings
Lines 358 and 365 built log entries by string concatenation. Nothing
untrusted reached them, but pasted definitions now do. **Fix:** `el()`
and `textContent` only.

## D. Engineering

### D1 — No tests, no CI, no data files
Presets and prices lived inside the script. **Fix:** `data/` for
presets and pricing, Vitest for the engine, the model and the cost
lines, ESLint and html-validate in the lint job, a security scan, and
Pages deployment from a green build.
