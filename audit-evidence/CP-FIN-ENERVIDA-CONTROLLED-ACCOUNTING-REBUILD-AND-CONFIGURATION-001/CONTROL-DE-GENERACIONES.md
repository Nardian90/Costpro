# CONTROL DE GENERACIONES — CP-FIN-003

**Tienda:** ENERVIDA-VITALLCONS · **Ciclo ejecutado en producción el 2026-11-20 (21:0x–21:30 UTC)**

## 1. Identificadores

| Generación | ID | Estado final | Vida |
|---|---|---|---|
| **GEN-0** (legado) | `d0b7adf7-d355-4802-8348-3daf33f290ed` | **superseded** (conservada íntegra) | creada por la migración 20261120120000 al agrupar los 1.066 asientos existentes; activa hasta el corte |
| **GEN-1** (reconstrucción) | `9f1d7d75-b4e7-47ba-a3a4-66f3c8bfa670` | **active** | creada 21:26, construida/validada 21:29, **activada 2026-11-19 21:30:25.881 UTC** (hora del servidor) |

## 2. Corte y snapshot

- **Instante de corte:** la GEN-1 se creó con snapshot de la GEN-0 (por categoría + conteos).
- **Congelación de posting:** durante la construcción la GEN-0 siguió activa (los triggers
  postean en la activa); el tramo de construcción duró segundos por pase (build total 0.7–3.2 s).
- **Delta del corte:** 0 asientos nuevos en GEN-0 durante la ventana (verificado:
  `posted_at > 21:26 → 0 filas`). Ninguna venta quedó sin contabilizar ni doble.

## 3. Construcción (fin_generation_build — política final)

| Pase | Resultado |
|---|---|
| 1 · Re-derivación de reconocimiento/pago de la activa | 1.059 re-derivados; 2 registrados como **no reconstruibles** (documento inexistente; efecto incorporado en datos corregidos) |
| 2 · Anulaciones | 1 (venta anulada: compensatorio enlazado) |
| 3 · Apertura (saldo inicial autorizado) | 1 copia literal (posted_at preservado) |
| 4 · Ajustes manuales | **lista VACÍA** (política documentada §D: la copia indiscriminada duplicaba correcciones del mundo FAC-VITALLCONS-001; primera activación con lista de 4 dejó el inventario en −36,19 M → revertida por rollback y reconstruida en pura re-derivación) |
| 5 · Cobertura documental completa | +5 ventas y +5 vales que la GEN-0 nunca contabilizó (posting errors de la era pre-v3) quedaron incluidos |
| **Total** | **1.084 asientos · 0 errores** |

Idempotencia verificada: re-build → `repostados=0, ya_existentes=1.084, errores=0`.

## 4. Validación (fin_generation_validate — precondición de activación)

| Control | Resultado |
|---|---|
| Asientos desequilibrados | **0** |
| Identidad global (Σdébitos − Σcréditos) | **0.00** |
| Duplicados (doc+evento+pago por generación) | **0** |
| Errores de construcción | **0** |
| Cobertura vs activa | VENTA 714→719 (+5 pre-v3 sin asiento), VALE_SALIDA 198→203 (+5), resto exacto; RECTIFICACION_FIN 12→0 (omitidas por política) |
| Comparación por categoría | puente completo (§D/§F) — todas las deltas explicadas |

## 5. Activación atómica

- `fin_generation_activate` (exige validación `ok=true`): GEN-0 → `superseded` (superseded_at),
  GEN-1 → `active` (activated_at/activated_by registrados).
- Informes (situación/rendimiento/dashboard/drilldown/estado de tipos) leen **solo** GEN-1.

## 6. Rollback (ejercido y revertido en el proceso real)

- Durante la iteración de política de ajustes se ejecutó `fin_generation_rollback`:
  GEN-1 → `rolled_back`, GEN-0 → `active` (reversibilidad probada en producción).
- La GEN-1 se vació, reconstruyó con la política final y se **re-activó** (21:30:25).
- Las entradas de la primera construcción NO se borraron de la historia de la tabla:
  fueron eliminadas solo dentro de la candidata en construcción (estado `building`),
  jamás de la generación activa ni de GEN-0.

## 7. Disponibilidad

- El ciclo completo (`create → build → validate → activate ⇄ rollback`) quedó disponible
  para cualquier tienda (multitienda; RLS de lectura por membresía; ejecución solo
  service_role — canal canónico).
- Toda venta posterior al corte contabiliza directamente en GEN-1 (riel normal de triggers).
