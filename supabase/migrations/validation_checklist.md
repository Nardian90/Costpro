Checklist de validación (auditoría)

1) Migraciones aplicadas en staging: `20260112_ensure_audit_rls.sql`, `20260112_register_stock_movement.sql`.
2) Verificar que `register_reception` y `register_stock_movement` existen y tienen `SECURITY DEFINER`.
3) Ejecutar `sql_checks.sql` y documentar resultados (guardar salida como `sql_checks_results_TIMESTAMP.md`).
4) Probar E2E: crear una recepción desde UI y confirmar inserciones en `receipts`, `receipt_items`, `stock_movements`, y actualización en `inventory` en una sola transacción.
5) Confirmar que usuarios sin permisos no pueden escribir directamente en tablas protegidas (403 desde frontend).
6) Verificar `audit_logs` para entradas correspondientes a las operaciones importantes.
7) Rotar `anon key` y actualizar entorno; verificar que la app sigue funcionando.
8) (OBSOLETO — Prisma removido, Supabase es la fuente de verdad)
