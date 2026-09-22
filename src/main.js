/** Wires the ASL engine, the model and the cost table to the page and the Executive Shell. */
import { execute, linearOrder, serviceOf, validate } from './asl.js';
import { loadChartLib, makeCharts } from './charts.js';
import { mountExecShell } from './exec-shell.js';
import { annotate, executionCost, makeModel, percentile, throttling } from './model.js';
import { mulberry32 } from './rng.js';
import { $, el, setText } from './ui.js';

const state = { workflows: null, pricing: null, key: 'api', def: null, input: null, runs: [], running: false, source: 'preset' };
let charts = makeCharts(null);
let shell;
const usd = (v) => (v < 0.01 ? `$${v.toFixed(7)}` : `$${v.toFixed(4)}`);

function settings() {
  return { memoryMb: parseInt($('cfg-memory').value, 10), coldStartRate: parseInt($('cold-rate').value, 10) / 100, errorRate: parseInt($('error-rate').value, 10) / 100, executions: parseInt($('executions').value, 10), seed: parseInt($('seed').value, 10), workflowType: $('workflow-type').value };
}

function loadDefinition(def, input, label) {
  const problems = validate(def);
  if (problems.length) {
    setText('asl-problems', problems.join(' · '));
    return false;
  }
  setText('asl-problems', '');
  state.def = def;
  state.input = input;
  state.runs = [];
  $('asl-editor').value = JSON.stringify(def, null, 2);
  $('input-editor').value = JSON.stringify(input, null, 2);
  setText('wf-label', `${label} · ${Object.keys(def.States).length} states · ${def.Comment ?? ''}`);
  renderPipeline();
  renderResults();
  return true;
}

function renderPipeline() {
  const el2 = $('pipeline');
  el2.replaceChildren();
  for (const name of linearOrder(state.def)) {
    const s = state.def.States[name];
    const node = el('div', { class: `wf-node type-${s.Type.toLowerCase()}`, 'data-state': name });
    node.append(el('span', { class: 'wf-type', text: s.Type + (s.Type === 'Task' ? ` · ${serviceOf(s.Resource)}` : '') }), el('span', { class: 'wf-name', text: name }), el('span', { class: 'wf-timing', text: '—' }));
    el2.append(node);
  }
}

async function runAll() {
  if (state.running || !state.def) return;
  state.running = true;
  $('run-btn').disabled = true;
  const cfg = settings();
  const uniform = mulberry32(cfg.seed);
  const model = makeModel({ uniform, memoryMb: cfg.memoryMb, coldStartRate: cfg.coldStartRate, errorRate: cfg.errorRate });
  state.runs = [];
  const animate = $('animate').checked;
  for (let i = 0; i < cfg.executions; i += 1) {
    const result = annotate(state.def, execute(state.def, state.input, model, { depth: 0, execution: {} }));
    result.cost = executionCost(result, state.pricing, { workflowType: cfg.workflowType, memoryMb: cfg.memoryMb });
    state.runs.push(result);
    if (animate && i < 12) await animateTrace(result);
    if (i % 10 === 0 || (animate && i < 12)) renderResults();
  }
  renderResults();
  state.running = false;
  $('run-btn').disabled = false;
}

async function animateTrace(result) {
  for (const n of document.querySelectorAll('.wf-node')) n.classList.remove('is-active', 'is-done', 'is-failed', 'is-caught');
  for (const t of result.trace) {
    const node = document.querySelector(`.wf-node[data-state="${CSS.escape(t.name)}"]`);
    if (!node) continue;
    node.classList.add('is-active');
    node.querySelector('.wf-timing').textContent = t.durationMs ? `${t.durationMs} ms${t.attempts > 1 ? ` · ${t.attempts} attempts` : ''}` : '—';
    await new Promise((r) => setTimeout(r, 90));
    node.classList.remove('is-active');
    node.classList.add(t.error && !t.caught ? 'is-failed' : t.caught ? 'is-caught' : 'is-done');
  }
}

