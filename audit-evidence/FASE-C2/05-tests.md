# FASE C — C2 · 05 TESTS

## 1. Tests unitarios/integración (vitest) — NUEVOS de este gate

| Archivo | Tests | Cobertura (mandato §20) |
|---|---|---|
| `src/__tests__/lib/cost-sheet-document-compatibility.test.ts` | 16 | **Contrato**: CS válido→ACCEPT; FC(model)→REJECT; FC(ficha)→REJECT; FC(category)→REJECT; data vacío→REJECT; null/primitivos/arrays→REJECT; pilares incompletos→REJECT; determinismo; `isFCDocument` por las 3 señales; constantes del filtro PostgREST |
| `src/__tests__/api/cost-sheets-save.test.ts` | 7 | **Persistencia** (writer con mocks de supabase/auth, `createApiError` REAL): CREATE sin store_id + created_by de sesión; payload del flujo IA legado sin 400; UPDATE sin duplicar con doble ownership (id+created_by en fetch y update); 404 ajena/inexistente; **409 FC propio (D3)**; 409 semilla; 400 id inválido |
| `src/__tests__/store/cost-sheet-persisted-doc.test.ts` | 4 | Vínculo create/update: setPersistedDocId; limpieza en setSheet/loadExample/reset; guard Zod de apertura rechaza FC-format |

## 2. Suite completa (regresión §28)

```text
bunx vitest run → 105 archivos passed | 1 skipped (106) · 2227 tests passed | 24 skipped (2251) · 0 fallos
Baseline pre-C2 (medido en este entorno): 2225 passed — los +2 netos son los suites nuevos (21 nuevos
menos ajustes de consolidación de mocks). FAIL NUEVO: 0 · FAIL PREEXISTENTE: 0 (la suite ya estaba verde).
```

Nota: el `stderr` visible en el test del store (Zod Validation Error) es el console.error ESPERADO del propio caso de rechazo FC.

## 3. TypeScript / Lint

```text
bunx tsc --noEmit            → limpio (0 errores)
npm run lint (proyecto)      → 0 errores, 1294 warnings (preexistentes, patrón del proyecto)
eslint sobre los 13 archivos modificados → 0 errores (mismos warnings de estilo que sus vecinos)
```

## 4. Build (§26)

```text
npm run build (local, NODE_OPTIONS max-old-space-size=2560) → "Killed" (OOM del host, ~2.2GB disponibles
con PM2 arriba). BUILD = ENVIRONMENT LIMITATION — precede dokumentiert: FASE B/C0 ya lo registraron
(OOM local / exit 137, Build SUCCESS en CI). Se utilizará CI como verificación de Build tras el push.
```

## 5. Tests E2E contra la app real (flujos §24)

Ejecutados con `scripts/fasec2-e2e.py` contra `http://localhost:3000` (PM2, dev con hot-reload) y JWT real de `admin@demo.com` (sin cookies, vía Bearer que `getServerSession` valida contra Supabase). **14/14 asserts**:

| # | Verificación | Resultado |
|---|---|---|
| 1 | login JWT usuario | OK (uid a1111111) |
| 2 | censo PRE determinista | 8 = 7 FC + 0 CS + 1 semilla |
| 3 | Flujo C PRE (query filtrada+guard) | 0 compatibles |
| 4 | Flujo A: CREATE por la ruta real | 200 created:true (sin store_id) |
| 5 | censo POST-CREATE | 9 = 7 FC + 1 CS (**NUNCA 8 CS**) |
| 6 | Flujo C POST | servidor 2 → guard 1 (solo la nueva) |
| 7 | Flujo A: UPDATE misma ficha | created:false; total sigue 9; sin duplicado |
| 8 | D3: ataque sobre FC PROPIO | **409** — writer se niega; fila intacta |
| 9 | §23: ataque sobre FC AJENO | 404 — RLS/ownership; fila intacta |
| 10 | recuperación por id | 4 pilares presentes |
| 11 | búsqueda IA sobre FC con filtro | 0 resultados |
| 12 | limpieza del fixture | DELETE por id exacto (204) |
| 13 | censo FINAL + hashes | 8 = 7 FC + 0 CS + 1 semilla; FC **byte-intacto** |
| 14 | §22: anon | 0 filas — RLS sin evasión |

Resultados JSON: `scripts/fasec2-e2e-results.json` (fuera del repo). Los tests mutativos usaron SOLO el fixture `[C2-TEST]` creado y eliminado por el propio script (§25) — con una excepción accidental corregida y documentada en `07-security.md` (incidente + recuperación íntegra).

## 6. CI

Tras el push se verificará el workflow `ci.yml` (TypeCheck + Lint + Unit + Build) del commit C2 — Build local quedó como ENVIRONMENT LIMITATION. Resultado registrado en FINAL-REPORT.
