# EXPEDIENTE — FIX ESPEJO DE PAGOS DEL DRY-RUN F1 (v3) · 2026-11-14

**Rama:** `fix/fin-dryrun-espejo-pagos-20261114` (base: `feat/fin-backfill-dryrun-20261113`, rama CP-FIN).
**Producción:** EXCLUSIVAMENTE lectura (dry-run re-ejecutado read-only; conteos ANTES=DESPUÉS idénticos).
**Autor:** misión del propietario «revisión de consistencia contable y económica» (2026-11-14), punto 1.

## 1. Defecto detectado (punto 1 de la misión)

El informe F1 (dry-run v2) describía el asiento de pago de Servicios Recibidos como
`PAS_CXP_PROV` débito / `ACT_EFECTIVO_CUP` crédito, mientras el reconocimiento
acredita `PAS_SERV_PEND`. Verificación directa contra producción (read-only):

- **Reglas activas** (`fin_rule_versions`, sin overrides por tienda): el evento
  `pago` de `SERVICIO_RECIBIDO` debita `PAS_SERV_PEND` (post-m015); el de
  `RECEPCION` debita `PAS_CXP_PROV`. El crédito es `ACT_EFECTIVO_CUP` (cash) o
  `ACT_BANCOS` (no cash).
- **Simulación autoritativa del motor** (`fin_compute_metrics` +
  `fin_apply_templates`) sobre los 16 pagos elegibles: 16/16 debitan
  `PAS_SERV_PEND`; saldo pendiente tras el pago = 0,00 CUP en los 16/16 servicios.
- **No existe equivalencia intencional** entre `PAS_CXP_PROV` y `PAS_SERV_PEND`:
  subcuentas hermanas de `pasivo_corriente` (orden 30/31); el balance
  (`fin_get_balance_sheet`) agrupa por `category_code` (líneas separadas, sin
  consolidación).

**Conclusión:** el MOTOR es correcto; el defecto estaba en el ESPEJO HARDCODEADO
del script `scripts/fin-backfill-dryrun.mjs` (v2), que reportaba TODOS los pagos
como `PAS_CXP_PROV` D / `ACT_EFECTIVO_CUP` C. Efecto del espejo si se tomara por
real: `PAS_SERV_PEND` quedaría 33.215,00 CUP pendiente indefinidamente y
`PAS_CXP_PROV` saldría deudor en −33.215,00 CUP.

## 2. Corrección (v3)

`scripts/fin-backfill-dryrun.mjs` reescrito a v3:

1. **Espejo de pagos desde el motor real** (`PAGOS_SIM_SQL`, exportada): cada
   pago elegible se simula con `fin_compute_metrics` + `fin_apply_templates` y la
   regla activa resuelta por tienda (idéntico a `fin_resolve_rule`). Doble
   verificación: asiento equilibrado y PAS_* débito por regla; FAIL exit 7 si
   alguna regla activa desequilibrara.
2. **Semántica de divisa por documento:** las ventas en divisa con
   Σ`amount_cup` = `total_amount` se marcan `TOTAL_AMOUNT_YA_CUP_EQUIVALENTE`
   (evidencia de `payment_transactions`; ítems `price_at_sale` en divisa y
   `price_at_sale_cup` = divisa×tasa; `create_sale_v2` actual lo sigue haciendo:
   135 USD × 930 → `total_amount` 125.550 CUP). Se reporta la economía corregida
   y la inflación por doble conversión de la fórmula v2.
3. **Pre-check del motor real (VENTA):** `POST_OK` / `ERR_UNBALANCED_SIN_PAGOS`
   / `ERR_UNBALANCED_DOBLE_CONVERSION_USD` / `ERR_UNBALANCED_PARCIAL_O_EXCESO`
   por tienda — lo que `fin_post_document` realmente aceptaría o rechazaría.
4. **Desglose por tienda** (ventas, resto de tipos, pagos posteriores).

El hash de pasadas NO cambia respecto a v2 (`32109d55dd3fb0db…`: los importes
que alimentan el hash son los mismos) → continuidad verificable; solo se
corrigen categorías reportadas, semántica y conteos reales.

## 3. Evidencias (read-only sobre producción wthkddeleylijmonclxg)

Informe máquina: `scripts/fin-backfill-dryrun-informe.json` (v3; regenerado sin
escrituras — conteos ANTES=DESPUÉS idénticos, `bd_intacta: true`).

- Elegibles: 1.342 docs; asientos reconocimiento 1.342; pagos posteriores 16
  (32 movimientos) — **categorías debitadas: `PAS_SERV_PEND` ×16, `PAS_CXP_PROV` ×0**.
- Semántica de divisa: 131 ventas con `total_amount` YA en CUP (11.070.884,97 CUP
  reales); fórmula v2 inflaría 7.566.770.544,63 CUP; USD real cobrado 37.204,64.
- Motor real (ventas): 690 `POST_OK`; 165 sin pagos (3.163.110 CUP); 131 doble
  conversión (rechazadas por desbalance — no contaminan, quedan como
  `fin_posting_errors`); 3 parciales.
- Por tienda: ENERVIDA 707 ventas (408 OK / 299 err) + 340 resto + 14 pagos;
  COSTPRO (Prueba) 213 ventas OK + 5 resto; PUERTO PADRE 69 ventas OK + 8 resto + 2 pagos.

## 4. Validación en BD AISLADA (lguovmvrozxgssupkwpf) — `validar-fix-dryrun-pagos.mjs`

**PASS TOTAL (15/15) · NET DELTA 0** — `validacion-bd-aislada.txt`:

- Crea un servicio CUP 100,00 + pago cash CUP 100,00 reales → los triggers del
  motor contabilizan reconocimiento y pago DE VERDAD.
- Asiento REAL contabilizado: `PAS_SERV_PEND` D 100,00 / `ACT_EFECTIVO_CUP` C 100,00.
- ESPEJO v3 (`PAGOS_SIM_SQL`) == ASIENTO REAL == REGLA ACTIVA (mismas
  categorías/sentidos/importes) y NO reporta `PAS_CXP_PROV`.
- Limpieza total con patrón canónico del repo (PT007: trigger de invariantes
  deshabilitado solo dentro de la transacción) → conteos idénticos ANTES/DESPUÉS.

Guard CP-INFRA-019 en ambos scripts (dry-run: `ALLOW_PROD=read-only` +
producción verificada por URL; validador: `mode:'write'`, `projectRef` BD E2E
aislada). `check-writers`: `validar-fix-dryrun-pagos.mjs` declarado en
`writers.manifest.json` (`guardProtected`).

## 5. Estado de autorización (SIN CAMBIOS)

Backfill real NO autorizado; saldos iniciales NO autorizados; PR #1612 sin merge
ni despliegue; ninguna migración aplicada a producción en esta rama; PR #1612
sigue independiente de CP-FIN. La rama corrige SOLO la herramienta de simulación
(informe); el motor de producción no se toca (sus reglas ya son correctas).
