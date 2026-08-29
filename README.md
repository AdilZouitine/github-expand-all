# GitHub Expand All

A Manifest V3 content-script extension that adds one user-initiated action on
GitHub Issue and Pull Request pages: expand hidden, collapsed, deferred, or
paginated conversation content.

**Store status:** not published on the Chrome Web Store or Firefox Add-ons
(AMO). Install from a local production build until the first reviewed listing
exists.

**Privacy:** the extension collects, stores, and transmits no data. It has no
backend and makes no extension-originated network requests. See
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
