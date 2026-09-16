# FC ACCESS FLOW FIX — Una sola identidad COSTPRO (2026-09-16)

> **Misión**: convertir Ficha de Costo (`/fc/`) en una **superficie de producto de COSTPRO**,
> eliminando su identidad visual y de autenticación duplicada (landing + login propios),
> conservando intacto el funcionamiento offline y el motor normativo.
> Complementa a `docs/fc-mvp-integration.md` (integración técnica MVP, commit `5f5fe2f5`).

---

## 0. Diagnóstico (por qué aparecía el login/landing de FC)

La integración anterior siembrа correctamente la identidad COSTPRO
(`FC_CLOUD_SESSION_V1` desde `sb-<ref>-auth-token`), pero **FC nunca la usaba para entrar**:

```text
COSTPRO → CTA → /fc/ → wrapper (siembra) → FC.release.html
   boot(): Landing.init()          → 1ª visita: LANDING de marketing de FC
   gateEnter(): Auth.current()     → sesión LOCAL de FC (sessionStorage FC_SESSION_V1)
             └ null → showAuth()  → LOGIN PROPIO de FC (tabs login/registro/invitado/cloud)
```

La identidad sembrada solo alimentaba plan/sync (`FcCloud`), jamás la entrada
(`gateEnter` decide con `Auth.current()`, el segundo mecanismo de autenticación).
Además `manifest.start_url=./FC.release.html` arrancaba la PWA **sin wrapper**
(envelope obsoleto tras rotación de refresh_token → expulsiones).

## 1. GATE 0 — elementos FC eliminados/desactivados (A)

| # | Elemento | Antes | Después |
|---|----------|-------|---------|
| R1 | `<title>FC · …` | Marca de app independiente | `COSTPRO · Ficha de Costos y Gastos — Res. 148/2023 MFP` |
| R2 | Appbar `<small>` | Sin marca de ecosistema | `COSTPRO · Resolución 148/2023 · MFP · Anexo I` |
| R3 | `Landing.shouldShow()` | `true` en 1ª visita | `false` — landing de marketing **NUNCA** se muestra |
| R4 | `Landing.open()` | Abre overlay marketing | `window.location.href="/"` — «Volver a COSTPRO» |
| R5 | `Landing.close()` | Overlay | no-op (inerte) |
| R6 | `gateEnter()` | `Auth.current()` local o login FC | **Adopta identidad COSTPRO** (envelope `FC_CLOUD_SESSION_V1` o, si no, lo deriva de `sb-…-auth-token` same-origin); sin identidad → redirect a **login COSTPRO** `/?login=1&returnTo=%2Ffc%2F` |
| R7 | `doLogout()` | `showAuth()` (login FC) | Cierra contexto FC (`Auth.logout` + `FcCloud.signOut`, que revoca el token compartido) y vuelve a COSTPRO |
| R8 | `showAuth()` | Muestra login FC | **REDIRECT a login COSTPRO** — cubre `guestTransition`, `guestCreate`, `openCuenta` y cualquier path futuro. Login FC = INEXISTENTE |
| R9 | Botón «Presentación» | `verLanding` → marketing | **«Volver a COSTPRO»** (título/aria/texto) |
| R10 | `FcCloud.signInFromAuthScreen` | Form cloud en auth screen | Redirect a login COSTPRO |
| R11 | `FcCloud.signInFromCuenta` | Form cloud en «Mi cuenta» | Redirect a login COSTPRO |

**Inventario residual inerte (no alcanzable, sin diff innecesario)**: markup `#landing`
(permanece `hidden`, inalcanzable con R3/R4), `#authScreen` (permanece `hidden`,
inalcanzable con R8), `FC_AUTH_ACCOUNTS`/`Auth.signIn/register`/`bridgeRegister`
(muertos: su única vía de entrada era `auForm`, inaccesible), `FcCloud.signUp`
(idem), modo invitado (sin punto de entrada nuevo).

## 2. Flujos resultantes (B/C)

