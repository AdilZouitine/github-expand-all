# Testing

CI never contacts live `github.com`. All automated tests use checked-in
sanitized fixtures or a local GitHub-like Playwright harness.

## Pyramid

| Layer              | Tool                                        | When                            |
| ------------------ | ------------------------------------------- | ------------------------------- |
| Unit               | Vitest + happy-dom                          | Every PR                        |
| DOM integration    | Vitest fixtures                             | Every PR                        |
| Coverage gates     | Vitest V8                                   | Every PR (`pnpm test:coverage`) |
| Package assertions | `scripts/assert-*.mjs`                      | Every PR                        |
| E2E Chromium       | Playwright, unpacked production extension   | Every PR                        |
| E2E Firefox        | Same harness in Firefox plus `web-ext lint` | Every PR                        |
| Benchmarks         | `pnpm bench` via CodSpeed                   | PR, `main`, manual              |

## Unit and integration

```bash
pnpm test:run
pnpm test:coverage
```

Tests live under `tests/unit/` and `tests/integration/`. Fixtures load through
`tests/fixtures/load.ts`. Prefer injected clocks and fake timers over real
sleeps.

Global coverage floors: 90% statements/lines/functions and 85% branches.
Critical modules (`src/engine/**`, `src/selectors/safety.ts`, `src/app/route.ts`,
`src/ui/state.ts`) require 95% statements/lines/functions and 90% branches.
Thresholds fail CI.

Each selector rule needs at least one positive fixture, one already-expanded
fixture, and one near-match negative fixture. Live GitHub DOM snapshots are
not refreshed in CI; fixture updates require human review.

## Browser E2E

```bash
pnpm build
pnpm build:firefox
pnpm test:e2e
```

Playwright is configured in `e2e/playwright.config.ts`.

**Chromium:** load the unpacked production extension from `.output/chrome-mv3`
in a persistent context (Playwright Chrome-extension guidance).

**Firefox:** Playwright cannot reliably load Manifest V3 extensions. CI runs
the same local harness in Firefox without the extension (SPA markup and
client navigation) and runs `web-ext lint` on the Firefox package. This is
the recorded V1 strategy in `docs/architecture.md`.

Traces, screenshots, and video are collected on failure only. The CI E2E job
uploads them with 7-day retention.

Required scenarios include single mount on supported routes, absence on
unsupported routes, static and async expansion, cancel vs concurrent-run
protection, SPA navigation, keyboard/theme/reduced-motion, destructive
near-matches left untouched, and the safety-limit partial path.

## Benchmarks

```bash
pnpm bench
```

CodSpeed compares PRs to `main` in simulation mode. Until a `main` baseline
exists the workflow is `continue-on-error` (warning threshold). Before 1.0.0
store submission, regressions ≥ 10% and statistically significant on a
critical benchmark become required.

## Full local gate

```bash
pnpm validate
```
