════════════════════════════════════════════════════════════════════
W9.5 — B-10 · 03-db-function-inventory.md
Inventario live (GATE 2) — PRE (dd3f3276) vs POST (migración 20260905000002)
════════════════════════════════════════════════════════════════════

── duplicate_inventory_adjustment_v2 ──
  PRE : oid=138870 owner=postgres secdef=True sp=search_path=public, pg_temp acl=postgres=X/postgres,service_role=X/postgres md5=8c7eee6022
  POST: oid=138870 owner=postgres secdef=True sp=search_path=public, pg_temp acl=postgres=X/postgres,service_role=X/postgres md5=8c7eee6022  cambio=NO
── reverse_adjustment ──
  PRE : oid=136656 owner=postgres secdef=True sp=search_path=public acl=postgres=X/postgres,service_role=X/postgres md5=43b309a973
  POST: oid=136656 owner=postgres secdef=True sp=search_path=public acl=postgres=X/postgres,service_role=X/postgres md5=43b309a973  cambio=NO
── reverse_devolution ──
  PRE : oid=136657 owner=postgres secdef=True sp=search_path=public acl=postgres=X/postgres,service_role=X/postgres md5=7374c7ad99
  POST: oid=136657 owner=postgres secdef=True sp=search_path=public acl=postgres=X/postgres,service_role=X/postgres md5=e1915afda4  cambio=SÍ (esperado)
── reverse_production_order ──
  PRE : oid=138622 owner=postgres secdef=True sp=search_path=public, extensions acl=postgres=X/postgres,service_role=X/postgres md5=c3108e8a5a
  POST: oid=138622 owner=postgres secdef=True sp=search_path=public, extensions acl=postgres=X/postgres,service_role=X/postgres md5=51ded199fb  cambio=SÍ (esperado)
── reverse_receipt ──
  PRE : oid=136654 owner=postgres secdef=True sp=search_path=public acl=postgres=X/postgres,service_role=X/postgres md5=a2dd36ed6f
  POST: oid=136654 owner=postgres secdef=True sp=search_path=public acl=postgres=X/postgres,service_role=X/postgres md5=a2dd36ed6f  cambio=NO
── reverse_receipt_v2 ──
  PRE : oid=138196 owner=postgres secdef=True sp=search_path=public, pg_temp acl==X/postgres,postgres=X/postgres,authenticated=X/postgres,service_r md5=d13a05b0bc
  POST: oid=138196 owner=postgres secdef=True sp=search_path=public, pg_temp acl==X/postgres,postgres=X/postgres,authenticated=X/postgres,service_r md5=e9822e1883  cambio=SÍ (esperado)
── reverse_transfer ──
  PRE : oid=136655 owner=postgres secdef=True sp=search_path=public, pg_temp acl=postgres=X/postgres,service_role=X/postgres md5=8bd79925ba
  POST: oid=136655 owner=postgres secdef=True sp=search_path=public, pg_temp acl=postgres=X/postgres,service_role=X/postgres md5=cb92c117c2  cambio=SÍ (esperado)

NUEVAS: can_reverse_document (oid 143547) y reverse_inventory_adjustment_v2
(oid 143548) — postgres, SECURITY DEFINER, ACL postgres+service_role (patrón F06).

SIN DRIFT: duplicate_inventory_adjustment_v2 y reverse_adjustment byte-idénticos
(el botón "Duplicar" conserva su semántica B-11). reverse_receipt V1 (136654):
viva sin consumers (backlog B-1, fuera de alcance).
Triggers de audit de status (20240325000000): SOLO transactions+receipts;
las demás entidades dependen del audit de su RPC (REVERSE_DEVOLUTION era
imprescindible — GATE J).