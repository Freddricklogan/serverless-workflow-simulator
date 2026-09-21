/**
 * Amazon States Language: validation, a linear rendering order, and a seeded simulator that
 * walks the machine with Retry/Catch semantics. Supports Task, Pass, Choice, Wait, Parallel,
 * Map, Succeed and Fail states — the subset a workflow author meets first.
 */

export const STATE_TYPES = ['Task', 'Pass', 'Choice', 'Wait', 'Parallel', 'Map', 'Succeed', 'Fail'];

/** Validates a state machine definition; returns a list of problems (empty when valid). */
export function validate(def, path = '') {
  const problems = [];
  const at = (s) => `${path}${s}`;
  if (!def || typeof def !== 'object') return [at('definition must be an object')];
  if (typeof def.StartAt !== 'string') problems.push(at('StartAt is required'));
  if (!def.States || typeof def.States !== 'object' || Object.keys(def.States).length === 0) return [...problems, at('States must be a non-empty object')];
  const names = Object.keys(def.States);
  if (def.StartAt && !names.includes(def.StartAt)) problems.push(at(`StartAt "${def.StartAt}" is not a state`));
  const reachable = new Set();
  const visit = (name) => {
    if (reachable.has(name) || !def.States[name]) return;
    reachable.add(name);
    const s = def.States[name];
    if (s.Next) visit(s.Next);
    if (s.Default) visit(s.Default);
    for (const c of s.Choices ?? []) if (c.Next) visit(c.Next);
    for (const c of s.Catch ?? []) if (c.Next) visit(c.Next);
  };
  if (def.StartAt) visit(def.StartAt);
  for (const [name, s] of Object.entries(def.States)) {
    const p = (m) => problems.push(at(`state "${name}": ${m}`));
    if (!STATE_TYPES.includes(s.Type)) p(`unknown Type "${s.Type}"`);
    const terminal = s.Type === 'Succeed' || s.Type === 'Fail';
    if (!terminal && s.Type !== 'Choice' && !s.Next && !s.End) p('needs Next or End');
    if (s.Next && !names.includes(s.Next)) p(`Next "${s.Next}" is not a state`);
    if (s.Type === 'Task' && typeof s.Resource !== 'string') p('Task needs a Resource');
    if (s.Type === 'Choice') {
      if (!Array.isArray(s.Choices) || s.Choices.length === 0) p('Choice needs Choices');
      for (const c of s.Choices ?? []) if (!c.Next || !names.includes(c.Next)) p(`choice Next "${c.Next}" is not a state`);
      if (s.Default && !names.includes(s.Default)) p(`Default "${s.Default}" is not a state`);
    }
    if (s.Type === 'Wait' && !(s.Seconds >= 0) && !s.SecondsPath && !s.Timestamp) p('Wait needs Seconds, SecondsPath or Timestamp');
    if (s.Type === 'Parallel') (s.Branches ?? []).forEach((b, i) => problems.push(...validate(b, `${path}${name}/Branches[${i}]/`)));
    if (s.Type === 'Map' && (s.Iterator || s.ItemProcessor)) problems.push(...validate(s.Iterator ?? s.ItemProcessor, `${path}${name}/ItemProcessor/`));
    for (const c of s.Catch ?? []) if (!c.Next || !names.includes(c.Next)) p(`catch Next "${c.Next}" is not a state`);
    if (!reachable.has(name)) p('unreachable');
  }
  return problems;
}

/** Service inferred from a Task Resource ARN, for durations and pricing. */
export function serviceOf(resource) {
  const r = String(resource);
  const m = r.match(/^arn:aws:states:::([a-z0-9-]+):/);
  if (m) return m[1];
  if (r.startsWith('arn:aws:lambda:')) return 'lambda';
  return 'unknown';
}

/** Deterministic linear order for rendering: StartAt first, then a depth-first walk of Next/Choices/Catch. */
export function linearOrder(def) {
  const order = [];
  const seen = new Set();
  const visit = (name) => {
    if (!name || seen.has(name) || !def.States[name]) return;
    seen.add(name);
    order.push(name);
    const s = def.States[name];
    if (s.Next) visit(s.Next);
    for (const c of s.Choices ?? []) visit(c.Next);
    if (s.Default) visit(s.Default);
    for (const c of s.Catch ?? []) visit(c.Next);
  };
  visit(def.StartAt);
  for (const name of Object.keys(def.States)) visit(name);
  return order;
}

const OPS = {
  StringEquals: (a, b) => a === b,
  StringLessThan: (a, b) => a < b,
  StringGreaterThan: (a, b) => a > b,
  NumericEquals: (a, b) => Number(a) === b,
  NumericLessThan: (a, b) => Number(a) < b,
  NumericGreaterThan: (a, b) => Number(a) > b,
  NumericLessThanEquals: (a, b) => Number(a) <= b,
  NumericGreaterThanEquals: (a, b) => Number(a) >= b,
  BooleanEquals: (a, b) => a === b,
  IsPresent: (a, b) => (a !== undefined) === b
};

