# FASE C2R — 08 INCIDENT ASSESSMENT (§20/§21) + alcance de commits (§15)

## 1. Alcance de los commits C2 (§15) — dentro de alcance, sin extras

### `ca3a019f` — «FASE C — C2: CostSheet persistencia real + separación por contrato + Guardar Ficha»
30 archivos, +1371/−52:

| Grupo | Archivos | ¿En alcance? |
|---|---|---|
| Implementación C2-A (writer) | `api-schemas.ts`, `save/route.ts`, `api-errors.ts` | ✓ |
| Implementación C2-B (contrato) | `document-compatibility.ts` (NUEVO), `useCostSheets.ts`, `ArenaFC.tsx`, `registry.ts` | ✓ |
| Implementación C2-C (Guardar≠Exportar) | `cost-sheet-store.ts`, `useCostSheetActions.ts`, `CostSheetView.tsx`, `CostSheetModuleNav.tsx`, `DarianEditor.tsx`, `navigation-definition.ts`, `navigation-map.ts`, `view-tips.ts` | ✓ |
| Tests | 3 suites nuevas + `gate1-navigation.test.ts` (aserción de semántica) | ✓ |
| Evidencia | 11 docs `audit-evidence/FASE-C2/` | ✓ |

- `/fc/FC.html` tocado: **NO** — `git diff --stat bbb74f4c..00a7c9a7 -- public/fc/` vacío; `git log bbb74f4c..00a7c9a7 -- public/fc/` vacío (ningún commit tocó el motor FC).
- Migraciones no declaradas: **0** (`git diff --stat <rango> -- supabase/` vacío). RLS: **0 cambios**. Producción no relacionada: **0** (ningún archivo fuera de la lista).
- `00a7c9a7`: **solo documentación** (2 archivos de evidencia FASE-C2) — cierro verificación CI en los docs. Sin código.

## 2. Zero-touch de dominios de producción (§20)

| Dominio | Evidencia |
|---|---|
| `stores`, `products`, `inventory`, `stock_movements`, `transactions`, `cash`, `devolutions`, `production_orders`, `purchase_orders` | (a) `git diff bbb74f4c..00a7c9a7` no toca NINGUNA ruta API/lógica de esos dominios (alcance §1); (b) sin migraciones/SQL (supabase/ vacío en diff); (c) los scripts E2E de C2 solo tocaron `cost_sheets` (fixture `[C2-TEST]` por id + el incidente ya documentado); (d) service role usado SOLO en GET |
| 7 FC históricos | Íntegros (03/04/05) — excepto el incidente `0024c883`, que consta explícitamente como **temporary test mutation → recovery → integrity verification** |

El único contacto mutativo con datos LIVE en todo C2 fue: fixture propio creado y borrado por id + el incidente `0024c883` (recuperado). Nada oculto: el incidente está documentado en la evidencia commiteada del propio gate (07-security §3) y re-verificado aquí.

## 3. Clasificación del incidente (§21) — dos conclusiones separadas

### A. Integridad final — **PASS**
Los datos están HOY íntegros: censo 8/7/1/0, par `0024c883`/`6dd35833` byte-idéntico, 0 drift de timestamps/ownership/filas (03/04/05).

### B. Seguridad del proceso de pruebas — **FALLO REAL, corregido**
El script E2E v1 seleccionó el objetivo «por posición» (`fc_pre[0]`) y limpió «por patrón de nombre»: métodos prohibidos por sentido común forense y por el propio §22 de este gate. Que la fila fuera del propio usuario (RLS correctamente lo permitió) agrava la lección: **RLS ≠ contrato**. El proceso original NO fue seguro.

### Clasificación formal

```text
TEST-SAFETY INCIDENT — RECOVERED
  causado por: script de verificación v1 (posición + patrón), NO por código de producto
  impacto: 1 documento FC (0024c883, del propio usuario de prueba)
  duración: temporal (misma sesión E2E, 2026-09-23)
  recuperación: íntegra vía gemelo certificado 6dd35833 (mismo id/contenido/timestamps/owner)
  verificación: byte-identidad del par re-probada hoy (04)
  defensas permanentes resultantes: guard D3 409 en writer (producto) + script v2 endurecido (proceso)
  estado: NO ocultado, NO minimizado — documentado en evidencia commiteada de C2 y en este gate
```

## 4. Recomendación permanente de hardening (§22) — sin modificar código en C2R

> Los E2E mutativos NUNCA deben seleccionar documentos LIVE reales por posición, nombre, orden de creación o supuesto propietario. Deben usar fixtures sintéticos creados por el propio test o registros con mutabilidad inequívocamente garantizada. Patrón obligatorio: **CREATE FIXTURE → capture ID → operate only on captured ID → assert ownership/contract → cleanup captured ID**. Nunca `SELECT first row / by name / nth row / "foreign-looking"`.

Esta recomendación ya está materializada en: guard D3 del writer (producto), tests unitarios 409/404 (repo), y diseño documentado del script v2 (07-security §3). Queda como directriz para C3+ (idealmente con staging dedicado, como ya recomendó C2 FINAL-REPORT §5.2).

## 5. Riesgos residuales

| # | Riesgo | Clase | Mitigación/estado |
|---|---|---|---|
| R-1 | Snapshots C1R/C/C1 perdidos (untracked) → la integridad de los 5 FC ajenos al par se apoya en cadena convergente (hashes C2 documentados + invariantes LIVE), no en re-comparación directa byte-a-byte hoy | Documental (evidencia no concluyente de primer orden) | Sin indicador alguno de corrupción; C2R fija AHORA hashes canónicos por fila (02) que sirven de baseline futuro. **Recomendación: commitar la evidencia de cada gate en el mismo gate** |
| R-2 | Script E2E v2 y sus JSON fuera del repo → no re-ejecutables como artefacto | Documental | Lógica protectora replicada en tests en-repo; diseño documentado |
| R-3 | CREATE del writer no assertion-a `isCostSheetDocument(exportData)` antes del INSERT | Hardening (no bloqueante; no puede dañar FC existentes) | Registrado como recomendación |
| R-4 | Discrepancia documental: C2 declaró restauración «a segundo», LIVE muestra microsegundos idénticos al gemelo | Documental (a favor de la integridad) | Registrada en 04 §4 |