```text
FLUJO 1 — no autenticado:
COSTPRO landing ─ CTA «Crear Ficha de Costo — Gratis» ─► /fc/
  wrapper: no hay sb-token ─► /?login=1&returnTo=%2Ffc%2F
  ─► modal LOGIN COSTPRO (auto-abierto; Google o email/password)
  ─► login OK ─► returnTo (allowlist) ─► /fc/ ─► siembra ─► /fc/FC.html ─► app

FLUJO 2 — ya autenticado:
COSTPRO landing ─ CTA ─► /fc/ ─► wrapper: siembra ─► /fc/FC.html ─► app (sin login)

FLUJO 3 — dentro de /fc/:
App directamente (Fichas). Header: marca COSTPRO · botón «Volver a COSTPRO».
Sin landing, sin login, sin registro, sin invitado, sin segundo onboarding.

FLUJO 4 — OFFLINE (prioridad absoluta):
Con sb-token/envelope persistidos: reload offline ─► SW sirve shell ─► gateEnter
adopta identidad local ─► app completa (crear/editar/calcular/guardar/PDF/sync local).
NUNCA: logout, redirect a login, reload forzado, pérdida de contexto.
Sin identidad COSTPRO previa + offline: no hay entrada (offline ≠ permisos nuevos).
```

## 3. Principios aplicados

- **UNA SOLA IDENTIDAD**: `Supabase Auth COSTPRO → COSTPRO + Ficha de Costo`.
  FC ya no autentica, registra ni recupera contraseñas.
- **returnTo NO es autorización**: `safeReturnTo()` (`src/lib/navigation.ts`) solo
  acepta rutas internas de la allowlist real (`/fc/`); absolutos, protocol-relative
  (`//`) y paths no permitidos → `/`. La autorización es sesión COSTPRO + RLS.
- **OFFLINE = continuar con contexto local, NO permisos nuevos**: la adopción de
  identidad es local (0 fetches, same-origin); todo acceso remoto sigue pasando
  por access token + RLS (`created_by = auth.uid()`).
- **El bridge NUNCA borra sesiones**: el wrapper jamás elimina `FC_CLOUD_SESSION_V1`;
  `FcCloud.init` solo la descarta ante rechazo **explícito del servidor**
  (`refresh_denegado`), nunca ante fallo de red (queda en `offline`).
  El wrapper decide la entrada por el token vivo de COSTPRO (`sb-`), no por el
  envelope residual (evita entradas con credenciales ya cerradas).
- **Superficie inicial ≠ límite artificial**: entrar por `/fc/` no oculta COSTPRO
  con seguridad frontend; los demás módulos siguen protegidos por sus reglas reales.

## 4. Archivos modificados (E)

| Archivo | Cambio |
|---|---|
| `public/fc/FC.html` | **NUEVO** — release canónico v12.10.0 (`4a9ee7f3…96df`) + 11 parches R1–R11 (sha256 `3737d7c1…a374`) |
| `public/fc/FC.release.html` | **ELIMINADO** del árbol servido (canonical queda en repo fichascosto + historial git `5f5fe2f5`) |
| `public/fc/index.html` | Wrapper v2: decisión de entrada (sb-token → FC.html; sin sesión → login COSTPRO con returnTo) |
| `public/fc/sw.js` | `VERSION 12.10.0-fc.2`; ALLOWLIST `+FC.html −FC.release.html`; rama network-first para `FC.html` |
| `public/fc/manifest.webmanifest` | `start_url`/`id` → `./index.html` (arranque PWA pasa por el wrapper; evita envelope obsoleto) |
| `public/fc/release-manifest.json` | schemaVersion 2: proveniencia canónica + hashes + parches + distribución |
| `src/lib/navigation.ts` | `safeReturnTo()` + `returnToFromLocation()` (allowlist, anti open-redirect) |
| `src/app/LandingPage.tsx` | Auto-abre modal login con `?login=1`; limpia `login`/`returnTo` al cerrar el modal |
| `src/app/HomePageClient.tsx` | Consume `returnTo` tras resolver auth (round-trip Google OAuth) |
| `src/components/auth/LoginForm.tsx` | Nav post-login a `returnToFromLocation()`; Google `redirectTo` preserva `returnTo` |
| `src/components/auth/RegisterForm.tsx` | Google `redirectTo` preserva `returnTo` |
| `src/proxy.ts` | Solo comentario (referencia al artefacto FC.html) |
| `docs/fc-access-flow-fix.md` | Este documento |
| `docs/fc-mvp-integration.md` | Nota de supersession de flujo de acceso |
| `scripts/fc-identity-patch.py` | Generador determinista de FC.html (verifica unicidad de objetivos + motor byte-igual) |
| `scripts/fc-syntax-check.cjs` | Validación sintáctica de los `<script>` del artefacto |
| `scripts/fc-access-test-user.cjs` | Usuario E2E de prueba (create/cleanup) |
| `docs/fc-access-fix-mobile-320.png`, `docs/fc-access-fix-desktop.png` | Evidencia visual |

