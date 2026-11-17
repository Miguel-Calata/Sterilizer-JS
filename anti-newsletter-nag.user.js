// ==UserScript==
// @name         Anti Newsletter Nag
// @namespace    cal.anti-newsletter
// @version      1.0.0
// @description  Oculta modales y popups de suscripción a newsletters en cualquier sitio y libera el scroll que bloquean
// @match        *://*/*
// @noframes
// @run-at       document-start
// @inject-into  content
// @grant        none
// ==/UserScript==

/*
 * Oculta los modales, popups y banners que fuerzan suscribirse a newsletters.
 *
 * Dos estrategias:
 * 1) Proveedores conocidos: Substack, ConvertKit, Mailchimp, Beehiiv, Buttondown,
 *    HubSpot, ActiveCampaign, Omnisend, Klaviyo, etc. — se ocultan por selectores CSS.
 * 2) Heurística genérica: detecta modales fixed/sticky con texto de suscripción
 *    ("Suscríbete", "newsletter", "email", "stay updated", etc.) y formularios
 *    de email dentro de overlays.
 *
 * Al igual que Cookie Banner Killer y Muros de login, libera el scroll bloqueado
 * y oculta los fondos oscuros (backdrops) que quedan tras esconder el modal.
 *
 * Para ver la página original sin el script: agrega #original a la URL.
 */

