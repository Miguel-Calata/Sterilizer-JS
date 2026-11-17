# Sterilizer-JS — Sin fricción

Colección de **userscripts** que eliminan las fricciones innecesarias de la web: banners de cookies, muros de login, paywalls, verificación de edad, auto-traducción forzada, parámetros de rastreo, modales de newsletter, y más.

Diseñados para ser **minimalistas, no invasivos y configurables**. Cada script solo toca lo necesario y permite ver la página original agregando `#original` a la URL.

---

## Tabla de contenidos

- [Scripts disponibles](#scripts-disponibles)
- [Instalación](#instalación)
- [Personalización](#personalización)
- [Crear nuevos scripts](#crear-nuevos-scripts)
- [Notas](#notas)

---

## Scripts disponibles

### Anti-banner / Anti-nag

| Script | Descripción | Sitios |
|--------|-------------|--------|
| [cookie-banner-killer.user.js](cookie-banner-killer.user.js) | Rechaza u oculta banners de cookies de cualquier CMP (OneTrust, Cookiebot, Didomi, etc.) y libera el scroll bloqueado | Todos los sitios |
| [anti-newsletter-nag.user.js](anti-newsletter-nag.user.js) | Oculta modales y popups de suscripción a newsletters (Substack, ConvertKit, Mailchimp, Beehiiv, etc.) y detecta genéricos por texto | Todos los sitios |

### Muros de acceso

| Script | Descripción | Sitios |
|--------|-------------|--------|
| [muros-de-login.user.js](muros-de-login.user.js) | Quita el popup de Google One Tap en todos lados, y muros de login, "abre la app" y nags de registro | Reddit, Quora, Pinterest, LinkedIn, Threads, Medium, Glassdoor, Tumblr, Twitch, Quizlet, Brainly, ResearchGate, Academia, Scribd, Studocu |
| [muros-de-pago.user.js](muros-de-pago.user.js) | Quita paywalls blandos (cuando el texto ya llegó al navegador) y busca la versión abierta de papers académicos | El Universal, Milenio, El País, NYT, y más. Botón de versión abierta en ResearchGate/Academia |

### Redes sociales

| Script | Descripción | Sitios |
|--------|-------------|--------|
| [redes-sin-friccion.user.js](redes-sin-friccion.user.js) | Videos directos sin muros de login ni banners de "abre la app". Soporta reproductor embebido y extracción de MP4 | TikTok, Instagram, Facebook, X (Twitter) |
| [youtube-anti-shorts2.user.js](youtube-anti-shorts2.user.js) | Oculta los Shorts y las publicaciones de la comunidad de YouTube. Redirige `/shorts/` a `/watch` | YouTube |

### Utilidades

| Script | Descripción | Sitios |
|--------|-------------|--------|
| [google-sin-autotraduccion.user.js](google-sin-autotraduccion.user.js) | Evita las páginas auto-traducidas de Google (`*.translate.goog`) y abre siempre el sitio original | Google Search |

---

## Instalación

### Safari (macOS / iOS / iPadOS)

1. Instala la app **[Userscripts](https://apps.apple.com/us/app/userscripts/id1573282226)** desde la App Store.
2. Abre Userscripts → toca `+` → importa el archivo `.user.js` desde Files o iCloud Drive.
3. Activa el script desde la app o desde Ajustes → Safari → Extensions → Userscripts.

> **Nota:** En Safari, los toggles de configuración se editan directamente en el archivo (`CONFIG = { ... }`). `GM_registerMenuCommand` no funciona.

### Tampermonkey / Violentmonkey

1. Instala la extensión en tu navegador.
2. Haz clic en el archivo `.user.js` o usa "Instalar script desde URL".
3. Algunos scripts ofrecen un menú de configuración accesible desde el icono de la extensión.

### Otros gestores

Cualquier gestor compatible con Greasemonkey 4+ debería funcionar. Verifica que soporte los `@grant` que use cada script.

---

## Personalización

### Ver la página original

Agrega `#original` al final de la URL para desactivar el script en esa página:

```
https://www.reddit.com/r/programador#original
```

### Editar la configuración

La mayoría de scripts propios tienen un objeto `CONFIG` al inicio del IIFE:

```javascript
const CONFIG = {
  debug: false,        // activa los logs en consola
  excluir: [],         // ['mibanco.com'] para excluir dominios
  // ... otros toggles
};
```

### Debug

Pon `CONFIG.debug = true` y revisa la consola del navegador (`F12` → Console) para ver qué hace el script.

---

## Crear nuevos scripts

Este repositorio incluye **[Agents.md](Agents.md)**, una guía detallada para que un agente de IA pueda crear nuevos userscripts siguiendo los mismos patrones, convenciones y mejores prácticas.

La guía cubre:

- Estructura del repositorio y convenciones de nombre
- Cabecera `==UserScript==` (campos, `@match`, `@run-at`, `@grant`)
- Estructura del código (IIFE, CONFIG, safe wrapper, debug)
- 10 patrones de implementación reutilizables
- Utilidades comunes (`safe()`, `textoDe()`, `esVisible()`, etc.)
- 3 plantillas base listas para usar
- Mejores prácticas y checklist de validación

---

## Notas

- **Scripts propios** siguen un estilo consistente: IIFE, `'use strict'`, `CONFIG`, `safe()`, comentarios en español.
- Para crear nuevos scripts, consulta la guía [Agents.md](Agents.md).
- Para conflictos o preguntas, abre un issue.
