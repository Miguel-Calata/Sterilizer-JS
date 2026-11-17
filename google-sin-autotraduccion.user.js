// ==UserScript==
// @name         Google: sin auto-traducción
// @namespace    cal.userscripts
// @version      1.0
// @description  Evita las páginas auto-traducidas de Google (*.translate.goog) y abre siempre el sitio original
// @match        *://*.translate.goog/*
// @match        *://www.google.com/*
// @match        *://www.google.com.mx/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const TR_HOST = /\.translate\.goog$/i;

  // translate.goog codifica el host así:  "-" -> "--"  y  "." -> "-"
  // "www-mi--sitio-com" -> "www.mi-sitio.com"
  const decodeHost = (label) =>
    label.replace(/--/g, '\u0000').replace(/-/g, '.').replace(/\u0000/g, '-');

  // Devuelve la URL original, o null si la URL no es una traducción
  function untranslate(raw) {
    let u;
    try { u = new URL(raw, location.href); } catch { return null; }

    // 1) Wrapper de Google: /url?q=…  (solo lo tocamos si adentro hay una traducción)
    if (/(^|\.)google\./i.test(u.hostname) && u.pathname === '/url') {
      const inner = u.searchParams.get('q') || u.searchParams.get('url');
      return inner ? untranslate(inner) : null;
    }

    // 2) Proxy actual: dominio-com.translate.goog/ruta?_x_tr_sl=en&_x_tr_tl=es…
    if (TR_HOST.test(u.hostname)) {
      const host = decodeHost(u.hostname.replace(TR_HOST, ''));
      const scheme = u.searchParams.get('_x_tr_sch') || 'https'; // sitios http traen _x_tr_sch=http
      const out = new URL(`${scheme}://${host}`);
      out.pathname = u.pathname;
      out.search = u.search;
      out.hash = u.hash;
      for (const k of [...out.searchParams.keys()]) {
        if (k.startsWith('_x_tr_')) out.searchParams.delete(k);
      }
      return out.href;
    }

    // 3) Proxy viejo: translate.google.com/translate?u=…  o  /website?u=…
    if (u.hostname === 'translate.google.com' && /^\/(translate|website)$/.test(u.pathname)) {
      return u.searchParams.get('u');
    }

    return null;
  }

  // ── A) Ya caíste en *.translate.goog → regresar al original ──────────────
  if (TR_HOST.test(location.hostname)) {
    let ref = '';
    try { ref = new URL(document.referrer).hostname; } catch {}
    // Si la traducción la pediste a mano desde translate.google.com, se respeta
    if (ref === 'translate.google.com') return;

    const orig = untranslate(location.href);
    if (orig) location.replace(orig); // replace: no deja la versión traducida en el historial
    return;
  }

  // ── B) En Google: reescribir los links antes de que los toques ───────────
  const SUSPECT = /translate\.goog|translate\.google\.|\/url\?/i;

  const fix = (a) => {
    const href = a.getAttribute('href');
    if (!href || !SUSPECT.test(href)) return;
    const orig = untranslate(a.href);
    if (orig && orig !== a.href) {
      a.href = orig;
      a.removeAttribute('ping');
    }
  };

  const scan = (root) => root.querySelectorAll?.('a[href]').forEach(fix);

  // Resultados que se cargan después (scroll infinito, "Más resultados", etc.)
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') {
        if (m.target.tagName === 'A') fix(m.target);
        continue;
      }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'A') fix(n);
        scan(n);
      }
    }
  }).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  });

  // Respaldo: si Google cambia el href justo al tocar, lo corregimos en captura
  for (const ev of ['touchstart', 'mousedown', 'click']) {
    document.addEventListener(ev, (e) => {
      const a = e.target.closest?.('a[href]');
      if (a) fix(a);
    }, { capture: true, passive: true });
  }

  document.addEventListener('DOMContentLoaded', () => scan(document));
})();
