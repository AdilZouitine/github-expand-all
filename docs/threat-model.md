# Threat model

Scope: the shipped content-script extension, its CI/release pipeline, and
store submission. The extension has no backend.

## Assets

- User's GitHub session in the current browser tab (never read or sent)
- Release signing/submission credentials in GitHub Environments
- Integrity of Chrome and Firefox store packages

## Threats and mitigations

These are the primary threats from the engineering specification §12.2.

### Selector drift activates destructive or unintended controls

A GitHub markup change could make an allowlisted selector match Close,
Merge, Approve, or another state-changing control.

**Mitigations:** allowlisted rules only; discovery is confined to recognized
conversation roots; safety predicates and a denylist of destructive concepts;
immediate pre-click revalidation; negative fixtures; human-reviewed fixture
updates (no silent live-DOM refresh in CI).

### Injected page markup impersonates an expansion control

A comment or other page content could include buttons that look like GitHub
expansion controls.

**Mitigations:** candidates must be connected, visible, interactive, inside a
known conversation container, and outside the extension host; UI is built
with DOM APIs and `textContent` only — no `innerHTML` with page-derived
content; the host uses `github-expand-all-host` /
`data-github-expand-all="host"`.

### Compromised dependency or CI action modifies release output

A malicious package or unpinned Action could alter zip contents.

**Mitigations:** exact lockfile and `pnpm install --frozen-lockfile`;
Dependabot; dependency review failing at moderate severity; CodeQL on
JavaScript/TypeScript; Actions pinned to full commit SHAs; two isolated
clean builds compared with `scripts/reproducibility-check.mjs`;
`assert-manifest` and `assert-artifacts` before release.

### Malicious fork workflow exfiltrates release secrets

A pull request from a fork could try to run privileged workflows.

**Mitigations:** top-level `contents: read`; no `pull_request_target`; no
store secrets on pull-request jobs; Chrome and AMO credentials only in
protected `chrome-web-store` and `firefox-amo` Environments, gated by
`ENABLE_STORE_SUBMIT`; release only from annotated `vX.Y.Z` tags whose
commit passed CI.

### DOM size or mutation storms cause excessive CPU usage

A huge timeline or noisy observer could lock the tab.

**Mitigations:** user-initiated runs only; bounded passes, activations,
runtime, settle time, and consecutive no-progress passes; observers limited
to the conversation root and ignore the extension host; hitting a limit
yields `partial`, never an infinite loop.

### Remote code or overly broad permissions expand the attack surface

Extra hosts, `eval`, or remote scripts would turn a local expander into a
remote-code host.

**Mitigations:** empty `permissions`; host access exactly
`https://github.com/*`; no `eval`, `new Function`, remote scripts, remotely
hosted WASM, or dynamic code download; production source maps omitted;
default extension-pages CSP left strict; permission review gate in
`docs/privacy.md`.

## Residual risk

GitHub's DOM is an unversioned external interface. Residual selector-drift
risk is accepted and handled as a compatibility bug: skip ambiguous
controls, report a partial result, and ship a fixture-backed patch. Store
review delays are not treated as release-job failures after a successful
submission.
