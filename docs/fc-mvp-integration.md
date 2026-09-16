# FC-MVP-INTEGRATION — Ficha de Costo MVP dentro de COSTPRO

> **ACTUALIZACIÓN (2026-09-16) — FC ACCESS FLOW FIX:** este documento describe la
> integración técnica MVP original (artefacto byte-exacto `FC.release.html` con su
> landing/login propios). El **flujo de acceso fue corregido** en la fase siguiente:
> FC es ahora una **superficie de producto de COSTPRO** con UNA SOLA IDENTIDAD
> (landing y login propios de FC eliminados/desactivados; artefacto servido:
> `FC.html`, release canónico + 11 parches de identidad documentados).
> Ver **`docs/fc-access-flow-fix.md`**. Lo no relacionado con identidad/entrada
> (offline, sync, RLS, motor) permanece vigente tal como se documenta aquí.

**Fase:** REM-FC-MVP (Gate 0 read-only → Gate 1 ejecución con cambio mínimo)
**Mandato:** integrar el MVP de Ficha de Costo (monolito `fichascosto` v12.10.0) en COSTPRO preservando offline, cálculo y funcionalidad. Autorización del propietario: «Primero valida. Después ejecuta.»
**Fecha:** 2026-09-16 · **Repositorio fuente del artefacto:** `Nardian90/fichascosto` (release canónico `4a9ee7f3ed4d56b4441e5f271153ca6b17e0301c362d297f0862a223a31296df`)

---

## Veredicto Gate 0

```text
A. VIABLE CON ADAPTACIONES
B. OFFLINE PRESERVABLE
```

## 1. Cambios realizados

| # | Cambio | Tipo | Justificación |
|---|--------|------|---------------|
| 1 | `public/fc/` — artefactos del release canónico copiados **byte-exactos** (FC.release.html, manifest.webmanifest, release-manifest.json, 4 iconos) | NUEVO (solo distribución) | Estrategia B+E: HTML como recurso estático controlado bajo el dominio de COSTPRO. Regresión matemática garantizada por igualdad de bytes (sha256 verificado antes y después de servir). |
| 2 | `public/fc/index.html` — wrapper de entrada (puente de identidad same-origin) | NUEVO | Único mecanismo para unificar identidad sin tocar el monolito: siembra el sobre `FC_CLOUD_SESSION_V1` que `FcCloud.init()` ya consume, a partir del token estándar `sb-<ref>-auth-token` de supabase-js (mismo origen, mismo proyecto Supabase). Fail-open: nunca borra, sin fetches, sin red requerida. |
| 3 | `public/fc/sw.js` — copia de integración del SW canónico | NUEVO (2 deltas documentados en su cabecera) | (a) allowlist + `index.html` para que la entrada `/fc/` funcione offline; (b) `VERSION=12.10.0-fc.1` para bump de cache. Resto byte-idéntico (shell network-first, estáticos cache-first, Supabase/cruzados jamás cacheados). |
| 4 | `src/proxy.ts` — exención CSP quirúrgica para `/fc/*` | MÍNIMO (1 bloque temprano) | BLOQUEADOR B1: la CSP con nonce+strict-dynamic mata los scripts inline del monolito. Se omite SOLO la CSP en `/fc/*`; todos los demás headers de seguridad se mantienen. Fuera de `/fc/*` la CSP permanece byte-idéntica. |
| 5 | `src/app/fc/route.ts` — redirect 307 server-side a `/fc/index.html` | NUEVO | URL de entrada limpia `/fc/` sin depender de JS (Location relativo RFC 7231, invariante tras proxy). |
| 6 | `src/components/landing/HeroSection.tsx` — CTA «Crear Ficha de Costo — Gratis» (hero + nav móvil) + subtexto con Res. 148/2023 | MÍNIMO (1 CTA + 1 item + 1 línea) | Percepción de un solo ecosistema; producto de entrada accesible desde la landing. |

**NO se modificó:** FC.html / FC.release.html (byte-exacto), motor de cálculo (`computeFicha` protegido por guardas `__ENGINE_START__/__ENGINE_END__` y engineHash), fórmulas, lógica normativa, persistencia de FC, auth interna de FC, SW canónico del repo fichascosto, GitHub Pages (landing de distribución aislada, contrato de release intacto), Supabase (0 DDL, 0 políticas, 0 migraciones), middleware/CSP global de COSTPRO, ninguna tabla ni RLS.

## 2. Archivos modificados

