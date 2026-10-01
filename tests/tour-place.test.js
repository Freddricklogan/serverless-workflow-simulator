import { describe, expect, it } from 'vitest';
import { centreTourCard, placeTourCard } from '../src/tour-place.js';

const vw = 1280;
const vh = 900;

describe('placeTourCard', () => {
  it('sits below a target with room beneath it', () => {
    expect(placeTourCard({ rect: { top: 100, bottom: 200, left: 40 }, vw, vh, cw: 360, ch: 300 })).toEqual({ left: 40, top: 216 });
  });
  it('moves above a target near the bottom of the viewport', () => {
    expect(placeTourCard({ rect: { top: 700, bottom: 780, left: 40 }, vw, vh, cw: 360, ch: 300 }).top).toBe(384);
  });
  it('keeps the whole card on screen when neither side has room', () => {
    const { top } = placeTourCard({ rect: { top: 200, bottom: 760, left: 40 }, vw, vh, cw: 360, ch: 500 });
    expect(top).toBeGreaterThanOrEqual(12);
    expect(top + 500).toBeLessThanOrEqual(vh - 12);
  });
  it('pins a card taller than the viewport to the top margin', () => {
    expect(placeTourCard({ rect: { top: 50, bottom: 300, left: 40 }, vw: 400, vh, cw: 360, ch: 1400 }).top).toBe(12);
  });
  it('stays on screen for a target measured far below the fold', () => {
    const { top } = placeTourCard({ rect: { top: 2300, bottom: 2365, left: 40 }, vw: 400, vh, cw: 360, ch: 400 });
    expect(top + 400).toBeLessThanOrEqual(vh - 12);
  });
  it('clamps the left edge when the target sits near the right edge', () => {
    expect(placeTourCard({ rect: { top: 100, bottom: 200, left: 300 }, vw: 400, vh, cw: 376, ch: 200 }).left).toBe(12);
  });
});

describe('centreTourCard', () => {
  it('centres a card that fits', () => {
    expect(centreTourCard({ vw, vh, cw: 360, ch: 300 })).toEqual({ left: 460, top: 300 });
  });
  it('pins a card taller than the viewport to the top margin', () => {
    expect(centreTourCard({ vw: 400, vh, cw: 376, ch: 1200 })).toEqual({ left: 12, top: 12 });
  });
});
