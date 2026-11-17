// ==UserScript==
// @name         Muros de login
// @namespace    cal.muros-de-login
// @version      1.1.1
// @description  Quita el popup "Acceder con Google" (One Tap) en todos lados, y muros de login, "abre la app" y nags de registro en Reddit, Quora, Pinterest, LinkedIn, Threads, Medium, Glassdoor, Tumblr, Twitch y sitios educativos
// @match        *://*/*
// @noframes
// @run-at       document-start
// @inject-into  content
// @grant        none
// ==/UserScript==

/*
 * En TODOS los sitios: esconde el popup de Google One Tap ("Acceder a X con Google").
 * El botón normal de "Iniciar sesión con Google" no se toca: si quieres entrar, sigue ahí.
 *
 * Los módulos de muros solo corren en sus sitios (un dueño por dominio):
 *  - TikTok/IG/FB/X → Redes sin fricción · YouTube → Anti Shorts · cookies → Cookie Banner Killer
 *  - Paywalls de periódicos → Muros de pago (que aquí solo pone el botón de "versión abierta")
 *
 * Qué NO hace: desbloquear contenido de pago (páginas premium de Scribd/Studocu,
 * Quizlet Plus, Brainly Plus, reseñas que Glassdoor ya manda truncadas). Solo nags
 * de login/registro y de "abre la app" sobre contenido gratuito.
 *
 * Para ver la página original sin el script: agrega #original a la URL.
 */

