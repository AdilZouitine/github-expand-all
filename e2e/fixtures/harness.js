/* eslint-disable -- browser harness served as a static asset, not typechecked Node */
'use strict';

/**
 * Deterministic GitHub-like SPA for Playwright.
 *
 * Routes (any owner/repo pair with this shape):
 *   /owner/repo                repository home (unsupported)
 *   /owner/repo/issues         issue list (unsupported)
 *   /owner/repo/issues/1       full Issue conversation
 *   /owner/repo/pull/2         Pull Request conversation
 *   /owner/repo/issues/3       no-progress pagination (safety-limit)
 *   /owner/repo/issues/4       empty conversation
 *   /owner/repo/issues/5       slow first candidate (cancel mid-run)
 *
 * Dark theme: ?theme=dark → html[data-color-mode="dark"]
 *
 * Issue 3: each Load more click does not mutate the DOM. Two distinct
 * pagination controls with unique ids keep fingerprints distinct. The
 * production engine treats consecutive no-progress passes as a safety
 * limit (~2) rather than requiring 250 activations.
 *
 * Load more delays mutation until `delayMs` so Cancel can abort during
 * settle. Attribute writes before that delay would count as progress.
 */

(function bootstrapHarness() {
  const app = document.getElementById('app');
  if (app === null) {
    throw new Error('#app is missing');
  }

  const state = {
    noProgressClicks: 0,
    expansionClicks: 0,
  };

  window.__harness = {
    navigate: navigate,
    get noProgressClicks() {
      return state.noProgressClicks;
    },
    get expansionClicks() {
      return state.expansionClicks;
    },
  };

  applyTheme();
  render();
  bindGlobalNavigation();

  function navigate(nextPath) {
    const url = new URL(nextPath, location.origin);
    applyTheme(url.search);
    render(url.pathname);
    history.pushState({}, '', url.pathname + url.search);
    emitTurboLoad();
  }

  function emitTurboLoad() {
    // GitHub/Turbo listeners sit on `document`. Dispatch on both so window
    // and document subscribers see a completion signal (events do not bubble
    // from window to document).
    document.dispatchEvent(new Event('turbo:load'));
    window.dispatchEvent(new Event('turbo:load'));
  }

  function bindGlobalNavigation() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest('a');
      if (anchor === null) {
        return;
      }
      const href = anchor.getAttribute('href');
      if (href === null || href.startsWith('#') || href.startsWith('http')) {
        return;
      }
      event.preventDefault();
      navigate(href);
    });
    window.addEventListener('popstate', () => {
      applyTheme();
      render();
      emitTurboLoad();
    });
  }

  function applyTheme(search) {
    const params = new URLSearchParams(
      search === undefined ? location.search : search,
    );
    const mode = params.get('theme') === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-color-mode', mode);
  }

  function render(pathname) {
    const path = pathname === undefined ? location.pathname : pathname;
    app.replaceChildren();
    const view = parseView(path);
    if (view.type === 'home') {
      app.append(renderHome(view));
      return;
    }
    if (view.type === 'list') {
      app.append(renderList(view));
      return;
    }
    if (view.type === 'issue') {
      app.append(renderIssue(view));
      return;
    }
    if (view.type === 'pull') {
      app.append(renderPull(view));
      return;
    }
    app.append(renderUnknown());
  }

  function parseView(pathname) {
    const segments = pathname.replace(/\/+$/u, '').split('/').filter(Boolean);
    if (segments.length === 2) {
      return { type: 'home', owner: segments[0], repo: segments[1] };
    }
    if (segments.length === 3 && segments[2] === 'issues') {
      return { type: 'list', owner: segments[0], repo: segments[1] };
    }
    if (segments.length === 4 && segments[2] === 'issues') {
      return {
        type: 'issue',
        owner: segments[0],
        repo: segments[1],
        number: segments[3],
      };
    }
    if (segments.length === 4 && segments[2] === 'pull') {
      return {
        type: 'pull',
        owner: segments[0],
        repo: segments[1],
        number: segments[3],
      };
    }
    return { type: 'unknown' };
  }

  function renderHome(view) {
    const main = document.createElement('main');
    main.append(
      heading(`${view.owner}/${view.repo}`),
      paragraph('Repository home (unsupported route).'),
      navLink(`/${view.owner}/${view.repo}/issues`, 'Issues'),
    );
    return main;
  }

  function renderList(view) {
    const main = document.createElement('main');
    main.append(
      heading('Issues'),
      paragraph('Issue list (unsupported route).'),
      navLink(`/${view.owner}/${view.repo}/issues/1`, 'Issue 1'),
      navLink(`/${view.owner}/${view.repo}`, 'Repository'),
    );
    return main;
  }

  function renderUnknown() {
    const main = document.createElement('main');
    main.append(heading('Not found'), paragraph('Unknown harness route.'));
    return main;
  }

  function renderIssue(view) {
    const fragment = document.createDocumentFragment();
    fragment.append(renderHeader(view));
    const root = conversationRoot();
    if (view.number === '3') {
      root.append(renderNoProgressConversation());
      fragment.append(root);
      return fragment;
    }
    if (view.number === '4') {
      root.append(paragraph('Empty conversation.'));
      fragment.append(root);
      return fragment;
    }
    if (view.number === '5') {
      root.append(renderSlowConversation());
      fragment.append(root);
      return fragment;
    }
    root.append(renderFullConversation({ loadMoreDelayMs: 30 }));
    fragment.append(root);
    return fragment;
  }

  function renderPull(view) {
    const fragment = document.createDocumentFragment();
    fragment.append(renderHeader(view));
    const root = conversationRoot();
    root.append(renderFullConversation({ loadMoreDelayMs: 30 }));
    fragment.append(root);
    return fragment;
  }

  function renderHeader(view) {
    const header = document.createElement('header');
    header.className = 'harness-header';
    header.setAttribute('data-testid', 'issue-header');
    const skip = document.createElement('a');
    skip.id = 'page-focus-target';
    skip.href = '#conversation';
    skip.textContent = 'Conversation';
    const title = heading(`${view.owner}/${view.repo} #${view.number}`);
    const actions = document.createElement('div');
    actions.className = 'harness-actions';
    actions.setAttribute('data-testid', 'issue-header-actions');
    header.append(skip, title, actions);
    return header;
  }

  function conversationRoot() {
    const root = document.createElement('div');
    root.id = 'conversation';
    root.className = 'harness-conversation';
    root.setAttribute('data-testid', 'issue-viewer-container');
    return root;
  }

  function renderFullConversation(options) {
    const wrap = document.createDocumentFragment();
    wrap.append(
      createLoadMore({
        id: 'timeline-load-more',
        delayMs: options.loadMoreDelayMs,
      }),
      createButton({
        id: 'hidden-items-expand',
        testId: 'hidden-items-expand',
        label: 'Show hidden items',
        onActivate: disconnectSelf,
      }),
      createCommentShowMore({
        id: 'comment-show-more',
        expanded: false,
      }),
      createCommentShowMore({
        id: 'comment-already-expanded',
        expanded: true,
      }),
      createMinimizedComment({ id: 'minimized-static' }),
      createResolvedThread(),
      createButton({
        id: 'review-thread-load-more',
        testId: 'review-thread-load-more',
        label: 'Load more review comments',
        onActivate: disconnectSelf,
      }),
      renderDestructiveRow(),
    );
    return wrap;
  }

  function renderSlowConversation() {
    const wrap = document.createDocumentFragment();
    wrap.append(
      createLoadMore({ id: 'slow-load-more', delayMs: 1200 }),
      createCommentShowMore({ id: 'later-comment-a', expanded: false }),
      createCommentShowMore({ id: 'later-comment-b', expanded: false }),
      createMinimizedComment({ id: 'later-minimized' }),
      renderDestructiveRow(),
    );
    return wrap;
  }

  function renderNoProgressConversation() {
    const wrap = document.createDocumentFragment();
    wrap.append(
      paragraph(
        'Safety-limit page: pagination clicks do not mutate the DOM (data-harness="no-progress").',
      ),
      createNoProgressPager('pager-a'),
      createNoProgressPager('pager-b'),
      renderDestructiveRow(),
    );
    return wrap;
  }

  function createNoProgressPager(id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.setAttribute('data-testid', 'timeline-load-more');
    button.setAttribute('data-harness', 'no-progress');
    button.textContent = 'Load more';
    button.addEventListener('click', () => {
      state.noProgressClicks += 1;
    });
    return button;
  }

  function createLoadMore(options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = options.id;
    button.setAttribute('data-testid', 'timeline-load-more');
    button.textContent = 'Load more';
    button.addEventListener('click', () => {
      const parent = button.parentElement;
      const delayMs = options.delayMs;
      window.setTimeout(() => {
        if (parent === null || !parent.isConnected || !button.isConnected) {
          return;
        }
        markExpansion(button);
        button.remove();
        parent.append(
          createMinimizedComment({
            id: `${options.id}-async-reveal`,
            asyncInserted: true,
          }),
        );
      }, delayMs);
    });
    return button;
  }

  function createCommentShowMore(options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = options.id;
    button.setAttribute('data-testid', 'comment-show-more');
    button.setAttribute('aria-expanded', options.expanded ? 'true' : 'false');
    if (options.expanded) {
      button.setAttribute('data-harness', 'already-expanded');
      button.textContent = 'Show less';
      return button;
    }
    button.textContent = 'Show more';
    button.addEventListener('click', () => {
      markExpansion(button);
      button.setAttribute('aria-expanded', 'true');
      button.textContent = 'Show less';
    });
    return button;
  }

  function createMinimizedComment(options) {
    const wrap = document.createElement('div');
    wrap.className = 'minimized-comment';
    if (options.asyncInserted === true) {
      wrap.setAttribute('data-harness', 'async-inserted');
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.id = options.id;
    button.setAttribute('data-testid', 'minimized-comment-reveal');
    button.textContent = 'Show comment';
    button.addEventListener('click', () => {
      markExpansion(button);
      button.remove();
      const body = document.createElement('p');
      body.textContent = 'Revealed comment';
      wrap.append(body);
    });
    wrap.append(button);
    return wrap;
  }

  function createResolvedThread() {
    const details = document.createElement('details');
    details.setAttribute('data-resolved', 'true');
    const summary = document.createElement('summary');
    summary.setAttribute('data-testid', 'review-thread-expand');
    summary.textContent = 'Show resolved';
    summary.addEventListener('click', () => {
      markExpansion(summary);
    });
    const body = document.createElement('p');
    body.textContent = 'Resolved review thread';
    details.append(summary, body);
    return details;
  }

  function createButton(options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = options.id;
    button.setAttribute('data-testid', options.testId);
    button.textContent = options.label;
    button.addEventListener('click', () => {
      markExpansion(button);
      options.onActivate(button);
    });
    return button;
  }

  function disconnectSelf(element) {
    element.remove();
  }

  function renderDestructiveRow() {
    const row = document.createElement('div');
    row.className = 'harness-destructive';
    const labels = [
      'Merge',
      'Close issue',
      'Resolve conversation',
      'Comment',
      'Approve',
    ];
    for (const label of labels) {
      row.append(createDestructiveButton(label));
    }
    return row;
  }

  function createDestructiveButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-harness-destructive', slug(label));
    button.textContent = label;
    button.addEventListener('click', () => {
      button.setAttribute('data-clicked', 'true');
    });
    return button;
  }

  function markExpansion(element) {
    state.expansionClicks += 1;
    element.setAttribute('data-clicked', 'true');
  }

  function heading(text) {
    const node = document.createElement('h1');
    node.textContent = text;
    return node;
  }

  function paragraph(text) {
    const node = document.createElement('p');
    node.textContent = text;
    return node;
  }

  function navLink(href, text) {
    const node = document.createElement('a');
    node.href = href;
    node.textContent = text;
    return node;
  }

  function slug(label) {
    return label.toLowerCase().replace(/\s+/gu, '-');
  }
})();
