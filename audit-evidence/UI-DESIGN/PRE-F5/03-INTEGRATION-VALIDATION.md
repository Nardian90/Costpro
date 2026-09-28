# PRE-F5 — 03 INTEGRATION VALIDATION (GATE 9 y 12)

Fecha: 2026-09-29 · Estados validados: (a) post-merge F3 `9a534d96`; (b) integrado final `e45efb62`.
Entorno: pm2 (dev server server.ts, puerto 3000), bun 1.3.14, Node 22, box 3.9GiB RAM.

---

## 1. Validación post-F3 (GATE 9) — estado `9a534d96`

| Check | Comando | Resultado |
|---|---|---|
| TypeScript | `tsc --noEmit` | **PASS — 0 errores** |
| ESLint | `eslint src` | **PASS — 0 errores** (1298 warnings = deuda preexistente de clases/raw-buttons, misma clasificación de F3/F4) |
| Vitest | `vitest run` | **PASS — 2387 passed / 24 skipped / 0 failed** (118 files + 1 skipped) |
| Build | `next build` | **exit 137 (OOM kernel)** — LIMITACIÓN DE INFRAESTRUCTURA, ver §3 |

## 2. Validación integrada final (GATE 12) — estado `e45efb62` (F3+F4+main)

| Check | Comando | Resultado |
|---|---|---|
| TypeScript | `tsc --noEmit` (heap 2560, pm2 detenido) | **PASS — 0 errores** |
| ESLint | `eslint src` | **PASS — 0 errores** (1298 warnings preexistentes, sin delta) |
| Vitest | `vitest run` | **PASS — 2387 passed / 24 skipped / 0 failed** (220s) |
| Servidor | pm2 start + GET / | **HTTP 200**, 0 errores de consola en superficies smoke |

**Delta de tests explicado:** 2387 = 2355 (certificación F4) + 32 tests añadidos a `main`
por PR #1331 (`sec-ts-05-purge-snapshots.test.ts`, 214 líneas). Ningún fallo nuevo.

## 3. Build de producción — limitación de infraestructura documentada

```text
Intento 1  next build (turbopack)                 → exit 137 (killed) durante compilación
Intento 2  next build (turbopack, pm2 detenido)   → exit 137 (killed) durante compilación
Intento 3  next build --webpack (heap 2816MB)     → exit 137 (killed) durante compilación
Intento 4  next build --webpack (heap 2304MB)     → exit 137 (killed) durante compilación
```

- El kill ocurre SIEMPRE en la fase "Creating an optimized production build", sin error de
  compilación previo: es el kernel matando por presión de RAM (box 3.9GiB; el build requiere
  ~3GB RSS — documentado previamente en `audit-evidence/REM-V2-3/08-regression.md`:
  "exit 137 — INFRASTRUCTURE LIMITATION idéntica a REM-V2-2/2.1, NO contada como PASS").
- **Veredicto autoritativo de build se obtiene por CI** (`.github/workflows/ci.yml`, job
  "TypeCheck + Lint + Unit Tests + Build", `NODE_OPTIONS=--max-old-space-size=4096` en
  runner 7GiB). En el run del PR de `ff307220` ese job pasó COMPLETO (incl. Build).
  Para esta integración se emplaza un PR de integración cuya CI valida el árbol
  combinado final (ver 05-FINAL-VERDICT.md).

## 4. Regresión de superficies certificadas (GATE 12, smoke en vivo)

Método: navegador real (agent-browser) contra pm2 localhost:3000, sesión admin
(`admin@demo.com`), viewport desktop 1280×800 y mobile 390×844, estado integrado.

### F4 — deep-links y nomenclatura

| Deep-link | Breadcrumb real observado | Veredicto |
|---|---|---|
| `/?view=reception_list` | Inicio > OPERACIÓN > LOGÍSTICA > **RECEPCIONES** | PASS |
| `/?view=pos` | Inicio > OPERACIÓN > **VENDER** (h1 "Vender") | PASS |
| `/?view=settings` | Inicio > SISTEMA > **AJUSTES** (h1 "Ajustes") | PASS |
| `/?view=management-hub` | Inicio > OPERACIÓN > **GESTIÓN DE TIENDAS** | PASS |
| `/?view=sales` | Inicio > OPERACIÓN > VENTAS > **Historial De Ventas** | PASS |
| `/?view=catalog` | Inicio > OPERACIÓN > ALMACÉN > INVENTARIO > **CATÁLOGO** | PASS |

Sin anomalías de nomenclatura (1 nombre por vista). NOTA: el primer hit de una vista
en modo dev puede mostrar la landing mientras el chunk compila (retraso de
compilación on-demand, no regresión — verificado reintentando: vista correcta).

### F3 — overlays, Escape y foco

| Check | Observación | Veredicto |
|---|---|---|
| Modal visor de imagen (catálogo) | `role=dialog` abierto, focus entra al modal | PASS |
| `Escape` | Modal cierra; el único `role=dialog` restante es el **Toaster canónico F3** (sonner, `fixed bottom-0 z-50`) | PASS |
| Restauración de foco | `document.activeElement` = trigger original ("Ver imagen de Abrazadera metálica…") | PASS |

### F1 — mobile (390×844)

| Check | Observación | Veredicto |
|---|---|---|
| Tab bar mobile | `NAV "Navegación principal mobile"` `sm:hidden fixed bottom-0`, 6 botones (5 tabs + Más) | PASS |
| Touch targets | mínimo 36px en tab bar y cookie consent | PASS |
| Safe areas | `env(safe-area-*)` en consent y toaster | PASS |

### F2 — tokens y jerarquía

| Check | Observación | Veredicto |
|---|---|---|
| Tokens vivos | `--background #121212`, `--primary #22c55e`, `--card #1a1a1a`, `--sidebar #0a0a0a` | PASS |
| PageHeader | `h1` "Vender"/"Ajustes" + breadcrumb enlazado (patrón F2) | PASS |

## 5. Estado del CI en `main` previo (condición pre-existente, no atribuible a la integración)

Run `36477991803` (push `09ef9e97`):
- Security Audit → success
- TypeCheck + Lint → success; **Unit tests → 1 fallo**: `sprint1.integration.test.ts >
  computeFullQuantReport no retorna ceros fantasma`
- **E2E Playwright → fallo** (Run E2E tests)

Evidencia de flakiness ambiental (mismo código pasó CI en el run del PR de `ff307220`:
jobs CI + Test Coverage + Security CI Gate completos):
- Ese test **pasa localmente** sobre el estado integrado: `vitest run
  src/__tests__/integration/sprint1.integration.test.ts` → **8/8 PASS**.
- El fallo CI coincide con timeout/recurso del runner (el archivo tardó 131s en CI).
Conclusión: fallo ambiental pre-existente de `main`, no introducido por la integración
(la integración no toca `sprint1.integration.test.ts` ni su SUT).
