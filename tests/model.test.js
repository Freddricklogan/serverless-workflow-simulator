import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { execute } from '../src/asl.js';
import { annotate, COLD_START_MS, executionCost, LATENCY, makeModel, percentile, throttling } from '../src/model.js';
import { mulberry32 } from '../src/rng.js';

const wf = JSON.parse(readFileSync(new URL('../data/workflows.json', import.meta.url), 'utf8')).workflows;
const pricing = JSON.parse(readFileSync(new URL('../data/pricing.json', import.meta.url), 'utf8'));

describe('pricing data', () => {
  it('carries a fetch date and positive rates for every line the model uses', () => {
    expect(pricing.fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const k of ['lambdaRequest', 'lambdaGbSecond', 'stateTransition', 'expressRequest', 'expressGbSecond', 'sqsRequest', 'snsRequest', 'apiGatewayRestRequest', 'dynamoWriteUnit', 'dynamoReadUnit']) expect(pricing.rates[k].usd, k).toBeGreaterThan(0);
    expect(pricing.rates.lambdaGbSecond.usd).toBeCloseTo(0.0000166667, 10);
    expect(pricing.rates.stateTransition.usd).toBe(0.000025);
  });
});

describe('makeModel', () => {
  it('is deterministic per seed, memory-scaled, and injects cold starts and errors at the configured rates', () => {
    const a = makeModel({ uniform: mulberry32(1), memoryMb: 1024, coldStartRate: 0, errorRate: 0 });
    const b = makeModel({ uniform: mulberry32(1), memoryMb: 1024, coldStartRate: 0, errorRate: 0 });
    const r1 = execute(wf.api.definition, wf.api.input, a);
    const r2 = execute(wf.api.definition, wf.api.input, b);
    expect(r1.elapsedMs).toBe(r2.elapsedMs);
    const task = { Type: 'Task', Resource: 'arn:aws:states:::lambda:invoke' };
    const big = makeModel({ uniform: () => 0.5, memoryMb: 2048, coldStartRate: 0, errorRate: 0 });
    const small = makeModel({ uniform: () => 0.5, memoryMb: 256, coldStartRate: 0, errorRate: 0 });
    expect(big.taskDurationMs(task, 1, {})).toBeLessThan(small.taskDurationMs(task, 1, {}));
    const cold = makeModel({ uniform: () => 0.5, memoryMb: 1024, coldStartRate: 1, errorRate: 0 });
    const warmed = makeModel({ uniform: () => 0.5, memoryMb: 1024, coldStartRate: 0, errorRate: 0 });
    const ctx = {};
    expect(cold.taskDurationMs(task, 1, ctx) - warmed.taskDurationMs(task, 1, {})).toBeCloseTo((COLD_START_MS[0] + COLD_START_MS[1]) / 2, -1);
    expect(cold.taskDurationMs(task, 1, ctx)).toBe(warmed.taskDurationMs(task, 1, {})); // second task in the same execution is warm
    const errs = makeModel({ uniform: mulberry32(3), coldStartRate: 0, errorRate: 0.5 });
    let n = 0;
    for (let i = 0; i < 2000; i += 1) if (errs.taskError(task, 1)) n += 1;
    expect(n / 2000).toBeCloseTo(0.5, 1);
    expect(errs.taskError({ Type: 'Task', Resource: 'arn:aws:states:::sqs:sendMessage' }, 1)).toBeNull();
    expect(Object.keys(LATENCY)).toContain('dynamodb');
  });
});

describe('executionCost', () => {
  it('prices the api workflow line by line from the price list', () => {
    const r = annotate(wf.api.definition, execute(wf.api.definition, wf.api.input, { taskDurationMs: () => 100, taskError: () => null }));
    const c = executionCost(r, pricing, { workflowType: 'STANDARD', memoryMb: 1024 });
    const R = pricing.rates;
    // Two Lambda tasks at 100 ms / 1 GB, one DynamoDB put, four transitions.
    const expected = 2 * R.lambdaRequest.usd + 2 * R.lambdaGbSecond.usd * 0.1 + R.dynamoWriteUnit.usd + 4 * R.stateTransition.usd;
    expect(c.total).toBeCloseTo(expected, 12);
    expect(c.lines.some((l) => l.item.includes('4 state transitions'))).toBe(true);
    const express = executionCost(r, pricing, { workflowType: 'EXPRESS', memoryMb: 1024 });
    expect(express.lines.some((l) => l.item === 'Express request')).toBe(true);
    expect(express.total).toBeLessThan(c.total);
  });
  it('counts retried attempts and branches', () => {
    const flaky = { taskDurationMs: () => 100, taskError: (s) => (s.Parameters?.FunctionName === 'logic-priority' ? 'Lambda.ServiceException' : null) };
    const r = annotate(wf.api.definition, execute(wf.api.definition, wf.api.input, flaky));
    const c = executionCost(r, pricing);
    expect(c.lines.find((l) => l.item === 'Lambda requests × 3')).toBeDefined();
    expect(c.lines.some((l) => l.item.startsWith('SQS request'))).toBe(true);
    const img = annotate(wf.image.definition, execute(wf.image.definition, wf.image.input, { taskDurationMs: () => 100, taskError: () => null }));
    expect(executionCost(img, pricing).lines.filter((l) => l.item.startsWith('Lambda requests'))).toHaveLength(1);
  });
});

describe('throttling and percentiles', () => {
  it('Erlang-B: zero blocking at zero load, rises with offered load, bounded by 1', () => {
    expect(throttling(0, 100, 10).blockingProbability).toBe(0);
    const low = throttling(10, 100, 10); // 1 Erlang on 10 servers
    const high = throttling(200, 100, 10); // 20 Erlangs on 10 servers
    expect(low.blockingProbability).toBeLessThan(0.001);
    expect(high.blockingProbability).toBeGreaterThan(0.5);
    expect(high.blockingProbability).toBeLessThan(1);
    expect(high.occupancy).toBeLessThanOrEqual(10);
    // Known value: A = 1 Erlang, N = 1 server → B = 1/2.
    expect(throttling(10, 100, 1).blockingProbability).toBeCloseTo(0.5, 12);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([], 0.5)).toBeNaN();
  });
});
