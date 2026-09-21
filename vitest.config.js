import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // The DOM-binding layer is covered by the Playwright smoke test, not by
      // unit tests; excluding it keeps the coverage number meaningful.
      exclude: ['src/main.js', 'src/charts.js', 'src/ui.js', 'src/exec-shell.js']
    }
  }
});
