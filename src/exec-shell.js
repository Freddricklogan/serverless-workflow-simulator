/**
 * Executive Shell — portfolio standard v1.
 *
 * Builds the sticky header (title, tagline, badge row, tour button, source
 * link), the live KPI strip, the footer, and a keyboard-accessible guided
 * tour whose steps perform real actions against the demo.
 *
 * No build step, no dependencies, no inline event handlers.
 *
 * @example
 *   import { mountExecShell } from './src/exec-shell.js';
 *   const shell = mountExecShell({
 *     title: 'SIEM Log Analyzer',
 *     tagline: 'Browser-based detection-engineering sandbox.',
 *     repo: 'https://github.com/Freddricklogan/siem-log-analyzer',
 *     pagesUrl: 'https://freddricklogan.github.io/siem-log-analyzer/',
 *     kpis: [{ label: 'Events', compute: () => store.events.length }],
 *     tour: [{ selector: '#generate', title: 'Ingest', body: '…', action: () => run() }]
 *   });
 *   shell.refreshKpis();
 */

const OWNER = 'Freddrick Logan';
const OWNER_GITHUB = 'https://github.com/Freddricklogan';
const OWNER_SITE = 'https://fredlogan.phd';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** @param {string} tag @param {object} [props] @param {Array<Node|string>} [kids] */
function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const kid of kids) {
    if (kid == null) continue;
    node.append(kid);
  }
  return node;
}

function prefersReducedMotion() {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * @typedef {{ label: string, compute: () => (string|number), tone?: 'ok'|'warn'|'danger'|'accent' }} KpiSpec
 * @typedef {{ selector: string, title: string, body: string, action?: () => void|Promise<void> }} TourStep
 * @typedef {{ label: string, tone?: 'accent'|'plain', dot?: boolean }} BadgeSpec
 * @typedef {'signal'|'graphite'|'ember'|'plum'|'forest'|'midnight'} ThemeName
 */

export const THEMES = ['signal', 'graphite', 'ember', 'plum', 'forest', 'midnight'];
/** Outside a browser (unit tests) tokens() returns the midnight dark palette so logic modules stay testable. */
const NODE_TOKENS = { bg: '#0b1220', panel: '#111a2e', panel2: '#16223a', border: '#22304d', text: '#e6edf3', muted: '#8b98b0', accent: '#58a6ff', accent2: '#d4a95a', ok: '#3fb950', warn: '#d29922', danger: '#f85149', onAccent: '#0b1220', series: ['#58a6ff', '#d4a95a', '#3fb950', '#f85149', '#d2a8ff', '#ffa657', '#79c0ff', '#f2cc60'] };
const TOKEN_NAMES = ['bg', 'panel', 'panel-2', 'border', 'text', 'muted', 'accent', 'accent-2', 'ok', 'warn', 'danger', 'on-accent'];

/**
 * Apply a category palette. Sets data-theme (and data-accent="secondary" to swap the two hues) on
 * <html>; the palettes themselves live in exec-shell.css. Repos never write colour values.
 * @param {ThemeName} theme
 * @param {'primary'|'secondary'} [accent]
 */
export function applyTheme(theme, accent = 'primary') {
  if (!THEMES.includes(theme)) throw new Error(`applyTheme: unknown theme "${theme}" (expected one of ${THEMES.join(', ')})`);
  document.documentElement.dataset.theme = theme;
  if (accent === 'secondary') document.documentElement.dataset.accent = 'secondary';
  else delete document.documentElement.dataset.accent;
}

/**
 * The palette as resolved right now (dark or light, after any data-accent swap) so chart
 * libraries draw with the page's colours. `series` is --chart-1 … --chart-8.
 * @returns {{ bg: string, panel: string, panel2: string, border: string, text: string, muted: string,
 *   accent: string, accent2: string, ok: string, warn: string, danger: string, onAccent: string, series: string[] }}
 */
export function tokens() {
  if (typeof document === 'undefined') return { ...NODE_TOKENS, series: [...NODE_TOKENS.series] };
  const cs = getComputedStyle(document.documentElement);
  const read = (name) => cs.getPropertyValue(`--${name}`).trim();
  const out = {};
  for (const n of TOKEN_NAMES) out[n.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())] = read(n);
  out.series = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => read(`chart-${i}`));
  return out;
}

