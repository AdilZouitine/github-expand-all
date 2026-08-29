# AMO reviewer build

These steps reproduce the Firefox production package from the source archive
attached to each AMO version.

## Environment

| Tool    | Version                                     |
| ------- | ------------------------------------------- |
| Node.js | **24.20.0** (see `.node-version`)           |
| pnpm    | **11.24.0** (`package.json#packageManager`) |
| OS      | Linux x86_64 or macOS; `TZ=UTC` `LC_ALL=C`  |

No private registries, undeclared global tools, or secrets are required.
Network access is limited to the official npm registry through pnpm.

## Commands

```text
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
pnpm build:firefox && pnpm zip:firefox
```

Optional, matches release CI:

```text
export TZ=UTC LC_ALL=C
export SOURCE_DATE_EPOCH=<unix time of the tagged commit>
```

## Output

Unpacked extension:

```text
.output/firefox-mv3/
```

Store archive (WXT `artifactTemplate`
`{{name}}-{{version}}-{{browser}}.zip`):

```text
.output/github-expand-all-<version>-firefox.zip
```

Example for 1.0.0: `.output/github-expand-all-1.0.0-firefox.zip`.

The package `manifest.json` must contain:

- `manifest_version`: `3`
- `browser_specific_settings.gecko.id`: `github-expand-all@gitscroll.dev`
- `browser_specific_settings.gecko.strict_min_version`: `140.0`
- `browser_specific_settings.gecko.data_collection_permissions.required`: `["none"]`
- `permissions`: `[]`
- `host_permissions`: `["https://github.com/*"]`

Production builds omit source maps (`vite.build.sourcemap: false`).

## Comparison procedure

1. Extract the uploaded Firefox zip (or signed XPI after AMO signing).
2. Extract or open `.output/firefox-mv3` from the reviewer build.
3. Compare the two **extracted trees** byte-for-byte (ignore zip mtimes if
   the archive container differs).
4. `manifest.json` version must equal `package.json` version.

If you have two clean checkouts of the same tag:

```text
node scripts/reproducibility-check.mjs path-a/.output path-b/.output
```

The unsigned upload zip is not the later AMO-signed XPI; compare file
contents, not the signed container.
