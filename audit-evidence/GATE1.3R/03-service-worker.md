# GATE 1.3R.1 — 03 SERVICE WORKER (estrategias, fix y validación)

## Estrategias detectadas (§7)

`public/sw.js` (scope `/`):
- Precache: solo `/offline.html`.
- Default handler: **NetworkOnly** (auth-safe).
- `/_next/static/*` → **CacheFirst** (`costpro-next-static-v4`, 7 días, 60 entradas, statuses [0,200]) — PELIGROSO EN DEV fuera de localhost.
- `/api/sync/batch` POST → NetworkOnly + BackgroundSync.
- Activate: borra TODA cache salvo `costpro-next-static-v4`; `skipWaiting` + `clients.claim`.

`public/fc/sw.js` (scope `/fc/`, app Ficha de Costo):
- ALLOWLIST: index.html, FC.html, manifest, icons — **no cachea `/_next/static/`** → no participa en el bug.
- FC.html network-first; estáticos de versión cache-first; sin skipWaiting/claim.

## Fix aplicado (§10 — mínima corrección, preferencias 1–3)

`src/components/ServiceWorkerRegister.tsx` — GATE 1.3R.1 FIX-SW-DEV:
1. **Registro SOLO en producción** (`process.env.NODE_ENV === 'production'`) — alinea este
   componente con el criterio de `layout.tsx` (FIX-ENTRY). En dev ya no se registra NINGÚN SW.
2. **Limpieza activa en dev**: desregistra cualquier SW preexistente
   (`getRegistrations().forEach(unregister)`) y borra caches `costpro-*` — sana los navegadores
   ya afectados sin acción del usuario (segundo reload queda limpio).
3. Producción intacta: Workbox + CacheFirst sobre artefactos con hash (seguros por inmutabilidad).

NO se eliminó `ListFilter`; NO se sustituyó lucide-react; NO se tocó `sidebar.structure.ts`.

Complemento (`next.config.ts` — FIX-DEV-ORIGIN): `allowedDevOrigins` += `21.0.6.25`, `127.0.0.1`,
`0.0.0.0` (solo afecta dev) — elimina la variante 403 por acceso directo por IP.

## Validación (§11) — `02-runtime-error-fix-validation.json`

| Caso | regs | controlled | costpro-* caches | errores relevantes |
|---|---|---|---|---|
| Fresh browser (dev) | 0 | false | [] | 0 |
| Browser con SW PREVIO (simulado) → reload | **0** (unregister OK) | true (carga aún controlada por el SW viejo) | residual (recacheada por el SW viejo durante esa carga) | 0 |
| Reload #2 del mismo contexto | 0 | **false** | **[]** (cleanup ejecutado) | 0 |
| Nueva pestaña | 0 | false | — | 0 |
| 2ª carga posterior | 0 | false | [] | 0 |

- Hard reload + normal reload: ambos OK.
- Único console error residual: `WebSocket is already in CLOSING or CLOSED state` — teardown del
  socket realtime al cerrar el browser de automatización; sin relación con chunks/SW.
- 403 fix: chunk vía `Origin: http://21.0.6.25:3000` → **200** (antes 403).

## Resultado esperado alcanzado

```text
0 module factory errors
0 stale chunk errors
0 console errors relacionados
```
