# Expediente de evidencia readonly de producción — misión 006

**Fecha:** 2026-11-08 · **PR:** Nardian90/Costpro#1563 · **Rama:** `audit/multicashier-001`
**Naturaleza:** consultas **SELECT de solo lectura** contra la base de producción de Costpro, vía la API de Management de Supabase, **agregadas y sin PII**. Ejecutadas con el helper local `scripts/agent/e2e-query.cjs` del sandbox de auditoría; **las credenciales NO forman parte de este repositorio** (viven en el entorno del agente y no se copian jamás al PR). No se ejecutó ninguna escritura, migración ni cambio de configuración.

Este expediente se mantiene **separado** de las simulaciones conceptuales (los scripts de asertos de `docs/audits/evidence/*.py` no tocan ninguna base de datos). Clase de evidencia: **[MEDIDO]**.

---

## Q1 — Combinaciones reales de `ref_type / direction / payment_method` en el ledger

```sql
SELECT ref_type, direction, payment_method, count(*)::int AS n
FROM payment_transactions GROUP BY 1,2,3 ORDER BY n DESC;
```

| ref_type | direction | payment_method | n |
|---|---|---|---:|
| sale | in | cash | 584 |
| sale | in | zelle | 242 |
| sale | in | transfer | 54 |
| work | in | zelle | 31 |
| service | in | cash | 9 |
| work | in | cash | 3 |
| devolution | refund | cash | 2 |
| cash_flow | out | cash | 2 |

**Lectura:** `devolution/out/cash` = **0 filas** (y ninguna ruta de código la crea — D.18.3): el filtro de devoluciones comerciales es `direction='refund'` exclusivo. `direction='out'` pertenece a los egresos documentados (`cash_flow/out/cash`) y a las filas contra de anulación. No existen aún filas `cash_transfer/*` (funcionalidad futura del diseño).

## Q2 — Vínculo `cash_flow_documents` ↔ ledger

```sql
SELECT status, count(*)::int AS docs,
       count(payment_transaction_id)::int AS con_fila,
       count(annulment_payment_transaction_id)::int AS con_contra
FROM cash_flow_documents GROUP BY 1;
```

| status | docs | con_fila | con_contra |
|---|---:|---:|---:|
| confirmado | 2 | 2 | 0 |

**Lectura:** ambos documentos confirmados tienen su fila monetaria; sin anulaciones aún → los CHECKs aditivos `ctr_cfd_*` (D.18.4) son validables en migración sin backfill.

## Q3 — Filas que respaldan más de un documento

```sql
SELECT count(*)::int AS dups FROM (
  SELECT payment_transaction_id FROM cash_flow_documents
   WHERE payment_transaction_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) x;
```

→ `dups = 0` (sin UNIQUE vigente aún: la corrección D.18.4 lo vuelve estructuralmente imposible).

## Q4 — Documentos confirmados sin fila monetaria

```sql
SELECT count(*)::int AS hueco FROM cash_flow_documents WHERE payment_transaction_id IS NULL;
```

→ `hueco = 0`.

## Q5 — Claves de idempotencia duplicadas en el ledger

```sql
SELECT count(*)::int AS dups FROM (
  SELECT idempotency_key FROM payment_transactions
   WHERE idempotency_key IS NOT NULL GROUP BY 1 HAVING count(*)>1) x;
```

→ `dups = 0` (los reintentos no duplicaron dinero hasta hoy; índice único vigente).

## Verificación de entorno (misma sesión)

- `origin/main` = `fb4006184`; cambios respecto a `534f08e0a` solo del módulo auth (PR #1568) — **sin cambios en el módulo Caja**.
- Proyecto E2E separado (`lguovmvrozxgssupkwpf`, 5 filas de muestra) distinguido del proyecto de producción (`wthkddeleylijmonclxg`): todas las cifras de arriba son de producción.
