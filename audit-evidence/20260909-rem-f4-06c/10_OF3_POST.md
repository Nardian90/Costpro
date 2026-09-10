# 10_OF3_POST — estado POST del close (§14) (raw: out_q03_post_state.txt + verificación byte-a-byte)

- Firma PRESERVADA: close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL) RETURNS jsonb
- secdef=true, owner=postgres, cfg=[search_path=public, pg_temp] (preservado del objeto vigente)
- ACL: postgres=X/postgres,service_role=X/postgres (CREATE OR REPLACE preserva OID/ACL/comment)
- Cuerpo: SIN ninguna referencia a fiscal_period_closures (guard POST + S5 en vivo)

## Restauración canónica verificada byte-a-byte (diff contra v2_12_9)
```
5c5
<  SET search_path TO 'public'
---
>  SET search_path TO 'public', 'pg_temp'
```
ÚNICA diferencia = search_path preservado del objeto actual (hardening vigente).
Todo el cuerpo (declaraciones, autorización has_store_access_as, ramas UPDATE/INSERT con
totales, retorno closing_id/total_*) es IDÉNTICO al canónico v2_12_9.

## Efecto
- close sobre fila open → UPDATE status='closed' + closed_by=actor + audit trigger (1 fila)
- close sin fila → totales (transactions/devolutions/receipts/commission_payments) + INSERT
  status='closed' con total_cash_balance = sales − devolutions − commissions
- retorno canónico: {status:'success', closing_id, total_sales, total_devolutions,
  total_purchases, total_commissions}
- fiscal_period_closures: sigue inexistente en TODOS los relkinds (censo POST p4)
