# INC-20261030 — Cierre de sesión masivo y rebote al landing («Entrar a COSTPRO» devolvía al landing)

**Fecha:** 2026-10-30 · **Severidad:** ALTA (indisponibilidad total de autenticación en producción) · **Estado:** RESUELTO + fix de resiliencia en este PR

---

## 1. Resumen ejecutivo

La instancia **Postgres** del proyecto Supabase `wthkddeleylijmonclxg` (CostproBD, `us-east-1`) dejó de aceptar conexiones. El servicio de autenticación (**GoTrue**) depende de esa base de datos: quedó inalcanzable a través del edge (Cloudflare **522**) y todos los clientes con sesión activa fueron expulsados al landing. El botón «Entrar a COSTPRO» rebotaba de vuelta al landing porque el check de sesión colgaba y la app forzaba `unauthenticated` a los 5 s.

**No fue causado por los PRs #1527/#1528** (verificado en §5). La remediación fue reiniciar Postgres vía Management API. Este PR añade resiliencia para que una caída futura del backend de auth **no expulse al usuario con sesión local válida**.

## 2. Síntoma

1. Usuario autenticado de forma normal es deslogueado «de un momento a otro».
2. Clic en «Entrar a COSTPRO» (landing, `HeroSection.tsx` camino 2) → con sesión local en localStorage navega a `/` → `HomePageClient` no puede validar la sesión → **vuelve a mostrar el landing**.
3. Iniciar sesión desde el modal también falla (GoTrue inalcanzable).

## 3. Diagnóstico — evidencia técnica

| Check | Resultado | Interpretación |
|---|---|---|
| `GET https://wthkddeleylijmonclxg.supabase.co/auth/v1/health` | **522 / timeout (×4 intentos, 15–25 s cada uno)** | GoTrue inalcanzable a través de Cloudflare |
| `POST /auth/v1/token?grant_type=password` | **522** | Flujo de login colgado |
| `GET /storage/v1/status` | **200** | Storage OK (pool de conexiones ya establecido) |
| `GET /rest/v1/` (metadatos) | **401** con `sb-project-ref` correcto | Gateway REST vivo (no toca la BD aún) |
| `GET /rest/v1/stores?select=id&limit=1` (secret key) | **Error 5xx Cloudflare** | Toda query de datos contra BD colgada |
| Management API `POST /v1/projects/{ref}/database/query` | **«Connection terminated due to connection timeout»** | **Postgres no acepta conexiones nuevas** |
| Management API `GET /v1/projects/{ref}` | **`ACTIVE_HEALTHY`, PG 17.6.1.063, us-east-1** | El panel de Supabase NO reflejaba el problema |
| status.supabase.com | «All Systems Operational» (solo incidente resuelto: «Logs degraded», 11:38 UTC) | Sin incidente público que lo cubriera |

**Conclusión:** proyecto «ACTIVE_HEALTHY» de nombre, pero con la base de datos colgada a nivel de plataforma. Storage respondía porque su pool ya estaba establecido; todo lo que necesitaba una conexión nueva (GoTrue, PostgREST, Management API) se colgaba.

### Por qué el usuario acababa en el landing (cadena de fallo en el cliente)

1. `useSessionManager.checkSession()` → `supabase.auth.getUser(token)` cuelga → `Promise.race` rechaza con `Session check timeout` a los 8 s → el `catch` hacía `setAuthStatus('unauthenticated')` cuando `user` era `null`, y la rama `userError` hacía `logout()` **sin distinguir fallo de red de credenciales inválidas**.
2. `HomePageClient` forzaba `unauthenticated` a los **5 s** si `loading` seguía activo → `LandingPage`.
3. El botón «Entrar a COSTPRO» usa `hasCostproSession()` (presencia de `sb-*-auth-token` en localStorage): la sesión local seguía ahí → `window.location.assign('/')` → rebote al landing otra vez. **Loop.**

## 4. Remediación aplicada (2026-10-30)

1. `POST /v1/projects/wthkddeleylijmonclxg/restart` con `{"restart_type":"postgresql"}` → HTTP 200.
2. Recuperación verificada (~90 s después):
   - `/auth/v1/health` → **200** `{"name":"GoTrue","version":"v2.197.0"}`
   - `GET /rest/v1/stores?limit=1` (secret) → **200** con datos
   - `POST /auth/v1/token` (credenciales falsas) → **400 `invalid_credentials`** (GoTrue vuelve a tocar la BD y responde protocolo correcto, ya no 522)
3. Diagnóstico post-restart de la BD (Management API):
   - **13/60 conexiones** (0 `idle in transaction` salvo la actividad normal de GoTrue), **sin bloqueos**, **sin transacciones > 5 min**.
   - Integridad OK: `auth.users` = 32, `auth.refresh_tokens` = 267, `auth.sessions` = 259.
   - `create_store_with_membership` con `search_path = pg_catalog, public` correcto.
   - Migraciones registradas en `supabase_migrations.schema_migrations`: 12.

No hubo pérdida de datos. Las sesiones/refresh tokens sobrevivieron; solo los clientes cuyo refresh falló durante la ventana del outage necesitaban volver a autenticarse.

