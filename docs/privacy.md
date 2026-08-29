# Privacy

GitHub Expand All operates locally on the GitHub page you are viewing. It
does not collect, store, sell, share, or transmit personal data, browsing
history, repository content, credentials, analytics, or telemetry.

This statement is the source of truth for Chrome Web Store and Firefox
Add-ons (AMO) privacy disclosures. Keep store listings identical to it.

## What the extension does

On a supported `https://github.com/<owner>/<repo>/issues/<n>` or
`/pull/<n>` page, the user can click **Expand all**. The content script
then activates expansion controls that GitHub already rendered in that
document.

## What the extension does not do

- No accounts, options sync, or extension storage
- No backend, remote configuration, or update pings beyond the browser
  store's own update mechanism
- No extension-originated network requests
- No cookies, pixels, or analytics SDKs
- No reading or writing through the GitHub API
- No logging of comment text, usernames, repository names, URLs, or DOM
  serialization in production

Development logging, when enabled locally, may include rule IDs, counts,
timing, and termination reasons only.

## Permissions

- **API permissions:** none (`permissions` is an empty array)
- **Host access:** `https://github.com/*` only, so the content script can
  run on github.com. Runtime route gating further limits work to Issue and
  Pull Request conversation pages
- **Remote code:** none. Scripts and styles are packaged with the extension

## Chrome Web Store

Single purpose: expand hidden or collapsed conversation content on GitHub
Issues and Pull Requests. User data usage is **none** — no collection, no
transmission, no third-party sharing, no use for advertising or creditworthiness.

## Firefox Add-ons

The add-on does not collect or transmit data. It does not require a privacy
policy URL beyond this document and does not use remote data collection.

## Changes

Any new permission, host, network request, persistence mechanism, analytics
SDK, or remote service requires a threat-model update, this disclosure,
store policy review, manifest snapshot changes, and explicit maintainer
approval.