- `src/proxy.ts` (+20 líneas)
- `src/components/landing/HeroSection.tsx` (+23/−1)
- NUEVOS: `public/fc/{FC.release.html, index.html, sw.js, manifest.webmanifest, release-manifest.json, icons/icon-{192,512,maskable-192,maskable-512}.png}`, `src/app/fc/route.ts`, `docs/fc-mvp-integration.md`, `docs/fc-mvp/landing-cta.png`, `docs/fc-mvp/fc-app.png`

## 3. Archivos preservados

- `fichascosto@80c7f55` — **intacto al 100%** (el repo fuente no recibió ni un commit).
- Engine de cálculo: verificado por igualdad sha256 del artefacto servido vs release-manifest (`4a9ee7f3…96df`), ANTES == DESPUÉS por construcción.
- CSP global, guards API (`withAuth/withRole/withStoreAccess`), contrato de 141 SECDEF (fase anterior), landing existente.

## 4. Supabase

- **Mismo proyecto** para COSTPRO y FC (`wthkddeleylijmonclxg`) — sin duplicación de usuarios/identidad/datos (ya era así desde v12.8.0 de fichascosto).
- Tabla `cost_sheets` compartida con convivencia demostrada: FC solo procesa filas con `data.ficha.id` (FC.html:4852) y las del panel COSTPRO llevan otro sobre; el hook COSTPRO (`useCostSheets`) usa Zod laxo (`data: z.any()`) → sin colisión.
- RLS vigente y **verificada en vivo**: INSERT/SELECT/UPDATE/DELETE de FC pasan por `cost_sheets_owner_manage (auth.uid() = created_by)`; la prueba E2E creó filas con `created_by` correcto automáticamente.
- **0 DDL, 0 políticas nuevas, 0 service_role en frontend.**

## 5. Auth

- **Flujo SSO**: login COSTPRO (email/password o Google, sin cambios) → CTA → `/fc/` → wrapper siembra `FC_CLOUD_SESSION_V1` `{v:1, access_token, refresh_token, expires_at(ms), user{id,email}}` → `FcCloud.init()` lo adopta → FC carga `profiles.plan` con ese token. Verificado E2E: perfil `plan: free` cargado con sesión COSTPRO real.
- **Logout COSTPRO**: la revocación del refresh token provoca que el siguiente refresh de FC falle → FC marca `expirada`, limpia y sigue en modo local (sin bloqueo). Comportamiento aceptable y documentado.
- **El bug de sesión de COSTPRO NO se tocó** (diagnóstico en §7; fix propuesto como ciclo separado). FC es inmune por diseño fail-open.
- Usuario de prueba: creado y **neutralizado** (auth ban + `profiles.is_active=false`; filas de prueba borradas 204). Residuo documentado: 1 usuario baneado `65f87559-…-595d51`.

## 6. Offline

| Funcionalidad | Offline ANTES (fichascosto standalone) | Offline DESPUÉS (/fc/ en COSTPRO) | Dependencia de red |
|---|---|---|---|
| Abrir aplicación | SÍ | **SÍ** (SW precachea wrapper+shell) | 0 |
| Crear ficha | SÍ | **SÍ** (verificado E2E offline) | 0 |
| Editar ficha | SÍ | **SÍ** (verificado) | 0 |
| Calcular / recalcular | SÍ | **SÍ** (`computeFicha` offline, grafo Anexo I completo) | 0 |
| Guardar | SÍ | **SÍ** (localStorage, verificado) | 0 |
| Abrir ficha existente / Biblioteca | SÍ | **SÍ** (3 fichas locales intactas tras reload offline) | 0 |
| PDF | SÍ (window.print) | **SÍ** (sin cambios) | 0 |
| Exportar (JSON/Excel) | SÍ | **SÍ** (escritor ZIP propio, sin cambios) | 0 |
| Imprimir | SÍ | **SÍ** | 0 |
| Configuración/tema | SÍ | **SÍ** | 0 |
| Assets | inline | **inline** (0 CDN — verificado) | 0 |
| Auth/contexto | fail-open local | **fail-open** (sobre sembrado + plan cacheado) | solo para validar/refresh |
| Sincronización | opcional fail-open | **igual** (cola = fichas dirty en localStorage) | solo online |

## 7. Diagnóstico del problema de sesión COSTPRO (read-only, NO corregido en esta fase)

Cadena exacta: evento `online` (`useSessionManager.ts:122-128`) → `checkSession(true)` → `getUser()` falla por red aún no lista → `logout()` sin distinguir red de credenciales (`:69-73`) → zustand `unauthenticated` → `window.location.reload()` (`TerminalShell.tsx:258-266`) → «la sesión se reinició».
Caso de destrucción real: perfil falla por red → `user-service.ts:110-112` devuelve `null` en cualquier error → `checkSession:104-107` ejecuta `supabase.auth.signOut()` → SIGNED_OUT → reload (`useSessionManager.ts:139-146`).
Agravantes: timeout 5s (`HomePageClient.tsx:47-56`), `visibilitychange` (60s), `TOKEN_REFRESHED` → revalidación.
Fix recomendado (ciclo separado): distinguir `AuthRetryableFetchError` en `:69`; no `signOut()` si el fallo del perfil fue de red (usar fallback `authenticated_stale_profile` de `:84-89`); eliminar reloads duros; revisar timeout 5s.

