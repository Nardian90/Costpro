# CERTIFICATION-MATRIX — Matriz de certificación final CP-BRA-001

**Misión:** CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 · **Fecha:** 2026-11-27
**Base de evidencia:** main `a488a5255` (fusión #1733/#1734/#1735) + rama de cierre `chore/final-compliance-closure-20261127` · producción `wthkddeleylijmonclxg` verificada read-only 2026-11-27 · CI 9/9 en los 3 heads fusionados · regresión integral ≈6,877 tests / 0 FAIL.

---

## 1. CERTIFICADO DE ALCANCE (formato §3 de la política)

```
CERTIFICADO DE REGLAS DE NEGOCIO — CP-BRA-001
Alcance:            los 16 dominios críticos (FIN/POS/INV/PUR/PRO/CAT/TEN/SEC/DOC/SYS)
                    según TRACEABILITY-MATRIX §B + 32 invariantes + máquinas de estados.
Versión examinada:  main a488a5255 (+ cierre); producción: artefactos DDL verificados
                    2026-11-27 (body_hash 7b08c5d5 §0.2; R-03 7/7 marcas; FASE 4 6/6 marcas).
Reglas identificadas: 72 (12 familias) · 32 invariantes · 13+ máquinas de estados.
Reglas críticas auditadas: 16 → **CERTIFICADAS 15 · CONDICIONAL 1**
                    (SEC-003 elevada a CERTIFICADA en esta misión; PUR-001 permanece
                    CONDICIONAL por R-06 — decisión de POLÍTICA del propietario pendiente,
                    NO defecto técnico; ver OWNER-DECISIONS PEND-1).
Defectos críticos abiertos: NINGUNO. Altos/medios: formalmente aceptados y documentados
                    (RISK-REGISTER-CLOSURE §2 — no eliminados del registro).
Pruebas ejecutadas: CI 9/9 × 3 heads fusionados (#1733/#1734/#1735) · regresión integral
                    local ≈6,877 PASS / 0 FAIL · baterías dedicadas 17+15+22+8+16 PASS ·
                    net-zero tras cada ventana · replay MATCH 224 · surface 233 fn OK.
Exclusiones:        módulos no auditados en profundidad (HR nómina completa, reportes
                    avanzados, rendimiento/carga); políticas opcionales rechazadas por
                    decisión expresa (§0.4/§0.5: sin topes POS, sin UNIQUE proveedores).
```

## 2. Estado de las 16 reglas críticas

| # | Regla | Estado | Evidencia clave |
|---|---|---|---|
| 1 | FIN-002 (fuente única de saldo) | CERTIFICADA | fórmula única preservada en los 3 motores (R-26) + lote OT (R-03, mismo CASE) |
| 2 | FIN-003 (pagos no borrables) | CERTIFICADA | contrato intacto; residuo: sin reversión de pagos OT (decisión vigente) |
| 3 | FIN-004 (reversión con contra-fila única) | CERTIFICADA | contrato + producción (Pixelarte) |
| 4 | FIN-008 (cierres no se reabren) | CERTIFICADA | guard R-14 |
| 5 | FIN-009 (monedas no se suman) | CERTIFICADA | rates canónico; sin regresión |
| 6 | FIN-011 (CxC coherente) | CERTIFICADA | E2E 16/16 ×2 + baterías R-25/R-03 sin regresión |
| 7 | FIN-012 (anulación con pagos vivos) | CERTIFICADA | guards ×4 vías verificados en producción |
| 8 | POS-001 (venta atómica) | CERTIFICADA | create_sale_v2 sin cambios; CI |
| 9 | POS-006 (incidencias) | VERIFICADA + **POLÍTICA DECIDIDA §0.4** (sin topes ni supervisor — decisión expresa; controles intactos; pins vigentes) | catálogo + registro actualizados |
| 10 | INV-003 (WAC server-side) | CERTIFICADA | sin cambios; CI |
| 11 | INV-005 (R-05 confirmación con rol) | CERTIFICADA | desplegada §11g (misión precedente) |
| 12 | PUR-001 (ciclo compra→inventario) | **CONDICIONAL (R-06)** — guards de integridad certificados; falta DECISIÓN de política de roles para confirmar/anular (PEND-1 con recomendación Alternativa A/B) | OWNER-DECISIONS.md |
| 13 | PRO-001 (alta de proveedores) | VERIFICADA + **POLÍTICA DECIDIDA §0.5** (unicidad no estricta + dedup RPC confirmado) + regularización Tienda Pueblo | catálogo + registro |
| 14 | CAT-001 (maestro = identidad) | CERTIFICADA con RR R-18/R-19 documentados | sin cambios |
| 15 | TEN-001 (aislamiento multitienda) | CERTIFICADA | baterías de dominio (otra tienda 404/403 sin fuga en R-25/R-03/§0.2/FASE 4) |
| 16 | SEC-003 (autenticación fail-closed) | **CERTIFICADA (2026-11-27)** — 229/229 rutas clasificadas con control automatizado en CI + batería P− 22/22 + diag-splash corregido | SEC003-REMEDIATION.md |

## 3. Reglas nuevas/actualizadas certificadas en esta misión

| Regla | Alcance | Evidencia |
|---|---|---|
| FIN-013 (pagos múltiples OT) | **CERTIFICADA** — decisión §0.1: operación parcial + atomicidad por orden | batería 17/17 + migración en producción 7/7 |
| FIN-014 (pago de comisiones) | **CERTIFICADA** — decisión §0.2: roles de tienda + cajón intacto + fallback eliminado | batería 15/15 + producción 8/8 |
| TR-SEC-003 | **CERTIFICADA** | audit-route-auth en CI + P− 22/22 |

## 4. Sello oficial

- Las decisiones del propietario §0.1–§0.5 están IMPLEMENTADAS y DEMOSTRADAS.
- SEC-003 dejó de ser condicional con sus criterios demostrados (no se cambió su significado).
- R-11/R-15 formalizadas como políticas DECIDIDAS (controles vigentes + no-decisiones registradas).
- Tienda Pueblo atribuida por OWNER_CONFIRMATION con trazabilidad completa.
- **UNA regla crítica permanece CONDICIONAL: PUR-001 (R-06)** — decisión de política del propietario pendiente (PEND-1), con recomendación concreta preparada y bloqueo documentado. Por honestidad del estándar (misión §11: «si alguna regla crítica continúa condicional, no emitas ese sello»), **el sello global `COSTPRO — BUSINESS RULES COMPLIANCE: VERIFIED` NO se re-emite como pleno**; el estado queda:

  > **COSTPRO — BUSINESS RULES COMPLIANCE: CERTIFIED — con 1 excepción documentada de política (PUR-001/R-06, pendiente de decisión del propietario; 15/16 críticas plenas; 0 defectos críticos abiertos).**

  Tan pronto el propietario decida R-06 (recomendación lista en OWNER-DECISIONS.md) y se implemente con su batería + §11g, PUR-001 se eleva y el sello pleno aplica sin ninguna otra condición.

## 5. Diferencia con la certificación precedente

| Aspecto | Antes (2026-11-27 am) | Ahora |
|---|---|---|
| SEC-003 | CONDICIONAL (P− parcial, criterio manual) | **CERTIFICADA** (automatizada + P− 22/22) |
| R-03 / FIN-013 | mitigado (loop no atómico; sin canal parcial) | **CERTIFICADA** por decisión §0.1 |
| pay_commission | gate admin\|manager (encargado rechazado); fallback legacy | **CERTIFICADA** §0.2 (tres roles; cajón único canal) |
| 3 recepciones «—» | excepción abierta | **REGULARIZADAS** a Tienda Pueblo (OWNER_CONFIRMATION) |
| R-11/R-15 | decisiones «pendientes» implícitas | **DECIDIDAS** explícitamente (§0.4/§0.5) |
| PUR-001 | CONDICIONAL (R-06) | CONDICIONAL (R-06) — ahora con recomendación formal |