function renderResults() {
  const runs = state.runs;
  const n = runs.length;
  const cfg = settings();
  for (const r of runs) r.cost = executionCost(r, state.pricing, { workflowType: cfg.workflowType, memoryMb: cfg.memoryMb });
  const ok = runs.filter((r) => r.status === 'SUCCEEDED').length;
  const durations = runs.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const costs = runs.map((r) => r.cost.total);
  const retries = runs.reduce((s, r) => s + r.trace.reduce((x, t) => x + (t.retries ?? 0), 0), 0);
  setText('s-runs', n);
  setText('s-success', n ? `${((ok / n) * 100).toFixed(1)}%` : '—');
  setText('s-p50', n ? `${percentile(durations, 0.5).toFixed(0)} ms` : '—');
  setText('s-p95', n ? `${percentile(durations, 0.95).toFixed(0)} ms` : '—');
  setText('s-cost', n ? usd(costs.reduce((a, b) => a + b, 0) / n) : '—');
  setText('s-retries', retries);
  setText('s-million', n ? `$${((costs.reduce((a, b) => a + b, 0) / n) * 1e6).toFixed(2)}` : '—');
  if (n) {
    const bins = 20;
    const lo = durations[0];
    const hi = durations[n - 1];
    const width = (hi - lo) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (const d of durations) counts[Math.min(bins - 1, Math.floor((d - lo) / width))] += 1;
    charts.histogram($('durationChart'), { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * width), counts }, 'Execution duration (ms)');
    const byItem = new Map();
    for (const r of runs) for (const l of r.cost.lines) byItem.set(l.item.replace(/ ×.*| \d.*GB-s| \d+ state/, ''), (byItem.get(l.item.replace(/ ×.*| \d.*GB-s| \d+ state/, '')) ?? 0) + l.usd / n);
    const items = [...byItem.entries()].sort((a, b) => b[1] - a[1]);
    charts.bars($('costChart'), items.map((i) => i[0]), items.map((i) => i[1] * 1e6), 'USD per million executions');
  }
  const tbody = $('cost-tbody');
  tbody.replaceChildren();
  const last = runs[n - 1];
  if (last) {
    for (const l of last.cost.lines) {
      const tr = el('tr');
      tr.append(el('td', { text: l.item }), el('td', { text: usd(l.usd) }));
      tbody.append(tr);
    }
    const tr = el('tr', { class: 'total' });
    tr.append(el('td', { text: `Total (last execution, ${last.status.toLowerCase()})` }), el('td', { text: usd(last.cost.total) }));
    tbody.append(tr);
  }
  const log = $('log');
  log.replaceChildren();
  for (const r of runs.slice(-8).reverse()) {
    const li = el('li', { class: r.status === 'SUCCEEDED' ? 'ok' : 'fail' });
    li.textContent = `${r.status} · ${r.elapsedMs.toLocaleString()} ms · ${r.transitions} transitions · ${usd(r.cost.total)}${r.error ? ` · ${r.error}` : ''} · ${r.trace.map((t) => t.name + (t.attempts > 1 ? `×${t.attempts}` : '')).join(' → ')}`;
    log.append(li);
  }
  const thr = throttling(parseFloat($('arrival').value), n ? percentile(durations, 0.5) : 200, parseInt($('concurrency').value, 10));
  setText('throttle-out', `Offered load ${thr.offeredLoad.toFixed(2)} Erlangs · ${(thr.blockingProbability * 100).toFixed(2)}% of arrivals throttled · mean occupancy ${thr.occupancy.toFixed(2)} of ${$('concurrency').value} slots (Erlang-B on the median duration${n ? '' : ', 200 ms assumed until you run'})`);
  setText('pricing-note', `Rates: ${state.pricing.source}, fetched ${state.pricing.fetched} by scripts/fetch-pricing.mjs. Workflow type ${cfg.workflowType}; Lambda at ${cfg.memoryMb} MB. Latencies and cold starts are stated assumptions, not measurements.`);
  shell?.refreshKpis();
}

function applyEditor() {
  try {
    const def = JSON.parse($('asl-editor').value);
    const input = JSON.parse($('input-editor').value || '{}');
    state.source = 'editor';
    if (loadDefinition(def, input, 'Pasted definition')) setText('asl-problems', 'Definition valid.');
  } catch (err) {
    setText('asl-problems', `Not valid JSON: ${err.message}`);
  }
}

