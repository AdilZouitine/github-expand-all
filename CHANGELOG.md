# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-08-29

### Added

- Initial Manifest V3 content-script extension for Chrome and Firefox.
- User-initiated **Expand all** on GitHub Issue and Pull Request conversation
  pages, with cancellation, safety limits, and terminal summaries.
- Six expansion rule families: timeline load-more, hidden timeline items,
  comment expand, minimized-comment reveal, review-thread expand, and review
  comments load-more. Truncated diffs are not activated in V1.
- In-flow host next to Issue/PR header actions when a documented anchor
  exists, otherwise a small fixed control. Shadow DOM isolates extension CSS;
  GitHub theme custom properties inherit.
- Permanent Firefox Gecko ID `github-expand-all@gitscroll.dev`.
- Least-privilege manifest: empty `permissions`, host access limited to
  `https://github.com/*`, production source maps omitted.
- Zero-collection privacy model: no backend, storage, telemetry, or
  extension-originated network requests.
- Vitest unit/integration coverage gates, Playwright Chromium extension E2E,
  Firefox harness plus `web-ext lint`, and CodSpeed benchmarks (warning
  threshold until a `main` baseline exists).
- Reproducible release artifacts, AMO source archive, and GitHub Releases.
  Chrome Web Store and AMO submission stay behind `ENABLE_STORE_SUBMIT`.

[Unreleased]: https://github.com/AdilZouitine/gitscroll/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/AdilZouitine/gitscroll/releases/tag/v1.0.0
