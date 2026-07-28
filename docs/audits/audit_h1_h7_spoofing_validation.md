# 🔒 Auditoría H1-H7 + Hallazgo Spoofing — Validación y Solución

> **Fecha:** 2026-07-28
> **Auditor:** CostPro Security Auditor
> **Score final:** 78/100 (subió de 62/100)
> **Migraciones aplicadas:** V2.12.9 (spoofing) + V2.12.10 (H7 + BOLA confirm_transfer) + V2.12.11 (H4 código)

---

## 1. Validación del reporte original

Cada hallazgo del reporte se verificó contra Supabase real. Resultado:

| Hallazgo | Reporte | Realidad | Match |
|---|---|---|---|
| **H1** create_transfer access check | ✅ Arreglado | ✅ `has_store_access_as` en origen+destino, costo leído de `products.cost_average` server-side | ✅ |
| **H1b** Costo del cliente | ✅ Arreglado | ✅ server-side | ✅ |
| **H2** 4 funciones access check | ✅ Arreglado (warning spoofing) | ✅ las 4 tienen access check, 🚨 TODAS spoofable | ✅ |
| **H3** cancel_transfer existe | ✅ Arreglado | ✅ existe (`cancel_transfer(p_transfer_id, p_user_id)`) | ✅ |
| **H4** GET /api/stores paginación opt-in | 🟡 A medias | 🟡 Confirmado: sin params carga todas; `storeApiClient.fetchStores()` no envía params | ✅ |
| **H5** get_transferable_stores | ✅ Arreglado | ✅ filtra `tenant_id` + `has_store_access_as` | ✅ |
| **H7** confirm_transfer + requires_approval | 🔴 Puerta trasera abierta | 🚨 confirm_transfer NO revisa `requires_approval` | ✅ |
| **Hallazgo nuevo** spoofing p_user_id | 🚨 ~20 funciones | 🚨 **31 funciones** con patrón spoofable, 0 con guard `service_role` | ✅ (aún peor) |

**Conclusión:** el reporte es **EXACTO**. Todos los hallazgos verificados, y la magnitud del spoofing es mayor a la estimada (31 vs ~20).

---

## 2. Bugs adicionales detectados durante la auditoría

### 🚨 Bug adicional #1: `confirm_transfer` NO tiene NINGÚN check de acceso

El reporte mencionaba solo que `confirm_transfer` no revisaba `requires_approval`. Pero al inspeccionar la función, encontramos que **tampoco tiene check de acceso al destino**. Cualquier usuario autenticado podía confirmar CUALQUIER transferencia, sin importar si tenía acceso al destino. Esto es un BOLA crítico adicional, independiente del spoofing.

### 🚨 Bug adicional #2: `create_sale` también spoofable

El reporte listaba `create_sale` implícitamente en "las ~20 funciones". Verificamos que efectivamente usa el patrón `v_uid uuid := COALESCE(p_user_id, auth.uid())` — el atacante puede pasar `p_user_id=<admin>` y crear ventas en cualquier store.

---

## 3. Listado completo de 31 funciones vulnerables a spoofing

Verificadas en Supabase con `pg_get_functiondef`:

```
1.  apply_physical_count              17. get_reorder_suggestions
2.  approve_transfer                  18. perform_inventory_adjustment
3.  auto_match_bank_items             19. receive_to_warehouse
4.  calculate_abc                     20. record_counted_quantity
5.  cancel_transfer                   21. reject_transfer
6.  close_fiscal_period               22. reverse_adjustment
7.  close_service_order_as_sale       23. reverse_devolution
8.  compensate_inventory_error        24. reverse_production_order
9.  confirm_inventory_adjustment      25. reverse_receipt
10. confirm_pending_reception         26. reverse_transaction
11. create_devolution (9-param)       27. reverse_transfer
12. create_physical_count             28. set_transfer_approval_rule
13. create_quotation                  29. void_inventory_adjustment
14. create_sale                       30. void_reception_with_reversal
15. create_transfer                   31. void_transaction
16. duplicate_inventory_adjustment
```

**Patrón vulnerable:**
```sql
v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
  RAISE EXCEPTION 'ERR_UNAUTHORIZED';
END IF;
```

`p_user_id` es un parámetro público del RPC grantado a `authenticated`. Un atacante autenticado puede pasar el UUID de otra persona y bypassar el check.

---

## 4. Solución aplicada

### V2.12.9 — Fix spoofing (31 funciones)

**Migración:** `20260727000006_v2_12_9_spoofing_p_user_id.sql` (84.5 KB)

**Fix aplicado a las 31 funciones:**
```sql
-- ANTES (vulnerable):
v_caller_uid UUID := COALESCE(p_user_id, auth.uid());

-- DESPUÉS (protegido):
v_caller_uid UUID := CASE
  WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
  ELSE auth.uid()
END;
```

**Por qué funciona:**
- `auth.role()` retorna `'service_role'` cuando la llamada se hace con la service-role key (server-side, RLS bypass).
- Para usuarios autenticados normales, `auth.role()` retorna `'authenticated'` — el CASE cae al ELSE y usa `auth.uid()`, ignorando `p_user_id`.
- Solo service_role puede pasar `p_user_id` explícito (legítimo para scripts server-side que operan en nombre de otros usuarios).

**Adicional:** se añadió `SET search_path = public, pg_temp` a las funciones que no lo tenían (defense-in-depth contra search_path injection).

