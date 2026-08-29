import { defineConfig } from 'vitest/config';
import codspeedPlugin from '@codspeed/vitest-plugin';

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    benchmark: {
      include: ['tests/benchmarks/**/*.bench.ts'],
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 90,
        branches: 85,
        'src/engine/**': {
          statements: 95,
          lines: 95,
          functions: 95,
          branches: 90,
        },
        'src/selectors/safety.ts': {
          statements: 95,
          lines: 95,
          functions: 95,
          branches: 90,
        },
        'src/app/route.ts': {
          statements: 95,
          lines: 95,
          functions: 95,
          branches: 90,
        },
        'src/ui/state.ts': {
          statements: 95,
          lines: 95,
          functions: 95,
          branches: 90,
        },
      },
    },
  },
});
