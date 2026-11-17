// ==UserScript==
// @name         Cookie Banner Killer
// @namespace    cal.cookiekiller
// @version      1.1.0
// @description  Rechaza (o esconde) banners de cookies en cualquier sitio y libera el scroll/overlays que dejan atrás
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const DEBUG = false;               // ponlo en true para ver en consola qué hace
  const MAX_RUNTIME_MS = 20000;      // deja de observar el DOM después de 20 s
  const CLEANUP_WINDOW_MS = 4000;    // tras actuar sobre un banner, cuánto tiempo limpiamos lo que deja atrás
  const EXCLUDE_HOSTS = [            // sitios donde el script no hace nada (incluye subdominios)
    // 'mibanco.com.mx',
  ];
  const log = (...a) => DEBUG && console.log('[CBK]', ...a);

  const HOST = location.hostname;
  if (EXCLUDE_HOSTS.some(h => HOST === h || HOST.endsWith('.' + h))) return;

  // ─────────────────────────────────────────────────────────────
  // 1) Botones de "rechazar" de CMPs conocidos (prioridad: rechazar > esconder)
  // ─────────────────────────────────────────────────────────────
  const REJECT_SELECTORS = [
    '#onetrust-reject-all-handler',                 // OneTrust
    '#CybotCookiebotDialogBodyButtonDecline',       // Cookiebot
    '#didomi-notice-disagree-button',               // Didomi
    '.cky-btn-reject',                              // CookieYes
    '.cmplz-btn.cmplz-deny',                        // Complianz (WordPress)
    '.iubenda-cs-reject-btn',                       // iubenda
    '.osano-cm-denyAll',                            // Osano
    '#cn-refuse-cookie',                            // Cookie Notice (WordPress)
    '[data-tid="banner-decline"]',                  // Termly
    '.fc-cta-do-not-consent',                       // Google Funding Choices
  ];

  // CMPs que viven dentro de Shadow DOM: [host, botón dentro del shadowRoot]
  const SHADOW_REJECT = [
    ['#usercentrics-root', '[data-testid="uc-deny-all-button"]'],  // Usercentrics
  ];

  // ─────────────────────────────────────────────────────────────
  // 2) Contenedores conocidos que se esconden por CSS desde el arranque
  // ─────────────────────────────────────────────────────────────
  const HIDE_SELECTORS = [
    '#onetrust-consent-sdk', '#onetrust-banner-sdk',
    '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay',
    '#didomi-host',
    '#qc-cmp2-container', '.qc-cmp2-container',      // Quantcast
    '.cky-consent-container', '.cky-overlay',
    '#cmplz-cookiebanner-container', '.cmplz-cookiebanner',
    '#iubenda-cs-banner',
    '.osano-cm-window',
    '#cookie-notice',
    '#truste-consent-track', '.truste_box_overlay',  // TrustArc
    '#usercentrics-root',
    '.fc-consent-root',
    '.cc-window', '.cc-banner',                      // cookieconsent clásico
    '#cookie-law-info-bar', '.cli-modal-backdrop',   // CookieLawInfo
    '#moove_gdpr_cookie_info_bar',                   // GDPR Cookie Compliance
    '[id^="sp_message_container_"]',                 // Sourcepoint
  ];

  // overflow-y (no overflow) para no destapar scroll horizontal que el sitio oculta a propósito
  const CSS = `
    ${HIDE_SELECTORS.join(',\n    ')} {
      display: none !important;
      visibility: hidden !important;
    }
    html.cbk-unlock, html.cbk-unlock body {
      overflow-y: auto !important;
      touch-action: auto !important;
    }
    html.cbk-unlock body { pointer-events: auto !important; }
  `;

  // ─────────────────────────────────────────────────────────────
  // 3) Heurística genérica por texto (para sitios sin CMP conocido)
  // ─────────────────────────────────────────────────────────────
  const REJECT_TEXT = new RegExp(
    '^(' + [
      'rechazar( todo| todas| todas las cookies| cookies)?',
      'no acepto', 'solo (las )?(necesarias|esenciales)',
      'reject( all)?( cookies)?', 'decline( all)?', 'deny( all)?',
      'only (necessary|essential)( cookies)?', 'necessary only', 'do not consent',
      '(alle )?ablehnen', 'refuser( tout)?', 'tout refuser',
      'rifiuta( tutto)?', 'recusar( tudo)?',
    ].join('|') + ')$', 'i'
  );
  const BANNER_HINT = /cookie|consent|gdpr|rgpd|lgpd|\bcmp\b|privacy|privacidad/i;

  // Clases que los modales ponen en <html>/<body> para congelar la página
  const LOCK_CLASS = /^(modal-open|no-?scroll|scroll-?lock(ed)?|overflow-hidden|is-locked|is-clipped|lock-?scroll|disable-?scroll|prevent-?scroll|stop-scrolling|has-(modal|overlay))$|cookie|consent|gdpr/i;

  // Si estamos dentro del iframe de un CMP (ej. Sourcepoint), no exigimos pista en el contenedor
  const IN_CMP_FRAME = window.top !== window &&
    /privacy-mgmt|consent|cmp|cookie/i.test(location.hostname);

  // ─────────────────────────────────────────────────────────────
  const clicked = new WeakSet();
  let found = false;      // ya actuamos sobre algún banner en esta página
  let lastHit = 0;        // timestamp de la última acción (abre la ventana de limpieza)
  let cssHit = false;

  const classOf = el => (typeof el.className === 'string' ? el.className : '');

  function injectCSS() {
    if (document.getElementById('cbk-style')) return;
    const s = document.createElement('style');
    s.id = 'cbk-style';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function markHit() { found = true; lastHit = Date.now(); }

  function tryClick(el, why) {
    if (!el || clicked.has(el)) return false;
    clicked.add(el);
    log('click →', why, el);
    el.click(); // funciona aunque el elemento esté oculto con display:none
    markHit();
    return true;
  }

  function hide(el, why) {
    el.style.setProperty('display', 'none', 'important');
    el.dataset.cbkHidden = '1';
    markHit();
    log('oculto →', why, el);
  }

  // Sube por los ancestros (cruzando Shadow DOM) buscando pistas de "banner de cookies"
  function looksLikeBanner(el) {
    if (IN_CMP_FRAME) return true;
    for (let i = 0; el && i < 12; i++) {
      const sig = `${el.id || ''} ${classOf(el)} ${el.getAttribute?.('aria-label') || ''}`;
      if (BANNER_HINT.test(sig)) return true;
      if (el.getAttribute?.('role') === 'dialog' && /cookie/i.test(el.textContent || '')) return true;
      el = el.parentElement || el.getRootNode?.().host;
    }
    return false;
  }

  function knownReject() {
    let hit = false;
    for (const sel of REJECT_SELECTORS) {
      if (tryClick(document.querySelector(sel), sel)) hit = true;
    }
    for (const [host, sel] of SHADOW_REJECT) {
      const el = document.querySelector(host)?.shadowRoot?.querySelector(sel);
      if (tryClick(el, host)) hit = true;
    }
    return hit;
  }

  function genericReject() {
    const btns = document.querySelectorAll(
      'button, [role="button"], a, input[type="button"], input[type="submit"]'
    );
    for (const b of btns) {
      if (clicked.has(b)) continue;
      const t = (b.innerText || b.value || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 40) continue;
      if (REJECT_TEXT.test(t) && looksLikeBanner(b)) {
        return tryClick(b, `texto: "${t}"`);
      }
    }
    return false;
  }

  // Banners "informativos" (solo botón de Aceptar/Entendido): se esconden si son fixed/sticky
  function hideGenericFixed() {
    const cands = document.querySelectorAll(
      '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="gdpr" i],[class*="gdpr" i]'
    );
    for (const el of cands) {
      if (el === document.body || el === document.documentElement) continue;
      if (el.dataset?.cbkHidden) continue;
      const pos = getComputedStyle(el).position;
      if ((pos === 'fixed' || pos === 'sticky') && /cookie|consent|gdpr|privacidad/i.test(el.textContent || '')) {
        hide(el, 'genérico');
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4) Limpieza post-banner: lo que el modal deja atrás al esconderlo sin cerrarlo
  // ─────────────────────────────────────────────────────────────
  function unlockScroll() {
    const root = document.documentElement, body = document.body;

    for (const el of [root, body]) {
      if (!el) continue;
      for (const c of [...el.classList]) {
        if (c !== 'cbk-unlock' && LOCK_CLASS.test(c)) {
          el.classList.remove(c);
          log('clase de bloqueo quitada →', c);
        }
      }
    }

    // Patrón típico en iOS: body { position: fixed; top: -<scroll>px; width: 100% }
    if (body && getComputedStyle(body).position === 'fixed') {
      const y = Math.abs(parseFloat(body.style.top) || 0);
      for (const p of ['position', 'top', 'left', 'right', 'width']) body.style.removeProperty(p);
      if (getComputedStyle(body).position === 'fixed') body.style.setProperty('position', 'static', 'important');
      if (y) window.scrollTo(0, y);
      log('body fijo liberado (scroll restaurado a', y, ')');
    }

    // inert en el contenido principal = nada es clickeable aunque se vea
    const area = innerWidth * innerHeight;
    document.querySelectorAll('[inert]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width * r.height > area * 0.5) {
        el.removeAttribute('inert');
        log('inert quitado →', el);
      }
    });
  }

  // Fondo oscuro / capa invisible a pantalla completa que sigue tapando los clics.
  // elementFromPoint ignora pointer-events:none, así que solo encuentra capas que de verdad bloquean.
  function clearOverlay() {
    if (!document.body) return;
    const vw = innerWidth, vh = innerHeight;
    for (const [x, y] of [[vw / 2, vh / 2], [vw / 2, vh * 0.2], [vw / 2, vh * 0.8]]) {
      let top = null; // el ancestro fixed más externo del punto
      for (let n = document.elementFromPoint(x, y); n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        if (getComputedStyle(n).position === 'fixed') top = n;
      }
      if (!top || top.dataset.cbkHidden) continue;

      const r = top.getBoundingClientRect();
      if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;     // no cubre la pantalla

      // Salvaguarda: un app-shell fixed legítimo tiene mucho texto visible; un overlay casi nada
      if ((top.innerText || '').trim().length > 80) continue;

      const cs = getComputedStyle(top);
      const backdrop = cs.backdropFilter || cs.webkitBackdropFilter;
      const tinted = /rgba?\([^)]*,\s*0?\.\d+\)/.test(cs.backgroundColor) ||
                     (backdrop && backdrop !== 'none') || parseFloat(cs.opacity) < 1;
      const related = top.querySelector('[data-cbk-hidden]') || BANNER_HINT.test(`${top.id} ${classOf(top)}`);

      if (tinted || related) hide(top, 'overlay');
    }
  }

  // ─────────────────────────────────────────────────────────────
  function run() {
    knownReject();
    genericReject();
    hideGenericFixed();

    if (!cssHit && document.querySelector(HIDE_SELECTORS.join(','))) { cssHit = true; markHit(); }
    if (!found) return;

    document.documentElement.classList.add('cbk-unlock');

    // La limpieza agresiva solo corre justo después de actuar, para no tocar
    // modales que el usuario abra después (galerías, carrito, etc.)
    if (Date.now() - lastHit < CLEANUP_WINDOW_MS) {
      unlockScroll();
      clearOverlay();
      // Algunos sitios re-bloquean cambiando solo atributos (el observer no lo ve): re-chequeo
      setTimeout(schedule, 700);
    }
  }

  // Debounce para no correr en cada micro-mutación del DOM
  let timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; run(); }, 250);
  }

  function start() {
    injectCSS();
    const obs = new MutationObserver(schedule);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => { injectCSS(); schedule(); });
    window.addEventListener('load', schedule);
    setTimeout(() => { obs.disconnect(); log('observer detenido'); }, MAX_RUNTIME_MS);
    schedule();
  }

  if (document.documentElement) start();
  else document.addEventListener('readystatechange', start, { once: true });
})();
