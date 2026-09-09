# 18 — FINAL VERDICT

**Gate:** REM-F4-03 — PRODUCTION WITHDRAWAL CANONICAL SERVER-SIDE REMEDIATION
**Fecha de cierre:** 2026-09-09
**Formato:** §35 de la directive (REM-F4-03)

---

## Baseline

```text
HEAD:         b94ca3692a11f11eebfa014d0b150c4921a1ad8e (al inicio; == origin/main)
origin/main:  b94ca3692a11f11eebfa014d0b150c4921a1ad8e (REM-F4-04 ya en remoto, verificado con fetch)
worktree:     clean → artefactos F4-03 commiteados (§31)
```

## Finding

```text
F4-03 CONFIRMED (reconfirmado en vivo, SELECT-only):
  * RPC withdraw_production_item (6 args) NO EXISTE en la BD viva → ruta HTTP 500 (PGRST202)
  * withdraw_production_item_v3 existe, segura (costo server-side DF-05),
    pero sin EXECUTE para authenticated (hardening W9-F06) → huérfana
  * La ruta histórica aceptaba p_unit_cost del CLIENTE (inadmisible contable)
```

## Root cause

```text
1) Desincronización ruta↔BD: la ruta llama a una función muerta.
2) W9-F06 revocó EXECUTE de la sucesora segura y no había consumidor HTTP.
3) Defecto de diseño: el costo del retiro de producción lo determinaba el cliente.
```

## Remediation

```text
Migration:  20260909000001_rem_f4_03_grant_withdraw_production_item_v3.sql
            (SHA256 6835517c…f1, aplicada 2026-09-09T03:55:14Z HTTP 201,
             guards PRE/POST operativos — attempt 1 abortado por guard preservado como evidencia)
RPC:        withdraw_production_item_v3 (SIN CAMBIOS en su definición; solo GRANT 1:1 a authenticated)
Endpoint:   src/app/api/production-orders/[id]/withdraw/route.ts
            (llama _v3 con firma correcta; p_unit_cost ELIMINADO del contrato;
             unit_cost del cliente se ignora por diseño; errores nuevos mapeados)
Commit base:        b94ca369
Commit remediation: 4fd687c1 (HEAD final tras amend de veredicto+SHA256SUMS
                    documentado en worklog y reporte al principal — patrón RECON/F4-04)
```

## Cost authority

```text
Server-side source:  products.cost_average (WAC) bajo FOR UPDATE, sin fallback a 0;
                     WAC=0 exige w62_zero_cost_flags documentado. Misma autoridad
                     que el COGS de ventas. Sin nueva fórmula ni duplicación.
Client p_unit_cost:  ELIMINADO del contrato de la RPC; el campo del body se
                     ignora silenciosamente (compatibilidad UI, cero cambios de UI).
Result:              unit_cost_used == WAC en 4/4 retiros adversariales; 0 movimientos
                     con costo forjado (census 0 filas para 0.01 y 999999999).
```

## Functional

```text
Valid withdrawal:      PASS (HTTP 200 real, item/kardex/audit consistentes)
Stock invariant:       PASS (stock_after == stock_before - qty; 3 escenarios)
Cost invariant:        PASS (movement==item==audit==WAC; 4/4)
Accounting invariant:  PASS (cost_authority=server_side_wac_v3 en 4/4; WAC no re-precificado;
                       wac_change_log sin contribuciones de retiros)
```

## Adversarial

```text
p_unit_cost=0:        contrato eliminado (el campo ya no viaja a la RPC)
p_unit_cost=0.01:     IGNORADO (unit_cost_used=100; 0 movimientos con 0.01)
p_unit_cost=999999999: IGNORADO (unit_cost_used=100; 0 movimientos con costo forjado)
```

## Security

```text
Anon:         DENY (HTTP 401 por middleware + RPC 42501 permission denied)
Non-member:   DENY (ERR_UNAUTHORIZED; sub-cero JWT; sin mutaciones)
Cross-store:  DENY (clerk real de STORE A vs orden STORE B → 403; STORE B intacta;
              producto cross-store imposible por construcción FK)
RPC ACL:      anon=NO · authenticated=SÍ (validado internamente) · service_role=SÍ (sin cambios) ·
              PUBLIC=NO (guards PRE/POST de la migration; commit 4fd687c1)
```

## Idempotency

