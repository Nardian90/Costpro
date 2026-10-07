# ENERVIDA-WAC-ZERO-COST-CIERRE — Cierre controlado de `cost_average = 0`

**TAREA 2B — Cierre de la saneamiento contable con DECISIÓN CONTABLE EXPLÍCITA: WAC nominal = 1 CUP**
**Tienda:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`)
**Fecha de ejecución:** 2026-10-07 · **Baseline de `main`:** `466f4b9cb4` · **Rama:** `audit/enervida-zero-cost-cierre`
**Base evidencial previa:** TAREA 2C — `ENERVIDA-COST-PROVENANCE-AUDIT.md` (PR #1375) · TAREA 2 — `ENERVIDA-WAC-ZERO-COST.md` (PR #1370)

---

## Antes

```text
13 SKU con cost_average = 0
9, 21, 24, 44, 80, 82, 83, 85, 86, 111, 117, 118, 122
```

Verificación pre-write (FASE B): el conjunto objetivo en live era **exactamente** el de arriba, cada uno con `cost_average = 0`. Snapshot inmutable capturado antes de escribir: `evidence/enervida-wac-cierre-before.json` (inventario, movimientos por tipo, recepciones, flags DF-02, conteo de `wac_change_log` = 121, baseline global de documentos).

## Decisión

> **Asignar `cost_average = 1 CUP` a los 13 SKU restantes**, documentado como **DECISIÓN CONTABLE EXPLÍCITA DE SANEAMIENTO** — y NO como costo histórico reconstruido, costo real demostrado, conversión monetaria confirmada ni corrección del dato fuente.

Justificación registrada en cada `wac_change_log`:

> "DECISION CONTABLE EXPLICITA: WAC nominal = 1 CUP para saneamiento de cost_average=0. No representa reconstruccion demostrada del costo historico."

La auditoría de procedencia (TAREA 2C) demostró que el patrón de recepción de estos 13 productos era costo = precio de venta (11 casos, `unit_cost` USD × tasa 680) o dato incoherente (SKU 122: 23 800 = 35×680; SKU 44: 5 040 sin referencia), por lo que **no existía costo fiable que reconstruir**; el 1 CUP nominal es además coherente con la convención ya existente en la tienda (57 productos ya operaban con WAC=1 nominal).

## Mecanismo de escritura (FASES D-F)

Protocolo gobernado certificado (GATE 16 / TAREA 2), un DO-block atómico por SKU:

```sql
SELECT cost_average, stock_current INTO v_ca, v_st FROM public.products
  WHERE id='...' AND store_id='5e6fe821-...' FOR UPDATE;
IF v_ca <> 0 THEN RAISE EXCEPTION 'STATE_CHANGED'; END IF;
IF v_st <> <snapshot> THEN RAISE EXCEPTION 'STOCK_CHANGED'; END IF;
PERFORM set_config('app.wac_writer', 'fn_recalc_wac', true);   -- single-writer guard
UPDATE public.products SET cost_average = 1, updated_at = now() WHERE id='...' AND store_id='5e6fe821-...';
INSERT INTO public.wac_change_log (store_id, product_id, wac_before, wac_after, event,
  qty_in, uc_in, source_ref, changed_by)
VALUES ('5e6fe821-...', '...', 0, 1, 'wac_correction', NULL, NULL,
  '{"correction_id":"ENERVIDA-WAC-2026-DECISION-1CUP-SKU-009","method":"governed_admin_write",...}'::jsonb,
  'a1111111-1111-1111-1111-111111111111');
