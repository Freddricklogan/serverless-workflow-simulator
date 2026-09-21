import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chooseNext, errorMatches, evaluateRule, execute, linearOrder, resolvePath, serviceOf, validate } from '../src/asl.js';

const wf = JSON.parse(readFileSync(new URL('../data/workflows.json', import.meta.url), 'utf8')).workflows;
const fixed = { taskDurationMs: () => 100, taskError: () => null };

describe('validate', () => {
  it('accepts every shipped workflow', () => {
    for (const [k, w] of Object.entries(wf)) expect(validate(w.definition), k).toEqual([]);
  });
  it('names each problem', () => {
    expect(validate(null)).toEqual(['definition must be an object']);
    expect(validate({ States: {} })).toEqual(['StartAt is required', 'States must be a non-empty object']);
    const p = validate({ StartAt: 'A', States: { A: { Type: 'Task' }, B: { Type: 'Bogus', Next: 'Z' }, C: { Type: 'Choice', Choices: [{ Next: 'Q' }] }, W: { Type: 'Wait', Next: 'A' } } });
    expect(p).toEqual(expect.arrayContaining(['state "A": needs Next or End', 'state "A": Task needs a Resource', 'state "B": unknown Type "Bogus"', 'state "B": Next "Z" is not a state', 'state "B": unreachable', 'state "C": choice Next "Q" is not a state', 'state "W": Wait needs Seconds, SecondsPath or Timestamp']));
    expect(validate({ StartAt: 'X', States: { A: { Type: 'Succeed' } } })).toContain('StartAt "X" is not a state');
    expect(validate({ StartAt: 'P', States: { P: { Type: 'Parallel', Branches: [{ StartAt: 'Q', States: { Q: { Type: 'Task' } } }], End: true } } })).toContain('P/Branches[0]/state "Q": needs Next or End');
  });
});

describe('helpers', () => {
  it('serviceOf, linearOrder, resolvePath, rules', () => {
    expect(serviceOf('arn:aws:states:::lambda:invoke')).toBe('lambda');
    expect(serviceOf('arn:aws:states:::dynamodb:putItem')).toBe('dynamodb');
    expect(serviceOf('arn:aws:lambda:us-east-1:123:function:f')).toBe('lambda');
    expect(serviceOf('x')).toBe('unknown');
    expect(linearOrder(wf.api.definition)).toEqual(['Authorise', 'Tier?', 'PriorityLogic', 'Persist', 'RecordFailure', 'Failed', 'StandardLogic']);
    expect(resolvePath({ a: { b: 3 } }, '$.a.b')).toBe(3);
    expect(resolvePath({ a: 1 }, '$.a.b')).toBeUndefined();
    expect(resolvePath({ a: 1 }, '$')).toEqual({ a: 1 });
    expect(evaluateRule({ Variable: '$.n', NumericGreaterThan: 5 }, { n: 6 })).toBe(true);
    expect(evaluateRule({ And: [{ Variable: '$.n', NumericGreaterThan: 5 }, { Variable: '$.s', StringEquals: 'x' }] }, { n: 6, s: 'y' })).toBe(false);
    expect(evaluateRule({ Not: { Variable: '$.k', IsPresent: true } }, {})).toBe(true);
    expect(() => evaluateRule({ Variable: '$.x', TimestampEquals: 'now' }, {})).toThrow(/unsupported/);
    expect(chooseNext({ Choices: [{ Variable: '$.t', StringEquals: 'gold', Next: 'G' }], Default: 'D' }, { t: 'silver' })).toBe('D');
    expect(() => chooseNext({ Choices: [{ Variable: '$.t', StringEquals: 'gold', Next: 'G' }] }, { t: 'silver' })).toThrow(/NoChoiceMatched/);
    expect(errorMatches(['States.ALL'], 'Anything')).toBe(true);
    expect(errorMatches(['States.TaskFailed'], 'Lambda.ServiceException')).toBe(true);
    expect(errorMatches(['States.TaskFailed'], 'States.Timeout')).toBe(false);
    expect(errorMatches(['X'], 'Y')).toBe(false);
  });
});

