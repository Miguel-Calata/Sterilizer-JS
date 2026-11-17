// ==UserScript==
// @name         Muros de pago
// @namespace    cal.muros-de-pago
// @version      1.0.1
// @description  Quita paywalls blandos (cuando el texto ya llegó al navegador) y busca la versión abierta de papers. Servicios de terceros apagados por defecto.
// @match        *://*/*
// @exclude      *://*.youtube.com/*
// @exclude      *://*.tiktok.com/*
// @exclude      *://*.instagram.com/*
// @exclude      *://*.facebook.com/*
// @exclude      *://x.com/*
// @exclude      *://*.twitter.com/*
// @noframes
// @run-at       document-start
// @inject-into  content
// @grant        GM.xmlHttpRequest
// @connect      api.openalex.org
// ==/UserScript==

/*
 * Qué hace
 *  - Paywall de CLIENTE (el artículo completo llega y lo tapan con modal, blur,
 *    degradado o max-height): lo destapa. Ej.: El Universal, Milenio (M+), el
 *    contador de registro de El País.
 *  - Paywall de SERVIDOR (solo llega el resumen): no se puede desde aquí. Si
 *    activas terceros.archivo, aparece un botón para buscar copia en archive.today.
 *  - En páginas de artículos académicos (con DOI) pone un botón que pregunta a
 *    OpenAlex si hay una copia legal en acceso abierto (repositorio, preprint, PMC).
 *
 * Reparto con tus otros scripts (un dueño por dominio)
 *  - Cookie Banner Killer: banners de consentimiento.
 *  - YouTube Anti Shorts / Redes sin fricción: YouTube, TikTok, IG, FB, X → aquí no corre.
 *  - Muros de login: Reddit, Quora, Pinterest, LinkedIn, Medium, etc. → aquí solo
 *    corre el botón de "versión abierta" (útil en ResearchGate/Academia).
 *
 * Para ver una página sin que el script intervenga: agrega #original a la URL.
 */