```text
PASS — registry oficial (idempotency_registry, scope withdraw_v3): retry con misma
key → replay del mismo resultado; 0 dobles efectos (stock/movimiento/item/registry).
Sin key: overconsumption + FOR UPDATE evitan dobles efectos (P11/P12).
```

## Concurrency

```text
PASS — 2 retiros paralelos sobre budgeted ceiling: exactamente 1 éxito + 1 denegación;
actual_qty==2 (sin lost update); stock decrementado exactamente 2; 1 movimiento.
FOR UPDATE en item/orden/producto (mecanismo existente, sin inventar infraestructura).
```

## Regression

```text
Vitest: 2058 PASS / 0 FAIL / 24 SKIP == baseline EXACTO (210.18s, single worker)
TSC:    PASS (exit 0, 0 errores)
Lint:   PASS (0 errors / 1291 warnings == baseline exacto)
Build:  INFRA OOM — "Compiled successfully 79s"; type-checker interno Killed
        (firma kernel: next-build anon-rss 2.8GB en 3.9Gi/0 swap; TSC independiente
        exit 0 corrobora; next.config NO tocado; precedente idéntico F4-04/RECON;
        impacto nulo: la remediación es route TS compilada con éxito + migration SQL)
PM2:    3/3 online, 0 restarts, sin crash loop
Health: HTTP 200 {"status":"ok"}
```

## Zero-touch

```text
ENERVIDA:     PRE == POST (125 prod, stock 4012.5, valor, updated_at, 451 movs, 0 POs, fingerprint)
PUERTO PADRE: PRE == POST (36 prod, stock 966.1289, valor, updated_at, 251 movs, 77 withdrawals históricos, fingerprint)
Único delta global: ACL de la RPC remediada (objetivo mismo de la migration)
```

## Evidence

```text
Path:       audit-evidence/20260908-rem-f4-03/
Documents:  19 numerados (00–18)
Raws:       17 en evidence/ (definición viva _v3 pre/post, census funciones, apply log
            + attempt1 guard-abortado, ACL post, zero-touch PRE/POST, suite output/results,
            vitest/tsc/lint/build logs, firma OOM kernel, metadata de regresión)
SHA256SUMS: generado sobre el contenido final del pack
Secretos:   escaneo previo al commit (§29); MGMT_TOKEN vía env var, nunca commiteado;
            ANON_KEY publishable (pública por diseño)
```

## Git

```text
Local:  ver worklog.md + reporte al principal (hash del amend final)
Remote: resultado del push documentado honestamente (§32)
Push:   intentado con git push origin main; resultado explícito en worklog
```

## Open findings

1. **Build = INFRA OOM** (no code fail): el entorno 3.9Gi/0 swap no puede ejecutar
   el type-checker integrado de next build (~2.8GB RSS). Compensado por TSC
   independiente exit 0 + compilación exitosa. Recomendación de plataforma (no
   bloqueante): runner de build con ≥8Gi en futuras corridas.
2. **UI envía unit_cost inútil** (P3-info): `ProductionOrdersView` sigue mostrando
   el campo de costo al usuario para retiros; el servidor lo ignora. Sugerencia
   de UX futura (fuera del alcance F4-03, no es defecto de integridad):
   ocultar/re-etiquetar el campo para evitar confusión.
3. `production_order_withdrawals` referenciada por migraciones históricas no
   existe en la BD viva (objeto muerto documentado en 03/05; el registro real es
   audit_logs + production_order_items). Sin acción requerida en F4-03.

---

## VERDICT

```text
REM-F4-03 = PASS
```

**Justificación:** todos los gates obligatorios PASS — contrato RPC correcto,
endpoint real funcional, costo 100% server-side (resistencia forjada demostrada
con census en cero), invariantes de inventario y contabilidad exactas,
aislamiento multitienda con fixture real, non-member y anon DENY, idempotencia
y concurrencia verificadas, regresión global == baseline exacto, zero-touch
íntegro, evidence completo con SHA256SUMS, commit limpio solo-F4-03. La única
condición no ejecutable íntegramente (Build) es OOM de infraestructura firmado
por el kernel con criterio subyacente demostrado por vía independiente e
impacto nulo para la remediación (mismo tratamiento que el precedente
REM-F4-04 PASS).

## Next gate

```text
REM-F4-03 = PASS  →  AUTORIZADO → REM-F4-06
(NO ejecutar REM-F4-06 dentro de esta corrida)
```
