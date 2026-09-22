#!/usr/bin/env node
/* global process, console, URL */
/** WCAG AA contrast check for every palette in exec-shell.css.
 * For each theme (its dark block and its [data-scheme="light"] block) the pairs below are measured:
 *   text, muted            vs bg, panel, panel-2      ≥ 4.5  (body text)
 *   primary, secondary     vs bg, panel, panel-2      ≥ 4.5  (links are text)
 *   ok, warn, danger       vs bg, panel, panel-2      ≥ 4.5  (demos use them as text colours)
 *   chart-1..8             vs bg, panel               ≥ 3.0  (graphics)
 *   on-accent              vs primary, secondary      ≥ 4.5  (button labels; both accents can be primary)
 *   border                 vs bg                      ≥ 1.2  (visible edge; informational)
 * Usage: node contrast-check.mjs path/to/exec-shell.css   → exit 1 on any failure. */
import { readFileSync } from 'node:fs';

const css = readFileSync(process.argv[2] ?? new URL('./exec-shell.css', import.meta.url), 'utf8');
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// Dark blocks are [data-theme="x"] rules; light blocks carry [data-scheme="light"] in the selector.
const themes = {};
for (const m of css.matchAll(/((?:\[data-scheme="light"\])?)\s*\[data-theme="([a-z]+)"\]\s*\{([^}]*)\}/g)) {
  const tokens = Object.fromEntries([...m[3].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((t) => [t[1], t[2].toLowerCase()]));
  if (Object.keys(tokens).length) (themes[m[2]] ??= {})[m[1] ? 'light' : 'dark'] = tokens;
}
const RULES = [
  [['text', 'muted', 'primary', 'secondary'], ['bg', 'panel', 'panel-2'], 4.5],
  [['ok', 'warn', 'danger'], ['bg', 'panel', 'panel-2'], 4.5],
  [['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8'], ['bg', 'panel'], 3.0],
  [['on-accent'], ['primary', 'secondary'], 4.5],
  [['border'], ['bg'], 1.2]
];
let failures = 0, checked = 0;
for (const [name, schemes] of Object.entries(themes)) {
  for (const [scheme, t] of Object.entries(schemes)) {
    for (const [fgs, bgs, min] of RULES) for (const fg of fgs) for (const bg of bgs) {
      if (!t[fg] || !t[bg]) { console.log(`${name}/${scheme}: missing token --${fg} or --${bg}`); failures++; continue; }
      const r = ratio(t[fg], t[bg]); checked++;
      if (r < min) { console.log(`FAIL ${name}/${scheme} --${fg} ${t[fg]} on --${bg} ${t[bg]}: ${r.toFixed(2)} < ${min}`); failures++; }
    }
  }
}
console.log(`contrast-check: ${Object.keys(themes).length} themes × 2 schemes, ${checked} pairs, ${failures} failures`);
process.exit(failures ? 1 : 0);