(() => {
  'use strict';

  // ───────────────────────── Configuración ─────────────────────────
  const CONFIG = {
    proveedores: true,    // ocultar widgets de proveedores conocidos
    generico: true,       // detectar modales de newsletter por texto
    liberarScroll: true,  // liberar scroll bloqueado por modales
    excluir: [],          // dominios donde no correr el script
    debug: false,
  };

  const TAG = '[Anti Newsletter]';
  const log = (...a) => CONFIG.debug && console.log(TAG, ...a);
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  if (location.hash === '#original') return;

  const HOST = location.hostname;
  if (CONFIG.excluir.some((d) => HOST === d || HOST.endsWith('.' + d))) return;

  // ───────────────────────── Proveedores conocidos ─────────────────────────
  // Selectores CSS de widgets, modales y popups de newsletter por proveedor.
  // Se inyectan desde document-start para evitar parpadeo.

  const HIDE_SELECTORS = [
    // Substack — embeds, popups y formularios
    '.substack-app iframe[src*="substack.com/embed"]',
    '#substack-subscription-form',
    'form[action*="substack.com"]',

    // ConvertKit / CK Forms
    '.ck_form_container',
    '#ck_form_container',
    '.ck_form',
    'iframe[src*="ckforms.com"]',
    'iframe[src*="convertkit.com"]',

    // Mailchimp — popups, forms y overlays
    '#mc_embed_signup',
    '.mc_embed_signup',
    '#mailchimp-overlay',
    '.mailchimp-popup',
    'iframe[src*="mailchimp.com"]',
    'iframe[src*="list-manage.com"]',
    '#mc-embedded-subscribe-form',
    '.mc-autoresponders-form',

    // Beehiiv — modales y popups
    '.beehiiv-popup',
    '#beehiiv-popup',
    '[data-beehiiv]',
    'iframe[src*="beehiiv.com"]',

    // Buttondown
    'form[action*="buttondown.email"]',
    '#buttondown-embed',

    // HubSpot — portals y formularios
    '.hs-form',
    '#hs-form',
    '.hs-overlay',
    '.hs-popup',
    '[data-hs-form-portal]',

    // ActiveCampaign
    '#activecampaign-form',
    '.activecampaign-form',
    'iframe[src*="activehosted.com"]',

    // Omnisend — popups y banners
    '.omnisend-popup',
    '#omnisend-popup',
    '.omnisend-banner',

    // Klaviyo — modales y popups
    '.klaviyo-popup',
    '#klaviyo-popup',
    '.klaviyo-modal',
    'iframe[src*="klaviyo.com"]',

    // Revue
    'form[action*="revue.email"]',

    // Loops
    'iframe[src*="loops.so"]',

    // GetResponse
    '#getresponse-form',
    '.getresponse-popup',
    'iframe[src*="getresponse.com"]',

    // AWeber
    '#awber-form',
    '.awber-popup',
    'iframe[src*="aweber.com"]',

    // Drip
    'iframe[src*="dripemail.com"]',

    // Flodesk
    'iframe[src*="flodesk.com"]',

    // Sendinblue / Brevo
    'iframe[src*="sendinblue.com"]',
    'iframe[src*="brevo.com"]',

    // Campaign Monitor
    'iframe[src*="campaignmonitor.com"]',

    // MailerLite
    '.ml-form',
    'iframe[src*="mailerlite.com"]',
  ];

  // CSS base: ocultar proveedores + liberar scroll
  const CSS = `
    ${HIDE_SELECTORS.join(',\n    ')} {
      display: none !important;
    }
    html.anl-unlock, html.anl-unlock body {
      overflow: auto !important;
      overflow-y: auto !important;
      position: static !important;
      touch-action: auto !important;
    }
  `;

  // ───────────────────────── Heurística genérica ─────────────────────────
  // Patrón de texto para detectar modales de newsletter por su contenido.
  const NEWSLETTER_TEXT = /(newsletter|bolet[ií]n|suscrib(ir|e(te|te al|irte))?|suscripci[oó]n|suscr[ií]bete|stay ?updated|keep ?in ?touch|don'?t ?miss|never ?miss|join ?our|join ?the|get ?the ?(latest|news|updates)|sign ?up ?for|subscribe ?to|email ?(address|list|updates)|by ?email|weekly ?(digest|roundup|update)|monthly ?(digest|update)|direct ?to ?(your|my)|straight ?to ?(your|my) ?(inbox|email)|inbox|correo ?(electr[oó]nico|electrónico)|direcci[oó]n ?de ?correo|recibe ?(nuestras|nuestro)|env[ií]anos|enviar ?(un |una )?(correo|email)|recibir ?(noticias|actualizaciones|contenido)|inscr[ií]bete|reg[ií]strate ?para)/i;

  // Patrón para detectar inputs de email (confirma que es un formulario de suscripción)
  const EMAIL_INPUT = /type=["']?email["']?|name=["']?(email|mail|correo|user_email|subscriber_email|EMAIL|EMAIL_ADDRESS)["']?|placeholder=["']?(email|correo|mail|tu ?email|tu ?correo|your ?email|your ?mail|enter ?your|ingresa)/i;

  // Clases de bloqueo de scroll conocidas
  const BLOQUEOS = [
    'modal-open', 'noscroll', 'no-scroll', 'overflow-hidden',
    'stop-scrolling', 'ReactModal__Body--open', 'is-locked',
    'has-overlay', 'has-modal', 'newsletter-open', 'popup-open',
  ];

  // ───────────────────────── Inyección CSS ─────────────────────────
  function estilo(css) {
    const s = document.createElement('style');
    s.textContent = css;
    const poner = () => (document.head || document.documentElement).appendChild(s);
    if (document.documentElement) return poner();
    new MutationObserver((_, o) => {
      if (document.documentElement) { o.disconnect(); poner(); }
    }).observe(document, { childList: true });
  }

  // ───────────────────────── Ocultar elementos ─────────────────────────
  function ocultar(el) {
    if (!el || el.dataset.anlOculto) return;
    el.dataset.anlOculto = '1';
    el.style.setProperty('display', 'none', 'important');
    log('oculto', el);
  }

  // ───────────────────────── Liberar scroll ─────────────────────────
  function liberarScroll() {
    if (!CONFIG.liberarScroll) return;
    const html = document.documentElement;
    html.classList.add('anl-unlock');
    for (const el of [html, document.body]) {
      if (!el) continue;
      BLOQUEOS.forEach((c) => el.classList.remove(c));
      if (el.style.overflow === 'hidden') el.style.overflow = '';
      if (el.style.overflowY === 'hidden') el.style.overflowY = '';
      if (el.style.position === 'fixed') el.style.position = '';
    }
    // Quitar atributo inert que bloquea interacción
    for (const el of document.querySelectorAll('[inert]')) {
      const r = el.getBoundingClientRect();
      const area = innerWidth * innerHeight;
      if (r.width * r.height > area * 0.5) {
        el.removeAttribute('inert');
        log('inert quitado', el);
      }
    }
  }

  // ───────────────────────── Cerrar <dialog> nativos ─────────────────────────
  function cerrarDialogos(nodo, prof = 0) {
    if (!nodo || prof > 8) return;
    for (const d of nodo.querySelectorAll?.('dialog') || []) {
      safe(() => d.open && d.close());
      d.removeAttribute('open');
    }
    for (const el of nodo.querySelectorAll?.('*') || []) {
      if (el.shadowRoot) cerrarDialogos(el.shadowRoot, prof + 1);
    }
    if (nodo.shadowRoot) cerrarDialogos(nodo.shadowRoot, prof + 1);
  }

  // ───────────────────────── Heurística genérica ─────────────────────────
  function nagGenerico() {
    if (!CONFIG.generico) return 0;
    let n = 0;
    const vh = innerHeight;
    const vw = innerWidth;

    // Candidatos: hijos directos de body, diálogos y elementos con aria-modal
    const cands = document.querySelectorAll(
      'body > *, body > * > *, body > * > * > *, [role="dialog"], [aria-modal="true"], dialog[open]'
    );

    for (const el of cands) {
      if (!el.isConnected || el.dataset.anlOculto) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;

      // Debe ser fixed/sticky o un diálogo
      const esDialogo = el.matches('[role="dialog"], [aria-modal="true"], dialog');
      if (!esDialogo && !/fixed|sticky/.test(cs.position)) continue;

      // Geometría: debe ser grande o una barra inferior
      const r = el.getBoundingClientRect();
      if (!esDialogo) {
        // No tocar la barra de navegación superior
        const cabecera = r.top <= 0 && r.height < 130;
        const grande = r.height >= vh * 0.25;
        const barraInferior = r.bottom >= vh - 4 && r.height >= 50;
        if (cabecera || !(grande || barraInferior)) continue;
      }

      // Verificar que contiene texto de newsletter
      const txt = (el.innerText || '').trim();
      if (!txt || txt.length > 1500) continue;
      if (!NEWSLETTER_TEXT.test(txt)) continue;

      // Confirmar con input de email (salvaguarda contra falsos positivos)
      const tieneEmail = safe(() => {
        const inputs = el.querySelectorAll('input');
        for (const inp of inputs) {
          const attrs = `${inp.type} ${inp.name || ''} ${inp.placeholder || ''} ${inp.getAttribute('type') || ''}`;
          if (EMAIL_INPUT.test(attrs)) return true;
        }
        // Si no hay input, verificar si el HTML contiene un formulario de email
        return EMAIL_INPUT.test(el.innerHTML);
      }) || false;

      // Si no tiene input de email, verificar si el texto es muy claro
      const textoMuyClaro = (txt.match(NEWSLETTER_TEXT) || []).length >= 2;

      if (!tieneEmail && !textoMuyClaro) continue;

      // Cerrar diálogos nativos antes de ocultar
      cerrarDialogos(el);
      ocultar(el);
      n++;
      log('nag genérico oculto', el);
    }

    // Ocultar backdrops oscuros que quedan tras esconder el modal
    if (n) {
      for (const el of document.querySelectorAll('body > div, body > div > div')) {
        if (el.dataset.anlOculto) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        // Un backdrop es: fixed, casi pantalla completa, sin texto, con fondo oscuro o blur
        if (cs.position !== 'fixed') continue;
        if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
        const txt = (el.innerText || '').trim();
        if (txt.length > 20) continue; // no es un backdrop, tiene contenido
        const bg = cs.backgroundColor;
        const backdrop = cs.backdropFilter || cs.webkitBackdropFilter;
        const esBackdrop = /rgba?\([^)]*,\s*0?\.\d+\)/.test(bg) ||
                           (backdrop && backdrop !== 'none') ||
                           parseFloat(cs.opacity) < 1 ||
                           bg === 'rgb(0, 0, 0)' || bg === 'rgb(0,0,0)';
        if (esBackdrop) ocultar(el);
      }
    }

    return n;
  }

  // ───────────────────────── Barrido de iframes embebidos ─────────────────────────
  // Algunos sitios embeben formularios de newsletter en iframes.
  // Los ocultamos si el src coincide con un proveedor conocido.
  function ocultarIframes() {
    const proveedores = [
      'substack.com/embed', 'ckforms.com', 'convertkit.com',
      'mailchimp.com', 'list-manage.com', 'beehiiv.com',
      'activehosted.com', 'klaviyo.com', 'getresponse.com',
      'aweber.com', 'dripemail.com', 'flodesk.com',
      'sendinblue.com', 'brevo.com', 'campaignmonitor.com',
      'mailerlite.com', 'loops.so',
    ];
    for (const iframe of document.querySelectorAll('iframe')) {
      if (iframe.dataset.anlOculto) continue;
      const src = iframe.src || '';
      for (const p of proveedores) {
        if (src.includes(p)) {
          ocultar(iframe);
          // También ocultar el contenedor padre si es un wrapper vacío
          const padre = iframe.parentElement;
          if (padre && (padre.children.length === 1) && !padre.dataset.anlOculto) {
            const cs = getComputedStyle(padre);
            if (/fixed|sticky/.test(cs.position)) ocultar(padre);
          }
          log('iframe oculto', src);
          break;
        }
      }
    }
  }

  // ───────────────────────── Arranque ─────────────────────────
  estilo(CSS);

  function barrer() {
    if (!document.body) return;
    let actuado = false;

    if (CONFIG.generico) {
      const n = nagGenerico();
      if (n) actuado = true;
    }

    ocultarIframes();

    // Si se ocultó algo, liberar scroll
    if (actuado || document.querySelector('[data-anl-oculto]')) liberarScroll();
  }

  // MutationObserver con debounce para DOM dinámico
  let timer;
  const obs = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(barrer, 250);
  });
  obs.observe(document, { childList: true, subtree: true });

  // Barrido inicial y al cargar
  barrer();
  document.addEventListener('DOMContentLoaded', barrer);
  window.addEventListener('load', barrer);

  // Desconectar observer después de 30 segundos para no consumir recursos
  setTimeout(() => { obs.disconnect(); log('observer detenido'); }, 30000);
})();