async function boot() {
  const Chart = await loadChartLib();
  charts = makeCharts(Chart);
  if (!Chart) $('chart-notice').hidden = false;
  [state.workflows, state.pricing] = await Promise.all([fetch('data/workflows.json').then((r) => r.json()), fetch('data/pricing.json').then((r) => r.json())]);
  const sel = $('preset');
  for (const [k, w] of Object.entries(state.workflows.workflows)) sel.append(el('option', { value: k, text: w.label }));
  const loadPreset = (k) => {
    state.key = k;
    state.source = 'preset';
    const w = state.workflows.workflows[k];
    if (k === 'webhook') $('workflow-type').value = 'EXPRESS';
    loadDefinition(w.definition, w.input, w.label);
  };
  sel.addEventListener('change', () => loadPreset(sel.value));
  $('run-btn').addEventListener('click', runAll);
  $('apply-asl').addEventListener('click', applyEditor);
  for (const id of ['arrival', 'concurrency', 'workflow-type', 'cfg-memory']) $(id).addEventListener('change', renderResults);
  loadPreset('api');

  shell = mountExecShell({
  theme: 'graphite',
    title: 'Serverless Workflow Simulator',
    tagline: 'Amazon States Language executed by a tested engine — Task, Choice, Wait, Parallel, Map, Retry and Catch — with seeded latency and failure injection, an Erlang-B throttling estimate, and a per-execution cost built from the AWS Price List API. Paste your own state machine.',
    repo: 'https://github.com/Freddricklogan/serverless-workflow-simulator',
    pagesUrl: 'https://freddricklogan.github.io/serverless-workflow-simulator/',
    badges: [{ label: 'ASL engine', tone: 'accent' }, { label: 'Price List API rates', dot: true }, { label: 'Seeded', dot: true }],
    kpis: [
      { label: 'Executions', compute: () => state.runs.length, tone: 'accent' },
      { label: 'Success rate', compute: () => $('s-success').textContent, tone: 'ok' },
      { label: 'p95 duration', compute: () => $('s-p95').textContent },
      { label: 'Cost per million', compute: () => $('s-million').textContent, tone: 'warn' },
      { label: 'Retries', compute: () => $('s-retries').textContent, tone: 'muted' }
    ],
    tour: [
      { selector: '#pipeline', title: 'A real state machine, not a list of boxes', body: 'The pipeline is rendered from Amazon States Language: the API workflow has a Choice on tier, Retry with backoff on the Lambda calls and a Catch into a dead-letter path. Run it.', action: async () => { $('preset').value = 'api'; loadPresetByValue(); $('animate').checked = true; await runAll(); } },
      { selector: '#cost-table', title: 'Cost from the price list', body: 'Every line comes from the AWS Price List API — Lambda requests and GB-seconds, DynamoDB request units, state transitions — with the fetch date shown. Switch to Express and the transition line becomes a request-and-duration line.', action: () => { $('workflow-type').value = 'EXPRESS'; renderResults(); } },
      { selector: '#throttle-out', title: 'Throttling by arithmetic', body: 'Erlang-B on the median duration: offered load versus concurrency slots gives the fraction of arrivals that would be throttled. Raise the arrival rate and watch it.', action: () => { $('arrival').value = '150'; renderResults(); } },
      { selector: '#tab-editor', title: 'Paste your own definition', body: 'The validator names every problem — unknown types, missing Next, unreachable states, bad Choice targets — before anything runs. The batch preset shows Map with MaxConcurrency 2.', action: async () => { $('preset').value = 'batch'; loadPresetByValue(); await runAll(); } }
    ]
  });
  function loadPresetByValue() {
    loadPreset($('preset').value);
  }
  shell.refreshKpis();
}

boot();

for (const [id, out] of [['cold-rate', 'cold-rate-out'], ['error-rate', 'error-rate-out']]) {
  $(id).addEventListener('input', () => setText(out, `${$(id).value}%`));
}
