# Selector rules

GitHub Expand All activates only conversation controls that match a
documented rule. Application code must import selectors from
`src/selectors/registry.ts` rather than embedding `querySelector` strings.

Last verified: **2026-08-29** against synthetic fixtures in
`tests/fixtures/`. Live GitHub DOM was not verified on this date.

V1 guarantees the English GitHub UI locale (`locale: 'en'`). When
`locale` is `unknown`, text-only name matches are skipped unless a
non-text signal exists (`data-testid`, `data-url`,
`details[data-resolved]`, `.minimized-comment`, or
`form.ajax-pagination-form`).

Safety predicates in `src/selectors/safety.ts` apply to every candidate
before activation: connected, approved interactive control, visible and
enabled, inside the conversation root, outside the extension host, not on
the destructive denylist, and not already expanded unless the rule models
pagination.

---

## timeline-load-more

| Field                      | Value                                                                 |
| -------------------------- | --------------------------------------------------------------------- |
| Purpose                    | Reveal deferred timeline pages ("Load more", "Show older").           |
| Priority                   | 10 (runs first so later comments can appear).                         |
| Pagination                 | Yes (`modelsPagination`).                                             |
| Per-run limit              | 50                                                                    |
| May insert more candidates | Yes. A new page can add comments, hidden-item rows, or another pager. |
| Fixtures                   | `tests/fixtures/issue.html`, `tests/fixtures/async.html`              |

**Selectors** (from `RULE_SELECTORS`, evidence order):

- `[data-testid="timeline-load-more"]`
- `[data-testid="load-more-timeline"]`
- `form.ajax-pagination-form button[type="submit"]`
- `button[data-url*="timeline"]`

**Positive predicates:** matching test id, `form.ajax-pagination-form`
ancestor, `data-url` containing `timeline`, or English accessible name
`/^(load more|show more|show older|show newer)/i`.

**Exclusions:** outside the conversation root; destructive actions; host
UI; hidden/disabled/inert controls.

**Pre-click:** connected submit/button inside the conversation. Already
expanded `aria-expanded="true"` is allowed because this rule paginates.

**Post-click:** element disconnected, `data-url` changed, or a replacement
pager with a new `data-url`. Same `data-url` on a replaced node is not
reactivated (fingerprint).

---

## timeline-hidden-items

| Field                      | Value                                                             |
| -------------------------- | ----------------------------------------------------------------- |
| Purpose                    | Reveal collapsed "hidden items" rows in the timeline.             |
| Priority                   | 20                                                                |
| Pagination                 | No                                                                |
| Per-run limit              | 20                                                                |
| May insert more candidates | Yes (unhidden comments may themselves be truncated or minimized). |
| Fixtures                   | `tests/fixtures/issue.html`                                       |

**Selectors:**

- `[data-testid="hidden-items-expand"]`
- `[data-testid="show-hidden-items"]`
- `.js-timeline-item-hidden button`