const SCHEME_KEY = 'exec-scheme';
const schemeListeners = new Set();

/** 'dark' (default) or 'light' — light is opt-in through the header toggle and remembered per site. */
export function currentScheme() {
  return document.documentElement.dataset.scheme === 'light' ? 'light' : 'dark';
}

/** Apply a scheme; `persist` writes the choice to localStorage (the toggle does, first paint does not). */
export function applyScheme(scheme, persist = true) {
  if (scheme === 'light') document.documentElement.dataset.scheme = 'light';
  else delete document.documentElement.dataset.scheme;
  if (persist) {
    try { localStorage.setItem(SCHEME_KEY, scheme); } catch { /* storage unavailable: the choice lasts for the page */ }
  }
  const t = tokens();
  for (const cb of schemeListeners) cb(t, scheme);
}

/** Restore the remembered scheme (dark when nothing is stored). Called by mountExecShell. */
export function restoreScheme() {
  let stored = null;
  try { stored = localStorage.getItem(SCHEME_KEY); } catch { /* ignore */ }
  applyScheme(stored === 'light' ? 'light' : 'dark', false);
}

/** Re-run a callback when the scheme toggles (charts redraw with the new tokens). */
export function onSchemeChange(callback) {
  schemeListeners.add(callback);
  return () => schemeListeners.delete(callback);
}

const SUN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function buildSchemeToggle() {
  const btn = el('button', { type: 'button', class: 'exec-btn exec-btn--icon', id: 'exec-scheme-toggle' });
  const render = () => {
    const light = currentScheme() === 'light';
    btn.innerHTML = light ? MOON : SUN;
    btn.setAttribute('aria-label', light ? 'Switch to the dark palette' : 'Switch to the light palette');
    btn.title = btn.getAttribute('aria-label');
  };
  btn.addEventListener('click', () => applyScheme(currentScheme() === 'light' ? 'dark' : 'light'));
  schemeListeners.add(render);
  render();
  return btn;
}

/**
 * @param {{
 *   title: string,
 *   tagline: string,
 *   repo: string,
 *   pagesUrl?: string,
 *   badges?: BadgeSpec[],
 *   kpis?: KpiSpec[],
 *   tour?: TourStep[],
 *   mainSelector?: string,
 *   theme?: ThemeName,
 *   accent?: 'primary'|'secondary'
 * }} config
 */
export function mountExecShell(config) {
  const {
    title,
    tagline,
    repo,
    pagesUrl = '',
    badges = defaultBadges(),
    kpis = [],
    tour = [],
    mainSelector = '#demo-root',
    theme,
    accent
  } = config || {};

  if (theme) applyTheme(theme, accent);
  restoreScheme();

  if (!title || !tagline || !repo) {
    throw new Error('mountExecShell: title, tagline and repo are required.');
  }

  const skip = el('a', {
    class: 'exec-skip-link',
    href: mainSelector.startsWith('#') ? mainSelector : '#demo-root',
    text: 'Skip to demo'
  });

  const tourBtn = el('button', {
    type: 'button',
    class: 'exec-btn exec-btn--primary',
    id: 'exec-tour-start'
  }, ['Take the 30-second tour']);

  const header = buildHeader({ title, tagline, repo, pagesUrl, badges, tourBtn, schemeToggle: buildSchemeToggle() });
  const { strip, cells } = buildKpiStrip(kpis);
  const footer = buildFooter({ repo, pagesUrl });

  document.body.prepend(skip, header);
  if (strip) header.after(strip);
  document.body.append(footer);

  const tourApi = buildTour(tour, tourBtn);
  if (!tour.length) tourBtn.hidden = true;

  const api = {
    header,
    kpiStrip: strip,
    footer,
    /** Recompute every KPI from live demo state. Safe to call on every render. */
    refreshKpis() {
      for (const cell of cells) {
        let value;
        try {
          value = cell.spec.compute();
        } catch {
          value = '—';
        }
        cell.valueEl.textContent = String(value ?? '—');
      }
    },
    startTour: tourApi.start,
    stopTour: tourApi.stop,
    destroy() {
      tourApi.destroy();
      skip.remove();
      header.remove();
      strip?.remove();
      footer.remove();
    }
  };

  api.refreshKpis();
  return api;
}

