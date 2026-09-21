# GATE 1.3R.1 — 02 RUNTIME ERROR (`lucide-react / ListFilter / module factory is not available`)

## 1. Reproducción (§4) — matriz completa

Entorno emulado del usuario: **secure context + hostname NO-localhost**
(`preview-test.space-z.ai` → 127.0.0.1 vía host-resolver-rules + flag
`--unsafely-treat-insecure-origin-as-secure`), idéntico al acceso real por
`https://preview-<bot-id>.space-z.ai/`. Servidor: Next.js **dev con Turbopack**
(`next({ dev: true })` en `server.ts`; procesos `.next/dev/build/chunks/[turbopack-node]`).

| Caso | Resultado |
|---|---|
| A · sesión nueva (fresh context) | 15 chunks `/_next/static/**` fallan: **403 Forbidden** → `net::ERR_ABORTED` |
| B · hard reload (CDP cache disabled) | idéntico — 15 × 403 |
| C · nueva pestaña | idéntico |
| D · perfil/incógnito limpio | idéntico — **descarta "caché del navegador"** |
| E · SW desregistrado + Cache Storage limpio | idéntico — **descarta SW como única causa** |
| F · reload tras limpiar cache storage | idéntico |

Fuente: `02-runtime-error.json` (casos A–F), `02-runtime-probe.json`.

## 2. El 403: bloqueo de origen dev de Next.js 16

Logs del servidor (pm2) durante la reproducción:

```text
⚠ Blocked cross-origin request to Next.js dev resource /_next/static/chunks/_1p81836._.js
  from "preview-abc.proxy.space-z.ai".
Cross-origin access to Next.js dev resources is blocked by default for safety.
To allow this host in development, add it to "allowedDevOrigins" in next.config.js
```

Matriz Origin (curl, misma URL de chunk):

| Origin | Estado |
|---|---|
| (sin Origin) | 200 |
| `http://21.0.6.25:3000` (IP contenedor) | **403** |
| `https://preview-abc.space-z.ai` | 200 (wildcard `*.space-z.ai` cubre 1 nivel) |
| `https://preview-abc.proxy.space-z.ai` | **403** (2 niveles NO cubiertos) |
| `http://preview-abc.space-z.ai:3000` | 200 (compara hostname, no puerto) |

Consecuencia directa: un chunk que no carga = **module factory no registrada** = exactamente el
error observado `list-filter.js <export default as ListFilter> … module factory is not available`.
NOTA: `sidebar.structure.ts` NO importa lucide-react hoy (grep) — el error referenciaba la
instancia en el grafo del cliente de una sesión/build anterior.

## 3. Service Worker (§5/§7) — hallazgos

- `layout.tsx` (FIX-ENTRY): registro inline **solo producción**.
- `ServiceWorkerRegister.tsx`: montado SIEMPRE (incl. dev) — hace `HEAD /sw.js` y registra vía
  Workbox si 200. En dev **sí registra** cuando el origen está allowlistado (probe manual:
  `register('/sw.js')` → scope `/`, state `activated`, `controlled: true`).
- `sw.js`: guard `IS_DEV_HOST` solo cubre `localhost/127.0.0.1/0.0.0.0` → en host de preview
  aplica la **rama de producción: CacheFirst sobre `/_next/static/*`** (cache
  `costpro-next-static-v4`, 7 días, 60 entradas).
- Los chunks de Turbopack dev NO llevan marcadores `/development/` ni `/webpack/` → el filtro
  `isCacheableStaticAsset` los considera cacheables (el comentario FIX-STALE-DEV 2026-09-20 ya
  advertía del hueco, pero solo se arregló localhost).

## 4. Test de versiones (§8) — prueba byte-level de stale serving

`02-runtime-error-repro3.json` + `02-runtime-error-repro4.json`:

1. Carga inicial → SW activado → **39 chunks dev cacheados** (incl. HMR client, react-dom dev, CSS).
2. Edición de `src/app/LandingPage.tsx` (probe con backup+restore) → recompile.
3. Chunk `src_05nizxw._.js`: **URL idéntico**, cache SW = 84.013 B, servidor = 84.041 B.
4. `fetch()` desde la página (atravesando el SW): **84.013 B — el SW SIRVE BYTES VIEJOS**
   (`swServesStaleBytes: true`).

Un cliente con HTML fresco + chunks stale (o al revés) produce exactamente la clase de error
"module factory is not available" para cualquier export (p.ej. `ListFilter`).

## 5. Clasificación (§9)

| Categoría | Aplica |
|---|---|
| **SERVICE-WORKER BUG** | **SÍ — CAUSA PRIMARIA**: CacheFirst de chunks dev no-inmutables en hosts no-localhost (guard `IS_DEV_HOST` incompleto) |
| CACHE-CONTROL BUG | No — HTML `no-cache, must-revalidate`; `/sw.js` `max-age=0`; chunks con hash de sesión |
| NEXT BUILD/CHUNK BUG | Parcial — el guard `allowedDevOrigins` de Next 16 bloquea 403 orígenes legítimos (IP directa, subdominios de 2 niveles) |
| RUNTIME-CACHE BUG | No (HTTP cache descartado en caso B) |
| BROWSER-STATE ARTIFACT | No (descartado en casos D/E/F) |

Veredicto: el error NO era "caché del navegador" — eran dos mecanismos verificables:
(1) SW CacheFirst sirviendo chunks dev stale/muertos, (2) 403 de origen dev.
