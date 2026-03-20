# Informe de Reparación: Módulo de Inversión de Documentos (Ventas/Recepciones)

## Estado de la Situación
- **Problema Reportado:** Al intentar "Invertir" una venta, el estado del documento no cambia a "Anulado" y no se visualiza el movimiento de ajuste en el módulo de inventario.
- **Evaluación Inicial (Antes):** 2/10 (El proceso fallaba silenciosamente en la base de datos).
- **Porcentaje de Error:** 100% (Ninguna inversión se completaba correctamente en el estado del documento).

## Causas Raíz Identificadas
1. **Trigger de Auditoría Roto (`log_transaction_changes`):**
   - El trigger intentaba insertar en `audit_logs` usando columnas inexistentes (`old_values`, `new_values`), lo que provocaba que cualquier `UPDATE` en la tabla de transacciones fallara con un error 42703.
   - **Estado:** CORREGIDO.

2. **Falta de Políticas RLS para UPDATE:**
   - La tabla `transactions` y `receipts` no tenían políticas de RLS para permitir la operación `UPDATE` desde el cliente. Aunque el usuario fuera administrador, Supabase bloqueaba la actualización del estado.
   - **Estado:** PENDIENTE DE APLICAR.

3. **Falta de Políticas RLS para SELECT en Stock Movements:**
   - La tabla `stock_movements` no tenía política de `SELECT`. El RPC de ajuste de inventario creaba el registro (vía SECURITY DEFINER), pero el frontend no podía leerlo para mostrarlo en la vista de "Ajustes Doc.".
   - **Estado:** PENDIENTE DE APLICAR.

## Plan de Acción (Solución Técnica)
1. **Corregir Trigger:** Actualizado para usar `old_data`/`new_data` y manejar dinámicamente `seller_id` (ventas) o `user_id` (recepciones).
2. **Habilitar RLS UPDATE:** Crear políticas que permitan a administradores y propietarios actualizar el estado de los documentos.
3. **Habilitar RLS SELECT:** Permitir la visualización de movimientos de stock según el acceso a la tienda.

## Evaluación Post-Solución (Esperada)
- **Puntuación:** 10/10.
- **Porcentaje de Error:** < 1%.

---
*Ingeniero Jules - Costpro QA/Dev*
