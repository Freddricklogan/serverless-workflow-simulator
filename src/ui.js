/** DOM helpers. No incident logic lives here. */
export const $ = (id) => document.getElementById(id);
export function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}
export function hoursLabel(h) {
  return Number.isFinite(h) ? `${h.toFixed(1)} h` : '—';
}
export function dateLabel(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
