// ==UserScript==
// @name         Redes sin fricción
// @description  TikTok, Instagram, Facebook y X: videos directos, sin muros de login ni banners de "abre la app"
// @version      1.3
// @match        https://*.tiktok.com/*
// @match        https://*.instagram.com/*
// @match        https://instagram.com/*
// @match        https://*.facebook.com/*
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @grant        GM.xmlHttpRequest
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  // ───────────────────────── Configuración ─────────────────────────
  const CONFIG = {
    autoVideo: true,                  // un solo video → abrirlo directo en el player nativo de Safari
    tiktokAutoplay: false,            // false: tocas ▶ y suena | true: arranca solo, pero Safari lo silencia (toca para activar el audio)
    tiktokModo: 'player',             // 'player': reproductor embebido oficial (recomendado) | 'limpiar': la web normal sin muros | 'extraer': sacar el .mp4
    tiktokOrden: ['propio', 'tikwm'], // (modo 'extraer') si 'propio' da 403 al reproducir, invierte el orden
    bloquearApps: true,               // bloquear redirecciones a la App Store y a esquemas de apps
    usarTikwm: true,                  // fallback de TikTok (servicio de terceros)
    usarFxtwitter: true,              // X vía api.fxtwitter.com (servicio de terceros)
    limpiarNags: true,                // quitar muros de login, "abre la app" y Smart App Banner
  };
  // Para ver la página original sin que el script intervenga: agrega #original a la URL.

  const ORIGINAL = location.hash === '#original';
  const HOST = location.hostname;

  if (CONFIG.limpiarNags) antiNag();
  if (CONFIG.bloquearApps) guardiaApps();

  const handler = [
    [/^(www|m|vm|vt)\.tiktok\.com$/, tiktok],
    [/^(www\.)?instagram\.com$/, instagram],
    [/^(www|m|web)\.facebook\.com$/, facebook],
    [/^(x\.com|twitter\.com|mobile\.twitter\.com)$/, xtwitter],
  ].find(([re]) => re.test(HOST))?.[1];

  if (handler && !ORIGINAL) correr(handler);

  async function correr(fn) {
    try {
      const r = await fn();
      if (!r) return;                         // no aplica: la página sigue normal
      if (r.redirect) return location.replace(r.redirect);
      mostrar(r);
    } catch (e) {
      pintar(`<p>No se pudo: ${esc(e.message)}</p>${linkOriginal()}`);
    }
  }

  // ───────────────────────── TikTok ─────────────────────────
  async function tiktok() {
    estilo(cssTikTok());
    if (location.pathname.startsWith('/player/v1/')) { sonidoAlTocar(); return null; }
    const id = location.pathname.match(/\/(?:video|photo|v)\/(\d+)/)?.[1];
    const corto = /^(vm|vt)\./.test(HOST) || location.pathname.startsWith('/t/');
    if (!id && !corto) return null;           // home, perfiles, etc.

    // Modo 'player': la página de video móvil dice "no disponible, usa la app";
    // el reproductor embebido oficial (/player/v1/ID) carga sin app ni sesión.
    if (CONFIG.tiktokModo === 'player') {
      if (!id) return null;                   // link corto: TikTok redirige a /video/ID y ahí entramos
      const params = (CONFIG.tiktokAutoplay ? 'autoplay=1&' : '') + 'description=1&music_info=1&rel=0&loop=0&native_context_menu=1';
      return { redirect: `https://www.tiktok.com/player/v1/${id}?${params}` };
    }

    if (CONFIG.tiktokModo !== 'extraer') return null; // modo 'limpiar': la página carga normal

    detener();                                // no cargar la web app ni su anti-bot
    const errores = [];
    for (const fuente of CONFIG.tiktokOrden) {
      try {
        const r = fuente === 'propio'
          ? id && await tiktokPropio()
          : CONFIG.usarTikwm && await tiktokTikwm();
        if (r) return r;
        errores.push(`${fuente}: sin datos`);
      } catch (e) {
        errores.push(`${fuente}: ${e.message}`);
      }
    }
    throw new Error(errores.join(' · '));
  }

  // Safari solo deja arrancar videos solos si van sin sonido. Un script no puede activar el audio
  // por su cuenta, pero dentro de un toque tuyo sí: el primer toque en el reproductor lo desmutea.
  function sonidoAlTocar() {
    const activar = () => {
      for (const v of document.querySelectorAll('video')) {
        v.muted = false;
        if (v.volume === 0) v.volume = 1;
      }
    };
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(ev, function una() {
        setTimeout(activar, 0);                 // después de que el reproductor procese el toque
        if (document.querySelector('video')) window.removeEventListener(ev, una, true);
      }, true);
    }
  }

  // Componentes de TikTok que suelen ser banners/modales de "abre la app" o login.
  // Son coincidencias por nombre de clase: ajústalas con el inspector si TikTok las cambia.
  function cssTikTok() {
    return `
      [class*="OpenApp" i], [class*="DownloadApp" i], [class*="AppBanner" i],
      [class*="GuideBanner" i], [class*="LoginModal" i], [class*="LoginContainer" i] {
        display: none !important;
      }`;
  }

  // Plan A: el JSON que TikTok incrusta en su propio HTML
  async function tiktokPropio() {
    try {
      const html = await fetch(location.pathname, { credentials: 'include' }).then(r => r.text());
      const raw = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s)?.[1];
      const item = JSON.parse(raw).__DEFAULT_SCOPE__['webapp.video-detail']?.itemInfo?.itemStruct;
      if (!item) return null;
      const imgs = item.imagePost?.images?.map(i => i.imageURL?.urlList?.[0]).filter(Boolean) ?? [];
      const play = item.video?.playAddr;
      if (!imgs.length && !play) return null;
      return {
        autor: item.author?.uniqueId ? '@' + item.author.uniqueId : '',
        texto: item.desc,
        videos: imgs.length ? [] : [{ url: play, thumb: item.video?.cover }],
        imagenes: imgs,
      };
    } catch {
      return null;                            // overload-protect, HTML cambiado, etc.
    }
  }

  // Plan B: tikwm resuelve el link desde sus servidores
  async function tiktokTikwm() {
    const j = await gmJSON('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: `url=${encodeURIComponent(location.href.split('#')[0])}&hd=1`,
    });
    const d = j.data;
    if (!d) throw new Error(j.msg || 'sin datos');
    const abs = u => (u?.startsWith('/') ? 'https://www.tikwm.com' + u : u);
    return {
      autor: d.author?.unique_id ? '@' + d.author.unique_id : '',
      texto: d.title,
      videos: d.images?.length ? [] : [{ url: abs(d.hdplay || d.play), thumb: abs(d.cover) }],
      imagenes: d.images ?? [],
    };
  }

  // ───────────────────────── Instagram ─────────────────────────
  async function instagram() {
    if (location.pathname.includes('/embed')) return null;
    const code = location.pathname.match(/^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/)?.[1];
    if (!code) return null;

    detener();
    const embed = `${location.origin}/p/${code}/embed/captioned/`;
    try {
      const html = await fetch(embed, { credentials: 'include' }).then(r => r.text());
      const video = buscarURL(html, ['video_url']);
      if (video) return { videos: [{ url: video, thumb: buscarURL(html, ['display_url']) }] };
    } catch { /* cae al embed */ }
    return { redirect: embed };               // fotos/carruseles: la vista embed pública
  }

  // ───────────────────────── Facebook ─────────────────────────
  // No detiene la página: busca el video en el HTML ya cargado.
  async function facebook() {
    const esVideo = /\/(videos|reel|watch|share\/[vr])(\/|$)/.test(location.pathname)
      || new URLSearchParams(location.search).has('v');
    if (!esVideo) return null;

    await listo();
    const claves = ['browser_native_hd_url', 'playable_url_quality_hd', 'browser_native_sd_url', 'playable_url'];
    let url = buscarURL(document.documentElement.innerHTML, claves);
    if (!url) {
      try {
        const html = await fetch(location.href, { credentials: 'include' }).then(r => r.text());
        url = buscarURL(html, claves);
      } catch { /* nada */ }
    }
    if (!url) return null;
    if (CONFIG.autoVideo) return { redirect: url };
    boton(url);
    return null;
  }

  // ───────────────────────── X / Twitter ─────────────────────────
  async function xtwitter() {
    const m = location.pathname.match(/^\/(\w+)\/status(?:es)?\/(\d+)/);
    if (!m || !CONFIG.usarFxtwitter) return null;

    detener();
    const j = await gmJSON(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`);
    const t = j.tweet;
    if (!t) throw new Error(j.message || 'post no disponible');
    return {
      autor: `${t.author?.name ?? ''} (@${t.author?.screen_name ?? m[1]})`,
      texto: t.text,
      videos: (t.media?.videos ?? []).map(v => ({ url: v.url, thumb: v.thumbnail_url })),
      imagenes: (t.media?.photos ?? []).map(p => p.url),
    };
  }

  // ───────────────────────── Anti-nag ─────────────────────────
  // Quita capas fijas (modales, barras) cuyo texto es un muro de login o "abre la app".
  function antiNag() {
    const NAG = /(log ?in|sign ?(up|in)|open (in |the )*(app|tiktok)|get the app|use the app|download the app|watch (it )?(on|in) the app|see more on|inici(ar|a) sesi[oó]n|reg[ií]strate|abr(ir|e) (en |la )*(app|aplicaci[oó]n|tiktok)|descarga(r)? la (app|aplicaci[oó]n)|ver (en|más en) la (app|aplicaci[oó]n)|ver m[aá]s en)/i;
    const PROFUNDIDAD = 'body > *, body > * > *, body > * > * > *, body > * > * > * > *';

    const esCapa = el => ['fixed', 'sticky'].includes(getComputedStyle(el).position);
    const esNag = el => {
      if (el.closest('#sf-root, [data-sf-oculto]')) return false;
      const txt = el.innerText || '';
      return txt.length > 0 && txt.length < 600 && NAG.test(txt);
    };
    const capaDe = el => {                    // la capa fija más alta que contiene al elemento
      let top = null;
      for (let n = el; n && n !== document.body; n = n.parentElement) if (esCapa(n)) top = n;
      return top;
    };
    const quitar = el => {
      // Ocultar en vez de borrar: si React pierde un nodo que controla, la app se rompe.
      el.dataset.sfOculto = '1';
      el.style.setProperty('display', 'none', 'important');
      for (const n of [document.documentElement, document.body]) {
        n?.style.setProperty('overflow', 'auto', 'important');
      }
    };

    const revisar = () => {
      document.querySelectorAll('meta[name="apple-itunes-app"]').forEach(m => m.remove());
      if (!document.body) return;
      for (const el of document.querySelectorAll(PROFUNDIDAD)) {
        if (el.isConnected && esCapa(el) && esNag(el)) quitar(el);
      }
      for (const el of document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-testid="BottomBar"]')) {
        if (!el.isConnected) continue;
        const capa = capaDe(el) || el;
        if (esNag(capa)) quitar(capa);
      }
    };

    let t;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(revisar, 250); })
      .observe(document, { childList: true, subtree: true });
  }

  // ───────────────────────── Guardia anti App Store ─────────────────────────
  function guardiaApps() {
    const APP = /^(snssdk\d*|tiktok|musically|aweme|itms(-apps|-appss)?|instagram|fb|twitter|intent):|\/\/(apps|itunes)\.apple\.com|onelink\.me|\.app\.link|app\.adjust\.com/i;
    const BOTON_APP = /^(open|get|use|download|abrir|abre|descargar?|usar)\b.{0,20}\b(app|aplicaci[oó]n|tiktok|instagram|facebook)\b/i;

    const esApp = el => {
      const a = el.closest('a[href]');
      if (a && APP.test(a.href)) return true;
      const b = el.closest('button, [role="button"], a');
      const txt = b?.innerText?.trim() || '';
      return txt.length > 0 && txt.length < 40 && BOTON_APP.test(txt);
    };

    // Fase de captura en window: corre antes que cualquier listener de la página.
    window.addEventListener('click', e => {
      if (!(e.target instanceof Element) || e.target.closest('#sf-root')) return;
      if (esApp(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // TikTok: links a videos → navegación normal, sin pasar por su JS (que intenta abrir la app)
      if (/(^|\.)tiktok\.com$/.test(HOST)) {
        const a = e.target.closest('a[href]');
        if (a && a.origin === location.origin && /\/(video|photo)\/\d+/.test(a.pathname)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          location.href = a.href;
        }
      }
    }, true);

    // Redirecciones por JS (location = 'itms-apps://…'), donde Safari soporte la Navigation API
    window.navigation?.addEventListener('navigate', e => {
      if (e.cancelable && APP.test(e.destination.url)) e.preventDefault();
    });

    // iframes ocultos con esquemas de app (truco clásico para abrir la app)
    let t;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        document.querySelectorAll('iframe[src]').forEach(f => { if (APP.test(f.src)) f.remove(); });
      }, 100);
    }).observe(document, { childList: true, subtree: true });
  }

  function estilo(css) {
    const s = document.createElement('style');
    s.textContent = css;
    const poner = () => (document.head || document.documentElement).appendChild(s);
    if (document.documentElement) return poner();
    // En document-start a veces aún no existe <html>: pegarlo al documento dejaría la página vacía
    new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); poner(); } })
      .observe(document, { childList: true });
  }

  // ───────────────────────── Vista limpia ─────────────────────────
  function mostrar({ autor = '', texto = '', videos = [], imagenes = [] }) {
    if (CONFIG.autoVideo && videos.length === 1 && !imagenes.length) {
      return location.replace(videos[0].url);
    }
    pintar(`
      ${autor ? `<h3>${esc(autor)}</h3>` : ''}
      ${texto ? `<p class="txt">${esc(texto)}</p>` : ''}
      ${videos.map(v => `
        <a class="vid" href="${esc(v.url)}">
          ${v.thumb ? `<img src="${esc(v.thumb)}">` : ''}<span>▶ Reproducir</span>
        </a>`).join('')}
      ${imagenes.map(s => `<img src="${esc(s)}">`).join('')}
      ${linkOriginal()}`);
  }

  function detener() {
    window.stop();
    pintar('<p>Cargando…</p>');
  }

  function pintar(cuerpo) {
    const root = document.documentElement || document.appendChild(document.createElement('html'));
    root.innerHTML = `
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>${esc(HOST)}</title>
        <style>
          body{margin:0;padding:12px;background:#000;color:#eee;font:16px/1.45 -apple-system,system-ui,sans-serif}
          h3{margin:.4em 0}.txt{white-space:pre-wrap}a{color:#6cf}
          img{width:100%;display:block;border-radius:8px;margin:8px 0}
          .vid{position:relative;display:block;margin:8px 0;color:#fff;text-decoration:none;min-height:3em;background:#222;border-radius:8px}
          .vid span{position:absolute;left:0;right:0;bottom:0;padding:12px;background:#000a;font-weight:600;border-radius:0 0 8px 8px}
        </style>
      </head>
      <body><div id="sf-root">${cuerpo}</div></body>`;
    document.getElementById('sf-orig')?.addEventListener('click', e => {
      e.preventDefault();
      history.replaceState(null, '', location.href.split('#')[0] + '#original');
      location.reload();
    });
  }

  function linkOriginal() {
    return '<p><a id="sf-orig" href="#original">Abrir original</a></p>';
  }

  function boton(url) {
    const a = document.createElement('a');
    a.id = 'sf-root';
    a.href = url;
    a.textContent = '▶ Video';
    a.style.cssText = 'position:fixed;right:16px;bottom:24px;z-index:2147483647;padding:12px 18px;'
      + 'border-radius:999px;background:#1877f2;color:#fff;font:600 16px system-ui;'
      + 'text-decoration:none;box-shadow:0 4px 12px #0006';
    document.body.appendChild(a);
  }

  // ───────────────────────── Utilidades ─────────────────────────
  function gmJSON(url, { method = 'GET', data, headers } = {}) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method, url, data, headers,
        onload: r => {
          try { resolve(JSON.parse(r.responseText)); }
          catch { reject(new Error(`respuesta inválida de ${new URL(url).hostname}`)); }
        },
        onerror: () => reject(new Error(`sin respuesta de ${new URL(url).hostname}`)),
      });
    });
  }

  // Busca "clave":"https://..." en HTML/JSON, aunque venga escapado una o dos veces.
  function buscarURL(texto, claves) {
    for (const k of claves) {
      const m = texto.match(new RegExp(`${k}\\\\*"\\s*:\\s*\\\\*"(https?.+?)\\\\*"`));
      if (m) return desescapar(m[1]);
    }
    return null;
  }

  function desescapar(s) {
    for (let i = 0; i < 3 && s.includes('\\'); i++) {
      try { s = JSON.parse(`"${s}"`); } catch { break; }
    }
    return s;
  }

  function listo() {
    return new Promise(r => (document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', r, { once: true })
      : r()));
  }

  function esc(s = '') {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
})();
