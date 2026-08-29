# Contributing

## Toolchain

- Node.js **24.20.0** or newer, pinned in `.node-version` and
  `package.json#engines`
- pnpm **11.24.0**, pinned in `packageManager` and enabled through Corepack

```bash
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
```

Do not commit `node_modules`, `.output`, coverage, Playwright results, zip
archives, or `.env.submit`.

## Local validation

```bash
pnpm validate
```

That runs `format:check`, `lint` (zero warnings), `typecheck`, and
`test:coverage`. Husky runs `lint-staged` on pre-commit and commitlint on
commit-msg. CI is authoritative.

## Conventional Commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):
`feat`, `fix`, `perf`, `refactor`, `test`, `build`, `ci`, `docs`, `chore`,
and `revert`. Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.
PR titles should follow the same convention when squash-merging.

## Tests

- Unit and DOM integration tests run in Vitest against sanitized fixtures.
- Playwright E2E uses a local GitHub-like harness. Chromium loads the unpacked
  production extension. Firefox evaluates the content-script bundle and lints
  the Firefox package (`docs/testing.md`).
- **Do not add live `github.com` access to CI.** Live markup is not a
  substitute for checked-in fixtures.

Selector changes need a failing fixture, the smallest registry edit, positive
and negative tests, and an update to `docs/selectors.md`.

## High-risk paths

Changes under `.github/workflows/`, `src/selectors/`, `src/engine/`,
`wxt.config.ts`, `scripts/`, `docs/privacy.md`, and `docs/threat-model.md`
require maintainer review (`CODEOWNERS`).
