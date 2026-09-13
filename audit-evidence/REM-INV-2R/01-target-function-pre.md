# 01 — TARGET FUNCTION PRE (REM-INV-2R)

## Identidad exacta del objetivo (verificado SELECT-only en fase previa a todo DDL)

| Campo | Valor |
|---|---|
| oid | 25452 |
| schema | public |
| nombre | receive_purchase |
| firma identidad | p_purchase_id uuid |
| retorno | void |
| owner | postgres |
| security | INVOKER (prosecdef = false) |
| language | plpgsql |
| volatility | v |
| definición sha256 | 3c471307db80cd4be0e77814dbeb35aff0205d1b1fa123c78752a8c8f7abf22f |

## ACL PRE (dos fuentes independientes, idénticas)

`pg_proc.proacl` = `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`

`information_schema.routine_privileges`:

| grantee | privilege_type |
|---|---|
| authenticated | EXECUTE |
| postgres | EXECUTE |
| service_role | EXECUTE |

Coincide exactamente con lo reportado por REM-INV-2 (assets/fingerprint-pre.json del pack
REM-INV-2). NO se asumió el estado previo: se midió en el momento PRE-DDL (fase 1).

## Definición PRE (verbatim, pg_get_functiondef)

La definición completa (46 líneas) está preservada en:
- `assets/phase3-identity-pre.json` → `.target_full[0].definition` (con hash)
- REM-INV-2: `audit-evidence/REM-INV-2/assets/assets-receive_purchase.sql` (idéntica por
  verificación de hash de cuerpo en REM-INV-2; el hash sha256 de esta gate se calculó sobre
  la salida cruda de pg_get_functiondef, que difiere en el wrapper CREATE OR REPLACE).

## Rasgos forenses de la definición (de REM-INV-2, reconfirmados por hash)

- consume tabla legacy `purchase_items` (0 filas en producción; única función que la usa);
- NO toca `receipts`/`receipt_items` (0 referencias);
- NO toca WAC (`cost_average`/`fn_recalc_wac`: 0 referencias);
- sin `auth.uid()`, sin `p_user_id`, sin guards de store, sin status guard;
- SECURITY INVOKER con EXECUTE para authenticated → superficie de status-flip directo de OC
  (riesgo residual P2 identificado por REM-INV-2, cerrado por este gate al eliminar la función).

## Protección contra confusión (fase 3)

La función objetivo se distingue inequívocamente de las canónicas por oid/firma/hash:

| Función | oid | Firma | sha256 (16 primeros) |
|---|---|---|---|
| **receive_purchase (TARGET)** | **25452** | **(p_purchase_id uuid)** | 3c471307db80cd4b |
| receive_against_po | 138544 | (p_po_id uuid, p_received_items jsonb, p_user_id uuid, p_reception_date timestamptz, p_invoice_number text) | 57cb0dad9085e5c4 |
| register_reception | 138536 | (p_store_id uuid, p_supplier text, p_reception_date timestamptz, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid) | a6ce108357ee5bb0 |
| confirm_pending_reception | 136713 | (p_receipt_id uuid, p_user_id uuid, p_operation_date timestamptz) | d7b0610b77bab22f |

El runner DDL pineó oid=25452 + hash de definición + firma: imposible eliminar otra función.