function defaultBadges() {
  return [
    { label: 'Client-side only', tone: 'accent' },
    { label: 'No backend · no account', dot: true }
  ];
}

function buildHeader({ title, tagline, repo, pagesUrl, badges, tourBtn, schemeToggle }) {
  const badgeList = el(
    'ul',
    { class: 'exec-badges', 'aria-label': 'Project attributes' },
    badges.map((b) =>
      el(
        'li',
        {
          class:
            'exec-badges__item' + (b.tone === 'accent' ? ' exec-badges__item--accent' : '')
        },
        [b.dot ? el('span', { class: 'exec-badges__dot', 'aria-hidden': 'true' }) : null, b.label]
      )
    )
  );

  const links = [
    el('a', {
      class: 'exec-btn',
      href: repo,
      rel: 'noopener',
      target: '_blank',
      text: 'Source on GitHub'
    })
  ];
  if (pagesUrl) {
    links.push(
      el('a', { class: 'exec-btn', href: pagesUrl, rel: 'noopener', text: 'Live demo' })
    );
  }

  return el('header', { class: 'exec-header', role: 'banner' }, [
    el('div', { class: 'exec-header__inner' }, [
      el('div', { class: 'exec-header__identity' }, [
        el('h1', { class: 'exec-header__title', text: title }),
        el('p', { class: 'exec-header__tagline', text: tagline }),
        badgeList
      ]),
      el('div', { class: 'exec-header__actions' }, [tourBtn, ...links, schemeToggle])
    ])
  ]);
}

function buildKpiStrip(kpis) {
  if (!kpis.length) return { strip: null, cells: [] };
  const cells = [];
  const strip = el('section', {
    class: 'exec-kpis',
    'aria-label': 'Key metrics',
    id: 'exec-kpis'
  });
  for (const spec of kpis) {
    const valueEl = el('div', {
      class: 'exec-kpi__value',
      'aria-live': 'polite',
      text: '—'
    });
    const card = el(
      'div',
      { class: 'exec-kpi' + (spec.tone ? ` exec-kpi--${spec.tone}` : '') },
      [valueEl, el('div', { class: 'exec-kpi__label', text: spec.label })]
    );
    strip.append(card);
    cells.push({ spec, valueEl });
  }
  return { strip, cells };
}

function buildFooter({ repo, pagesUrl }) {
  const links = [
    el('li', {}, [el('a', { href: OWNER_GITHUB, rel: 'noopener', text: 'github.com/Freddricklogan' })]),
    el('li', {}, [el('a', { href: OWNER_SITE, rel: 'noopener', text: 'fredlogan.phd' })]),
    el('li', {}, [el('a', { href: repo, rel: 'noopener', text: 'Repository' })])
  ];
  if (pagesUrl) {
    links.push(el('li', {}, [el('a', { href: pagesUrl, rel: 'noopener', text: 'Live demo' })]));
  }
  return el('footer', { class: 'exec-footer', role: 'contentinfo' }, [
    el('div', { class: 'exec-footer__inner' }, [
      el('span', { text: `${OWNER} · engineering portfolio` }),
      el('ul', { class: 'exec-footer__links' }, links)
    ])
  ]);
}

/* -------------------------------------------------------------------------- */
/* Tour                                                                       */
/* -------------------------------------------------------------------------- */