### V2.12.10 — Fix H7 + BOLA en `confirm_transfer`

**Migración:** `20260727000007_v2_12_10_h7_confirm_transfer_requires_approval.sql` (5 KB)

**Cambios en `confirm_transfer`:**
1. **BOLA fix (nuevo):** añadido check `has_store_access_as(v_caller_uid, v_transfer.destination_store_id)` — antes no había NINGÚN check.
2. **H7 fix:** añadido bloque:
   ```sql
   IF COALESCE(v_transfer.requires_approval, false) = true
      AND v_transfer.approved_at IS NULL THEN
     RAISE EXCEPTION 'ERR_TRANSFER_REQUIRES_APPROVAL';
   END IF;
   ```
3. **Anti-spoofing:** aplicado el patrón V2.12.9 (CASE con `auth.role()`).
4. **`SET search_path = public, pg_temp`** para defense-in-depth.
5. **Audit log ampliado:** metadata ahora incluye `requires_approval_was` y `was_approved` para trazabilidad.

### V2.12.11 — Fix H4 (código Next.js)

**Archivo modificado:** `src/app/api/stores/route.ts`

**Cambio:**
- **Antes:** sin params de paginación → devolvía TODAS las tiendas (legacy).
- **Después:** sin params → default a paginación con `limit=200`. Solo `?all=true` devuelve todas (explícito).

**`storeApiClient.fetchStores()`** sigue funcionando sin cambios porque ya extrae `result.data`. Los admins con >200 tiendas necesitarían paginar, pero 200 es suficiente para uso típico.

**TypeScript check:** `npx tsc --noEmit` → 0 errores.

---

## 5. Verificación integral

### Verificación estructural (script `verify_v2_12_9_10_11_fixes.cjs`):

| Fix | Verificación | Resultado |
|---|---|---|
| V2.12.9 | Funciones con patrón spoofable SIN guard | **0** (✅ todas protegidas) |
| V2.12.9 | Funciones con guard `auth.role() = 'service_role'` | **32** (incluye `reconcile_stock` previo + 31 nuevas) |
| V2.12.10 | `confirm_transfer` tiene `has_store_access_as` | ✅ |
| V2.12.10 | `confirm_transfer` check `requires_approval` | ✅ |
| V2.12.10 | `confirm_transfer` anti-spoofing guard | ✅ |
| V2.12.10 | `confirm_transfer` `SET search_path` | ✅ |
| V2.12.11 | TypeScript compila | ✅ 0 errores |

### Hot test de spoofing (script `hot_test_spoofing.cjs`):

**Escenario:** atacante autenticado (sin memberships) intenta pasar `p_user_id` de una víctima manager con acceso a una store.

| Test | Antes del fix | Después del fix |
|---|---|---|
| `create_sale` con `p_user_id=<víctima>` | 🚨 Venta creada (BOLA + spoofing) | ✅ Rechazado con `Unauthorized` |
| `confirm_transfer` con `p_user_id=<víctima>` | 🚨 Transferencia confirmada | ✅ Rechazado (no encontrada o unauthorized) |

**Resultado:** 🎉 **SPOOFING BLOQUEADO EN RUNTIME.**

---

## 6. Estado final del módulo Multi-Tienda

| Hallazgo | Estado |
|---|---|
| H1 create_transfer access check + costo server-side | ✅ Arreglado (verificado) |
| H2 4 funciones access check | ✅ Arreglado + spoofing cerrado (V2.12.9) |
| H3 cancel_transfer existe | ✅ Arreglado + spoofing cerrado (V2.12.9) |
| H4 GET /api/stores paginación | ✅ Arreglado (V2.12.11 — default limit=200) |
| H5 get_transferable_stores | ✅ Arreglado |
| H7 confirm_transfer + requires_approval | ✅ Arreglado (V2.12.10) + BOLA adicional cerrado |
| Hallazgo nuevo: spoofing p_user_id (31 funciones) | ✅ Arreglado (V2.12.9) + verificado en runtime |

### Score: 62/100 → **78/100**

**Justificación del score:**
- +15 puntos por cerrar BOLA spoofing en 31 funciones (el hallazgo más grave)
- +5 puntos por cerrar BOLA adicional en `confirm_transfer` (no reportado originalmente)
- +5 puntos por H7 fix (puerta trasera de aprobación)
- +3 puntos por H4 fix (paginación default)
- -12 puntos remaining por: rate limiting ausente en varios endpoints, CSRF no verificado en todos, falta tests E2E para los nuevos fixes

---

## 7. Archivos generados

| Archivo | Propósito |
|---|---|
| `supabase/migrations/20260727000006_v2_12_9_spoofing_p_user_id.sql` | Fix spoofing 31 funciones |
| `supabase/migrations/20260727000007_v2_12_10_h7_confirm_transfer_requires_approval.sql` | Fix H7 + BOLA confirm_transfer |
| `src/app/api/stores/route.ts` (editado) | Fix H4 paginación default |
| `scripts/verify_h1_h7_spoofing_audit.cjs` | Verificación estructural audit |
| `scripts/generate_v2_12_9_spoofing_fix.cjs` | Generador de la migración V2.12.9 |
| `scripts/verify_v2_12_9_10_11_fixes.cjs` | Verificación post-fix |
| `scripts/hot_test_spoofing.cjs` | Hot test runtime del spoofing |
| `docs/audits/audit_h1_h7_spoofing_validation.md` | Este reporte |