## 5. Archivos que NO se tocaron (F) — verificación

- **Motor normativo**: región `__ENGINE_START__/__ENGINE_END__` **BYTE-IGUAL** al canónico
  (md5 `180b1f349a002b3c2cda2b015ab9b7a3` en ambos). Fórmulas, Res. 148/2023, `computeFicha`, PDF, Excel: intactos.
- **Persistencia local** (`FC_RES148_2023_V1`, IndexedDB-equivalentes), **`FcCloud`/`FcSheets`** (sync), **SW offline semantics**.
- **Supabase schema / RLS**: 0 DDL, 0 políticas. Verificación en vivo: spoof de
  `created_by` → `403 (42501)`; lectura cross-user → `[]`; lectura propia → filas correctas.
- **`src/proxy.ts` (headers), `src/app/fc/route.ts`, HeroSection (CTA), repo `fichascosto` (0 commits)**.

## 6. Pruebas ejecutadas (TODAS PASS)

| Test | Escenario | Resultado |
|---|---|---|
| A | No autenticado: landing → CTA → login COSTPRO (modal auto) → `/fc/FC.html` | PASS |
| B | Autenticado: `/fc/` directo → app sin pedir login | PASS |
| C | Login FC: `showAuth()` → redirect login COSTPRO; `/fc/FC.release.html` → **404**; botón «Volver a COSTPRO» | PASS |
| D | Entrar a `/fc/` directamente → aplicación (no landing marketing) | PASS |
| E | Offline: reload → app viva; crear/editar/calcular/guardar (10.455 bytes) → PDF 2 páginas sin marca de agua | PASS |
| F | Reconexión: sync 2/2 fichas → cloudId asignados, filas en `cost_sheets` con `created_by` correcto, **sin logout**, envelope refrescado (~55 min de validez) | PASS |
| E+ | Offline + cierre de navegador (sessionStorage muerto): reload → re-adopción de identidad desde storage persistente, fichas intactas | PASS |
| G | `returnTo=https://evil.com` / `//evil.com` / `/dashboard` → rechazados (sin navegación); `/fc/` → honorado | PASS |
| G | RLS: insert con `created_by` ajeno → **403 42501**; lectura cross-user → `[]`; propia → 2 filas | PASS |
| UX | Mobile 320px: botón visible, sin overflow horizontal (`scrollWidth=320`) | PASS |

## 7. Rollback

1. `git revert` del commit de este fix restaura `public/fc/FC.release.html` + wrapper v1
   (el artefacto anterior era la copia byte-exacta del release canónico).
2. No hay cambios en Supabase/RLS/datos: rollback puramente de archivos estáticos y código de navegación.
3. El release canónico v12.10.0 permanece inalterado en `fichascosto` (tag/release oficial).

## 8. Estado

**MVP READY — FC es una superficie de COSTPRO**: un solo login, un solo landing,
una sola identidad; ONLINE + OFFLINE + SSO + RLS coexisten sin regresiones.
Pendiente separado (preexistente, fuera de alcance): diagnóstico de sesión
COSTPRO en `useSessionManager.ts` (Task 10, fix propuesto como ciclo propio).