describe('execute', () => {
  it('walks the api workflow through the gold branch with fixed durations', () => {
    const r = execute(wf.api.definition, wf.api.input, fixed);
    expect(r.status).toBe('SUCCEEDED');
    expect(r.trace.map((t) => t.name)).toEqual(['Authorise', 'Tier?', 'PriorityLogic', 'Persist']);
    expect(r.transitions).toBe(4);
    expect(r.elapsedMs).toBe(300);
    expect(execute(wf.api.definition, { tier: 'silver' }, fixed).trace.map((t) => t.name)).toContain('StandardLogic');
  });
  it('retries with backoff, then catches into the failure path', () => {
    const flaky = { taskDurationMs: () => 10, taskError: (s) => (s.Parameters?.FunctionName === 'logic-priority' ? 'Lambda.ServiceException' : null) };
    const r = execute(wf.api.definition, wf.api.input, flaky);
    const logic = r.trace.find((t) => t.name === 'PriorityLogic');
    expect(logic.attempts).toBe(3); // MaxAttempts 2 → three tries
    expect(logic.retries).toBe(2);
    expect(logic.caught).toBe(true);
    expect(r.trace.map((t) => t.name)).toEqual(['Authorise', 'Tier?', 'PriorityLogic', 'RecordFailure', 'Failed']);
    expect(r.status).toBe('FAILED');
    expect(r.error).toBe('BusinessLogicFailed');
    // Retry intervals: IntervalSeconds default 1 with BackoffRate default 2 → 1 s + 2 s.
    expect(r.elapsedMs).toBe(3 * 10 + 3000 + 10 + 10);
  });
  it('fails outright when an error has no matching retry or catch', () => {
    const r = execute(wf.batch.definition, wf.batch.input, { taskDurationMs: () => 5, taskError: (s) => (s.Parameters?.FunctionName === 'fetch-batch' ? 'Boom' : null) });
    expect(r.status).toBe('FAILED');
    expect(r.error).toBe('Boom');
    expect(r.trace).toHaveLength(1);
  });
  it('a failing branch fails the Parallel and a failing item fails the Map, with the error propagated', () => {
    const par = execute(wf.image.definition, wf.image.input, { taskDurationMs: () => 5, taskError: (s) => (s.Parameters?.FunctionName === 'resize' ? 'ResizeCrash' : null) });
    expect(par.status).toBe('FAILED');
    expect(par.error).toBe('ResizeCrash');
    expect(par.trace.at(-1).type).toBe('Parallel');
    const map = execute(wf.batch.definition, wf.batch.input, { taskDurationMs: () => 5, taskError: (s) => (s.Parameters?.FunctionName === 'worker' ? 'BadRecord' : null) });
    expect(map.status).toBe('FAILED');
    expect(map.error).toBe('BadRecord');
    expect(map.trace.at(-1).type).toBe('Map');
  });
  it('Parallel takes the slowest branch; Map respects MaxConcurrency', () => {
    const model = { taskDurationMs: (s) => (s.Parameters?.FunctionName === 'resize' ? 400 : 100), taskError: () => null };
    const img = execute(wf.image.definition, wf.image.input, model);
    expect(img.status).toBe('SUCCEEDED');
    expect(img.trace[0].durationMs).toBe(400);
    expect(img.transitions).toBe(3 + 2);
    const batch = execute(wf.batch.definition, wf.batch.input, fixed);
    const map = batch.trace.find((t) => t.name === 'EachRecord');
    expect(map.items).toBe(6);
    expect(map.durationMs).toBe(300); // 6 items, concurrency 2 → 3 waves of 100 ms
    expect(batch.transitions).toBe(3 + 6);
    expect(batch.output).toEqual(wf.batch.input.records);
  });
  it('Choice, Pass, Wait, Succeed and Fail', () => {
    const small = execute(wf.approval.definition, { amount: 500 }, fixed);
    expect(small.trace.map((t) => t.name)).toEqual(['Amount?', 'AutoApprove', 'Record', 'Done']);
    expect(small.status).toBe('SUCCEEDED');
    const big = execute(wf.approval.definition, wf.approval.input, fixed);
    expect(big.trace.map((t) => t.name)).toEqual(['Amount?', 'RequestApproval', 'WaitForDecision', 'Decide', 'Record', 'Done']);
    expect(big.trace.find((t) => t.name === 'WaitForDecision').durationMs).toBe(30000);
    const rejected = execute(wf.approval.definition, wf.approval.input, { taskDurationMs: () => 1, taskError: (s) => (s.Parameters?.FunctionName === 'check-decision' ? 'Denied' : null) });
    expect(rejected.status).toBe('FAILED');
    expect(rejected.error).toBe('NotApproved');
  });
  it('stops runaway loops', () => {
    const loop = { StartAt: 'A', States: { A: { Type: 'Pass', Next: 'B' }, B: { Type: 'Pass', Next: 'A' } } };
    expect(() => execute(loop, {}, fixed)).toThrow(/1000 states/);
  });
});
