# W7-14 — MATRIZ GO/NO-GO (FASE 24)

Fecha: 2026-08-30 · Alcance: madurez del paquete `w62-remediation/sql/01..09` para convertirse en migración segura. **Este documento es un veredicto de readiness; no es una autorización de despliegue.**

## 24.1 Criterios NO-GO del dueño — estado

| # | Criterio NO-GO | Estado | Evidencia |
|---|---|---|---|
| 1 | WAC multi-escritor | ✅ NO presente | W7-02 §3.3 (15 escritores → 1), censo F4, guard activo, ADV-A9 bloqueado |
| 2 | COGS manipulable por cliente | ✅ NO presente | DF-02: veneno 7777→100, COGS=WAC server (W7-11) |
| 3 | Race de devolución sin serializar | ✅ NO presente | DF-07 F7′: race 4+4 → 1 acepta, total 4≤5; INV-09 |
| 4 | Desequilibrio financiero | ✅ NO presente | F19-1..10 exacto; INV-11 (0 devoluciones sin contra-asiento) |
| 5 | **Ambigüedad de ACL** | ❌ **PRESENTE — W7-D1** | `fn_recalc_wac` EXECUTE a PUBLIC+anon+authenticated; mutación arbitraria de WAC reproducida (100 → 399.6666667) — W7-03 §12.2 |
| 6 | PGRST203 / overload ambiguo | ✅ NO presente | INV-14: 1 firma viva por nombre migrado; 42883 limpio en legacy |
| 7 | Migración destructiva irreversible | ✅ NO presente | rollback byte-idéntico (W7-06); irreversibles documentados y pre-deploy |
| 8 | Caller/overload desconocido | ✅ NO presente | grafo re-derivado de catálogos (W7-02), 35 callers mapeados |
| 9 | Fallo de conservación | ✅ NO presente | F19-10 Σdiff=0; F18-7 frontera exacta |
| 10 | Divergencia INV/WAC | ✅ NO presente | INV-01..15: 34/34 PASS en clon limpio (W7-13) |
| 11 | Rollback no demostrable | ✅ NO presente | POST_RB == PRE byte a byte (W7-06) |
| 12 | Mutación de producción | ✅ NO presente | 0 conexiones fuera de 127.0.0.1:5433; S1 final DIFF=0 |
| 13 | S1 ≠ 0 | ✅ NO presente | s1-fresh-v2.txt y s1-final-w7.txt: SHA 9e7cea9a…edc2 == baseline producción |

## 24.2 Hallazgos con severidad

| Severidad | # | Hallazgo | Dónde |
|---|---|---|---|
| **BLOCKER (1)** | W7-D1 | `fn_recalc_wac` ejecutable por anon/authenticated (PUBLIC jamás revocado en pkg 01) → escritura arbitraria de WAC reproducida | W7-03 §12.2 |
| HIGH (3) | F-C | `reset_store_data` escribirá WAC sin token → guard la bloquea → ruta admin `/api/stores/reset` rota (fail-closed) | W7-02 F-C, W7-04 §13.1 |
| | H3 | RENAME+REVOKE legacy (withdraw 6/9-arg, receive 4-arg) = breaking deliberado; exige ventana de despliegue coordinada | W7-01 H3 |
| | H6 | Ruta devolutions (USE_V2_REVERSE=false→v1) rompe: v1 REVOKE; frontend DEBE migrar a v2 en la ventana | W7-01 H6 |
| MEDIUM (5) | F-A | `create_devolution_v2` conserva PUBLIC EXECUTE (defensa interna activa; REVOKE recomendado) | W7-02/03 |
| | F-B | `reset_store_data` PUBLIC+anon (defensa interna activa; hardening recomendado) | W7-02/03 |
| | H1 | `create_devolution_v2` duplicada (06 y 08); orden 06→08 obligatorio | W7-01 H1, W7-05 |
| | H2 | Snapshot solo-esquema: PRECHECK vivo obligatorio antes del ALTER TABLE de pkg 08 | W7-01 H2, W7-05 P2 |
| | SYNC | `sync_product_stock` divergencia caché↔ledger con created_at tie (MEDIUM, sin impacto financiero, ruta RPC inmune) | W7-10 |
| LOW (4) | H4 | pkg 09 INSERTa parámetros (dato, no esquema) si se despliega | W7-01 |
| | ACL-L1 | `w62_df04_classify` PUBLIC (función pura de diseño) | W7-03 §12.1 |
| | ACL-L2 | `w62_guard_wac_writer` PUBLIC (trigger function; no invocable por RPC) | W7-03 §12.4 |
| | CMP-L1 | `create_vale_salida` 5-arg named-args: 42725 ambigüedad residual (preexistente, no regresión) | W7-04 §13.1 |

### Desviaciones de proceso (no son defectos del producto)

| # | Desviación | Impacto | Tratamiento |
|---|---|---|---|
| P-1 | 4 archivos de evidencia W6.2 (`W62-11/12/17/21`) fueron sobrescritos a las 03:53 por el re-run FASE 17 de esta revisión W7 → `SHA256SUMS` de w62-remediation: 10/14 (4 FAILED) | Cadena de custodia W6.2 rota para 4 .out; el contenido actual son outputs frescos de las MISMAS suites (mismos casos, PASS) | Documentado aquí; SHAs actuales registrados en `SHA256SUMS` de w7-readiness; originales no recuperables (sin backups); **violation de «no modificar el paquete original W6.2»** — se reporta al dueño |
| P-2 | `tmp/W7-rollback-run.out` quedó vacío (0 B) | Gap de log (no de prueba): el ciclo migración→rollback quedó probado por el trío de fingerprints pre/postmig/postrb (W7-06) | Notado; sin acción |

## 24.3 Matriz de decisión

| Categoría | Condición para GO | Estado |
|---|---|---|
| GO pleno | blocker=0 ∧ todos los CRITICAL PASS ∧ rollback/concurrencia/ACL/overload/compat/conservación/INV/adversarial OK ∧ producción y git intactos | **NO CUMPLE** (W7-D1) |
| CONDITIONAL GO | solo hallazgos sin impacto financiero/inventario/seguridad, con workaround+owner+fecha+criterio de cierre | **NO CUMPLE** (W7-D1 es de seguridad) |
| NO-GO | cualquier criterio de la tabla 24.1 marcado ❌ | **SÍ CUMPLE (criterio 5)** |

## 24.4 Veredicto

```text
FINAL VERDICT: NO-GO
```

**Razón única**: W7-D1 — el paquete 01 concede EXECUTE efectivo de `fn_recalc_wac` (el escritor único del WAC) a PUBLIC, anon y authenticated, con mutación arbitraria de WAC reproducida en laboratorio. Violación directa del criterio NO-GO «ambigüedad de ACL» y de la promesa DF-01 de motor no manejable por clientes. El resto de la plataforma W6.2 (9 paquetes, 164 asserts de regresión, 15 adversariales, rollback byte-idéntico, conservación exacta) está en condiciones de GO.

**NEXT GATE (única acción recomendada)**: el dueño enmienda el paquete 01 añadiendo la línea `REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) FROM PUBLIC, anon, authenticated;` → re-ejecutar SOLO el gate ACL (FASE 12) + INV-13 sobre clon limpio → si verde, re-gate GO. **No desplegar a producción bajo ningún escenario mientras W7-D1 siga abierto.**
