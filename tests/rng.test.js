import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng.js';

describe('mulberry32', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
  });
  it('stays in [0, 1) and is roughly uniform over 10 000 draws', () => {
    const u = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 10000; i += 1) {
      const x = u();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 10000).toBeCloseTo(0.5, 1);
  });
});
