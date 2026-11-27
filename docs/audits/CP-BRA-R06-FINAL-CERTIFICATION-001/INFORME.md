# INFORME — CP-BRA-R06-FINAL-CERTIFICATION-001

**Misión:** Control de creación, confirmación y anulación de recepciones (R-06) + certificación final CP-BRA-001.
**Repo:** Nardian90/Costpro · **Rama:** `fix/receipts-encargado-creator-ownership-20261128` · **Inicio:** 2026-11-28.
**SHAs:** inicial main `f17af9add0d2` → implementación `a687781f5` → batería `e63489447` → expediente+script §11g (este commit).

## Resumen ejecutivo

R-06 cerró la última regla condicional de CP-BRA-001. La política decidida por el propietario (§0.1-§0.5) se implementó como matriz de autorización en tres capas: barrera autoritativa en BD (migración `20261128120000`: helpers canónicos + gates en 10 RPC + trigger de inmutabilidad del creador + RLS endurecida + auditoría transaccional), espejo en rutas (`src/lib/reception-authorization.ts`) y alineación de UI (`src/lib/roles.ts` + vistas gated). Los cuerpos de los 10 RPC quedaron byte-idénticos salvo el bloque de autorización (re-emisión programática desde `pg_get_functiondef` verificado por contrato estático 14/14). La batería E2E contra la BD aislada demostró la matriz completa (40/40 PASS) con las invariantes financieras intactas y guardrail net delta = 0.

## Tabla de estado final (17 filas)

| # | Verificación | Resultado |
|---|---|---|
| 1 | Encargado con membresía activa — CREAR | PERMITIDO (caso 1: RPC + ruta 201) |
| 2 | Encargado sin membresía — CREAR | DENEGADO (caso 2: ERR_FORBIDDEN_ROLE) |
| 3 | Almacenero (warehouse) — CREAR | DENEGADO (caso 3) |
| 4 | Facturadora/clerk — CREAR | DENEGADO (casos 4/5; rol real clerk) |
| 5 | Manager — CREAR | DENEGADO (caso 6) |
| 6 | Admin de tienda — CREAR | DENEGADO (caso 7) |
| 7 | Admin de plataforma (≠ superadmin) — CREAR | DENEGADO (caso 7b) |
| 8 | Encargado de otra tienda — CREAR | DENEGADO (caso 8) |
| 9 | Anónimo / RPC directo sin sesión — CREAR | DENEGADO (casos 9/25) |
| 10 | Superadmin — CREAR global | PERMITIDO sin membresía, identidad propia (caso 10) |
| 11 | Creador original — CONFIRMAR/ANULAR propia | PERMITIDO (casos 14/15; sin exigencia de rol §0.2) |
| 12 | Otro encargado/admin/manager/almacenero/clerk — ajena | DENEGADO (casos 16-20) |
| 13 | Creador con membresía REVOCADA | DENEGADO (caso 21) |
| 14 | Superadmin — confirmar/anular/revertir ajena + otra tienda | PERMITIDO (casos 22-24, con bandera superadmin_global) |
| 15 | Histórico sin creador verificable | SOLO superadmin (caso 27); nadie reasignado |
| 16 | Guards financieros y máquina de estados | INTACTOS (casos 28-37: pagos vivos, estados, idempotencia, concurrencia, CxP) |
| 17 | Auditoría transaccional (actor/tienda/estados/creador/fuente) | IMPLEMENTADA (casos 38/39: RECEPTION_CONFIRMED_PENDING nuevo + authorization_source) |

**Meta:** SHAs inicial/final · PR + commit de fusión · CI verde · migración posición 225/225, sha256 `be4a4c8d…` · PRE/POST hash `register_reception` (PRE `716f53d45efd75ce0f229c32ba37ed58`) · E2E 40/40 + specs adaptados · net delta 0 · contrato de superficie re-exportado post-§11g (divergencia 0) · PM2 online con .env PRINCIPAL · health 200 · expediente en `docs/audits/CP-BRA-R06-FINAL-CERTIFICATION-001/` (10 documentos).

## Hallazgos de la auditoría (FASE 1) que motivaron el cambio

- 10 RPC de recepciones autorizaban por mera membresía (`has_store_access_as`/`has_store_access`) o admin de plataforma; la RLS de INSERT/UPDATE/DELETE era permisiva; el flujo de borradores del navegador mandaba `user_id` libremente (suplantación de creador posible, sin inmutabilidad); los botones de la UI no reflejaban política alguna.
- Roles VIVOS verificados: `admin, superadmin, manager, clerk, warehouse, encargado, usuario, costo, tenant_admin` — no existe `facturadora`; no se inventaron ni normalizaron roles.

## Entregables y evidencia

- Migración `20261128120000` (aplicada y verificada en CostproE2E); script gobernado `scripts/cpbra-r06-apply-prod.mjs` (writers manifest OK).
- Batería `e2e/creation/r06-reception-authorization.spec.ts` 40/40; 5 specs históricos adaptados (documentado por caso); unitarios contrato 14/14; afectados 56/56; replay manifest 225 MATCH.
- Expediente: OWNER-DECISION · AUTHORIZATION-MATRIX · CREATION-PERMISSIONS · CONFIRMATION-CANCELLATION · HISTORICAL-CREATOR-AUDIT · IMPLEMENTATION · TEST-EVIDENCE · PRODUCTION-APPLICATION · CERTIFICATION-FINAL · este INFORME.

## Riesgos residuales y limitaciones

- Aplicación §11g a producción pendiente al cierre de este expediente intermedio (orden FASE 7: post-fusión) — ver PRODUCTION-APPLICATION.md para el resultado final.
- Incidente colateral documentado: CI ajeno concurrente sobre la misma BD aislada durante la ventana E2E (R06-TEST-EVIDENCE §5).
- Vidas paralelas de la política: hasta la fusión + §11g, producción mantiene la barrera previa (documentado, sin efecto en la certificación que exige ambas evidencias).
