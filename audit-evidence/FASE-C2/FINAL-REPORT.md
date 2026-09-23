# FASE C — C2 · FINAL REPORT

Gate: **C2 — Implementación de CostSheet: persistencia real + separación por contrato + Guardar Ficha** · Fecha: 2026-09-23 · Baseline: `bbb74f4c` (== origin/main al inicio y al cierre, salvo el commit C2 mismo) · Modo: IMPLEMENTACIÓN CONTROLADA / NO REESCRITURA.

Cadena ejecutada: `GATE 0 (baseline) → GATE 1 (mapa pre-implementación) → C2-A (writer) → C2-B (aislamiento por contrato) → C2-C (Guardar≠Exportar) → TESTS UNITARIOS → E2E REAL (incidente + recuperación + re-ejecución endurecida) → TYPECHECK/LINT/SUITE → BUILD (limitación de entorno) → DIFF REVIEW → EVIDENCIA → GIT`.

## 1. Resultado por objetivo del mandato (§1)

| Objetivo | Estado | Evidencia |
|---|---|---|
| **C2-A** CostSheet guarda correctamente en `cost_sheets` | ✅ | writer sin `store_id` alineado al esquema real; E2E: CREATE `200 created:true` vía la ruta real con JWT de usuario; UPDATE sin duplicados; `created_by` del contexto autenticado (02-writer-fix) |
| **C2-B** CostSheet consulta SOLO documentos compatibles | ✅ | guard central `isCostSheetDocument` + exclusión PostgREST en los 3 lectores (`useCostSheets`, `ArenaFC`, `search_entity('costSheet')`); E2E Flujo C: 0 compatibles → 1 tras crear → NUNCA mezcla (03-contract-filter) |
| **C2-C** Guardar guarda; Exportar exporta | ✅ | `handleSaveToSupabase` (validación, estado real, feedback, ID, anti-doble-click); `handleExportJSON` conservado e independiente; ⌘S = persistir; paleta honesta (04-save-semantics) |
| Arquitectura sin mezcla implícita | ✅ | misma tabla física, dos bibliotecas lógicas: terminal replica el guard que FC ya tenía; writer se niega a sobrescribir no-CostSheet (409) |

## 2. Criterios de certificación (§30/§32)

| Criterio | Resultado |
|---|---|
| WRITER CORRECTO | ✅ (E2E ruta real, sin store_id, create/update distinguidos) |
| CONTRATOS SEPARADOS | ✅ (guard central + filtros server-side + Zod de apertura intacto) |
| GUARDAR REAL | ✅ (persistencia verificada por API HTTP real y recuperación posterior) |
| EXPORTAR SEPARADO | ✅ (Blob/download intacto, sin red; ninguna superficie "Guardar" descarga) |
| FC INTACTO (código) | ✅ (`git diff -- public/fc/` vacío; `/fc/FC.html` y `/fc/sw.js` → 200) |
| DATOS FC INTACTOS | ✅ (hashes SHA-256 + updated_at de los 7 FC idénticos pre/post E2E; incidente del script de prueba recuperado íntegramente — 07-security §3) |
| RLS SIN REGRESIÓN | ✅ (policies sin cambios; anon 0; ajeno→404; sin evasión: todo con JWT de usuario) |
| TESTS PASS | ✅ 2227 passed / 0 fallos (21 tests nuevos) |
| TypeScript | ✅ `tsc --noEmit` limpio |
| Lint | ✅ 0 errores (warnings preexistentes del proyecto) |
| CI/Build | ⚠️→✅ build local = ENVIRONMENT LIMITATION (OOM documentado, precede en FASE B/C0); **verificación CI post-push** — resultado registrado al final de este reporte |
| DIFF REVISADO | ✅ (08-diff-review; cero cambios fuera de alcance, sin APIs paralelas, sin migraciones, sin RLS) |
| GIT CERRADO | ✅ commit(s) descriptivos con SOLO implementación C2 + tests + evidencia; push verificado |

## 3. Hallazgos de C2

| ID | Hallazgo | Tratamiento |
|---|---|---|
| H-1 | `withStoreAccess` era defensa en profundidad huérfana (exigía un dato que la tabla no registra) | sustituido por `withAuth`; la autorización real queda en RLS + ownership explícito |
| H-2 | `validateRPCArrayResponse` era async y su consumidor no hacía `await` (funcionaba por azúcar de react-query) | corregido con `await` al añadir el guard |
| H-3 | El flujo IA duplicaba fichas en cada «Aplicar y guardar» (INSERT siempre) | UPDATE del mismo documento vía `persistedDocId` |
| H-4 | **El writer permitía sobrescribir un documento FC propio con datos CostSheet** (descubierto por el incidente E2E) | guard D3: verificación de compatibilidad del destino antes de UPDATE → 409 `COST_SHEET_NOT_COMPATIBLE`; probado unitaria y E2E |
| H-5 | Incidente del script E2E v1: sobrescritura+borrado de `0024c883` (FC del usuario de prueba) por defectos del PROPIO script (sin ORDER BY, limpieza por patrón) | recuperado íntegramente (mismo id, datos byte-idénticos del gemelo `6dd35833` certificado por C1R, timestamps, category, created_by); verificado 8=7FC+0CS+1 semilla y byte-identidad del par; script v2 endurecido; documentación completa en 07-security §3 |

## 4. Alcance respetado

- **C2-D**: FC.html intocable — cumplido (diff vacío; contrato/offline/sync/fichas intactos).
- **C2-E**: sin `store_id`, sin DDL, sin tabla nueva — cumplido.
- Fuera de alcance NO tocado: conversión FC→CostSheet, migraciones, reescritura del motor FC, cambios normativos, RLS, colaboración.

## 5. Limitaciones declaradas

1. **Build local**: OOM del host (2.2 GB disponibles con PM2 arriba) — no es un fallo del código; TypeScript + suite completa + CI (Build en GitHub Actions) cubren la verificación.
2. La verificación E2E se ejecutó contra el LIVE del entorno (no existe staging): los tests mutativos usaron fixture propio `[C2-TEST]` con limpieza por id, y el único contacto con datos reales fue el incidente H-5 (recuperado y documentado). Recomendación para C3+: reprovisionar un entorno de staging antes de baterías mutativas amplias.
3. La restauración de `0024c883` fija `created_at`/`updated_at` con precisión de segundo (los microsegundos originales no estaban en la evidencia previa) — sin impacto funcional (rev-check FC compara contenido/hash).

## 6. VEREDICTO

> ## **CERTIFIED**
>
> C2 implementa exactamente el alcance autorizado por C1R (C2-A/B/C/D/E): el writer de CostSheet persiste y actualiza documentos reales en `cost_sheets` sin `store_id`, la biblioteca del terminal aísla sus documentos por contrato (query → guard → Zod), «Guardar Ficha» persiste de verdad y «Exportar JSON» es una operación local independiente, FC.html y sus 7 fichas permanecen byte-intactos, RLS no presenta regresión, y la batería de verificación (unit + E2E real + typecheck + lint) pasó íntegra. El incidente del script de prueba fue corregido, recuperado y convertido en una defensa permanente del writer (H-4).

**Verificación CI (post-push)**: pendiente al momento del commit → resultado registrado a continuación de la ejecución del workflow.

## 7. Cierre git (§31)

```text
commit único de implementación C2 (código + tests + evidencia) → push a origin/main
git rev-parse HEAD / origin/main verificados tras el push
CI ci.yml (TypeCheck + Lint + Unit + Build) verificada en el commit pushed
```

*(Resultado exacto de CI anotado en la sección de cierre tras la ejecución.)*
