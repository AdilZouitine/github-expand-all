# E2E harness

Deterministic GitHub-like SPA used by Playwright. Routine CI never hits live
github.com markup, authentication, or rate limits.

## GitHub URL intercept

The production content script matches **`https://github.com/*` only**. A
localhost origin would not inject the unpacked extension.

Chromium tests therefore:

1. Start this server (`node e2e/harness/server.mjs`, default `127.0.0.1:4173`).
2. Launch Chromium with `--load-extension=.output/chrome-mv3`.
3. `context.route('https://github.com/**', …)` and fulfill each request from
   the harness origin (HTML, `/harness.js`, `/harness.css`).
4. `page.goto('https://github.com/owner/repo/issues/1')`.

The document URL is GitHub, so the real extension injects. Client-side
`history.pushState` stays on `github.com`; the harness then dispatches
`turbo:load` so the content script reconciles like GitHub's Turbo SPA.

Do not intercept other hosts.

## Routes

| Path                   | Role                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `/owner/repo`          | Repository home (unsupported)                               |
| `/owner/repo/issues`   | Issue list (unsupported)                                    |
| `/owner/repo/issues/1` | Issue with every candidate family + async Load more (~30ms) |
| `/owner/repo/pull/2`   | Pull Request conversation                                   |
| `/owner/repo/issues/3` | No-progress pagination (`data-harness="no-progress"`)       |
| `/owner/repo/issues/4` | Empty conversation                                          |
| `/owner/repo/issues/5` | Slow first candidate (~1200ms) for Cancel                   |

Query `?theme=dark` sets `html[data-color-mode="dark"]`. Reduced motion is
emulated by Playwright (`prefers-reduced-motion`), not by the page.

Issue **3** does not create 250 buttons. Each Load more click **must not
mutate the DOM** (clicks are counted in `window.__harness.noProgressClicks`
only). Two distinct pagers with unique `id`s keep engine fingerprints
distinct. Two consecutive no-progress passes should yield a partial run and
live text **Stopped after safety limit**. Production `maxActivations` is 250
and is too slow for E2E.

## Firefox

Playwright cannot reliably load Manifest V3 Firefox extensions. The Firefox
project runs harness-only tests (SPA markup and client navigation). CI lints
the Firefox package with **web-ext** separately. Chromium is the extension
E2E browser.

## Prerequisites

```bash
pnpm build
pnpm test:e2e
```
