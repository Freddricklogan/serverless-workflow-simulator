# Case Study — Serverless Workflow Simulator

**Repository:** [serverless-workflow-simulator](https://github.com/Freddricklogan/serverless-workflow-simulator) · **Live demo:** [freddricklogan.github.io/serverless-workflow-simulator](https://freddricklogan.github.io/serverless-workflow-simulator/) · **Author:** Freddrick Logan

---

## 1. Who has this problem

Teams choosing between Standard and Express workflows before writing one, an architect asked what a retry policy does to a p95, a finance partner who wants a per-million figure traceable to a published rate, and students in a cloud course who have drawn Step Functions diagrams but never watched a Catch fire. The question I hear most — what will this cost and how long will it take — is asked about a diagram, not a definition.

## 2. The problem, as a scenario

A team proposes an order pipeline: authorise, branch on customer tier, run business logic with retries, persist to DynamoDB, route failures to a dead-letter path. Someone asks for a cost per million and a latency estimate. The usual answer is a spreadsheet with a remembered Lambda rate applied to a guessed duration, no line for state transitions, and no account of what backoff does to the tail. The earlier version of this page reproduced that habit: flat lists of boxes, random sleeps, two hard-coded numbers billed against the whole pipeline, and a memory slider that made DynamoDB faster.

## 3. What it costs to leave it alone

The direct cost is a decision made on a number nobody can defend. Standard workflows bill per state transition, Express per request and duration; a retry policy multiplies invocations; a Map with a concurrency limit changes elapsed time in waves. None of that appears in a rate-times-duration estimate, so it is wrong by an amount that depends on the definition. The indirect cost is educational: a simulator that animates boxes teaches that orchestration is a sequence.

## 4. The approach, and the alternative I rejected

I rejected adding knobs to the box list; that keeps the model disconnected from the thing modelled. Instead the presets are Amazon States Language documents, and the page executes them. `src/asl.js` validates a definition — unknown types, missing Next, unreachable states, bad Choice targets — and runs Task, Choice, Wait, Parallel, Map with MaxConcurrency, Pass, Succeed, Fail, Retry with the interval-times-backoff rule, and Catch with ResultPath. The model supplying durations and errors is separate: a seeded Mulberry32 stream drives per-invocation cold-start and error draws. Prices are not typed into the code: `scripts/fetch-pricing.mjs` reads the AWS Price List Bulk API offer files for Lambda, Step Functions, SQS, SNS, API Gateway and DynamoDB and writes the first on-demand tier for us-east-1 into a dated data file, and the page prints that date beside the table.

## 5. What the code does today

Choose a preset — API request with retry and a dead-letter Catch, image pipeline with Parallel, nightly batch with Map at MaxConcurrency 2, approval with Wait and a timeout Choice, or an Express webhook buffer — or paste a definition and validate it. Set memory, cold-start rate, error rate, execution count and seed, and run. The pipeline animates the first executions from the engine's trace, marking each state done, caught or failed. The strip reports success rate, p50, p95, retries, mean cost and cost per million; a histogram shows durations and a bar chart the billing lines. The cost table itemises the last execution — Lambda requests and GB-seconds per attempt, DynamoDB units, queue and topic requests, transitions or Express duration — and switching the workflow type re-prices every run. A throttling panel computes Erlang-B blocking probability from arrivals per second, the measured median and reserved concurrency.

## 6. Evidence

Seventeen Vitest tests cover the validator's messages, exact traces and elapsed milliseconds for retry-then-catch (three attempts plus 1 s and 2 s of backoff), Parallel as the slowest branch, Map in waves, failure propagation from a branch and from an item, Choice rules, Wait, cost lines against hand arithmetic for Standard and Express, Erlang-B against the single-server closed form, and the generator's determinism. Coverage of the pure modules is 99.38 % of statements and 90.95 % of branches. In headless Chrome the API preset at seed 42 over 200 executions produced 100.0 % success, p50 250 ms, p95 1341 ms, 21 retries and a mean of $0.0001054 per execution, with zero console errors and no horizontal scroll at 1280 or 400 pixels. `AUDIT.md` records eleven findings against the earlier build and the fix for each.

## 7. What it would take to run this in production

As an estimator it is usable now: commit a definition, run it, read the lines. To make it a planning tool I would calibrate the model from CloudWatch — per-function duration percentiles and error rates from a metrics export — so assumptions become measurements, and refresh `data/pricing.json` on a schedule with a diff review, since the first tier is right for most workloads but not all. Intrinsic functions, distributed Map and Wait on a timestamp are not implemented.

## 8. Limits and next steps

Latencies and cold starts are stated assumptions from a fixed table, not measurements; the page says so. Only the first pricing tier and only us-east-1 are used. Choice supports the operators the presets need. Map models concurrency only in elapsed time. Next, in order: calibration from a metrics export, the remaining Choice operators and intrinsic functions, and a diff view showing how a change to a Retry policy moves the p95 and the cost per million.

## 9. Who should look at this

**Hiring manager:** evidence that I model cloud cost from published rates and language semantics rather than remembered numbers, and that I audit and replace my own earlier work.
**Consulting client:** a way to get a defensible per-million figure and a latency distribution for a workflow before it is built, from the definition you will deploy.
**Engineer:** read `src/asl.js` with `tests/asl.test.js` for the Retry and Catch semantics, and `executionCost()` in `src/model.js` for how each service is billed.