(() => {
  'use strict';

  // ───────────────────────── Configuración ─────────────────────────
  const CONFIG = {
    // 'boton': muestra un botón y SOLO al tocarlo consulta a OpenAlex (le manda el DOI).
    // 'auto' : consulta sola al abrir el paper. false: apagado.
    versionAbierta: 'boton',
    // Opcional: desde feb. 2026 OpenAlex pide API key (gratis en openalex.org/settings/api).
    // Sin key las búsquedas por DOI siguen funcionando, pero con una cuota diaria pequeña.
    openalexKey: '',

    // Servicios de terceros (apagados). archivo: botón "Buscar en archive.today"
    // cuando hay paywall y el texto no está en la página. Usa /newest/, que solo
    // BUSCA copias existentes: nunca crea una copia pública por ti.
    terceros: { archivo: false },

    // Dominios donde borrar el contador de "notas gratis" antes de que cargue el sitio.
    // Solo borra claves de medidores (ArcP, Piano, etc.), no tu sesión. Ej.: ['elpais.com']
    reiniciarContador: [],

    restaurarTexto: true,   // si el DOM viene truncado, rearma el texto con los datos de la propia página
    excluir: [],            // dominios donde no hacer nada, ej. ['mibanco.com']
    debug: false,
  };

  const TAG = '[Muros de pago]';
  const log = (...a) => CONFIG.debug && console.log(TAG, ...a);

  if (location.hash === '#original') return;

  const HOST = location.hostname.replace(/^www\./, '');
  const esDe = (dominio) => HOST === dominio || HOST.endsWith('.' + dominio);

  // Dueños de otros scripts
  const SOCIAL = ['youtube.com', 'tiktok.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com'];
  const LOGIN = /(^|\.)(reddit\.com|quora\.com|pinterest\.[a-z.]+|linkedin\.com|threads\.(net|com)|medium\.com|glassdoor\.[a-z.]+|tumblr\.com|twitch\.tv|quizlet\.com|brainly\.[a-z.]+|researchgate\.net|academia\.edu|scribd\.com|slideshare\.net|studocu\.com)$/;

  if (SOCIAL.some(esDe) || CONFIG.excluir.some(esDe)) return;
  const SOLO_VERSION_ABIERTA = LOGIN.test(HOST);

  // ───────────────────────── Módulos por sitio ─────────────────────────
  // css: se inyecta desde el arranque. contenedor: dónde vive el texto del artículo.
  // contador: claves de localStorage/cookies del medidor (para reiniciarContador).
  const SITIOS = [
    {
      nombre: 'El Universal',
      dominio: 'eluniversal.com.mx',
      // Piano trunca con CSS: div:has(> #pianoOfferContainer) > section { max-height: 100px } + degradado.
      css: `
        #pianoOfferContainer, .pianoOfferContainer { display: none !important; }
        div:has(> #pianoOfferContainer) > section { max-height: none !important; overflow: visible !important; }
        div:has(> #pianoOfferContainer) > section::after { display: none !important; }`,
      contenedor: 'section:has(p.sc__font-paragraph), .story-content',
    },
    {
      nombre: 'Milenio',
      dominio: 'milenio.com',
      // Notas M+: el texto completo está en #content-body; Piano monta el muro en #signwall.
      css: `#signwall { display: none !important; }`,
      contenedor: '#content-body',
    },
    {
      nombre: 'El País',
      dominio: 'elpais.com',
      // Paywall de Arc Subscriptions (/arc/subs/p.min.js) + contador de registro (REGCONTADOR).
      css: `#pmwalljs, .enp-pmwalljs { display: none !important; }`,
      contenedor: '.a_c, [data-dtm-region="articulo_cuerpo"]',
      contador: /^ArcP|regwall|contador/i,
    },
    {
      nombre: 'NYT',
      dominio: 'nytimes.com',
      // No se pudo verificar desde aquí: si el texto no llega, es paywall de servidor.
      css: `#gateway-content, [data-testid="gateway-container"] { display: none !important; }`,
      contenedor: 'section[name="articleBody"]',
    },
  ];
  const SITIO = SITIOS.find((s) => esDe(s.dominio)) || null;

  // ───────────────────────── Firmas de proveedores ─────────────────────────
  // Overlays conocidos: seguros de esconder porque son exclusivos de paywalls.
  const OVERLAYS = [
    '.tp-modal', '.tp-backdrop',                       // Piano / Tinypass
    '#zephr-overlay', '.zephr-overlay',                // Zephr
    '[class^="sp_veil"]',                              // Sourcepoint (velo de paywall)
    '.fc-ab-root',                                     // Funding Choices: muro anti-adblock
    '#poool-widget', '.poool-widget',                  // Poool
    '.leaky_paywall_message_wrap',                     // Leaky Paywall (WordPress)
    '.paywall-overlay', '.redacted-overlay',
  ];
  const BLOQUEOS_SCROLL = ['tp-modal-open', 'paywalled', 'modal-open', 'noscroll', 'no-scroll', 'overflow-hidden', 'swal2-shown'];
  const PROVEEDORES = {
    piano: 'script[src*="tinypass.com"], script[src*="piano.io"]',
    zephr: 'script[src*="zephr"], #zephr-overlay',
    arcSubs: 'script[src*="/arc/subs/"]',
    poool: 'script[src*="poool"]',
    sourcepoint: '[class^="sp_veil"]',
  };
  // Texto típico de un muro (para overlays sin clase conocida, solo en páginas con paywall)
  const TEXTO_MURO = /(suscr[ií]b|subscri|hazte (socio|miembro)|inici(a|ar) sesi[oó]n|reg[ií]str(ate|arse)|crea(r)? (una )?cuenta|l[ií]mite de (notas|art[ií]culos)|notas gratis|art[ií]culos gratuitos|log ?in|sign ?(in|up)|create (a |an )?(free )?account|free articles|you've reached|keep reading|continue reading|para seguir leyendo|sigue leyendo)/i;

  // ───────────────────────── Reinicio de contador (opt-in) ─────────────────────────
  if (!SOLO_VERSION_ABIERTA && CONFIG.reiniciarContador.some(esDe)) reiniciarContador();

  function reiniciarContador() {
    const CLAVE = SITIO?.contador
      || /^ArcP|piano|tinypass|^_?tp[_-]|__tbc|__pat|__pvi|xbc|meter|contador|paywall|regwall|pmw|zephr|poool|article.?count|pageview/i;
    for (const st of [safe(() => localStorage), safe(() => sessionStorage)]) {
      if (!st) continue;
      for (const k of Object.keys(st)) if (CLAVE.test(k)) { st.removeItem(k); log('borrado storage', k); }
    }
    const partes = location.hostname.split('.');
    const dominios = [''];
    for (let i = 0; i < partes.length - 1; i++) dominios.push('; domain=.' + partes.slice(i).join('.'));
    for (const c of document.cookie.split(';')) {
      const nombre = c.split('=')[0].trim();
      if (!nombre || !CLAVE.test(nombre)) continue;
      for (const d of dominios) document.cookie = `${nombre}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
      log('borrada cookie', nombre);
    }
  }

  // ───────────────────────── CSS base ─────────────────────────
  // html.mdp-usuario se pone unos segundos tras un toque: así, si TÚ abres el login
  // de Piano (.tp-modal), no se esconde.
  const CSS_BASE = `
    html:not(.mdp-usuario) :is(${OVERLAYS.join(', ')}) { display: none !important; }
    html.mdp-unlock, html.mdp-unlock body {
      overflow: auto !important; overflow-y: auto !important;
      position: static !important; touch-action: auto !important;
    }
    .mdp-destapado { max-height: none !important; overflow: visible !important;
      filter: none !important; -webkit-filter: none !important;
      -webkit-mask-image: none !important; mask-image: none !important;
      -webkit-line-clamp: unset !important; line-clamp: unset !important; }
    .mdp-sin-degradado::after, .mdp-sin-degradado::before { display: none !important; }
    #mdp-restaurado { margin: 1.5em 0; padding-top: 1em; border-top: 1px dashed currentColor; }
    #mdp-restaurado .mdp-nota { font: 600 12px/1.4 -apple-system, system-ui, sans-serif; opacity: .6; margin-bottom: .8em; }
  `;

  function estilo(css, id) {
    if (id && document.getElementById(id)) return;
    const s = document.createElement('style');
    if (id) s.id = id;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  // Toques del usuario: suspende el ocultado de overlays 4 s (para logins que abres tú)
  let toqueTimer;
  window.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('#mdp-ui')) return;
    document.documentElement.classList.add('mdp-usuario');
    clearTimeout(toqueTimer);
    toqueTimer = setTimeout(() => document.documentElement.classList.remove('mdp-usuario'), 4000);
  }, true);

  // ───────────────────────── Lectura de datos de la página ─────────────────────────
  function safe(fn) { try { return fn(); } catch { return null; } }

  // JSON-LD: isAccessibleForFree, hasPart.cssSelector/value, articleBody
  function leerJsonLd() {
    const r = { dePago: false, selectores: [], textos: [] };
    const visitar = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(visitar);
      if (o['@graph']) visitar(o['@graph']);
      const libre = o.isAccessibleForFree;
      if (libre === false || /^false$/i.test(String(libre))) r.dePago = true;
      for (const p of [].concat(o.hasPart || [])) {
        if (!p || typeof p !== 'object') continue;
        const pLibre = p.isAccessibleForFree;
        if (pLibre === false || /^false$/i.test(String(pLibre))) {
          r.dePago = true;
          for (const s of [].concat(p.cssSelector || [])) if (typeof s === 'string') r.selectores.push(s);
          if (typeof p.value === 'string') r.textos.push(p.value);
        }
      }
      if (typeof o.articleBody === 'string') r.textos.push(o.articleBody);
    };
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      visitar(safe(() => JSON.parse(s.textContent)));
    }
    return r;
  }

  // Arc XP (El Universal, El País, El Financiero, Infobae…): el artículo viaja en Fusion.globalContent
  function leerArc() {
    for (const s of document.querySelectorAll('script:not([src])')) {
      const t = s.textContent;
      const i = t.indexOf('Fusion.globalContent=');
      if (i < 0) continue;
      const ini = i + 'Fusion.globalContent='.length;
      const fin = t.indexOf(';Fusion.', ini);
      const g = safe(() => JSON.parse(t.slice(ini, fin > 0 ? fin : undefined)));
      if (!g?.content_elements) continue;
      const parrafos = g.content_elements
        .filter((e) => e && (e.type === 'text' || e.type === 'header') && e.content)
        .map((e) => aTexto(e.content))
        .filter(Boolean);
      return { restringido: !!g.content_restrictions?.content_code, parrafos };
    }
    return null;
  }

  // HTML → texto plano, sin ejecutar nada
  const parser = new DOMParser();
  function aTexto(html) {
    return (parser.parseFromString(String(html), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  const normal = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // ───────────────────────── Detección ─────────────────────────
  function detectar() {
    const ld = leerJsonLd();
    const arc = leerArc();
    const proveedores = Object.entries(PROVEEDORES)
      .filter(([, sel]) => safe(() => document.querySelector(sel))).map(([k]) => k);
    const overlay = !!safe(() => document.querySelector(OVERLAYS.join(',')));
    const dePago = ld.dePago || !!arc?.restringido || overlay || !!SITIO;
    return { ld, arc, proveedores, overlay, dePago };
  }

  // ───────────────────────── Acciones ─────────────────────────
  function liberarScroll() {
    const html = document.documentElement;
    html.classList.add('mdp-unlock');
    for (const el of [html, document.body]) {
      if (!el) continue;
      BLOQUEOS_SCROLL.forEach((c) => el.classList.remove(c));
      if (el.style.overflow === 'hidden') el.style.overflow = '';
      if (el.style.overflowY === 'hidden') el.style.overflowY = '';
      if (el.style.position === 'fixed') el.style.position = '';
    }
  }

  function contenedores(info) {
    const sels = [...info.ld.selectores, SITIO?.contenedor, '[itemprop="articleBody"]', 'article']
      .filter(Boolean);
    const out = new Set();
    for (const sel of sels) {
      for (const el of safe(() => document.querySelectorAll(sel)) || []) {
        if (el !== document.body && el !== document.documentElement) out.add(el);
      }
    }
    return [...out];
  }

  // Quita max-height/overflow, blur y degradados ::after dentro del artículo
  function destapar(raiz) {
    const nodos = [raiz, ...Array.from(raiz.querySelectorAll('div, section, p, article, main')).slice(0, 500)];
    for (const el of nodos) {
      const cs = getComputedStyle(el);
      const truncado = cs.maxHeight !== 'none' && /hidden|clip/.test(cs.overflow + cs.overflowY)
        && el.scrollHeight > el.clientHeight + 20;
      const borroso = /blur/.test(cs.filter) || /gradient/.test(cs.webkitMaskImage || cs.maskImage || '');
      const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
      if (truncado || borroso || clamp) el.classList.add('mdp-destapado');
      for (const pseudo of ['::after', '::before']) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content !== 'none' && /gradient/.test(ps.backgroundImage)) el.classList.add('mdp-sin-degradado');
      }
    }
  }

  // Overlays sin clase conocida: capas fijas grandes o diálogos con texto de muro
  function esconderMurosGenericos() {
    let n = 0;
    const vh = innerHeight;
    const candidatos = document.querySelectorAll(
      'body > *, body > * > *, body > * > * > *, [role="dialog"], [aria-modal="true"], dialog[open]');
    for (const el of candidatos) {
      if (!el.isConnected || el.dataset.mdpOculto || el.closest('#mdp-ui, #mdp-restaurado')) continue;
      const cs = getComputedStyle(el);
      const esDialogo = el.matches('[role="dialog"], [aria-modal="true"], dialog');
      if (!esDialogo && !/fixed|sticky/.test(cs.position)) continue;
      if (cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      const grande = r.height >= vh * 0.3 || (r.bottom >= vh - 4 && r.height >= 80);
      const esCabecera = r.top <= 0 && r.height < 130;
      if (!esDialogo && (!grande || esCabecera)) continue;
      const txt = (el.innerText || '').trim();
      if (!txt || txt.length > 900 || !TEXTO_MURO.test(txt)) continue;
      if (el.querySelector('article, [itemprop="articleBody"]')) continue;  // nunca esconder el artículo
      if (el.tagName === 'DIALOG' && el.open) safe(() => el.close());
      el.dataset.mdpOculto = '1';
      el.style.setProperty('display', 'none', 'important');
      n++;
      log('muro oculto', el);
    }
    return n;
  }

  // Si el DOM trae menos texto que los datos de la página, rearma lo que falta
  function restaurarTexto(info, conts) {
    if (!CONFIG.restaurarTexto || document.getElementById('mdp-restaurado')) return false;
    const fuentes = [];
    if (info.arc?.parrafos?.length) fuentes.push(info.arc.parrafos);
    for (const t of info.ld.textos) {
      const ps = t.split(/\n{1,}|(?<=[.!?…”"])\s{2,}/).map((x) => x.trim()).filter(Boolean);
      fuentes.push(ps.length > 1 ? ps : [t.trim()]);
    }
    const mejor = fuentes.sort((a, b) => b.join(' ').length - a.join(' ').length)[0];
    const total = mejor ? mejor.join(' ').length : 0;
    if (total < 800) return false;

    const visible = normal(document.body.innerText);
    const falta = (p) => p.length > 40 && !visible.includes(normal(p).slice(0, 80));
    const faltan = mejor.filter(falta);
    if (faltan.join(' ').length < total * 0.25) return false;   // casi todo está visible
    const desde = mejor.findIndex(falta);                       // solo lo que no se ve, sin repetir

    const ancla = conts[0] || document.querySelector('main') || document.body;
    const sec = document.createElement('section');
    sec.id = 'mdp-restaurado';
    const nota = document.createElement('div');
    nota.className = 'mdp-nota';
    nota.textContent = 'Texto recuperado de los datos de la propia página (Muros de pago)';
    sec.appendChild(nota);
    for (const p of mejor.slice(desde)) {
      const el = document.createElement('p');
      el.textContent = p;
      sec.appendChild(el);
    }
    ancla.after(sec);
    log('texto restaurado:', faltan.length, 'párrafos');
    return true;
  }

  // ───────────────────────── UI (botones flotantes, en shadow DOM) ─────────────────────────
  let ui;
  function boton(id, texto, alTocar, href) {
    if (!ui) {
      const host = document.createElement('div');
      host.id = 'mdp-ui';
      host.style.cssText = 'position:fixed;left:12px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147483646;';
      ui = host.attachShadow({ mode: 'open' });
      const st = document.createElement('style');
      st.textContent = `
        :host { all: initial; }
        .b { display:block; margin-top:8px; padding:9px 14px; border-radius:999px; border:0;
             background:#1c1c1e; color:#fff; font:600 14px/1.2 -apple-system,system-ui,sans-serif;
             box-shadow:0 4px 14px #0005; text-decoration:none; cursor:pointer; opacity:.92; }
        .b.ok { background:#1f7a4d; } .b.no { background:#555; }`;
      ui.appendChild(st);
      document.body.appendChild(host);
    }
    // Si cambia de botón a link (o al revés) se reemplaza el elemento: un <button> ignora href
    const tag = href ? 'A' : 'BUTTON';
    const viejo = ui.getElementById(id);
    const b = document.createElement(tag);
    b.id = id;
    b.className = 'b';
    if (viejo) viejo.replaceWith(b); else ui.appendChild(b);
    b.textContent = texto;
    if (href) { b.href = href; b.target = '_blank'; b.rel = 'noopener noreferrer'; }
    if (alTocar) b.onclick = alTocar;
    return b;
  }

  // ───────────────────────── Versión abierta (OpenAlex) ─────────────────────────
  const YA_ABIERTOS = /(^|\.)(arxiv\.org|biorxiv\.org|medrxiv\.org|europepmc\.org|ncbi\.nlm\.nih\.gov|zenodo\.org|scielo\.[a-z.]+|redalyc\.org|doaj\.org|openalex\.org|doi\.org|core\.ac\.uk|osf\.io|ssrn\.com)$/;

  function leerDoi() {
    const metas = [
      'meta[name="citation_doi"]', 'meta[name="dc.identifier"]', 'meta[name="DC.identifier"]',
      'meta[name="DC.Identifier"]', 'meta[name="prism.doi"]', 'meta[name="bepress_citation_doi"]',
      'meta[property="citation_doi"]',
    ];
    for (const sel of metas) {
      for (const m of document.querySelectorAll(sel)) {
        const d = (m.content || '').match(/10\.\d{4,9}\/[^\s"<>]+/);
        if (d) return d[0].replace(/[.,;]+$/, '');
      }
    }
    return null;
  }

  function pedirJSON(url) {
    const gm = typeof GM !== 'undefined' && GM?.xmlHttpRequest;
    if (!gm) return fetch(url, { credentials: 'omit' }).then((r) => r.json());
    return new Promise((ok, mal) => {
      const r = GM.xmlHttpRequest({
        method: 'GET', url, responseType: 'json',
        onload: (x) => { try { ok(x.response && typeof x.response === 'object' ? x.response : JSON.parse(x.responseText)); } catch (e) { mal(e); } },
        onerror: () => mal(new Error('sin respuesta')),
      });
      if (r?.then) r.then((x) => { try { ok(typeof x.response === 'object' ? x.response : JSON.parse(x.responseText)); } catch {} }, mal);
    });
  }

  function versionAbierta() {
    if (!CONFIG.versionAbierta || YA_ABIERTOS.test(HOST) || document.contentType === 'application/pdf') return;
    const doi = leerDoi();
    if (!doi) return;
    log('DOI', doi);

    const consultar = async () => {
      boton('mdp-oa', '⏳ Buscando versión abierta…');
      try {
        const url = `https://api.openalex.org/works/https://doi.org/${encodeURI(doi)}?select=title,open_access,best_oa_location`
          + (CONFIG.openalexKey ? `&api_key=${encodeURIComponent(CONFIG.openalexKey)}` : '');
        const w = await pedirJSON(url);
        const loc = w?.best_oa_location;
        const destino = loc?.pdf_url || w?.open_access?.oa_url || loc?.landing_page_url;
        if (w?.open_access?.is_oa && destino) {
          const mismaPagina = safe(() => new URL(destino).hostname.replace(/^www\./, '')) === HOST;
          const fuente = loc?.source?.display_name ? ` · ${loc.source.display_name}` : '';
          const b = boton('mdp-oa', mismaPagina ? '✅ Esta ya es de acceso abierto' : `🔓 Abrir versión abierta${fuente}`,
            null, mismaPagina ? null : destino);
          b.classList.add('ok');
        } else {
          const b = boton('mdp-oa', 'Sin versión abierta conocida');
          b.classList.add('no');
          setTimeout(() => b.remove(), 4000);
        }
      } catch (e) {
        log(e);
        const b = boton('mdp-oa', 'OpenAlex no respondió · reintentar', consultar);
        b.classList.add('no');
      }
    };

    if (CONFIG.versionAbierta === 'auto') consultar();
    else boton('mdp-oa', '🔓 ¿Versión abierta?', consultar);
  }

  // ───────────────────────── Ciclo principal ─────────────────────────
  let info = null;
  let destapados = false;

  function barrer() {
    if (!document.body) return;
    info = info || detectar();
    if (!info.dePago) {
      // Puede aparecer tarde un overlay de proveedor conocido
      if (safe(() => document.querySelector(OVERLAYS.join(',')))) info.dePago = true;
      else return;
    }
    const conts = contenedores(info);
    conts.forEach(destapar);
    const ocultos = esconderMurosGenericos();
    const hayOverlay = !!safe(() => document.querySelector(OVERLAYS.join(',')));
    if (ocultos || hayOverlay || info.ld.dePago || SITIO) liberarScroll();
    // Velos de blur sobre el body/raíz
    for (const el of [document.body, ...document.body.children]) {
      if (/blur/.test(getComputedStyle(el).filter)) el.classList.add('mdp-destapado');
    }
    if (!destapados) log('activo', { sitio: SITIO?.nombre, proveedores: info.proveedores, ld: info.ld.dePago });
    destapados = true;
  }

  function alCargar() {
    estilo(CSS_BASE, 'mdp-css');
    if (SITIO?.css) estilo(SITIO.css, 'mdp-css-sitio');
    info = detectar();
    barrer();

    // Texto: se revisa ya con la página asentada (los muros suelen montarse tarde)
    setTimeout(() => {
      if (!info?.dePago) return;
      const ok = restaurarTexto(info, contenedores(info));
      const hayFuente = (info.arc?.parrafos?.length || 0) + info.ld.textos.length > 0;
      if (CONFIG.terceros.archivo && !ok && !hayFuente) {
        boton('mdp-archivo', '🗄️ ¿Sigue cortado? Buscar en archive.today', null,
          'https://archive.ph/newest/' + location.href.split('#')[0]);
      }
    }, 2500);

    // Vigilar 60 s si hay paywall (overlays tardíos o al hacer scroll); 10 s si no
    let t;
    const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(barrer, 300); });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    setTimeout(() => obs.disconnect(), info.dePago ? 60000 : 10000);
  }

  // ───────────────────────── Arranque ─────────────────────────
  const listo = (fn) => (document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn());

  if (SOLO_VERSION_ABIERTA) {
    listo(versionAbierta);
    return;
  }

  // CSS lo antes posible para que el overlay ni parpadee
  if (document.documentElement) {
    estilo(CSS_BASE, 'mdp-css');
    if (SITIO?.css) estilo(SITIO.css, 'mdp-css-sitio');
  }
  listo(() => { alCargar(); versionAbierta(); });
})();