**Positive predicates:** matching test id, `.js-timeline-item-hidden`
ancestor, or English name `/show .*\bhidden\b/i` (for example "Show 3
hidden items").

**Exclusions:** "Show more" without `hidden`; pagination loaders; already
`aria-expanded="true"`.

**Pre-click:** visible button inside a hidden-items row.

**Post-click:** button disconnected or `aria-expanded="true"`.

---

## review-thread-expand

| Field                      | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Purpose                    | Open resolved or collapsed review conversation threads.            |
| Priority                   | 30                                                                 |
| Pagination                 | No                                                                 |
| Per-run limit              | 50                                                                 |
| May insert more candidates | Yes (resolved threads may contain "load more comments").           |
| Fixtures                   | `tests/fixtures/pull.html`, `tests/fixtures/already-expanded.html` |

**Selectors:**

- `[data-testid="review-thread-expand"]`
- `details[data-resolved="true"]:not([open]) > summary`
- `details.js-resolvable-timeline-thread-container:not([open]) > summary`
- `button[data-testid="review-thread-toggle"][aria-expanded="false"]`

**Positive predicates:** matching test id, `details[data-resolved="true"]`
or `details.js-resolvable-timeline-thread-container` ancestor, or English
name `/^(show resolved|expand conversation)/i`.

**Exclusions:** "Resolve conversation" / "Unresolve" (destructive);
unresolved threads that are already open; file-tree disclosures outside
the conversation root.

**Pre-click:** `summary` of a closed resolved `details`, or a collapsed
toggle button.

**Post-click:** parent `details.open === true` or `aria-expanded="true"`.
Clicking `summary` is sufficient; the engine does not write `innerHTML`.

---

## review-comments-load-more

| Field                      | Value                                               |
| -------------------------- | --------------------------------------------------- |
| Purpose                    | Page additional inline review comments on a thread. |
| Priority                   | 40                                                  |
| Pagination                 | Yes                                                 |
| Per-run limit              | 50                                                  |
| May insert more candidates | Yes (further pagers or truncated bodies).           |
| Fixtures                   | `tests/fixtures/pull.html`                          |

**Selectors:**

- `[data-testid="review-thread-load-more"]`
- `button[data-testid="load-more-review-comments"]`

**Positive predicates:** matching test id, or English name
`/load more (review )?comments/i`.

**Exclusions:** generic "Load more" that is timeline pagination; already
expanded non-pagination controls.

**Pre-click:** connected pager button inside the conversation.

**Post-click:** disconnection or a replacement button with a new
`data-url` / test id identity.

---

## minimized-comment-reveal

| Field                      | Value                                               |
| -------------------------- | --------------------------------------------------- |
| Purpose                    | Restore a minimized / hidden timeline comment.      |
| Priority                   | 50                                                  |
| Pagination                 | No                                                  |
| Per-run limit              | 50                                                  |
| May insert more candidates | Yes (the restored comment may include "Show more"). |
| Fixtures                   | `tests/fixtures/issue.html`                         |

**Selectors:**

- `[data-testid="minimized-comment-reveal"]`
- `.minimized-comment button`

**Positive predicates:** matching test id, `.minimized-comment` ancestor,
or English name `/^(show comment|show hidden comment|show minimized)/i`.

**Exclusions:** comment-expand "Show more"; "Show N hidden items";
destructive "Comment" submit.

**Pre-click:** button inside `.minimized-comment`.

**Post-click:** control disconnected or expanded.

---

## comment-expand

| Field                      | Value                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| Purpose                    | Expand a truncated issue/PR comment body.                           |
| Priority                   | 60 (after containers and pagers).                                   |
| Pagination                 | No                                                                  |
| Per-run limit              | 100                                                                 |
| May insert more candidates | No in the usual case (body text only).                              |
| Fixtures                   | `tests/fixtures/issue.html`, `tests/fixtures/already-expanded.html` |

**Selectors:**

- `[data-testid="comment-show-more"]`
- `button[data-expand-kind="comment"][aria-expanded="false"]`
- `button[aria-expanded="false"][aria-controls]`

**Positive predicates:** `comment-show-more` test id,
`data-expand-kind="comment"`, or English name
`/^(show more|show full comment|expand comment)$/i`.

**Exclusions (must not steal other families):** pagination (`data-url`,
ajax form, load-more test ids), hidden-items rows and names, minimized
comment wrappers and names, review-thread summaries ("Show resolved"),
review comment pagers. Already `aria-expanded="true"`.

**Pre-click:** collapsed comment toggle inside the conversation.

**Post-click:** `aria-expanded="true"`.

---

## Destructive denylist (defense in depth)

Whole-action phrases, not substrings. "Show resolved" is allowed;
"Resolve conversation" is not.

Denied examples: Resolve conversation, Unresolve, Merge, Close issue,
Reopen, Delete, Edit, Minimize, Report, Block, Unsubscribe, Approve,
Dismiss review, Submit comment, Comment, Add reaction.

Allowed examples: Show resolved, Load more, Show more, Show comment,
Show hidden items.