(() => {
  'use strict';

  // ───────────────────────── Configuración ─────────────────────────
  const CONFIG = {
    bloquearOneTap: true,  // popup de Google "Acceder con Google" en cualquier sitio

    modulos: {
      reddit: true, quora: true, pinterest: true, linkedin: true, threads: true, medium: true,
      glassdoor: true, tumblr: true, twitch: true, quizlet: true, brainly: true,
      researchgate: true, academia: true, scribd: true, studocu: true,
    },
    nagGenerico: true,     // detecta modales/barras de "inicia sesión" o "abre la app" por su texto
    bloquearApps: true,    // bloquea saltos a la App Store y a esquemas de apps

    // Opciones sensibles: apagadas por defecto
    reddit: { aceptarMas18: false, mostrarNSFW: false },  // pulsa "Sí, soy mayor de 18" / "Ver NSFW"
    twitch: { aceptarAvisoContenido: false },             // pulsa "Empezar a ver" en el aviso de contenido
    brainly: { reiniciarContador: false },                // borra el contador de respuestas de invitado

    // Servicios de terceros: apagados
    // Medium "member-only". Formato: <base> + URL completa del artículo.
    // freedium.cfd dejó de funcionar (dic. 2025); el espejo vigente es freedium-mirror.cfd.
    terceros: { freedium: false, freediumBase: 'https://freedium-mirror.cfd/' },

    debug: false,
  };

  const TAG = '[Muros de login]';
  const log = (...a) => CONFIG.debug && console.log(TAG, ...a);
  if (location.hash === '#original') return;

  const HOST = location.hostname;
  const safe = (fn) => { try { return fn(); } catch { return null; } };

  // ───────────────────────── Módulos por sitio ─────────────────────────
  // css: desde el arranque · contenido: lo que NUNCA se debe esconder · barrer: lógica propia
  const MODULOS = {
    reddit: {
      host: /(^|\.)reddit\.com$/,
      // Selectores capturados en sept. 2026 (proyecto Threadbare). Reddit los cambia ~cada mes.
      contenido: 'shreddit-post, shreddit-player, shreddit-blurred-container, [slot="post-media-container"], [slot="text-body"], shreddit-comment, [slot="revealed"]',
      css: () => {
        const G = ':not(:has(shreddit-post, shreddit-player, shreddit-blurred-container, [slot="post-media-container"], [slot="revealed"]))';
        return `
          configured-xpromo-modal${G}, rpl-dialog[dialog-classname*="configured-xpromo"]${G},
          rpl-bottom-sheet[dialog-classname*="configured-xpromo"]${G}, [dialog-id^="configured-xpromo"]${G},
          [id^="configured-xpromo"]${G}, shreddit-async-loader[paint-group="xpromo"]${G},
          xpromo-bottom-sheet, xpromo-bottom-bar, xpromo-app-selector, smart-banner,
          xpromo-nsfw-blocking-container${G}, #xpromo-bottom-sheet, #blocking-modal, #nsfw-qr-dialog,
          [id*="xpromo_nsfw_blocking"]${G}, shreddit-async-loader[bundlename*="xpromo"]${G},
          shreddit-async-loader[bundlename="app_selector"], shreddit-async-loader[bundlename="top_button"],
          shreddit-async-loader[bundlename="bottom_bar_xpromo"],
          .XPromoPopupRpl, .XPromoBottomBar, .TopNav__useAppButton, li.TopNav__promoButton, #get-app,
          body > div[style*="backdrop-filter"], div[style*="position: fixed"][style*="backdrop-filter"]
          { display: none !important; }
          html, body, body.rpl-scroll-lock, body.scroll-disabled {
            overflow-y: auto !important; position: static !important; touch-action: auto !important; }`;
      },
      barrer: barrerReddit,
    },
    quora: {
      host: /(^|\.)quora\.com$/,
      css: () => `
        .signup_wall_prevent_scroll, .signup_wall_prevent_scroll body { overflow: auto !important; }
        .signup_wall_prevent_scroll #root { filter: none !important; pointer-events: auto !important; }
        ._DialogSignupForm, .BaseSignupForm, body [class*="signup_wall" i]:not(body):not(#root) { display: none !important; }`,
      barrer: () => document.documentElement.classList.remove('signup_wall_prevent_scroll'),
    },
    pinterest: {
      host: /(^|\.)pinterest\.[a-z.]+$/,
      css: () => `
        [data-test-id="fullPageSignupModal"], [data-test-id="signup-modal"], [data-test-id="giftWrap"],
        [data-test-id="bottom-right-upsell"], [data-test-id="mweb-unauth-upsell"] { display: none !important; }`,
    },
    linkedin: {
      host: /(^|\.)linkedin\.com$/,
      // El /authwall es una redirección del servidor: ahí no hay nada que esconder.
      css: () => `
        #base-contextual-sign-in-modal, .contextual-sign-in-modal, .sign-in-modal,
        [data-tracking-control-name*="contextual-sign-in-modal"], .modal__overlay--visible:has(.sign-in-modal, .contextual-sign-in-modal)
        { display: none !important; }`,
    },
    threads: { host: /(^|\.)threads\.(net|com)$/ },
    medium: {
      host: /(^|\.)medium\.com$/,
      barrer: barrerMedium,
    },
    glassdoor: {
      host: /(^|\.)glassdoor\.[a-z.]+$/,
      css: () => `
        #HardsellOverlay, .hardsellOverlay, [id*="Hardsell" i], [class*="hardsell" i],
        #ContentWallHardsell, [data-test="authModalContainer"] { display: none !important; }`,
    },
    tumblr: { host: /(^|\.)tumblr\.com$/ },
    twitch: {
      host: /(^|\.)twitch\.tv$/,
      barrer: barrerTwitch,
    },
    quizlet: { host: /(^|\.)quizlet\.com$/ },
    brainly: {
      host: /(^|\.)brainly\.[a-z.]+$/,
      inicio: inicioBrainly,
      barrer: barrerBrainly,
    },
    researchgate: { host: /(^|\.)researchgate\.net$/ },
    academia: { host: /(^|\.)academia\.edu$/ },
    scribd: { host: /(^|\.)(scribd\.com|slideshare\.net)$/ },
    studocu: { host: /(^|\.)studocu\.com$/ },
  };

  // ───────────────────────── Google One Tap (todos los sitios) ─────────────────────────
  // One Tap = iframe de accounts.google.com/gsi/iframe/select dentro de #credential_picker_container
  // (escritorio) o #credential_picker_iframe (hoja inferior en móvil). El botón normal de
  // "Iniciar sesión con Google" es otro iframe (/gsi/button) y se deja en paz.
  if (CONFIG.bloquearOneTap && !/(^|\.)google\.[a-z.]+$/.test(HOST)) {
    estilo(`
      #credential_picker_container, #credential_picker_iframe,
      iframe[src*="accounts.google.com/gsi/iframe/select"],
      div:has(> iframe[src*="accounts.google.com/gsi/iframe/select"]) { display: none !important; }`);
  }

  const [ID, MOD] = Object.entries(MODULOS).find(([, m]) => m.host.test(HOST)) || [];
  if (!MOD || !CONFIG.modulos[ID]) return;   // fuera de sus sitios, solo One Tap
  log('módulo', ID);

  // ───────────────────────── Núcleo común ─────────────────────────
  const NAG = /(log ?in|sign ?(up|in)|create (an |a free |your )?account|join (now|for free|today|\w+ for free)|continue with (google|apple|facebook|email)|open (in |the )*app|get the app|use the app|download the app|view in app|continue in app|see more on|inici(ar|a) sesi[oó]n|reg[ií]str(ate|arse)|crea(r)? (una |tu )?cuenta|[uú]nete( gratis)?|contin[uú]a con (google|apple|facebook)|abr(ir|e) (en |la )*(app|aplicaci[oó]n)|descarga(r)? la (app|aplicaci[oó]n)|ver en la app|usa(r)? la app)/i;
  const BLOQUEOS = ['rpl-scroll-lock', 'scroll-disabled', 'signup_wall_prevent_scroll', 'overflow-hidden',
    'modal-open', 'noscroll', 'no-scroll', 'ReactModal__Body--open', 'stop-scrolling'];

  const CSS_BASE = `
    html.mdl-unlock, html.mdl-unlock body { overflow: auto !important; overflow-y: auto !important; touch-action: auto !important; }
    html.mdl-unlock body { position: static !important; }
    .mdl-sin-blur { filter: none !important; -webkit-filter: none !important; pointer-events: auto !important; }
    #mdl-ui { position: fixed; right: 12px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 2147483646; }
    #mdl-ui a { display: block; padding: 9px 14px; border-radius: 999px; background: #1c1c1e; color: #fff;
      font: 600 14px/1.2 -apple-system, system-ui, sans-serif; text-decoration: none; box-shadow: 0 4px 14px #0005; }`;

  function estilo(css) {
    const s = document.createElement('style');
    s.textContent = css;
    const poner = () => (document.head || document.documentElement).appendChild(s);
    if (document.documentElement) return poner();
    // En document-start a veces todavía no existe <html>
    new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); poner(); } })
      .observe(document, { childList: true });
  }

  function liberarScroll() {
    const html = document.documentElement;
    html.classList.add('mdl-unlock');
    for (const el of [html, document.body]) {
      if (!el) continue;
      BLOQUEOS.forEach((c) => el.classList.remove(c));
      if (el.style.overflow === 'hidden') el.style.overflow = '';
      if (el.style.overflowY === 'hidden') el.style.overflowY = '';
      if (el.style.position === 'fixed') el.style.position = '';
    }
    // Contenido borroso detrás del muro
    for (const el of [document.body, ...(document.body?.children || [])]) {
      if (el && /blur/.test(getComputedStyle(el).filter)) el.classList.add('mdl-sin-blur');
    }
  }

  // Cierra <dialog> nativos (showModal deja la página inerte aunque se escondan), cruzando shadow roots
  function cerrarDialogos(nodo, prof = 0) {
    if (!nodo || prof > 8) return;
    for (const d of nodo.querySelectorAll?.('dialog') || []) {
      safe(() => d.open && d.close());
      d.removeAttribute('open');
    }
    for (const el of nodo.querySelectorAll?.('*') || []) if (el.shadowRoot) cerrarDialogos(el.shadowRoot, prof + 1);
    if (nodo.shadowRoot) cerrarDialogos(nodo.shadowRoot, prof + 1);
  }

  const guardaContenido = (el) => !!(MOD.contenido && safe(() => el.querySelector(MOD.contenido)));

  function ocultar(el) {
    cerrarDialogos(el);
    el.dataset.mdlOculto = '1';
    el.style.setProperty('display', 'none', 'important');
  }

  // Modales/barras de login o "abre la app", detectados por texto y geometría
  function nagGenerico() {
    let n = 0;
    const vh = innerHeight;
    const cands = document.querySelectorAll(
      'body > *, body > * > *, body > * > * > *, body > * > * > * > *, [role="dialog"], [aria-modal="true"], dialog[open]');
    for (const el of cands) {
      if (!el.isConnected || el.dataset.mdlOculto || el.id === 'mdl-ui') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      const dialogo = el.matches('[role="dialog"], [aria-modal="true"], dialog');
      if (!dialogo && !/fixed|sticky/.test(cs.position)) continue;
      const r = el.getBoundingClientRect();
      if (!dialogo) {
        const cabecera = r.top <= 0 && r.height < 130;                 // la barra de arriba con "Log in" se queda
        const grande = r.height >= vh * 0.3;
        const barraInferior = r.bottom >= vh - 4 && r.height >= 50;
        if (cabecera || !(grande || barraInferior)) continue;
      }
      const txt = (el.innerText || '').trim();
      if (!txt || txt.length > 800 || !NAG.test(txt)) continue;
      if (guardaContenido(el)) { cerrarDialogos(el); continue; }      // nunca llevarse el contenido
      ocultar(el);
      n++;
      log('nag oculto', el);
    }
    // Fondos oscuros a pantalla completa que quedan sin modal
    if (n) {
      for (const el of document.querySelectorAll('body > div, body > div > div')) {
        if (el.dataset.mdlOculto || (el.innerText || '').trim()) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.position === 'fixed' && r.width >= innerWidth * 0.9 && r.height >= vh * 0.9) ocultar(el);
      }
    }
    return n;
  }

  // Smart App Banner + saltos a la App Store / esquemas de apps
  function guardiaApps() {
    const APP = /^(reddit|pinterest|quora|linkedin|tumblr|twitch|glassdoor|medium|quizlet|brainly|barcelona|threads|scribd|itms(-apps|-appss)?|intent):|\/\/(apps|itunes)\.apple\.com|onelink\.me|\.app\.link|app\.adjust\.com|\.page\.link/i;
    const BOTON_APP = /^(open|get|use|download|view|continue|abrir|abre|descargar?|usar|ver|continuar)\b.{0,20}\b(app|aplicaci[oó]n)\b/i;
    window.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      const a = e.target.closest('a[href]');
      const b = e.target.closest('button, [role="button"], a');
      const txt = (b?.innerText || '').trim();
      if ((a && APP.test(a.href)) || (txt && txt.length < 40 && BOTON_APP.test(txt))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        log('salto a app bloqueado', a?.href || txt);
      }
    }, true);
    window.navigation?.addEventListener('navigate', (e) => {
      if (e.cancelable && APP.test(e.destination.url)) e.preventDefault();
    });
    return () => {
      document.querySelectorAll('meta[name="apple-itunes-app"]').forEach((m) => m.remove());
      document.querySelectorAll('iframe[src]').forEach((f) => { if (APP.test(f.src)) f.remove(); });
    };
  }

  // ───────────────────────── Reddit ─────────────────────────
  function barrerReddit() {
    // 18+ (opcional): pulsar el propio botón de Reddit; máx. 2 veces por sesión
    if (CONFIG.reddit.aceptarMas18) {
      const n = +safe(() => sessionStorage.getItem('mdl-18')) || 0;
      const btn = buscarEnShadow(document, (r) => r.querySelector('ac-set-cookie[name="over18"]')?.closest('button, a'));
      if (btn && n < 2) {
        safe(() => sessionStorage.setItem('mdl-18', String(n + 1)));
        btn.click();
        return;
      }
    }
    for (const h of document.querySelectorAll('[dialog-classname*="configured-xpromo"], [id^="configured-xpromo"], xpromo-nsfw-blocking-container')) {
      cerrarDialogos(h);
      if (h.shadowRoot) h.shadowRoot.querySelectorAll('.prompt').forEach((p) => p.remove());
      if (!guardaContenido(h)) h.remove();
    }
    for (const d of document.querySelectorAll('div[style]')) {
      if ((d.style.backdropFilter || d.style.webkitBackdropFilter) && d.style.position === 'fixed') d.remove();
    }
    // NSFW (opcional): pulsar "Ver contenido" del propio componente
    if (CONFIG.reddit.mostrarNSFW) {
      for (const h of document.querySelectorAll('shreddit-blurred-container:not([data-mdl-visto])')) {
        const b = h.shadowRoot?.querySelector('.overlay button, button');
        if (b) { h.dataset.mdlVisto = '1'; b.click(); }
      }
    }
  }

  function buscarEnShadow(nodo, fn, prof = 0) {
    if (!nodo || prof > 8) return null;
    const r = safe(() => fn(nodo));
    if (r) return r;
    for (const el of nodo.querySelectorAll?.('*') || []) {
      if (el.shadowRoot) {
        const x = buscarEnShadow(el.shadowRoot, fn, prof + 1);
        if (x) return x;
      }
    }
    return null;
  }

  // ───────────────────────── Medium ─────────────────────────
  function barrerMedium() {
    if (!CONFIG.terceros.freedium || document.getElementById('mdl-ui')) return;
    // Historias "Member-only": sin sesión Medium solo manda los primeros párrafos (paywall de servidor)
    const soloMiembros = /member-only story|create an account to read/i.test(document.body.innerText)
      || [...document.querySelectorAll('script[type="application/ld+json"]')]
        .some((s) => /"isAccessibleForFree"\s*:\s*"?false/i.test(s.textContent));
    if (!soloMiembros) return;
    const ui = document.createElement('div');
    ui.id = 'mdl-ui';
    const a = document.createElement('a');
    a.href = CONFIG.terceros.freediumBase + location.href.split('#')[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = '📖 Abrir en Freedium';
    ui.appendChild(a);
    document.body.appendChild(ui);
  }

  // ───────────────────────── Twitch ─────────────────────────
  function barrerTwitch() {
    if (!CONFIG.twitch.aceptarAvisoContenido) return;
    const b = document.querySelector(
      '[data-a-target="content-classification-gate-overlay-start-watching-button"], [data-a-target="player-overlay-mature-accept"]');
    if (b && !b.dataset.mdlVisto) { b.dataset.mdlVisto = '1'; b.click(); }
  }

  // ───────────────────────── Brainly ─────────────────────────
  const BRAINLY_CLAVES = ['social-qa/telemetry', 'flexible-funnel-cycle-data'];
  function inicioBrainly() {
    if (!CONFIG.brainly.reiniciarContador) return;
    BRAINLY_CLAVES.forEach((k) => safe(() => localStorage.removeItem(k)));
  }
  function barrerBrainly() {
    if (!CONFIG.brainly.reiniciarContador) return;
    if (!document.querySelector('[data-testid="answer_blockade_adapter"]')) return;
    const clave = 'mdl-brainly-' + location.pathname;
    if (safe(() => sessionStorage.getItem(clave))) return;          // una recarga por página, no un bucle
    safe(() => sessionStorage.setItem(clave, '1'));
    BRAINLY_CLAVES.forEach((k) => safe(() => localStorage.removeItem(k)));
    location.reload();
  }

  // ───────────────────────── Arranque ─────────────────────────
  MOD.inicio?.();
  estilo(CSS_BASE);
  if (MOD.css) estilo(MOD.css());
  const limpiarApps = CONFIG.bloquearApps ? guardiaApps() : null;

  function barrer() {
    if (!document.body) return;
    limpiarApps?.();
    safe(() => MOD.barrer?.());
    const n = CONFIG.nagGenerico ? nagGenerico() : 0;
    const oculto = n || document.querySelector('[data-mdl-oculto]')
      || (MOD.css && safe(() => document.querySelector('[class*="signup_wall" i], #HardsellOverlay, .contextual-sign-in-modal')));
    if (oculto || ID === 'reddit') liberarScroll();
  }

  let t;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(barrer, 250); })
    .observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open'] });
  // Algunos muros salen al hacer scroll aunque el DOM no cambie
  addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(barrer, 400); }, { passive: true });
})();
