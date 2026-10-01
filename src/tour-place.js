/**
 * Where the tour card goes: below its target, else above it, and always inside the viewport.
 * A card taller than the viewport is capped by CSS (max-height with internal scroll) and pinned
 * to the top margin, so its Back / Next buttons stay reachable.
 * @param {{ rect: { top: number, bottom: number, left: number }, vw: number, vh: number, cw: number, ch: number, margin?: number, gap?: number }} p
 * @returns {{ left: number, top: number }}
 */
export function placeTourCard({ rect, vw, vh, cw, ch, margin = 12, gap = 16 }) {
  const h = Math.min(ch, vh - 2 * margin);
  let top = rect.bottom + gap;
  if (top + h > vh - margin) top = rect.top - h - gap;
  top = Math.min(Math.max(margin, top), vh - h - margin);
  let left = rect.left;
  if (left + cw > vw - margin) left = vw - cw - margin;
  return { left: Math.max(margin, left), top: Math.max(margin, top) };
}

/**
 * Centre a card with no target, never above the top margin.
 * @param {{ vw: number, vh: number, cw: number, ch: number, margin?: number }} p
 */
export function centreTourCard({ vw, vh, cw, ch, margin = 12 }) {
  const h = Math.min(ch, vh - 2 * margin);
  return { left: Math.max(margin, (vw - cw) / 2), top: Math.max(margin, (vh - h) / 2) };
}