function buildTour(steps, tourBtn) {
  if (!steps.length) {
    return { start() {}, stop() {}, destroy() {} };
  }

  let index = 0;
  let open = false;
  let lastFocus = null;

  const spot = el('div', { class: 'exec-tour-spot' });
  const stepEl = el('div', { class: 'exec-tour-card__step' });
  const titleEl = el('h2', { class: 'exec-tour-card__title', id: 'exec-tour-title' });
  const bodyEl = el('p', { class: 'exec-tour-card__body' });

  const prevBtn = el('button', { type: 'button', class: 'exec-btn' }, ['Back']);
  const nextBtn = el('button', { type: 'button', class: 'exec-btn exec-btn--primary' }, ['Next']);
  const closeBtn = el('button', { type: 'button', class: 'exec-btn' }, ['Close']);

  const card = el(
    'div',
    {
      class: 'exec-tour-card',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'exec-tour-title'
    },
    [
      stepEl,
      titleEl,
      bodyEl,
      el('div', { class: 'exec-tour-card__nav' }, [
        closeBtn,
        el('span', { class: 'exec-tour-card__spacer' }),
        prevBtn,
        nextBtn
      ]),
      el('p', {
        class: 'exec-tour-card__hint',
        html:
          '<kbd>&larr;</kbd> <kbd>&rarr;</kbd> to step · <kbd>Esc</kbd> to close'
      })
    ]
  );

  const backdrop = el('div', { class: 'exec-tour-backdrop', hidden: true }, [spot, card]);
  document.body.append(backdrop);

  async function render() {
    const step = steps[index];
    stepEl.textContent = `Step ${index + 1} of ${steps.length}`;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    prevBtn.disabled = index === 0;
    nextBtn.textContent = index === steps.length - 1 ? 'Finish' : 'Next';

    if (typeof step.action === 'function') {
      try {
        await step.action();
      } catch (err) {
        // A failed demo action must never break the tour chrome.
        bodyEl.textContent = `${step.body} (step action unavailable)`;
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('Tour step action failed:', err);
        }
      }
    }
    position(step);
  }

  function position(step) {
    const target = step.selector ? document.querySelector(step.selector) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!target) {
      spot.style.display = 'none';
      card.style.left = `${Math.max(16, (vw - card.offsetWidth) / 2)}px`;
      card.style.top = `${Math.max(16, (vh - card.offsetHeight) / 2)}px`;
      return;
    }

    target.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    });

    const r = target.getBoundingClientRect();
    spot.style.display = '';
    spot.style.left = `${Math.max(4, r.left - 6)}px`;
    spot.style.top = `${Math.max(4, r.top - 6)}px`;
    spot.style.width = `${r.width + 12}px`;
    spot.style.height = `${r.height + 12}px`;

    const cw = card.offsetWidth || 360;
    const ch = card.offsetHeight || 220;
    let top = r.bottom + 16;
    if (top + ch > vh - 12) top = Math.max(12, r.top - ch - 16);
    let left = r.left;
    if (left + cw > vw - 12) left = Math.max(12, vw - cw - 12);
    card.style.left = `${Math.max(12, left)}px`;
    card.style.top = `${Math.max(12, top)}px`;
  }

  function onKeydown(event) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      stop();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      prev();
    } else if (event.key === 'Tab') {
      trapFocus(event);
    }
  }

  function trapFocus(event) {
    const nodes = [...card.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onResize() {
    if (open) position(steps[index]);
  }

  function next() {
    if (index === steps.length - 1) {
      stop();
      return;
    }
    index += 1;
    void render();
  }

  function prev() {
    if (index === 0) return;
    index -= 1;
    void render();
  }

  function start() {
    if (open) return;
    open = true;
    index = 0;
    lastFocus = document.activeElement;
    backdrop.hidden = false;
    void render().then(() => nextBtn.focus());
  }

  function stop() {
    if (!open) return;
    open = false;
    backdrop.hidden = true;
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  tourBtn.addEventListener('click', start);
  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);
  closeBtn.addEventListener('click', stop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) stop();
  });
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', onResize);

  return {
    start,
    stop,
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      window.removeEventListener('resize', onResize);
      backdrop.remove();
    }
  };
}

export default mountExecShell;
