# W9.4.6 — H-5 · FASES 5 + 14 · DECISIÓN

Fecha: 2026-09-03 · HEAD auditado: e7959b41 · Producción: Supabase wthkddeleylijmonclxg

## FASE 5 — Versión canónica

**CANÓNICA: `reverse_transaction_v2` (oid 138188, body PR-4 `20260810000040`, ACL C2 `20260902200923`).**

Fundamentos (evidencia cruzada):
1. **Consumidor runtime único**: `/api/reverse` con `FEATURES.USE_V2_REVERSE=true` (env actual y `.env.example`) despacha `transaction → reverse_transaction_v2` (04-runtime-consumers.md).
2. **Producción == repo**: cuerpos idénticos normalizados (raw/f4_body_comparison.json) → SIN migration drift, SIN out-of-band deployment.
3. **Compatibilidad W7/single-writer**: pipeline stock_movements→inventory→kardex→products con triggers oficiales; nunca toca cost_average; guard WAC activo (P9).
4. **Seguridad e integridad superiores**: FOR UPDATE, idempotencia, audit_logs explícito, restricción `status='completed'`.
5. **Coherencia con dinero**: status `voided` filtrado por cash-report; V1 (`reversed`) contaminaría caja.
6. Release W7 (`1c204d1`) consolidó PR-4; sin versiones intermedias fuera de migraciones.

## FASE 14 — Veredicto

```text
H-5 = BACKLOG
```

Justificación contra las condiciones de cierre:
- **No existe P1**: anon/authenticated denegados por ACL (P1/P2 probes); guard de store por fila (P5); p_user_id no falsificable desde fuera ni desde authenticated (P4); cross-store imposible (P5); sin escritura WAC (P9: guard activo); sin pagos corruptos activos (vistas filtran por status); sin drift producción↔git; zero artefactos persistentes de los probes (P11, PRE==POST).
- **SÍ existe duplicidad v1/v2 con divergencias funcionales conocidas** (duplicidad sin riesgo inmediato bajo la postura actual: ACL + flag) ⇒ exactamente la definición de BACKLOG del menú permitido.

### Hallazgos para backlog (checklist de retiro/consolidación de V1)

| ID | Hallazgo | Severidad | Condición |
|---|---|---|---|
| H5-B1 | Duplicidad V1/V2: consolidar a función única (semántica V2) y retirar V1 cuando el flag V1 muera | P3 | requiere decisión de producto (flag OFF ya no soportado) |
| H5-B2 | Reversión de venta no marca `payment_transactions` (gap de trazabilidad; sin reset estilo H-4/PR-4) | P3 | ambas versiones; alinear con patrón H-4 al consolidar |
| H5-B3 | V1: sin `FOR UPDATE` (carrera de doble restauración concurrente) | P3-condicional | solo flag OFF + service_role |
| H5-B4 | V1: bypass de pipeline (escribe products.stock_current sin stock_movements/inventory; kardex `devolution_in` uc=0) | P3 | divergencia inventory si se usa V1 |
| H5-B5 | V1: status `reversed` incluido en cash-report (`.neq('status','voided')`) → doble conteo de caja bajo V1 | P3 | defensa en profundidad: filtrar también `reversed` |
| H5-B6 | Hardening search_path de V1 y helpers (`public` → `public, pg_temp`) | P3 | cuerpos ya cualificados; riesgo residual ≈0 |

### FASES 15-17: NO APLICAN

No se confirma P1 ⇒ no se diseña ni aplica corrección. **Producción NO fue modificada** (FASE 16/17 omitidas; verificación PRE==POST y catálogo estable como prueba).

## FASE 18 — Post-audit (sin cambios esperados = verificado)

- Catálogo POST == catálogo PRE (oid 136653/138188, prosrc_len 2802/2251, proconfig, proacl idénticos) — raw/post_catalog_check.json.
- Definiciones, dependencias y triggers: sin cambios (no se ejecutó DDL alguno).

## FASES 19-21 — Resumen

- **Matriz RPC (19)**: completa — ver 10-p1-probes.md (11 casos, 11 PASS).
- **Regresión aplicación (20)**: NO APLICABLE — cero cambios de código/DDL en este run (no hay diff que regresar). Registrado como NOT-RUN/N-A con justificación; no se fabrican PASS artificiales.
- **Integridad de datos (21)**: PRE==POST en 21 métricas (raw/post_baseline_check.json) + zero-persistencia específica de probes (P11).
