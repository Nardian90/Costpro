# GATE 1.3R.1 — 04 CACHE-HEADERS (§6)

Headers reales medidos (curl, `02-runtime-error.json` → headers):

| Recurso | Cache-Control | Otros |
|---|---|---|
| `/` (HTML app) | `no-cache, must-revalidate` | HTML siempre revalidado — seguro |
| `/sw.js` | `public, max-age=0` | revalida en cada carga — seguro |
| `/manifest.json` | `public, max-age=0` | seguro |
| `/_next/static/chunks/*` (dev, Turbopack) | (sin Cache-Control explícito; nombres con hash de sesión no inmutables) | aquí operaba el SW CacheFirst — el peligro no era el header sino la estrategia del SW |

## Combinación peligrosa evaluada

```text
HTML cacheado + chunks cacheados + service worker + deploy nuevo
```

- HTML cacheado: **NO** (no-cache).
- SW sirviendo HTML viejo: **NO** (default handler NetworkOnly).
- SW sirviendo CHUNKS viejos: **SÍ** en dev no-localhost (CacheFirst) — corregido (03-service-worker.md).
- `/fc/sw.js`: solo cachea su allowlist — sin interacción con chunks de Next.

Conclusión: no se cambió ningún header a ciegas (no fue necesario); el vector real era la
estrategia del SW en dev, corregida en el componente registrador.
