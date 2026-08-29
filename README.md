# GitHub Expand All

I'm tired of pressing **Load more** a dozen times just to review a PR.

GitHub hides comments, review threads, and older conversation behind
pagination and collapsible rows. On a busy pull request that means click,
wait, click, wait — until you've actually seen the thread.

This extension adds one button on Issue and Pull Request pages:
**Expand all**. It clicks the boring stuff for you — Load more, Show older,
hidden items, resolved review threads, truncated comments — until the
conversation is actually readable.

Not in the Chrome Web Store or Firefox Add-ons yet. Load it from a local
build until it is.

**Privacy:** the extension collects, stores, and transmits no data. It has no
backend and makes no network requests of its own. See
[docs/privacy.md](docs/privacy.md).

## Install from source

Requires [Node.js](https://nodejs.org/) 24.20.0 or newer and pnpm 11.24.0
(enabled through Corepack).

```bash
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
```

### Chrome

```bash
pnpm build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
and select `.output/chrome-mv3`.

### Firefox

```bash
pnpm build:firefox
```

Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary
Add-on…**, and select `.output/firefox-mv3/manifest.json`. The permanent Gecko
ID is `github-expand-all@gitscroll.dev`.

Store-ready archives:

```bash
pnpm zip
pnpm zip:firefox
```

Artifacts are named `github-expand-all-<version>-<browser>.zip` under
`.output/`.

## Development

```bash
pnpm dev            # Chrome
pnpm dev:firefox    # Firefox
```

Business logic lives in `src/` and is independent of WXT globals. The
content-script entrypoint only wires collaborators. Architecture decisions are
recorded in [docs/architecture.md](docs/architecture.md).

## Test

```bash
pnpm validate       # format, lint, typecheck, coverage
pnpm test:run       # Vitest unit and integration
pnpm test:e2e       # Playwright Chromium + Firefox harness
pnpm bench          # CodSpeed-oriented benchmarks
```

CI never talks to live `github.com`. See [docs/testing.md](docs/testing.md).

## License

[Apache-2.0](LICENSE). Store publisher identity is the repository owner until a
legal entity is registered.
