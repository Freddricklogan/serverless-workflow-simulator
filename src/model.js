/**
 * The simulation model: per-service latency distributions, cold starts, error injection and a
 * cost model whose rates come from data/pricing.json (AWS Price List API). Latencies and cold
 * start figures are stated assumptions for teaching, not measurements — the page says so.
 */
import { serviceOf } from './asl.js';

/** Typical warm latency ranges in ms, and cold-start additions for Lambda. Assumptions, labelled on the page. */
export const LATENCY = {
  lambda: [20, 200],
  dynamodb: [4, 20],
  sqs: [5, 15],
  sns: [5, 20],
  s3: [10, 40],
  apigateway: [5, 15],
  events: [5, 10],
  eventbridge: [5, 10],
  aws: [50, 500],
  unknown: [20, 100]
};
export const COLD_START_MS = [150, 500];

export function makeModel({ uniform, memoryMb = 1024, coldStartRate = 0.15, errorRate = 0.05 }) {
  const range = ([lo, hi]) => lo + uniform() * (hi - lo);
  const coldPerExecution = new WeakMap();
  return {
    memoryMb,
    taskDurationMs(state, attempt, ctx) {
      const svc = serviceOf(state.Resource);
      let d = range(LATENCY[svc] ?? LATENCY.unknown);
      if (svc === 'lambda') {
        // Memory scales CPU: relative to 1,024 MB, floor at 0.3× so 128 MB is not absurd.
        d *= Math.max(0.3, 1024 / memoryMb) ** 0.5;
        const key = ctx.execution ?? ctx;
        const cold = coldPerExecution.get(key) ?? (uniform() < coldStartRate);
        coldPerExecution.set(key, false);
        if (cold && attempt === 1) d += range(COLD_START_MS);
      }
      return Math.round(d);
    },
    taskError(state, attempt) {
      if (serviceOf(state.Resource) !== 'lambda') return null;
      // Retries succeed more often: each attempt halves the error probability.
      return uniform() < errorRate / 2 ** (attempt - 1) ? 'Lambda.ServiceException' : null;
    }
  };
}

/** Cost of one execution from its trace and the pricing table. Standard workflows bill per transition; Express per request and duration. */
export function executionCost(result, { rates }, { workflowType = 'STANDARD', memoryMb = 1024 } = {}) {
  const lines = [];
  const walk = (trace) => {
    for (const t of trace) {
      if (t.type === 'Task') {
        const svc = t.service;
        const attempts = t.attempts;
        if (svc === 'lambda') {
          const gbSec = (memoryMb / 1024) * (t.durationMs / 1000);
          lines.push({ item: `Lambda requests × ${attempts}`, usd: rates.lambdaRequest.usd * attempts });
          lines.push({ item: `Lambda ${gbSec.toFixed(3)} GB-s`, usd: rates.lambdaGbSecond.usd * gbSec });
        } else if (svc === 'dynamodb') lines.push({ item: `DynamoDB request unit × ${attempts}`, usd: (t.resource.includes('putItem') || t.resource.includes('updateItem') ? rates.dynamoWriteUnit.usd : rates.dynamoReadUnit.usd) * attempts });
        else if (svc === 'sqs') lines.push({ item: `SQS request × ${attempts}`, usd: rates.sqsRequest.usd * attempts });
        else if (svc === 'sns') lines.push({ item: `SNS request × ${attempts}`, usd: rates.snsRequest.usd * attempts });
        else if (svc === 'apigateway') lines.push({ item: `API Gateway REST request × ${attempts}`, usd: rates.apiGatewayRestRequest.usd * attempts });
      }
      if (t.branches) for (const b of t.branches) walk(b.trace);
    }
  };
  walk(result.trace);
  if (workflowType === 'EXPRESS') {
    lines.push({ item: 'Express request', usd: rates.expressRequest.usd });
    lines.push({ item: `Express duration ${(result.elapsedMs / 1000).toFixed(2)} s at 64 MB`, usd: rates.expressGbSecond.usd * (64 / 1024) * (result.elapsedMs / 1000) });
  } else {
    lines.push({ item: `${result.transitions} state transitions`, usd: rates.stateTransition.usd * result.transitions });
  }
  return { lines, total: lines.reduce((s, l) => s + l.usd, 0) };
}

/** Annotates a trace with service and resource so the cost model does not need the definition. */
export function annotate(def, result) {
  const walk = (d, trace) => {
    for (const t of trace) {
      const s = d.States[t.name];
      if (s?.Type === 'Task') {
        t.resource = s.Resource;
        t.service = serviceOf(s.Resource);
      }
      if (t.branches) t.branches.forEach((b, i) => walk(s.Branches[i], b.trace));
    }
  };
  walk(def, result.trace);
  return result;
}

/** Throttling under a concurrency limit for Poisson-ish arrivals: Little's law occupancy and the fraction of arrivals that find no slot (Erlang-B). */
export function throttling(arrivalsPerSecond, meanDurationMs, concurrencyLimit) {
  const offered = arrivalsPerSecond * (meanDurationMs / 1000); // Erlangs
  // Erlang-B recursion.
  let b = 1;
  for (let k = 1; k <= concurrencyLimit; k += 1) b = (offered * b) / (k + offered * b);
  return { offeredLoad: offered, blockingProbability: b, occupancy: offered * (1 - b) };
}

export function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return NaN;
  const h = (sortedValues.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sortedValues[lo] + (h - lo) * (sortedValues[hi] - sortedValues[lo]);
}
