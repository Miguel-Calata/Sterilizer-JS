// ==UserScript==
// @name         YouTube Anti Shorts (fixed)
// @namespace    cal.youtube-anti-shorts
// @version      1.2.0
// @description  Oculta los Shorts y las publicaciones de la comunidad de YouTube (escritorio y móvil) y redirige /shorts/ a /watch. Compatible con Safari (Userscripts) en macOS/iOS/iPadOS y con Vinegar.
// @author       Anong0u0 (original), revisado
// @match        *://*.youtube.com/*
// @exclude      *://music.youtube.com/*
// @exclude-match *://music.youtube.com/*
// @noframes
// @run-at       document-start
// @inject-into  content
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    /* ================================================================== *
     *  CONFIGURACIÓN — edita aquí en Safari/iOS (la app Userscripts no    *
     *  tiene menú de comandos, así que no hay toggles en la extensión).   *
     *  En Tampermonkey/Violentmonkey también puedes cambiarlo desde menú. *
     * ================================================================== */
    const CONFIG = {
        hideShelves: true,  // estantes de Shorts, menú lateral, pestaña del canal, barra inferior en móvil
        hideVideos:  true,  // Shorts sueltos en feeds, suscripciones, búsqueda y sidebar
        redirect:    true,  // /shorts/ID → /watch?v=ID (en Safari lo reproduce Vinegar)
        hidePosts:   true,  // publicaciones de la comunidad: estantes, posts sueltos y pestaña del canal
    };

    const TAG = '[Anti Shorts]';

    /* ------------------------------------------------------------------ *
     *  Ajustes persistentes: solo si el gestor tiene API síncrona + menú  *
     *  (Tampermonkey/Violentmonkey). En Userscripts se usa CONFIG tal cual.*
     * ------------------------------------------------------------------ */
    const HAS_MENU = typeof GM_registerMenuCommand === 'function'
                  && typeof GM_getValue === 'function'
                  && typeof GM_setValue === 'function';

    const OPTIONS = {
        hideShelves: { key: 'Hide_Shorts_Renderer', label: 'Ocultar estantes y menú de Shorts' },
        hideVideos:  { key: 'Hide_Shorts_Video',    label: 'Ocultar Shorts sueltos en feeds/búsqueda' },
        redirect:    { key: 'Redirect_Shorts_URL',  label: 'Redirigir /shorts/ a /watch' },
        hidePosts:   { key: 'Hide_Community_Posts', label: 'Ocultar publicaciones de la comunidad' },
    };

    const settings = { ...CONFIG };
    if (HAS_MENU) {
        for (const [name, opt] of Object.entries(OPTIONS)) {
            try { settings[name] = GM_getValue(opt.key, CONFIG[name]); } catch { /* usa CONFIG */ }
        }
    }

    /* ------------------------------------------------------------------ *
     *  CSS                                                                *
     * ------------------------------------------------------------------ */
    const SHORT = 'a[href^="/shorts/"]';
    // Links a un post: formato actual (/post/ID) y el viejo (/channel/…/community?lb=ID)
    const POST = ':is(a[href^="/post/"], a[href*="/community?lb="])';
    // tab-title está localizado: inglés, español y portugués
    const TAB_TITLES = ['Community', 'Posts', 'Comunidad', 'Publicaciones', 'Comunidade', 'Postagens', 'Publicações']
        .map((t) => `[tab-title="${t}"]`).join(', ');

    const CSS = {
        // Estantes, secciones completas, menú lateral y pestañas
        hideShelves: `
/* Menú lateral y mini menú (escritorio) */
ytd-guide-entry-renderer:has(a[href^="/shorts"]),
ytd-guide-entry-renderer:has(a[title="Shorts"]),
ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
ytd-mini-guide-entry-renderer[aria-label="Shorts"],

/* Pestaña "Shorts" en páginas de canal */
yt-tab-shape[tab-title="Shorts"],

/* Estantes de Shorts: se oculta la sección contenedora para no dejar huecos */
ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
ytd-rich-section-renderer:has(${SHORT}),
ytd-rich-shelf-renderer[is-shorts],
ytd-reel-shelf-renderer,
grid-shelf-view-model:has(${SHORT}),
ytd-search ytd-shelf-renderer:has(${SHORT}),

/* Móvil (m.youtube.com) */
ytm-pivot-bar-item-renderer:has(.pivot-shorts),
ytm-rich-section-renderer:has(a[href^="/shorts"]),
ytm-reel-shelf-renderer
{ display: none !important; }`,

        // Videos Shorts individuales mezclados en feeds, búsqueda y sidebar
        hideVideos: `
ytd-rich-item-renderer:has(${SHORT}),
ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model),
ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model-v2),
ytd-video-renderer:has(${SHORT}),
ytd-grid-video-renderer:has(${SHORT}),
ytd-compact-video-renderer:has(${SHORT}),
ytd-reel-item-renderer,
yt-lockup-view-model:has(${SHORT}),
.ytGridShelfViewModelGridShelfItem:has(${SHORT}),

/* Móvil */
ytm-shorts-lockup-view-model,
ytm-shorts-lockup-view-model-v2,
ytm-reel-item-renderer,
ytm-rich-item-renderer:has(${SHORT}),
ytm-video-with-context-renderer:has(${SHORT}),
ytm-compact-video-renderer:has(${SHORT})
{ display: none !important; }`,

        // Publicaciones de la comunidad (posts de texto, encuestas, imágenes)
        hidePosts: `
/* Estante "Publicaciones" en inicio: se oculta la sección completa para no dejar huecos */
ytd-rich-section-renderer:has(ytd-post-renderer),
ytd-rich-section-renderer:has(ytd-backstage-post-thread-renderer),
ytd-rich-section-renderer:has(${POST}),

/* Posts sueltos en feeds, búsqueda y sidebar */
ytd-rich-item-renderer:has(ytd-post-renderer),
ytd-rich-item-renderer:has(${POST}),
ytd-backstage-post-thread-renderer,
ytd-post-renderer,

/* Pestaña Comunidad/Publicaciones del canal (el título viene traducido) */
yt-tab-shape:is(${TAB_TITLES}),

/* Móvil (m.youtube.com) */
ytm-rich-section-renderer:has(ytm-backstage-post-thread-renderer),
ytm-rich-section-renderer:has(${POST}),
ytm-rich-item-renderer:has(ytm-backstage-post-thread-renderer),
ytm-rich-item-renderer:has(${POST}),
ytm-backstage-post-thread-renderer,
ytm-post-renderer,
.scbrr-tabs a:is([href$="/community"], [href$="/posts"])
{ display: none !important; }`,
    };

    // textContent en <style> NO es un sink de Trusted Types → no hace falta policy ni innerHTML
    const styles = {};
    for (const [name, css] of Object.entries(CSS)) {
        const el = document.createElement('style');
        el.id = 'anti-shorts-' + name;
        el.textContent = css;
        styles[name] = el;
    }

    function applyStyles() {
        const root = document.head || document.documentElement;
        if (!root) return;
        for (const [name, el] of Object.entries(styles)) {
            if (settings[name]) { if (!el.isConnected) root.appendChild(el); }
            else el.remove();
        }
    }

    /* ------------------------------------------------------------------ *
     *  Redirección /shorts/ID → /watch?v=ID                               *
     * ------------------------------------------------------------------ */
    function toWatchUrl(href) {
        try {
            const u = new URL(href, location.origin);
            const m = u.pathname.match(/^\/shorts\/([\w-]+)/);
            if (!m) return null;
            u.pathname = '/watch';
            u.searchParams.set('v', m[1]); // conserva otros params (?feature=share, etc.) sin romper la URL
            return u.href;
        } catch { return null; }
    }

    function checkLocation() {
        if (!settings.redirect || !location.pathname.startsWith('/shorts/')) return;
        const target = toWatchUrl(location.href);
        if (target && target !== location.href) {
            console.log(TAG, 'redirigiendo a', target);
            location.replace(target);
        }
    }

    function findShortsLink(e) {
        for (const n of e.composedPath()) {
            if (n instanceof HTMLAnchorElement && n.href.includes('/shorts/')) return n;
        }
        return null;
    }

    // Reescribe el href antes de clic medio / Ctrl+clic / "abrir en pestaña nueva".
    // touchstart cubre el toque largo de iOS/iPadOS (vista previa y "Abrir en pestaña nueva"),
    // donde Safari no dispara contextmenu.
    const rewriteHref = (e) => {
        if (!settings.redirect) return;
        const a = findShortsLink(e);
        const target = a && toWatchUrl(a.href);
        if (target) a.href = target;
    };
    window.addEventListener('mousedown', rewriteHref, true);
    window.addEventListener('contextmenu', rewriteHref, true);
    window.addEventListener('touchstart', rewriteHref, { capture: true, passive: true });

    // Clic izquierdo normal: YouTube navega por SPA ignorando el href, así que lo interceptamos
    window.addEventListener('click', (e) => {
        if (!settings.redirect || e.button !== 0) return;
        const a = findShortsLink(e);
        const target = a && toWatchUrl(a.href);
        if (!target) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) { a.href = target; return; }
        e.preventDefault();
        e.stopImmediatePropagation();
        location.assign(target);
    }, true);

    // Navegación interna de YouTube (escritorio y móvil) + respaldo barato
    document.addEventListener('yt-navigate-finish', checkLocation);
    window.addEventListener('state-navigateend', checkLocation);
    window.addEventListener('popstate', checkLocation);
    setInterval(checkLocation, 1000);

    /* ------------------------------------------------------------------ *
     *  Menú del gestor de userscripts                                     *
     * ------------------------------------------------------------------ */
    let menuIds = [];
    function buildMenu() {
        if (!HAS_MENU) return;
        const canRebuild = typeof GM_unregisterMenuCommand === 'function';
        if (menuIds.length && !canRebuild) return;
        if (canRebuild) menuIds.forEach((id) => GM_unregisterMenuCommand(id));

        menuIds = Object.entries(OPTIONS).map(([name, opt]) =>
            GM_registerMenuCommand(`${settings[name] ? '✅' : '❌'} ${opt.label}`, () => {
                settings[name] = !settings[name];
                try { GM_setValue(opt.key, settings[name]); } catch { /* nada */ }
                applyStyles();
                checkLocation();
                buildMenu();
            })
        );
    }

    /* ------------------------------------------------------------------ *
     *  Arranque                                                           *
     * ------------------------------------------------------------------ */
    if (document.documentElement) applyStyles();
    else {
        new MutationObserver((_, obs) => {
            if (document.documentElement) { obs.disconnect(); applyStyles(); }
        }).observe(document, { childList: true });
    }
    // Por si el <head> aparece después y queremos el style ahí
    document.addEventListener('DOMContentLoaded', applyStyles, { once: true });

    checkLocation();
    buildMenu();
    console.log(TAG, 'cargado', settings);
})();
