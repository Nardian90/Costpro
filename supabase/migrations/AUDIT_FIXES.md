Audit fixes - evidencia de cambios

Fecha: 2026-01-12

Resumen
- Se aplicó un plan para asegurar la integridad y trazabilidad de operaciones de inventario y recepción.
- Archivos creados/modificados en `supabase/migrations` y en el frontend para forzar RPCs y usar variables de entorno.

Cambios realizados

1) Migración RLS y wrapper
- Archivo: `20260112_ensure_audit_rls.sql`
- Descripción: Habilita RLS en tablas críticas (`receipts`, `receipt_items`, `stock_movements`, `inventory`), crea políticas de solo-lectura para usuarios autenticados y políticas que impiden escrituras directas desde cliente en tablas de auditoría. Añade `register_reception_wrapper` con `SECURITY DEFINER`.

2) RPC para movimientos de stock
- Archivo: `20260112_register_stock_movement.sql`
- Descripción: Implementación ejemplo de `register_stock_movement` que inserta en `stock_movements` y actualiza `inventory` de forma atómica. Requiere revisión de tipos y permisos antes de desplegar.
 
3) RPC para recepciones
- Archivo: `20260112_register_reception.sql`
- Descripción: Implementación ejemplo de `register_reception` que crea `receipts`, `receipt_items`, registra movimientos de compra en `stock_movements` y actualiza `inventory` de forma atómica.

3) Consultas de diagnóstico
- Archivo: `sql_checks.sql`
- Descripción: SELECTs para validar integridad entre `inventory` y `stock_movements`, receipts huérfanos, duplicados, y políticas RLS.

4) Cliente Supabase
- Archivo modificado: `src/lib/supabaseClient.ts`
- Descripción: Reemplazo de credenciales hardcodeadas por variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

5) Frontend - logging de movimientos
- Archivo modificado: `src/components/WarehouseView.tsx`
- Descripción: `logStockMovement` ahora intenta llamar a la RPC `register_stock_movement` y realiza fallback a inserción directa si la RPC no está disponible.

6) Frontend - ajuste individual via RPC
- Archivo modificado: `src/components/WarehouseView.tsx`
- Descripción: `handleStockAdjustment` ahora usa `register_stock_movement` directamente para realizar el ajuste de inventario y registrar el movimiento en una sola operación atómica.

6) `.env.example`
- Archivo creado en la raíz con variables de ejemplo y nota sobre `DATABASE_URL`.

Pasos sugeridos para despliegue en staging
1. Revisar y ajustar tipos/nombres de campos en `20260112_register_stock_movement.sql` y `20260112_ensure_audit_rls.sql`.
2. Ejecutar `sql_checks.sql` en staging antes de desplegar migraciones para documentar estado inicial.
3. Aplicar migraciones vía Supabase SQL editor o CLI.
4. Verificar que las funciones `register_reception` y `register_stock_movement` existen y tienen `SECURITY DEFINER`.
5. Ejecutar `sql_checks.sql` y validar el checklist de auditoría.

Notas
- No se hizo deploy automático a Supabase: los archivos están preparados para revisión y despliegue manual.
- Rotar keys: después de desplegar, rotar `anon key` y actualizar `.env`/secret manager.

Archivos de ayuda añadidos
- `DEPLOY_INSTRUCTIONS.md` — instrucciones paso a paso para desplegar en staging (manual/psql/CLI).
- `run_sql_checks.sh` / `run_sql_checks.ps1` — scripts para ejecutar `sql_checks.sql` y guardar resultado en `supabase/migrations`.
- `sql_checks.sql` — archivo con SELECTs de diagnóstico (ya incluido).

Contacto
- Si quieres, puedo generar PRs con estos cambios y/o aplicar ajustes necesarios al SQL para tu esquema exacto.
