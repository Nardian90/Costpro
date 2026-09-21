# GATE 1.3R.1 — 11 FINAL (§30, §33, §34)

## GATE FINAL checklist (§30)

```text
RUNTIME ERROR RESOLVED ................ ✓  (SW prod-only + cleanup dev; 403 origin fix)
SERVICE WORKER/CACHE BEHAVIOR VERIFIED ✓  (byte-level stale proof + validación A–F post-fix)
PERFORMANCE BG FIXED .................. ✓  (#121212 estándar; #0a0a0a solo en sidebar == estándar)
VENTAS HIERARCHY IMPLEMENTED .......... ✓  (Vender featured + Caja + Historial; Otras opciones ×6)
VENDER REMAINS 1-CLICK ................ ✓  (sidebar → /?view=pos = 1 click; móvil tab = 1 tap)
CAJA DISCOVERABLE ..................... ✓  (capa primaria del hub; 2 clicks total)
HISTORIAL DISCOVERABLE ................ ✓  (capa primaria del hub; 2 clicks total)
SECONDARY OPTIONS ACCESSIBLE .......... ✓  (Otras opciones: 6/6, orden §19)
COMMAND PALETTE INTACT ................ ✓  (10/10 términos al primer hit correcto)
DEEP LINKS INTACT ..................... ✓  (11 vistas + refresh/back/forward)
ROLES UNCHANGED ....................... ✓  (navigation-definition intacto; 73/73 nav tests)
NO DUPLICATE IMPLEMENTATIONS .......... ✓  (hub Vender → mismo viewId pos / mismo componente)
NO BACKEND CHANGES .................... ✓  (0 cambios API/DB/permisos)
TESTS PASS ............................ ✓  (tsc 0 · vitest 2143/0 · lint 0 errores · nav 73/73)
BROWSER PASS .......................... ✓  (1440/1280/1024/390/375 + fresh/existing/SW-on/off)
```

## Veredicto (§33)

**GATE 1.3R.1 = CERTIFIED**

Residuales documentados (no bloquean):
- P3: `allowedDevOrigins` cubre `*.space-z.ai` (1 nivel); un subdominio de 2 niveles p.ej.
  `x.proxy.space-z.ai` seguiría 403 — el acceso real documentado (`preview-<bot-id>.space-z.ai`)
  está cubierto, y el SW ya no se registra en dev de todos modos.
- P3: warnings de lint (1287, preexistentes) — refactor incremental V2.12.25 fuera de alcance.

## Informe final (§34)

```text
GATE 1.3R.1 = CERTIFIED

RUNTIME ERROR:      RESUELVED — SERVICE-WORKER BUG (CacheFirst dev en host no-localhost) + 403 allowedDevOrigins; repro A–F + prueba byte-level (84.013 B stale vs 84.041 B server, mismo URL)
SERVICE WORKER:     FIX-SW-DEV — registro solo producción + unregister/cleanup automático en dev; validado fresh/existing/reload/nueva-tab (0 registros, 0 caches, 0 errores)
CACHE:              HTML no-cache; /sw.js max-age=0; /fc/sw.js allowlist aislada; sin headers peligrosos
PERFORMANCE BG:     FIX-PERF-BG-V6 — fondo #121212 (== estándar dark) en raíz/main/bg-background/gradientes; sidebar #0a0a0a (== token); cards/muted intactos; 0 overflow 375–1440
VENTAS HIERARCHY:   Vender (featured full-width) → Caja + Historial → "Otras opciones" (Tabla, Conteo, Devoluciones, Cotizaciones, CxP, Cobros)
VENDER:             1 click (sidebar) / 1 tap (móvil) → /?view=pos; desde hub mismo viewId+componente
CAJA:               capa primaria hub → /?view=cash (2 clicks total)
HISTORIAL:          capa primaria hub → /?view=sales (2 clicks total)
OTRAS OPCIONES:     6/6 accesibles, orden §19, progressive disclosure
COMMAND PALETTE:    intacta; 10/10 términos OK; "terminal" → Vender
MOBILE:             Vender tab 1 tap → POS; Ventas → hub jerárquico; sheet Más limpio; 0 overflow
DEEP LINKS:         11/11 vistas OK + refresh/back/forward verificados
ROLES:              UNCHANGED (navigation-definition intacto)
REGRESSION:         0 (tsc 0 · vitest 2143 passed/0 failed · lint 0 errores · nav 73/73)
TESTS:              PASS
COMMIT:             fix: finalize sales navigation and runtime cache (ver git log)
ORIGIN:             HEAD == origin/main verificado tras push
WORKTREE:           CLEAN
```

Evidencia cruda: `02-runtime-error.json`, `02-runtime-probe.json`, `02-runtime-error-repro2.json`,
`02-runtime-error-repro3.json`, `02-runtime-error-repro4.json`,
`02-runtime-error-fix-validation.json`, `06-sales-navigation.json`, `07-command-palette.json`,
`08-mobile-deeplinks-refresh.json` + capturas PNG.