/** Resolves a JSONPath-lite Variable ("$.a.b") against the input. */
export function resolvePath(input, variable) {
  if (variable === '$') return input;
  const parts = String(variable).replace(/^\$\.?/, '').split('.').filter(Boolean);
  let cur = input;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Evaluates one choice rule (with And/Or/Not) against the input. */
export function evaluateRule(rule, input) {
  if (rule.And) return rule.And.every((r) => evaluateRule(r, input));
  if (rule.Or) return rule.Or.some((r) => evaluateRule(r, input));
  if (rule.Not) return !evaluateRule(rule.Not, input);
  for (const [op, fn] of Object.entries(OPS)) if (op in rule) return fn(resolvePath(input, rule.Variable), rule[op]);
  throw new Error(`unsupported choice operator in rule for ${rule.Variable}`);
}

export function chooseNext(state, input) {
  for (const rule of state.Choices) if (evaluateRule(rule, input)) return rule.Next;
  if (state.Default) return state.Default;
  throw new Error('States.NoChoiceMatched');
}

/** Whether an error name matches a Retry/Catch ErrorEquals list. */
export function errorMatches(errorEquals, errorName) {
  return errorEquals.some((e) => e === 'States.ALL' || e === errorName || (e === 'States.TaskFailed' && !errorName.startsWith('States.')));
}

/**
 * Runs one execution. `model.taskDurationMs(state, attempt)` returns a duration and
 * `model.taskError(state, attempt)` returns an error name or null — both injected so the
 * engine stays pure and the tests can script failures.
 */
export function execute(def, input, model, ctx = { depth: 0 }) {
  const trace = [];
  let transitions = 0;
  let elapsed = 0;
  let current = def.StartAt;
  let data = input;
  const MAX = 1000;
  while (current) {
    if (trace.length > MAX) throw new Error('execution exceeded 1000 states (loop?)');
    const state = def.States[current];
    transitions += 1;
    const entry = { name: current, type: state.Type, attempts: 1, durationMs: 0, error: null, retries: 0, caught: false };
    let next = state.Next ?? null;
    if (state.Type === 'Task') {
      let attempt = 0;
      for (;;) {
        attempt += 1;
        entry.attempts = attempt;
        const d = model.taskDurationMs(state, attempt, ctx);
        entry.durationMs += d;
        elapsed += d;
        const err = model.taskError(state, attempt, ctx);
        if (!err) {
          entry.error = null;
          break;
        }
        entry.error = err;
        const retry = (state.Retry ?? []).find((r) => errorMatches(r.ErrorEquals, err));
        if (retry && attempt - 1 < (retry.MaxAttempts ?? 3)) {
          const interval = (retry.IntervalSeconds ?? 1) * (retry.BackoffRate ?? 2) ** (attempt - 1);
          elapsed += interval * 1000;
          entry.retries += 1;
          continue;
        }
        const c = (state.Catch ?? []).find((k) => errorMatches(k.ErrorEquals, err));
        if (c) {
          entry.caught = true;
          next = c.Next;
          break;
        }
        trace.push(entry);
        return { status: 'FAILED', error: err, trace, transitions, elapsedMs: elapsed, output: data };
      }
    } else if (state.Type === 'Wait') {
      const secs = state.Seconds ?? resolvePath(data, state.SecondsPath) ?? 0;
      entry.durationMs = secs * 1000;
      elapsed += entry.durationMs;
    } else if (state.Type === 'Choice') {
      next = chooseNext(state, data);
    } else if (state.Type === 'Pass') {
      if (state.Result !== undefined) data = state.Result;
    } else if (state.Type === 'Parallel') {
      const branches = state.Branches.map((b) => execute(b, data, model, { depth: ctx.depth + 1 }));
      transitions += branches.reduce((n, b) => n + b.transitions, 0);
      entry.durationMs = Math.max(...branches.map((b) => b.elapsedMs));
      elapsed += entry.durationMs;
      entry.branches = branches;
      const failed = branches.find((b) => b.status === 'FAILED');
      if (failed) {
        trace.push(entry);
        return { status: 'FAILED', error: failed.error, trace, transitions, elapsedMs: elapsed, output: data };
      }
      data = branches.map((b) => b.output);
    } else if (state.Type === 'Map') {
      const items = state.ItemsPath ? resolvePath(data, state.ItemsPath) ?? [] : Array.isArray(data) ? data : [];
      const proc = state.Iterator ?? state.ItemProcessor;
      const conc = state.MaxConcurrency || items.length || 1;
      const runs = items.map((item) => execute(proc, item, model, { depth: ctx.depth + 1 }));
      transitions += runs.reduce((n, r) => n + r.transitions, 0);
      // Duration under a concurrency limit: waves of `conc` items, each wave as long as its slowest item.
      let dur = 0;
      for (let i = 0; i < runs.length; i += conc) dur += Math.max(0, ...runs.slice(i, i + conc).map((r) => r.elapsedMs));
      entry.durationMs = dur;
      entry.items = runs.length;
      elapsed += dur;
      const failed = runs.find((r) => r.status === 'FAILED');
      if (failed) {
        trace.push(entry);
        return { status: 'FAILED', error: failed.error, trace, transitions, elapsedMs: elapsed, output: data };
      }
      data = runs.map((r) => r.output);
    } else if (state.Type === 'Succeed') {
      trace.push(entry);
      return { status: 'SUCCEEDED', error: null, trace, transitions, elapsedMs: elapsed, output: data };
    } else if (state.Type === 'Fail') {
      trace.push(entry);
      return { status: 'FAILED', error: state.Error ?? 'States.Fail', trace, transitions, elapsedMs: elapsed, output: data };
    }
    trace.push(entry);
    if (state.End) return { status: 'SUCCEEDED', error: null, trace, transitions, elapsedMs: elapsed, output: data };
    current = next;
  }
  return { status: 'SUCCEEDED', error: null, trace, transitions, elapsedMs: elapsed, output: data };
}
