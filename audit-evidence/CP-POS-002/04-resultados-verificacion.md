# CP-POS-002 — Resultados de verificación (T5)

Fecha: 2026-11-08 · Sandbox de verificación: Linux x64, Node con `--max-old-space-size=6144` donde aplica. Todas las cifras [MEDIDO] salvo indicación.

## Lint

- `npx eslint .` → **0 errores** [MEDIDO], 1472 warnings (nivel repo; los mismos estilos preexistentes).
- Archivos de la misión: 11 warnings, todos del aviso de estilo preexistente "considera `<Button>` en vez de `<button>` crudo" (recomendación incremental V2.12.25 que arrastra todo el repo; no se introdujeron reglas nuevas ni errores).
- `e2e/pos-offline.spec.ts` está bajo el patrón de ignorados de ESLint para e2e (igual que el resto de specs).

## TypeScript

- `node --max-old-space-size=6144 ./node_modules/.bin/tsc --noEmit` → **exit 0, sin errores** [MEDIDO].

## Vitest — baterías de la misión (T5.1)

| Batería | Tests | Resultado |
|---|---|---|
| `src/__tests__/lib/sync-error-classification.test.ts` (D3) | 16 | ✓ [MEDIDO] |
| `src/__tests__/lib/sync-outbox-reservation.test.ts` (D1/D2) | 14 | ✓ [MEDIDO] |
| `src/__tests__/lib/sync-lease-backoff.test.ts` (D6) | 11 | ✓ [MEDIDO] |
| `src/__tests__/integration/sync-engine-transitions.test.ts` (D3/D6) | 10 | ✓ [MEDIDO] |
| `src/__tests__/integration/sync-batch-classification.test.ts` (D3/D8) | 12 | ✓ [MEDIDO] |
| `src/__tests__/api/sync-discard.test.ts` (D4) | 8 | ✓ [MEDIDO] |
| `src/__tests__/lib/sync-snapshot-age.test.ts` (D5) | 7 | ✓ [MEDIDO] |
| **Total nuevos** | **78** | **✓** |

## Vitest — regresión de la cola compartida (T5.3) [MEDIDO]

`offline-storage.test.ts` (19) · `sync-batch-pnotes.test.ts` (3) · `sync-batch-w4-roundtrips.test.ts` (7) · `rem-inv-2-dynamic-reachability.test.ts` · `iteration-11-1.test.ts` · `useSalesCatalog-notes.test.tsx` (5) — ejecución conjunta con las baterías nuevas: **169/169 en verde**.

## Contract tests de seguridad [MEDIDO]

- `node scripts/security-contract-test-static.cjs` → **CONTRATO OK** (2 warnings MEDIUM/LOW preexistentes, semántica idéntica al contract LIVE).
- `node scripts/bola-contract-test.cjs` → **5/5** (todos los endpoints multi-tenant con guard explícito de store_id).
- `node scripts/lib/check-writers.mjs` → **OK** (todos los escritores Supabase de scripts/ declarados — incluye los de esta misión que no escriben).

## Vitest — suite COMPLETA del repositorio

Ver el resultado final en el PR (archivo `04-resultados-suite-completa.md`, actualizado tras la corrida). La corrida completa local se documentó con su resumen en el PR; el CI del PR la vuelve a ejecutar.

## E2E (T5.2) — PENDIENTE (declarado)

`e2e/pos-offline.spec.ts` (@offline): **NO verificado en CI** — por diseño de la misión requiere 3 ejecuciones verdes consecutivas por `workflow_dispatch` contra CostproE2E con `CP_POS_002_RUN_OFFLINE_E2E=1`. Verificado localmente [MEDIDO]: `playwright test pos-offline --list` carga el spec en el proyecto core; sin opt-in se salta con motivo documentado; sin entorno aislado el global-setup corta fail-closed (E_URL_FALTA — sin fallback, por diseño del pipeline del repo).

## Git / integridad [MEDIDO]

- `git diff --check origin/main...HEAD` → limpio (sin conflictos de espacios en blanco).
- `git diff origin/main...HEAD -- supabase/migrations/` → **VACÍO** (ninguna migración tocada).
- `git diff origin/main...HEAD -- .github/` → **VACÍO** (ningún workflow/trigger modificado).
- 21 archivos, +3619/−214.

## Escaneo de seguridad del diff [MEDIDO]

- Patrones de secretos (sb_secret_, sbp_, github_pat_, sk-, JWT, claves inline): **sin coincidencias** en el diff completo.
- PII (emails/teléfonos +53) en archivos nuevos: **sin coincidencias**.
- URLs con credenciales embebidas en docs/evidencias: **sin coincidencias**.
- Sin datos reales de clientes en fixtures: los tests usan UUIDs sintéticos.

## Producción

CostproBD (wthkddeleylijmonclxg): **SOLO LECTURA** durante toda la misión — ninguna escritura, ninguna prueba ejecutada contra producción (el E2E y los tests corren contra mocks/entorno aislado). El guard `assertIsolatedDb` del repo (que rechaza el ref de producción antes de conectar) sigue intacto.

## Riesgos pendientes

1. E2E offline sin las 3 verdes consecutivas (procedimiento en POS-002_DISENO_OFFLINE.md §15).
2. Verificación en dispositivo real pendiente (checklist §16 del mismo documento).
3. Overselling entre navegadores/dispositivos: limitación física documentada (resolución por conciliación, no eliminable sin cambios de BD — fuera de alcance por EXCEPCIÓN C).
4. `/api/pos/checkout` acepta `idempotency_key` como string arbitrario (alineación con uuid estricto = misión futura opcional).
