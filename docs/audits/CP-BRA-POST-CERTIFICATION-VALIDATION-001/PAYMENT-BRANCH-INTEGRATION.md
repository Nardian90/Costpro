# PAYMENT-BRANCH-INTEGRATION.md — CP-BRA-POST-CERTIFICATION-VALIDATION-001

Misión: localizar el estado real de la rama concurrente de pagos
`srv-payment-date-delivery-report-filters` y su PR, revisarlo y — si estaba completa y
en alcance — fusionarla. **No introduce funcionalidades ni cambios de política.**
Fecha: 2026-11-28.

## 1. Estado real localizado (protocolo §11f: verificar antes de actuar)

| Dato | Valor verificado |
| --- | --- |
| Rama remota | `fix/srv-payment-date-delivery-report-filters-20261127` (head `c47a5cce5cd14c25dd34ef28dce41976a1b74a00`) |
| PR asociado | **#1738** — «fix+feat: fecha de pago en servicios recibidos (causa raíz + datos §11g) y selección de pagos en el Reporte Entrega (cuadre y PDF gobernados)» |
| Estado del PR | **merged: true**, `merged_at: 2026-11-28T12:17:23Z` por el propietario |
| Merge commit | `4d14dd2fc80245ce42976cbd8945d7d5f5d7fbda` — padres `(64233a502…, c47a5cce5…)`, es decir **fusionado SOBRE el main final de la certificación R-06 (`64233a502`)** |
| CI del head | **7/7 SUCCESS**: TypeCheck+Lint+Unit+Build · Unit & Integration · Security Audit · TypeScript Security · SQL DB Security · Allowlist Review · **E2E Aislado (project)** |
| Secretos en el diff | 0 coincidencias (`github_pat_`, `sb_secret_`, `sbp_`, `sb_publishable_`, `eyJhbGciOi`) |

La fusión ya había sido ejecutada por el propietario tras el cierre de
CP-BRA-R06-FINAL-CERTIFICATION-001 (main @ `64233a502`). Esta misión NO vuelve a
fusionar nada: ejecuta las verificaciones post-fusión que la misión encomienda.

## 2. Revisión de alcance y diff completo

Fusión limpia (three-way automática de GitHub, sin ediciones de conflicto): el merge
`4d14dd2fc` respecto a su primer padre (`64233a502`) incorporó **exactamente 11
archivos, +1079/−39**, todos en el alcance declarado de la rama:

| Archivo | Δ | Ámbito |
| --- | --- | --- |
| `scripts/cp-srv-payment-date-fix-prod.mjs` | +163 | §11g: corrección idempotente de datos prod (double-flag, guardProtected) |
| `src/lib/cash-report/payments-selection.ts` | +230 | Selección de pagos del Reporte Entrega (DELTA por grupo) |
| `src/components/views/terminal/views/cash/CashReportView.tsx` | +261 | Checkbox por pago, selección indeterminada, contador N de M |
| `src/components/views/terminal/views/cash/cash-report-pdf.ts` | +24 | PDF gobernado por la selección |
| `src/components/views/terminal/views/cash/cash-report-docx.ts` | +8 | Excel/Word gobernados |
| `src/app/api/cash-report/details/route.ts` | +35 | Cuadre recalculado con la selección |
| `src/components/views/terminal/views/received_services/ReceivedServicesView.tsx` | +35 | Selector «Fecha del pago» V2.12.32 (causa raíz payment_date) |
| `e2e/fixtures/run-env.ts` | +31 | Reintento acotado en signInRunUser (400 transitorio) |
| `scripts/lib/writers.manifest.json` | +3 | Declaración del script §11g en writers (guardProtected) |
| `src/components/views/adn008-create-service-modal.test.tsx` (+60) y `src/lib/cash-report-payments-selection.test.ts` (+268) | +328 | Tests de la misión |

**Cero migraciones añadidas** (`git diff --name-status 64233a502 4d14dd2fc --
supabase/migrations/` vacío) y **cero cambios ajenos**: no toca autorización de
recepciones, RLS, RPC de recepciones ni políticas certificadas.

Nota sobre el diff de la RAMA (64233a502→c47a5cce5, 54 archivos): muestra además
«eliminaciones» de R-06 (`reception-authorization.ts`, migración
`20261128120000_cpbra_r06_reception_authorization.sql`, gates en `roles.ts`…). Es un
artefacto de comparación — la rama partía de un main anterior a R-06, así que «carece»
de esos archivos, no los elimina. El three-way merge conservó la versión de main
(verificado abajo).

## 3. R-06 intacta tras la fusión (no contradice CP-BRA-001)

| Verificación | Resultado |
| --- | --- |
| Migración R-06 presente en main post-fusión | `supabase/migrations/20261128120000_cpbra_r06_reception_authorization.sql` (85.738 bytes) ✓ |
| `src/lib/reception-authorization.ts` | presente ✓ |
| `src/lib/roles.ts` — `canCreateReceptionInStore` / `canManageOwnReception` | presentes (§0.1/§0.2 exactos) ✓ |
| Gates R-06 en el surface certificado | 10 coincidencias `can_create_reception`/`can_manage_reception` ✓ |
| Surface == LIVE producción | re-export 233 funciones, diff CERO (ver SURFACE-CONTRACT-CLOSURE.md) ✓ |
| Batería E2E R-06 re-ejecutada post-fusión | **40/40 PASS** + net zero ✓ |

El alcance de la rama (pagos a proveedores + Reporte Entrega) es ajeno a la matriz
R-06; su corrección de `payment_date` no altera gates ni invariantes certificadas.
Los fallos E2E «PREEXISTING» documentados durante R-06 (E2E-POS-011/012/013/014/017)
eran el trabajo concurrente del propietario sobre la misma BD aislada; con la rama
fusionada y asentada, el E2E Aislado del propio #1738 pasó **7/7** y los runs
recientes del workflow son success (run 419 sobre `54343f361` y run 420 sobre
`725e00b6d`, 2026-11-28).

## 4. §11g de la rama (datos de producción)

El cuerpo del PR #1738 documenta la aplicación productiva UNA sola vez, con guard
doble flag y verificación `--check`: caso ENERVIDA `SRV-20261126-00152/00153`,
`payment_date` y `paid_at` alineados al 26/11/2026 mediodía Habana; importes, estados,
códigos y asientos `fin_entries` intactos (el ledger ya estaba en 26/11). El script
quedó declarado en `writers.manifest.json`. Esta misión no re-aplica nada.

## 5. Veredicto

La rama estaba **completa, en el alcance identificado, sin cambios inesperados, con CI
verde (incluido E2E Aislado) y sin contradicción con CP-BRA-001**. La fusión la
ejecutó el propietario (PR #1738 → `4d14dd2fc`), y `main` descendiente (`170a9f9be`)
la integra junto a #1742 (POS foco/identidad del pagador). **Estado: INTEGRADA y
VERIFICADA — no queda nada pendiente de fusionar.**
