# Releasing

`package.json` is the single version source. GitHub Releases publish when
artifact creation succeeds. Chrome Web Store and AMO availability remain
subject to review.

## Versioning

[Semantic Versioning 2.0.0](https://semver.org/):

- **patch:** selector compatibility or bug fix without a behavior break
- **minor:** new expansion family or backwards-compatible capability
- **major:** material behavior, permission, privacy, or platform contract change

Update `CHANGELOG.md` ([Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/))
in the release PR. Failed versions are never retagged; fix forward.

## Tag and ship

1. Merge the version + changelog PR to `main` after required checks pass.
2. Create an **annotated** tag that equals `v${package.json.version}`:

   ```bash
   git tag -a v1.0.0 -m "GitHub Expand All v1.0.0"
   git push origin v1.0.0
   ```

3. `.github/workflows/release.yml` runs on tags matching
   `v[0-9]+.[0-9]+.[0-9]+`:
   - `scripts/verify-tag-version.mjs` checks the tag against `package.json`
   - one clean build with `TZ=UTC`, `LC_ALL=C`, and `SOURCE_DATE_EPOCH` from
     the tag commit time
   - `assert-manifest` and `assert-artifacts`
   - AMO source zip via `scripts/create-source-archive.mjs`
   - SHA-256 checksum file
   - GitHub Release titled `GitHub Expand All vX.Y.Z`

Artifacts (never rebuilt in later jobs):

```text
github-expand-all-X.Y.Z-chrome.zip
github-expand-all-X.Y.Z-firefox.zip
github-expand-all-X.Y.Z-source.zip
github-expand-all-X.Y.Z-SHA256SUMS.txt
```

The unsigned Firefox zip is not the later signed XPI.

## ENABLE_STORE_SUBMIT

Store jobs are gated by the repository variable `ENABLE_STORE_SUBMIT`.

- Unset or any value other than `true`: artifacts-only GitHub Release.
- `true`: the `chrome-web-store` and `firefox-amo` jobs run against protected
  GitHub Environments of those names and submit the **existing** artifacts
  with `wxt submit`. They do not rebuild.

Create the environments before enabling the variable. Store secrets live only
in those environments, never at repository level, and never on pull-request
jobs. Do not print client secrets, refresh tokens, access tokens, or AMO JWT
material.

Chrome prefers WXT `submit` (Chrome Web Store API v2). A narrow audited v2
adapter is allowed only if the pinned WXT version cannot meet a current API
requirement (`docs/architecture.md` decision 10). First listings are created
manually; WXT does not create them.

AMO submissions must include the matching source zip. Reviewer instructions
are in [amo-build.md](amo-build.md).

## Local dry run

```bash
export TZ=UTC LC_ALL=C
export SOURCE_DATE_EPOCH="$(git log -1 --pretty=%ct)"
pnpm install --frozen-lockfile
pnpm build && pnpm zip
pnpm build:firefox && pnpm zip:firefox
node scripts/assert-manifest.mjs
node scripts/assert-artifacts.mjs
node scripts/create-source-archive.mjs
```