## 5. ¿Culpa de los dos últimos PRs mergeados? — NO

| PR | Contenido | Análisis |
|---|---|---|
| **#1528** `feat/catalogo-maestro-piloto-puerto-padre-20261030` | Migración `20261030130000_cp_org_003_fix_cswm_record_id_type.sql` (`CREATE OR REPLACE FUNCTION create_store_with_membership`, fix de tipo `record_id` uuid vs text) + `20261030143000` (CHECK de auditoría) + docs/tests/evidencia | Ninguna operación toca el esquema `auth.*` ni el pool de GoTrue. Un `CREATE OR REPLACE FUNCTION` toma un bloqueo brevísimo sobre la función, no sobre tablas. Verificado en vivo post-restart: la función quedó con `search_path` correcto y la BD sin bloqueos. La migración aplicó con éxito (evidencia comprometida en `audit-evidence/MAESTRO-004/`). |
| **#1527** `fix/pos-express-parity-buscador-20261030` | Solo frontend: `POSExpressMode.tsx`, `POSView.tsx`, tests | Imposible de relacionar con sesiones/infraestructura de auth. |

El colapso fue de infraestructura (Postgres dejó de aceptar conexiones). Coincidencia temporal con los merges (~10:57 EDT) pero sin relación causal: la evidencia de BD post-restart no muestra restos de bloqueos ni saturación (13/60 conexiones), y ningún objeto del esquema `auth` fue modificado por ninguna migración del día.

## 6. Fix de resiliencia (este PR)

Objetivo: que una caída del backend de auth **no expulse a usuarios con sesión local válida** y que el fallo sea visible/acotado, nunca un bucle.

### `src/lib/auth-outage.ts` (nuevo)

`isRetryableAuthOutage(err)` clasifica el error:
- **Transitorio → reintentar:** timeouts (`Session check timeout`), `Failed to fetch`/`fetch failed`/`load failed`, `AuthRetryableFetchError`, errores 5xx (tipados vía `err.status` o embebidos en el mensaje), errores de conexión (`ECONNRESET`, `ETIMEDOUT`, `connection terminated`…).
- **Definitivo → logout legítimo:** 4xx tipados, `invalid_credentials`, `bad_jwt`, JWT expirado, `refresh_token_not_found` (evita bucles con tokens irrecuperables).

### `src/hooks/logic/useSessionManager.ts`

- `session` se declara fuera del `try` para que el `catch` distinga «sin sesión local» de «con sesión local + backend caído».
- Rama `userError` de `getUser()` y `catch` de `checkSession()`: con error **transitorio** y sesión local → **reintento escalado (5 s → 15 s → 30 s, máx. 3)** conservando `loading=true`; solo fallo definitivo o escalera agotada → comportamiento previo (`logout()`/`unauthenticated`), acotado.
- Contador de reintentos se resetea en cada verificación exitosa.
- Failsafe anti-loading-infinito: 5 s sin sesión local (original); **20 s** con sesión local.

### `src/app/HomePageClient.tsx`

- El forzado a `unauthenticated` de los **5 s** se omite si `hasCostproSession()` (el reintento puede recuperar la sesión); se añade failsafe absoluto a **25 s** para que el landing nunca cuelgue indefinidamente.
- Restaurado intacto el bloque `currentState`/`queueMicrotask` para remounts con store ya resuelto.

### Tests

- `src/__tests__/lib/auth-outage.test.ts` — clasificación transitorio/definitivo + forma de la escalera.
- `src/__tests__/hooks/useSessionManager-auth-outage.test.tsx` — (1) timeout con sesión local NO hace logout, programa reintento y **se recupera solo** cuando el backend vuelve; (2) 401 `bad_jwt` SÍ hace logout inmediato; (3) outage prolongado agota la escalera (4 llamadas a `getUser`) y queda un estado acotado, sin bucle; (4) `TOKEN_REFRESHED` tras el outage refresca el token. Patrón de mocks calcado de `useSessionManager-logout.test.tsx`.
- Regresión: `useSessionManager-logout.test.tsx` (9/9) sigue en verde.
- Verificación: `vitest run` 21/21 en los 3 archivos de sesión; ESLint limpio en los 5 archivos; `tsc` acotado sin errores nuevos (los 4 errores styled-jsx de CyberShell/ParticleBackground/CostSheetFlatTable/CameraBarcodeScanner son preexistentes en `main`, verificados por diff de salida).

## 7. Recomendaciones de prevención

1. **Alertas de infraestructura:** el panel decía `ACTIVE_HEALTHY` con la BD colgada. Vigilar `/auth/v1/health` y una query SQL barata (p. ej. `SELECT 1` vía Management API) desde un monitor externo.
2. **Dashboard de cliente:** distinguir «sin sesión» de «no se pudo verificar la sesión» (banner de reconexión en vez de rebote silencioso).
3. Considerar `sessions_timebox` y retención de `auth.sessions` (259 sesiones / 32 usuarios) en revisiones periódicas del uso del pool.
4. Documentar el runbook de reinicio de Postgres (Management API) como procedimiento de emergencia — este incidente queda como referencia.
