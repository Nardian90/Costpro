# RISK-REGISTER-CLOSURE — Revisión completa de riesgos residuales

**Misión:** CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 · **Fecha:** 2026-11-27 · **Método:** revisión íntegra del `RISK-REGISTER.md` vigente (no solo los puntos del prompt), contraste con el código actual y el estado de producción; estados verificados con evidencia re-ejecutable.

---

## 1. Cierre por dominio de esta misión

| ID | Dominio | Estado final | Evidencia |
|---|---|---|---|
| **R-03** | FIN-013 pagos múltiples OT | **RESUELTO** (decisión §0.1): lote atómico por orden + operación parcial multi-OT; defecto FIN-013 (pago mixto no atómico dentro de una OT) cerrado | PR #1732 fusionado; batería 17/17; FIN-011 16/16 sin regresión |
| **§0.2** | FIN-014 pay_commission | **RESUELTO** (decisión §0.2): gate admin/manager/encargado en la barrera DB; bypass legacy eliminado | PR #1733; batería 15/15; PC-VERIFY 7/7 |
| **SEC-003** | Autenticación fail-closed | **CERTIFICADA**: 229/229 rutas clasificadas con control automatizado en CI; único hallazgo (diag-splash) corregido; P− 22/22 | PR #1734; `audit-route-auth.cjs` + batería P− |
| **Tienda Pueblo** | PRO-001/DOC-004 | **REGULARIZADA** (decisión §0.3): 3 recepciones → Tienda Pueblo por OWNER_CONFIRMATION; importes/kardex/pagos íntegros | PR #1735; prueba funcional 8/8; conciliación 19,435 |
| **R-11** | POS-006 | **POLÍTICA DECIDIDA** (§0.4): controles vigentes mantenidos; sin topes ni supervisor — decisión expresa | Catálogo + registro actualizados; pins vigentes |
| **R-15** | PRO-001 | **POLÍTICA DECIDIDA** (§0.5): unicidad no estricta + dedup RPC confirmado | Catálogo + registro actualizados |

## 2. Barrido completo del registro (todos los demás hallazgos)

| ID | Hallazgo | Estado actual | Veredicto |
|---|---|---|---|
| R-01 | Trigger de pagos (rama OT perdida) | RESUELTO 2026-11-25; rama OT verificada en producción (forense 18/18) | sin acción |
| R-02 | Conversión ×450 en CxC | RESUELTO 2026-11-25 (helper canónico); sin regresión | sin acción |
| R-04 | Anulación con pagos vivos | RESUELTO (guards ×4 vías) verificado en producción | sin acción |
| R-05 | Confirmación de ajustes sin rol | CERTIFICADA 2026-11-27 (§11g, expediente precedente) | sin acción |
| R-06 | Gate de rol en confirmación/anulación de recepciones | **ABIERTO (P2)** — requiere decisión del propietario (ver OWNER-DECISIONS PEND-1 con recomendación concreta Alternativa A/B) | bloqueo de política para PUR-001; no es defecto técnico |
| R-07 | Dedup de factura por grafías | ABIERTO (P2) | opcional, no bloquea el estándar |
| R-08 | Σ payment_distributions sin reconciliación server | ABIERTO (P2) | opcional |
| R-09 | Referencia de transferencia en componentes | ABIERTO (P2) | opcional |
| R-10 | CI/nombre con transferencia solo frontend | ABIERTO (P3) | opcional |
| R-12 | Entidades fuera del trigger global de transiciones | ABIERTO (P3) | opcional |
| R-13 | Vale de salida directo 1 paso | ABIERTO (P2) — decisión de flujo del propietario | opcional |
| R-14 / R-14b | Reversión en período cerrado / idempotencia contable de anulaciones | R-14 RESUELTO; R-14b ABIERTO (P3, decisión documentar) | opcional |
| R-16 | Clientes duplicables | ABIERTO (P2) — patrón R-15 replicable | opcional |
| R-17 | Borrado físico de terceros en resets | ABIERTO (P3) | opcional |
| R-18 | Variantes mutables sin RPC/auditoría | ABIERTO (P2) | opcional |
| R-19 | Precios editables por cualquier rol | ABIERTO (P2) — decisión propietario | opcional |
| R-20 | Whitelist de audit_logs con store_id NULL | ABIERTO (P3) | opcional |
| R-21 | ~63 SD sin primitiva de auth (defensa por ACL) | ABIERTO (P2) — allowlist v2 con expiración activa; las nuevas funciones (R-03/§0.2) nacen con ACL exclusiva documentada | opcional (control vigente) |
| **R-22** | 102 rutas sin zod / CSRF 88 / rate-limit 107 / dev bypass | **ABIERTO (P3) — explícitamente separado de SEC-003** (el criterio de SEC-003 es el fail-closed de autenticación, ya automatizado). Plan propio de misión | residual aceptado y documentado |
| R-23 | conversion_factor sin CHECK | ABIERTO (P3) | opcional |
| R-24 | Reserva de transferencia expira 24 h | ABIERTO (P3) | opcional |
| R-25(viejo) | Tres definiciones de «pagado» | ABIERTO (P2) — FIN-002 consolidada una fórmula en CxP; vista canónica pendiente como decisión de arquitectura | opcional |
| R-26(SYS-001) | 4 tablas sin RLS | ABIERTO (P3) | opcional |
| R-27 | Cron sin scheduler / 2 stacks realtime | ABIERTO (P4) | opcional |
| R-28 | Esquema base fuera de migraciones | ABIERTO (P4) — snapshot canónico requiere decisión | opcional |
| R-29 | Fragilidad PostgREST por firmas condicionales | ABIERTO (P4) | opcional |
| R-30/31/32 | Documentos obsoletos / churn de funciones / withAuth degrada | ABIERTOS (P4) | opcionales |

## 3. Riesgos nuevos identificados en esta misión

| ID | Hallazgo | Severidad | Tratamiento |
|---|---|---|---|
| (nuevo, documentado en expedientes) | Rate limit 429 en baterías con >10 llamadas/min por usuario sobre endpoints de pago | BAJA (infra de prueba) | rutas de pago a 30/min (precedente V2.12.32); baterías con pacing |
| (nuevo, residual FIN-013) | Sin vía de reversión de pagos OT (`reverse_supplier_payment` excluye production_order\|work) | BAJO — decisión vigente FIN-003; los sobrepagos se previenen con overpay fail-closed | aceptado y documentado; cambio requiere decisión del propietario |
| (nuevo, residual §0.2) | `approve`/`cancel` de comisiones conservan el gate por rol GLOBAL (sin decisión del propietario sobre esos actos) | BAJO — RLS de commission_payments cubre | aceptado y documentado |
| (nuevo, residual FASE 4) | Identidad de Tienda Pueblo por OWNER_CONFIRMATION sin documentación externa | BAJO — trazabilidad completa en auditoría; enriquecimiento futuro por canales normales | aceptado y documentado |

## 4. Veredicto de bloqueo

- **Defectos críticos abiertos: NINGUNO.** (Todos los CRÍTICOS del registro: RESUELTOS/CERTIFICADOS.)
- **Único condicional del alcance de las 16 reglas críticas:** PUR-001 por **R-06** — decisión de POLÍTICA del propietario pendiente (PEND-1), con recomendación preparada. No oculta ni reducida.
- Riesgos opcionales (ALTOS/MEDIOS/BAJOS sin impacto directo certificado): formalmente **aceptados y documentados** (no eliminados del registro) — P2/P3/P4 con planes propios según prioridad.