PERFORM set_config('app.wac_writer', '', true);
```

- **Orden del mandato respetado**: 9, 21, 24, 44 · 80, 82, 83, 85 · 86, 111, 117, 118 · 122 (4 lotes pequeños).
- Tras cada lote: relectura de WAC y stock, verificación de `wac_change_log` (exactamente 1 registro por SKU), y comprobación de que **no** aparecieron movimientos, transacciones, recepciones, vales, devoluciones, pagos ni OT nuevas. Todos los lotes: OK.
- Evento: `wac_correction` · método: `governed_admin_write` · referencia distinta de los 44 reconstruidos: `correction_id = ENERVIDA-WAC-2026-DECISION-1CUP-SKU-<sku>` (vs `ENERVIDA-WAC-2026-SKU-<sku>` de TAREA 2).

## Después

| SKU | Producto | WAC antes | WAC después | Stock antes | Stock después | Motivo |
|---|---|---:|---:|---:|---:|---|
| 9 | Brecker D63 A | 0 | 1 | 1 | 1 | Decisión contable explícita (saneamiento) |
| 21 | Colchón Milexus | 0 | 1 | 0 | 0 | Decisión contable explícita (saneamiento) |
| 24 | Cuchilla 2P 63A | 0 | 1 | 0 | 0 | Decisión contable explícita (saneamiento) |
| 44 | Losa aporcelanada 60x60 con defectos | 0 | 1 | 0 | 0 | Decisión contable explícita (saneamiento) |
| 80 | Brecker C32A Doble | 0 | 1 | 0 | 0 | Decisión contable explícita (saneamiento) |
| 82 | Crimpiadora con pela cable Anaranjada | 0 | 1 | 0 | 0 | Decisión contable explícita (saneamiento) |
| 83 | Crimpiadora Roja con 6 dabas rojas | 0 | 1 | 3 | 3 | Decisión contable explícita (saneamiento) |
| 85 | Panel 585 | 0 | 1 | 0 | 0 | Decisión contable explícita (saneamiento) |
| 86 | Panel + 600W | 0 | 1 | 0 | 0 | Decisión contable explícita (saneamiento) |
| 111 | Grapas plasticas con clavo de acero | 0 | 1 | 45 | 45 | Decisión contable explícita (saneamiento) |
| 117 | Inversor | 0 | 1 | 3 | 3 | Decisión contable explícita (saneamiento) |
| 118 | Barilla de Tierra | 0 | 1 | 0 | 0 | Decisión contable explícita (saneamiento) |
| 122 | Controladores de voltaje | 0 | 1 | 2 | 2 | Decisión contable explícita (saneamiento) |

Todos: **0 → 1**, stock **sin cambio**.

## Advertencia contable

> El valor 1 CUP constituye una decisión contable de saneamiento y no una reconstrucción demostrada del costo histórico original.

## Integridad (FASES G-J)

```text
157/157 inventory reconciliation (SKU por SKU vs ENERVIDA-2026-10-05-RECONCILIATION.csv, delta = 0)
71/71 stock unchanged (vs snapshot pre-escritura)
13/13 WAC corrected (0→1) y 13/13 trazabilidad en wac_change_log
0 fictitious movements
0 historical documents modified
```

Detalle de controles (todos PASS):

- **Por SKU**: `cost_average antes = 0` / `después = 1` / `stock antes = stock después` (13/13).
- **Global**: censo final `157 = 14 cero + 70 WAC=1 + 58 WAC>1 + 15 WAC∈(0,1)`; los 15 en (0,1) son WAC diluidos **preexistentes** (cuadres nominales de la importación), sin relación con esta tarea.
- **44 correcciones anteriores intactas** (WAC sin cambios, verificado contra snapshot).
- **14 ceros legítimos permanecen en 0** (SKUs 7, 10, 23, 41, 53, 54, 58, 60, 78, 91, 93, 101, 105, 114; 0 movimientos verificado).
- **Δ efectos colaterales = 0**: movimientos (994→994), transacciones (600→600), recepciones (47→47), items de recepción (153→153), vales (140→140), devoluciones (2→2), pagos (497→497), OT (18→18); `cost_at_sale` de los 13 sin escrituras.
- **0 otras tiendas modificadas por esta tarea**: cada UPDATE fue acotado por `id` + `store_id`; los únicos `updated_at` externos recientes son productos E2E-piloto de la CI (tiendas "E2E PILOT A/B"), actividad preexistente ajena a esta tarea.
- **`wac_change_log`: 121 → 134** (+13, exactamente los registros de esta decisión).

## DF-02 (FASE K)

Los 22 flags `w62_zero_cost_flags` de la tienda **se conservan íntegros** (0 borrados). Los 4 asociados a los SKU de esta decisión (9, 86, 111, 122 — scope `sale`) quedan **dormantes**: `create_sale_v2` solo exige flag cuando `v_wac_prev = 0`, y con WAC=1 esa verificación ya no se dispara. No existe en el sistema ningún mecanismo de expiración/borrado automático de flags, por lo que, conforme al mandato: **flags históricos conservados por trazabilidad**.

## Informe final (FASE O)

1. **¿Se modificaron los 13 SKU?** Sí.
2. **¿Qué valor se estableció?** `cost_average = 1 CUP`.
3. **¿Por qué?** Decisión contable explícita de saneamiento, autorizada por el propietario en el mandato de TAREA 2B, con base evidencial de la auditoría de procedencia (TAREA 2C).
4. **¿Se afirma que 1 CUP es su costo histórico real?** **NO.**
5. **¿Se modificó inventario?** **NO** (stock 13/13 intacto; 157/157 reconciliado).
6. **¿Se modificaron ventas históricas?** **NO** (Δ transacciones = 0).
7. **¿Se modificó `cost_at_sale`?** **NO.**
8. **¿Se crearon movimientos ficticios?** **NO** (Δ movimientos = 0).
9. **¿Se modificaron otras tiendas?** **NO** (escrituras acotadas por `store_id`).
10. **¿Cuántos `cost_average=0` quedan?** **14** — exactamente los 14 ceros legítimos certificados (7, 10, 23, 41, 53, 54, 58, 60, 78, 91, 93, 101, 105, 114).
11. **¿Reconciliación?** `157/157`, `delta = 0`.
12. **¿Auditoría WAC?** 44 correcciones anteriores (TAREA 2, intactas) + 13 correcciones por decisión contable (esta tarea) + 14 ceros legítimos = 71/71 productos auditados.
13. **¿Estado Git?**
    - Branch: `audit/enervida-zero-cost-cierre` (desde `origin/main` = `466f4b9cb4`)
    - Commit: `docs(audit): close ENERVIDA zero-cost WAC remediation` (ver `git log` del PR)
    - Origin: `https://github.com/Nardian90/Costpro.git`
    - Working tree: limpio (solo archivos intencionales de esta tarea)
    - PR: enlace en la sección inferior (creado sin merge automático)

## Estado de cierre

```text
13/13 WAC = 1                                  PASS
71/71 productos auditados                      PASS
14 ceros legítimos permanecen en 0             PASS
0 ceros accidentales/no clasificados           PASS
157/157 inventario reconciliado                PASS
Δ stock = 0                                    PASS
Δ movimientos = 0                              PASS
Δ históricos = 0                               PASS
13/13 trazabilidad WAC                         PASS
44 correcciones anteriores intactas            PASS
0 otras tiendas modificadas                    PASS
git diff --check                               PASS
TypeCheck (tsc --noEmit)                       PASS
Lint (eslint)                                  PASS
working tree limpio                            PASS
PR creado y verificable                        PASS (sin merge)
```

**TAREA 2B: CLOSED / CERTIFIED.** No se ejecutó merge automático. La TAREA 3 (COGS histórico) **no se inicia**; sus requisitos de evidencia quedan definidos en `ENERVIDA-COST-PROVENANCE-AUDIT.md` §10.
