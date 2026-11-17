# Agents.md — Guía para crear Userscripts

Este repositorio contiene userscripts funcionales y útiles que mejoran la experiencia de navegación eliminando fricciones innecesarias: banners de cookies, muros de login, paywalls, contenido NSFW bloqueado, auto-traducción forzada, parámetros de rastreo, etc.

Esta guía está diseñada para que un agente de IA pueda crear nuevos userscripts siguiendo los mismos patrones, convenciones y mejores prácticas del repositorio.

---

## Tabla de contenidos

1. [Estructura del repositorio](#1-estructura-del-repositorio)
2. [Patrones comunes](#2-patrones-comunes)
3. [Cabecera `==UserScript==`](#3-cabecera-userscript)
4. [Estructura del código](#4-estructura-del-código)
5. [Patrones de implementación](#5-patrones-de-implementación)
6. [Utilidades comunes](#6-utilidades-comunes)
7. [Categorías de scripts](#7-categorías-de-scripts)
8. [Plantilla base](#8-plantilla-base)
9. [Mejores prácticas](#9-mejores-prácticas)
10. [Validación y testing](#10-validación-y-testing)

---

## 1. Estructura del repositorio

```
scripts/
├── Agents.md                          ← Esta guía
├── cookie-banner-killer.user.js       ← Banners de cookies (todos los sitios)
├── muros-de-login.user.js             ← Muros de login/registro (multi-sitio)
├── muros-de-pago.user.js              ← Paywalls blandos (multi-sitio)
├── redes-sin-friccion.user.js         ← TikTok, IG, FB, X (videos directos)
├── youtube-anti-shorts2.user.js       ← YouTube Anti Shorts
└── google-sin-autotraduccion.user.js  ← Google sin auto-traducción
```

**Scripts propios** siguen un estilo consistente. **Scripts de terceros** (anti-adblocker, Instagram Download) se mantienen con su estilo original pero pueden tener patches.

---

## 2. Patrones comunes

### 2.1. Convenciones de nombre
- **Nombre del archivo**: `nombre-descriptivo.user.js` (kebab-case, en español o inglés)
- **`@name`**: Nombre legible, ej. "Cookie Banner Killer", "Muros de login"
- **`@namespace`**: `cal.<nombre>` para scripts propios

### 2.2. Idioma
- **Comentarios y documentación**: Español
- **Variables y funciones**: Español o inglés según contexto
- **`@description`**: Español, claro y conciso

### 2.3. Filosofía de diseño
- **Minimal invasivo**: Solo tocar lo necesario, no romper la página
- **Idempotente**: No pelear con otros scripts; usar markers (`data-*`) para no procesar dos veces
- **Defensivo**: `safe()` wrapper para todo lo que puede lanzar error
- **Configurable**: `CONFIG` object al inicio para toggles
- **Debuggable**: `CONFIG.debug` flag para logs condicionales

---

## 3. Cabecera `==UserScript==`

### 3.1. Campos requeridos

```javascript
// ==UserScript==
// @name         Nombre Descriptivo
// @namespace    cal.nombre-script
// @version      1.0.0
// @description  Qué hace el script en una línea clara
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
```

### 3.2. `@match` patterns

| Tipo de script | Pattern |
|---|---|
| Todos los sitios | `*://*/*` |
| Sitio específico | `*://*.reddit.com/*` + `*://reddit.com/*` |
| Múltiples sitios | Múltiples `@match` lines |
| Excluir sitios | `@exclude *://*.youtube.com/*` |

### 3.3. `@run-at` timing

| Valor | Cuándo usarlo |
|---|---|
| `document-start` | **Default para la mayoría**. Antes de que cargue cualquier cosa. Esencial para inyectar CSS antes de que parpadee un banner. |
| `document-idle` | Cuando necesitas que el DOM ya exista. Ej: Reddit NSFW Unblocker. |
| (omitido) | Equivale a `document-idle` |

### 3.4. `@grant` permissions

| Valor | Cuándo usarlo |
|---|---|
| `none` | **Default**. No necesitas APIs del gestor. |
| `GM.xmlHttpRequest` | Cuando necesitas fetch cross-origin (TikTok, fxtwitter) |
| `GM_getValue` / `GM_setValue` | Cuando necesitas persistencia (YouTube Anti Shorts) |
| `GM_registerMenuCommand` | Cuando necesitas menú de configuración |

### 3.5. Campos opcionales útiles

```javascript
// @noframes                 ← No correr dentro de iframes
// @inject-into content      ← Explicitar content world (Safari)
// @author                  ← Solo si es relevante
// @license MIT              ← Opcional
```

---

## 4. Estructura del código

### 4.1. Wrapper IIFE

**Siempre** envolver el código en un IIFE con `'use strict'`:

```javascript
(() => {
  'use strict';

  // Todo el código aquí
})();
```

### 4.2. Orden dentro del IIFE

1. **CONFIG object** — configuración y toggles
2. **Constantes y helpers** — TAG, log, safe, regex
3. **CSS base** — estilos a inyectar
4. **Funciones de acción** — lo que el script hace
5. **Arranque** — MutationObserver, event listeners, inicio

### 4.3. CONFIG object

```javascript
const CONFIG = {
  opcionPrincipal: true,    // toggles con default sensible
  opcionSensible: false,    // opciones agresivas apagadas por defecto
  excluir: [],              // dominios de exclusión
  debug: false,             // siempre incluir
};
```

### 4.4. Debug logging

```javascript
const TAG = '[Nombre Script]';
const log = (...a) => CONFIG.debug && console.log(TAG, ...a);
```

### 4.5. Safe wrapper

```javascript
const safe = (fn) => { try { return fn(); } catch { return null; } };
```

Usar `safe()` para cualquier operación que pueda fallar: `document.querySelector`, `JSON.parse`, `getComputedStyle`, etc.

### 4.6. `#original` escape hatch

Para scripts que modifican la página, permitir ver la versión original:

```javascript
if (location.hash === '#original') return;
```

---

## 5. Patrones de implementación

### 5.1. Inyección de CSS

**Pattern básico** (inyectar lo antes posible):

```javascript
function estilo(css, id) {
  if (id && document.getElementById(id)) return;
  const s = document.createElement('style');
  if (id) s.id = id;
  s.textContent = css;
  (document.head || document.documentElement).appendChild(s);
}

// En document-start, <html> puede no existir aún:
function inyectar() {
  const s = document.createElement('style');
  s.id = 'mi-css';
  s.textContent = CSS;
  const poner = () => (document.head || document.documentElement).appendChild(s);
  if (document.documentElement) return poner();
  new MutationObserver((_, o) => {
    if (document.documentElement) { o.disconnect(); poner(); }
  }).observe(document, { childList: true });
}
inyectar();
```

**CSS para liberar scroll** (usar en todos los scripts que ocultan modales):

```javascript
const CSS_LIBERAR = `
  html.mi-unlock, html.mi-unlock body {
    overflow: auto !important;
    overflow-y: auto !important;
    position: static !important;
    touch-action: auto !important;
  }
`;
```

### 5.2. MutationObserver para DOM dinámico

**Pattern básico con debounce**:

```javascript
let timer;
const obs = new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(barrer, 250);
});
obs.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'open']
});

// Desconectar después de un tiempo para no consumir recursos:
setTimeout(() => obs.disconnect(), 60000);
```

**Solo childList** (más barato, sin attribute observation):

```javascript
new MutationObserver((muts) => {
  for (const m of muts) {
    for (const n of m.addedNodes) {
      if (n.nodeType === 1) procesar(n);
    }
  }
}).observe(document, { childList: true, subtree: true });
```

### 5.3. Detección de modales/nags genéricos

**Pattern para detectar modales de login/registro/app por texto**:

```javascript
const NAG = /(log ?in|sign ?(up|in)|create (an |a free |your )?account|inici(ar|a) sesi[oó]n|reg[ií]str(ate|arse)|abr(ir|e) (en |la )*(app|aplicaci[oó]n))/i;

function nagGenerico() {
  const vh = innerHeight;
  const cands = document.querySelectorAll(
    'body > *, body > * > *, body > * > * > *, [role="dialog"], [aria-modal="true"], dialog[open]'
  );
  
  for (const el of cands) {
    if (!el.isConnected || el.dataset.miOculto) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    
    // Debe ser fixed/sticky o un diálogo
    const esDialogo = el.matches('[role="dialog"], [aria-modal="true"], dialog');
    if (!esDialogo && !/fixed|sticky/.test(cs.position)) continue;
    
    // Geometría: grande o barra inferior
    const r = el.getBoundingClientRect();
    if (!esDialogo && r.height < vh * 0.3 && !(r.bottom >= vh - 4 && r.height >= 50)) continue;
    
    // Texto debe coincidir con patrón de nag
    const txt = (el.innerText || '').trim();
    if (!txt || txt.length > 800 || !NAG.test(txt)) continue;
    
    ocultar(el);
  }
}
```

### 5.4. Ocultar elementos sin romper la página

**Preferir ocultar sobre borrar** (React/Vue pueden romper si se borra un nodo que controlan):

```javascript
function ocultar(el) {
  el.dataset.miOculto = '1';  // marker para no procesar de nuevo
  el.style.setProperty('display', 'none', 'important');
}
```

**Para modales que el JS del sitio necesita** (ej: muros de edad donde el clic debe funcionar):

```javascript
function hacerFantasma(el) {
  el.classList.add('mi-fantasma');  // opacity: 0, pointer-events: none
  // El elemento sigue vivo en el DOM para que el JS del sitio funcione
}
```

### 5.5. Liberar scroll bloqueado

```javascript
function liberarScroll() {
  const html = document.documentElement;
  html.classList.add('mi-unlock');
  
  for (const el of [html, document.body]) {
    if (!el) continue;
    // Quitar clases de bloqueo conocidas
    ['modal-open', 'noscroll', 'no-scroll', 'overflow-hidden', 'stop-scrolling']
      .forEach(c => el.classList.remove(c));
    // Quitar inline styles
    if (el.style.overflow === 'hidden') el.style.overflow = '';
    if (el.style.overflowY === 'hidden') el.style.overflowY = '';
    if (el.style.position === 'fixed') el.style.position = '';
  }
}
```

### 5.6. Cerrar `<dialog>` nativos

```javascript
function cerrarDialogos(nodo, prof = 0) {
  if (!nodo || prof > 8) return;
  for (const d of nodo.querySelectorAll?.('dialog') || []) {
    safe(() => d.open && d.close());
    d.removeAttribute('open');
  }
  // Cruzar shadow roots
  for (const el of nodo.querySelectorAll?.('*') || []) {
    if (el.shadowRoot) cerrarDialogos(el.shadowRoot, prof + 1);
  }
  if (nodo.shadowRoot) cerrarDialogos(nodo.shadowRoot, prof + 1);
}
```

### 5.7. Bloquear redirecciones a apps

```javascript
function guardiaApps() {
  const APP = /^(reddit|instagram|tiktok|itms(-apps|-appss)?|intent):|\/\/(apps|itunes)\.apple\.com/i;
  
  // Captura en window: corre antes que los listeners de la página
  window.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && APP.test(a.href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  
  // Navigation API
  window.navigation?.addEventListener('navigate', (e) => {
    if (e.cancelable && APP.test(e.destination.url)) e.preventDefault();
  });
}
```

### 5.8. Arranque seguro en `document-start`

En `document-start`, `<html>` puede no existir aún:

```javascript
const start = () => {
  // Inicialización
};

if (document.documentElement) {
  start();
} else {
  new MutationObserver((_, o) => {
    if (document.documentElement) { o.disconnect(); start(); }
  }).observe(document, { childList: true });
}
```

### 5.9. Módulos por sitio

Para scripts que corren en muchos sitios con lógica diferente:

```javascript
const MODULOS = {
  reddit: {
    host: /(^|\.)reddit\.com$/,
    css: () => `/* selectores específicos de Reddit */`,
    barrer: barrerReddit,
  },
  quora: {
    host: /(^|\.)quora\.com$/,
    css: () => `/* selectores específicos de Quora */`,
    barrer: barrerQuora,
  },
};

const HOST = location.hostname;
const [, MOD] = Object.entries(MODULOS).find(([, m]) => m.host.test(HOST)) || [];

if (MOD) {
  if (MOD.css) estilo(MOD.css());
  // ...
}
```

### 5.10. UI flotante con Shadow DOM

Para botones flotantes que no interfieran con el CSS del sitio:

```javascript
let ui;
function botonFlotante(texto, alTocar) {
  if (!ui) {
    const host = document.createElement('div');
    host.id = 'mi-ui';
    host.style.cssText = 'position:fixed;right:12px;bottom:16px;z-index:2147483646;';
    ui = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `
      :host { all: initial; }
      .b { display:block; padding:9px 14px; border-radius:999px; border:0;
           background:#1c1c1e; color:#fff; font:600 14px/1.2 -apple-system,system-ui,sans-serif;
           box-shadow:0 4px 14px #0005; cursor:pointer; }`;
    ui.appendChild(st);
    document.body.appendChild(host);
  }
  const b = document.createElement('BUTTON');
  b.className = 'b';
  b.textContent = texto;
  if (alTocar) b.onclick = alTocar;
  ui.appendChild(b);
}
```

---

## 6. Utilidades comunes

### 6.1. `safe()` — wrapper try/catch

```javascript
const safe = (fn) => { try { return fn(); } catch { return null; } };
```

### 6.2. `textoDe()` — extraer texto de elemento

```javascript
const textoDe = (el) => (
  el.innerText || el.textContent || el.value || 
  el.getAttribute?.('aria-label') || ''
).replace(/\s+/g, ' ').trim();
```

### 6.3. `esVisible()` — verificar si un elemento es visible

```javascript
function esVisible(el) {
  if (!el?.isConnected) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
```

### 6.4. `listo()` — esperar DOMContentLoaded

```javascript
function listo() {
  return new Promise(r => (
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', r, { once: true })
      : r()
  ));
}
```

### 6.5. `esc()` — escape HTML

```javascript
function esc(s = '') {
  return String(s).replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));
}
```

### 6.6. `buscarEnShadow()` — buscar en Shadow DOM

```javascript
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
```

---

## 7. Categorías de scripts

### 7.1. Anti-banner / Anti-nag
**Ejemplos**: `cookie-banner-killer.user.js`, `anti-newsletter-nag.user.js`, `muros-de-login.user.js`

**Patrones clave**:
- `@run-at document-start` para inyectar CSS antes de que parpadee
- Selectores conocidos + heurística genérica por texto
- MutationObserver para DOM dinámico
- Liberar scroll después de ocultar

### 7.2. Anti-paywall
**Ejemplos**: `muros-de-pago.user.js`

**Patrones clave**:
- Detección por proveedores (Piano, Zephr, Arc)
- JSON-LD para datos del artículo
- Restaurar texto truncado desde datos embebidos
- Servicios de terceros opcionales (archive.today, OpenAlex)

### 7.3. Content extraction / Media download
**Ejemplos**: `redes-sin-friccion.user.js`

**Patrones clave**:
- `GM.xmlHttpRequest` para fetch cross-origin
- Parsear JSON embebido en HTML
- APIs de terceros (tikwm, fxtwitter)
- Vista limpia con HTML personalizado

### 7.4. URL manipulation
**Ejemplos**: `google-sin-autotraduccion.user.js`

**Patrones clave**:
- `@run-at document-start` para interceptar antes de navegación
- MutationObserver para links dinámicos
- Event listeners en captura para clicks
- Page-world injection para beacon/clipboard

### 7.5. UI modification
**Ejemplos**: `youtube-anti-shorts2.user.js`

**Patrones clave**:
- CSS con selectores específicos de componentes web
- `GM_registerMenuCommand` para configuración
- Redirección de URLs internas

---

## 8. Plantilla base

### 8.1. Script simple (un sitio, una acción)

```javascript
// ==UserScript==
// @name         Nombre Descriptivo
// @namespace    cal.nombre-script
// @version      1.0.0
// @description  Qué hace el script
// @match        *://*.ejemplo.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * Descripción breve de qué hace y por qué.
 * Nota: si hay conflicto con otro script, mencionarlo aquí.
 */

(() => {
  'use strict';

  const CONFIG = {
    debug: false,
  };

  const TAG = '[Nombre Script]';
  const log = (...a) => CONFIG.debug && console.log(TAG, ...a);

  function accion() {
    // Lógica principal
  }

  // Ejecutar al cargar
  accion();

  // Si el DOM es dinámico, usar MutationObserver:
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) accion();
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
```

### 8.2. Script multi-sitio con CONFIG

```javascript
// ==UserScript==
// @name         Nombre Descriptivo
// @namespace    cal.nombre-script
// @version      1.0.0
// @description  Qué hace el script
// @match        *://*/*
// @noframes
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CONFIG = {
    debug: false,
    excluir: [],
  };

  const TAG = '[Nombre Script]';
  const log = (...a) => CONFIG.debug && console.log(TAG, ...a);
  const safe = (fn) => { try { return fn(); } catch { return null; } };

  if (location.hash === '#original') return;

  const HOST = location.hostname;
  if (CONFIG.excluir.some(d => HOST === d || HOST.endsWith('.' + d))) return;

  // CSS a inyectar lo antes posible
  const CSS = `
    /* selectores a ocultar */
  `;

  function estilo(css) {
    const s = document.createElement('style');
    s.textContent = css;
    const poner = () => (document.head || document.documentElement).appendChild(s);
    if (document.documentElement) return poner();
    new MutationObserver((_, o) => {
      if (document.documentElement) { o.disconnect(); poner(); }
    }).observe(document, { childList: true });
  }

  function barrer() {
    // Lógica principal
  }

  // Arranque
  estilo(CSS);
  
  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(barrer, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });
  
  setTimeout(barrer, 0);
})();
```

### 8.3. Script con GM.xmlHttpRequest

```javascript
// ==UserScript==
// @name         Nombre Descriptivo
// @namespace    cal.nombre-script
// @version      1.0.0
// @description  Qué hace el script
// @match        *://*.ejemplo.com/*
// @run-at       document-start
// @grant        GM.xmlHttpRequest
// @connect      api.ejemplo.com
// ==/UserScript==

(() => {
  'use strict';

  function pedirJSON(url) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: 'GET',
        url,
        responseType: 'json',
        onload: (r) => {
          try { resolve(r.response); }
          catch (e) { reject(e); }
        },
        onerror: () => reject(new Error('sin respuesta')),
      });
    });
  }

  async function accion() {
    try {
      const data = await pedirJSON('https://api.ejemplo.com/data');
      // Procesar data
    } catch (e) {
      console.error('[Script]', e);
    }
  }

  accion();
})();
```

---

## 9. Mejores prácticas

### 9.1. Do's ✅

- **Usar `data-*` markers** para no procesar elementos dos veces
- **Preferir ocultar sobre borrar** (`display: none` vs `remove()`)
- **Usar `safe()`** para operaciones que pueden fallar
- **Inyectar CSS lo antes posible** para evitar parpadeo
- **Desconectar MutationObserver** después de un tiempo razonable
- **Usar `@noframes`** para no correr dentro de iframes
- **Incluir `#original` escape hatch** para scripts invasivos
- **Comentar en español** qué hace cada sección
- **Usar `!important`** solo cuando sea necesario para override
- **Respetar `CONFIG.debug`** para logs condicionales

### 9.2. Don'ts ❌

- **No modificar el DOM agresivamente** sin necesidad
- **No usar `setInterval`** para polling cuando MutationObserver basta
- **No asumir que `<html>` existe** en `document-start`
- **No pelear con otros scripts**: usar namespaces únicos
- **No hacer fetch cross-origin sin `GM.xmlHttpRequest`**
- **No dejar MutationObserver activo indefinidamente**
- **No usar `unsafeWindow`** a menos que sea estrictamente necesario
- **No hardcodear selectores sin fallback genérico**
- **No romper la navegación del sitio**

### 9.3. Safari / iOS considerations

- **`@inject-into content`** es recomendado para Safari
- **`unsafeWindow` no existe** en Safari/Userscripts — usar `window` como fallback
- **`GM_registerMenuCommand`** no funciona en Safari — usar solo `CONFIG`
- **`document-start`** puede inyectar tarde en iOS — añadir barrido tardío
- **Touch events** pueden ser necesarios además de `click`

### 9.4. Performance

- **Debounce MutationObserver** con `setTimeout` (200-300ms)
- **Solo observar `childList`** si no necesitas atributos
- **Usar `attributeFilter`** cuando observes atributos
- **Limitar profundidad** en búsquedas recursivas
- **Desconectar observer** después de 10-60 segundos

---

## 10. Validación y testing

### 10.1. Checklist antes de entregar

- [ ] ¿La cabecera `==UserScript==` es válida y completa?
- [ ] ¿`@match` cubre todos los dominios necesarios?
- [ ] ¿`@run-at` es apropiado para la tarea?
- [ ] ¿El código está envuelto en IIFE con `'use strict'`?
- [ ] ¿Hay `CONFIG` con `debug: false`?
- [ ] ¿Se usa `safe()` para operaciones riesgosas?
- [ ] ¿Hay `#original` escape hatch si el script es invasivo?
- [ ] ¿MutationObserver se desconecta después de un tiempo?
- [ ] ¿Los comentarios están en español?
- [ ] ¿No hay conflictos con otros scripts del repo?

### 10.2. Testing manual

1. Instalar el script en Safari con la app Userscripts
2. Probar en los sitios objetivo
3. Verificar con `#original` que la página funciona sin el script
4. Activar `CONFIG.debug = true` y revisar consola
5. Probar en modo avión para verificar que no hay errores de red
6. Probar en iOS si el script es mobile-first

### 10.3. Verificación de compatibilidad

- **Safari + Userscripts**: verificar que no use APIs no disponibles
- **Tampermonkey/Violentmonkey**: verificar `@grant` permissions
- **Multi-gestor**: usar `typeof GM !== 'undefined'` para features opcionales

---

## Referencias rápidas

### Scripts de referencia por complejidad

| Nivel | Script | Qué aprender |
|---|---|---|
| **Básico** | `google-sin-autotraduccion.user.js` | Redirección simple, MutationObserver |
| **Intermedio** | `youtube-anti-shorts2.user.js` | CSS-only, GM menu commands |
| **Avanzado** | `cookie-banner-killer.user.js` | Heurística genérica, overlay detection |
| **Avanzado** | `anti-newsletter-nag.user.js` | Heurística por texto, confirmación por inputs |
| **Experto** | `muros-de-login.user.js` | Multi-sitio, módulos, Shadow DOM |
| **Experto** | `muros-de-pago.user.js` | JSON-LD, Arc XP, OpenAlex API |
| **Experto** | `redes-sin-friccion.user.js` | GM.xmlHttpRequest, page-world injection |

### Selectores comunes por plataforma

**Reddit (Threadbare)**:
- `shreddit-app`, `shreddit-post`, `xpromo-nsfw-blocking-container`
- `rpl-dialog`, `rpl-bottom-sheet`, `shreddit-blurred-container`
- `rpl-scroll-lock` en body

**YouTube**:
- `ytd-guide-entry-renderer`, `ytd-rich-item-renderer`
- `ytd-reel-item-renderer` (Shorts)
- `yt-tab-shape` (pestañas)

**Instagram**:
- `article` (posts), `section` (stories)
- `header` (profile)