## 8. Pruebas online (E2E con browser real, usuario smoke)

- Landing 200 + CTA «Crear Ficha de Costo — Gratis» visible en 320/390/1280 px, sin overflow horizontal.
- Login COSTPRO OK → `sb-…-auth-token` en localStorage → shell con usuario y rol.
- CTA → `/fc/` → 308→307→wrapper→FC.release.html → **perfil cloud cargado (plan free)**.
- Crear ficha → sync push → **filas verificadas server-side con `created_by` correcto por RLS** (2/2).

## 9. Pruebas offline (browser offline vía CDP)

- **Test 2**: reload sin red → app viva desde cache SW (`costpro-release-12.10.0-fc.1`, 7 recursos precacheados) con las 3 fichas locales intactas.
- **Test 1**: crear ficha offline («Ficha Offline Test») + guardar + `computeFicha` completo offline (0 errores, auditoría 24 claves).
- **Test 3**: reconexión → `syncNow` → 3/3 fichas con `cloudId`, `lastError: null`, fila verificada server-side. La primera carrera de red al reconectar falló y FC la manejó con reintento sin pérdida (exactamente el comportamiento de diseño).
- Regresión matemática: **sha256 del artefacto servido == manifest == copia** (`4a9ee7f3…96df`); engine intocado por construcción.

## 10. Seguridad

- 0 service_role / secretos en el artefacto (grep del servido: 0; release-manifest `noSecrets`).
- Offline ≠ bypass: sin red no hay consultas; con red todo pasa por RLS (`auth.uid() = created_by`).
- El wrapper lee solo credenciales del propio usuario en su propio navegador (same-origin); no amplía privilegios.
- CSP global intacta fuera de `/fc/*`; en `/fc/*` se mantienen nosniff/XFO/HSTS/Referrer/Permissions.
- Nota preexistente documentada (NO tocada): cuentas locales hardcodeadas `usuario`/`admin` en FC.html L3828 (PBKDF2, solo efecto local en el navegador del usuario) — hardening recomendado post-MVP en fichascosto.
- freeEnforce=false (gate comercial dormante) — decisión de producto preexistente de fichascosto, sin cambios.

## 11. Riesgos residuales

1. Bug de sesión COSTPRO (§7) — afecta UX de COSTPRO, no a FC. Fix separado recomendado.
2. Producción COSTPRO corre en modo dev (`NODE_ENV=development` → `next({dev:true})`, preexistente). El MVP funciona en este modo (verificado); un futuro build productivo necesitará resolver OOM del build en esta caja (3.9GB) o CI.
3. Sincronización de la copia `/fc/`: actualizar el artefacto = copiar el nuevo release de fichascosto + revisar deltas del sw + bump VERSION (procedimiento en §12).
4. Usuario invitado de FC sigue el funnel propio (límite 3 fichas guest) — comportamiento intencional de fichascosto preservado.
5. FC no tiene enlace «volver a COSTPRO» (monolito intocado); navegación por URL/atrás del navegador.

## 12. Rollback

- Git: `git revert <commit>` + `pm2 restart costpro` — elimina `/fc/*`, exención CSP, CTA y ruta (todo lo añadido es aditivo; 3 archivos tocados son revertibles limpiamente).
- Sin rollback de Supabase necesario (0 DDL). Sin rollback de fichascosto (repo intocado).

## 13. Estado del MVP

**MVP READY** — con las siguientes verificacaciones reales: SSO COSTPRO→FC funcionando con perfil real; offline completo (crear/editar/calcular/guardar/recargar sin red); sincronización con RLS verificada server-side; regresión matemática por igualdad byte; mobile 320–1280 sin overflow; CSP global intacta; rollback limpio.

Criterios pendientes de ciclo posterior (no bloquean el MVP): fix del bug de sesión de COSTPRO, hardening de cuentas locales de fichascosto, actualización del artefacto cuando salga el próximo release canónico.

---

Ruta de la visión futura (NO ejecutada): HTML MVP → baseline (`computeFicha` ya delimitado con engineHash) → FC Calculation Core → migración progresiva a Next.js, demostrando equivalencia funcional y normativa contra este MVP.
