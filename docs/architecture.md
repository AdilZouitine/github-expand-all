# Architecture

GitHub Expand All is a Manifest V3 content-script extension. It adds one
user-initiated action on GitHub Issue and Pull Request pages: expand hidden,
collapsed, deferred, or paginated conversation content.

The content-script entrypoint only wires dependencies. Business logic lives in
`src/` and must remain runnable in Vitest without WXT globals.

## Recorded decisions (Section 30)

| #   | Decision                     | Choice                                                                                                                                                                                                                                                     |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Package name and Gecko ID    | `github-expand-all`. Permanent Firefox ID: `github-expand-all@gitscroll.dev`.                                                                                                                                                                              |
| 2   | License and publisher        | Apache-2.0 (`LICENSE`). Store publisher identity is the repository owner until a legal entity is registered.                                                                                                                                               |
| 3   | Guaranteed GitHub UI locales | English GitHub UI is the V1 guaranteed locale. Other locales skip text-only matches rather than guessing.                                                                                                                                                  |
| 4   | Expansion rule families      | The six `RuleId` values in `src/engine/types.ts`. Truncated diffs are not activated in V1.                                                                                                                                                                 |
| 5   | UI placement                 | In-flow next to Issue/PR header actions when a documented anchor exists. Otherwise a small fixed, non-obscuring control. Shadow DOM is used for CSS isolation; GitHub CSS custom properties inherit.                                                       |
| 6   | Firefox E2E                  | Chromium Playwright loads the unpacked production extension on every PR. Firefox cannot reliably load MV3 extensions in Playwright; CI runs harness-only SPA tests in Firefox plus `web-ext lint` of the Firefox package. Documented in `docs/testing.md`. |
| 7   | CodSpeed threshold           | Warning / non-blocking until a `main` baseline exists. Before 1.0.0 store submission, regressions ≥ 10% and statistically significant on a critical benchmark become required.                                                                             |
| 8   | Source maps                  | Omitted from production store packages (`vite.build.sourcemap: false`).                                                                                                                                                                                    |
| 9   | GitHub Releases              | Published when artifact creation succeeds. Notes state that Chrome Web Store and AMO availability remain subject to review.                                                                                                                                |
| 10  | Chrome submission            | Prefer WXT `submit` (publish-browser-extension) against Chrome Web Store API v2. A narrow audited v2 adapter is allowed only if the pinned WXT version cannot meet a current API requirement.                                                              |

## Module boundaries

```
WXT content-script entrypoint
        │
        ▼
Route lifecycle controller ────── observes GitHub SPA navigation
        │
        ├── unsupported route → abort run, unmount UI
        │
        └── supported route → idempotently mount UI
                                │
                     user activates Expand all
                                │
                                ▼
                         Expansion engine
                      ┌─────────┴──────────┐
                      ▼                    ▼
              Selector registry       Run state/UI
```

- **Entrypoint:** `entrypoints/github.content/` wires collaborators. No business rules. No other module may import from it.
- **Route controller:** `src/app/controller.ts` decides whether the document is supported, mounts/unmounts, and cancels runs across navigation.
- **UI:** `src/ui/` renders state and emits `{ type: 'expand' } | { type: 'cancel' }`. It never queries GitHub controls.
- **Selector registry:** `src/selectors/` holds declarative GitHub-DOM knowledge and safety predicates. Application code must not contain ad hoc `querySelector` strings.
- **Engine:** `src/engine/` owns passes, ordering, deduplication, settling, limits, cancellation, and accounting.
- **Platform adapters:** `src/shared/` wraps abort, time, and logging so tests inject fakes.

## Host identity

- Element id: `github-expand-all-host`
- Attribute: `data-github-expand-all="host"`
- Prefixed CSS classes: `gea-*`

## Conversation roots

Recognized containers (preference order) are listed in `src/selectors/registry.ts`.
Discovery only considers nodes inside the first matching connected container.

## Navigation

On every navigation signal:

1. Parse `location.href` with `parseRoute`.
2. Compare the normalized route key with the last processed key.
3. Unchanged key → idempotent host-presence check only.
4. Changed key → abort any active run, remove stale hosts and observers.
5. Unsupported → stop.
6. Wait a bounded interval for a conversation anchor, then mount exactly one host.
7. Register teardown on the route `AbortController`.

Signals: `turbo:load`, `turbo:render`, `popstate`, `pageshow`, and a history
`pushState`/`replaceState` wrapper as fallback. GitHub-specific events are
adapters with a fallback, not the sole source of truth.

## Engine

Sequential activation is the default (batch size 1). Progress is established by
postconditions, candidate disappearance, or relevant mutations outside the host.
Hitting any limit yields `partial`, never an infinite loop.

## Privacy

The extension performs no extension-originated network requests, stores nothing,
and logs nothing in production. See `docs/privacy.md` and `docs/threat-model.md`.
