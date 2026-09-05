# W9.5 — B-10 · 01-reverse-endpoint-map.md
# Mapa completo del endpoint /api/reverse (GATE 1) — post-implementación
# fecha: 2026-09-05 · baseline dd3f3276

Cadena: vista → hook (useReverseDocument) → POST /api/reverse → withAuth(JWT
Supabase) + validateOrigin + rateLimit(5/min/user) → **boundary de autorización
por tipo** (función normativa DB) → RPC (service_role + p_user_id=session.user.id)
→ autorización DB (segunda barrera) → mutación + audit.

| type | RPC (V2 map, USE_V2_REVERSE=true) | Consumidor (vista → botón) | Mutaciones | Auditoría (action / metadata.operation) | Auth (boundary + DB) |
|---|---|---|---|---|---|
| transaction | reverse_transaction_v2 | SalesHistory → "Revertir" (gated canAdminReverseSaleInStore) | tx→voided, stock (sale_reverse), WAC | REVERSE_TRANSACTION_V2 / ADMIN_REVERSE | can_admin_reverse_transaction (B-8) en API + DB |
| receipt | reverse_receipt_v2 | ReceptionsHistory → "Revertir" (gated canReverseReceipt) | receipt→reversed, stock −qty (purchase_reverse), WAC, payments reset | REVERSE_RECEIPT_V2 / ADMIN_REVERSE_RECEIPT | can_reverse_document('receipt') en API + DB |
| transfer | reverse_transfer | Transferencias (salientes) → "Revertir" (gated canReverseDocumentInStore) | transfer→REVERSADA, transfer_in origen + transfer_out destino, WAC blend | transfer_reversed / ADMIN_REVERSE_TRANSFER | can_reverse_document('transfer') en ORIGEN (API+DB) + acceso DESTINO (DB) |
| adjustment | **reverse_inventory_adjustment_v2 (NUEVA — B-10-ADJ-1)** | Ajustes Doc. → "Revertir" (gated canReverseAdj) | contra-ajuste 'confirmed' con items intercambiados + movimiento −diff; original→reversed | REVERSE_ADJUSTMENT_V2 / ADMIN_REVERSE_ADJUSTMENT | can_reverse_document('adjustment') en API + DB |
| devolution | reverse_devolution | (vista huérfana — sin puerta nav) | devolution→reversed, stock −qty directo + kardex directo | REVERSE_DEVOLUTION (NUEVO) / ADMIN_REVERSE_DEVOLUTION | can_reverse_document('devolution') en API + DB (membresía) |
| production_order | reverse_production_order | Costo → Producción → "Revertir" (gated canReverseDocumentInStore) | order→reversed, stock −output (production_reverse), WAC | PRODUCTION_ORDER_REVERSED / ADMIN_REVERSE_PRODUCTION_ORDER | can_reverse_document('production_order') en API + DB |

V1 map (USE_V2_REVERSE=false): reverse_receipt / reverse_transfer /
reverse_adjustment / reverse_devolution / reverse_production_order — fallback de
emergencia; flag activo = true. reverse_receipt V1 sin consumers (backlog B-1).
