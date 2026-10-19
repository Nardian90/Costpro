# DOSSIER DE AUTORIZACIÓN — Backfill controlado de `david9999` (DT-03 / Decisión B)

**Fecha:** 2026-10-19 · **Estado:** ⛔ PENDIENTE DE AUTORIZACIÓN ESCRITA DEL PROPIETARIO — **NO EJECUTADO**
**Instrucción de referencia:** «No ejecutes ninguna escritura en producción hasta presentar los datos exactos de la fila, los valores anterior y nuevo, y el mecanismo de reversión. Solicita confirmación específica antes de ejecutar la escritura.» (instrucción operativa DT-03/PR #1422, §2.B)

---

## 1. Alcance exacto

**Exactamente 1 (UNA) fila de `public.profiles`.** Los otros 10 perfiles con `tenant_id` NULL **NO se tocan** (pertenencia no demostrable — clasificación completa en `INFORME.md` §PASO 4).

## 2. Datos exactos de la fila (captura viva read-only del 2026-10-19)

`raw/14_backfill_david9999_fila_actual.json` (SELECT * íntegro; resumen):

| Campo | Valor VIVO actual (antes) |
|---|---|
| `id` | `84ef824e-8066-4efa-afc7-102918c6c982` |
| `email` | `david9999@gmail.com` |
| `full_name` | `David` |
| **`tenant_id`** | **`NULL` ← valor anterior** |
| `role` | `clerk` |
| `is_active` | `true` |
| `active_store_id` | `5e6fe821-5465-48b1-b3f1-3aa3182edc38` (ENERVIDA-VITALLCONS) |
| `updated_at` | `2026-10-09 12:11:09.313885+00` |
| `plan` | `free` |
| `created_by` / `deleted_at` | `NULL` / `NULL` |

## 3. Valor nuevo propuesto

| Campo | Antes | Después |
|---|---|---|
| `tenant_id` | `NULL` | **`5364ccf8-e6cd-4c38-aea8-b167b3b5576f`** (Default Tenant — verificado vivo: existe, creado 2026-08-04) |
| `updated_at` | `2026-10-09 12:11:09.313885+00` | `now()` en el momento de la ejecución |
| Resto de columnas | — | **SIN CAMBIOS** (la UPDATE solo toca `tenant_id` y `updated_at`) |

## 4. Evidencia de pertenencia (por qué este perfil y no otros)

1. **Membership activa demostrable:** `clerk` en **ENERVIDA-VITALLCONS** (`5e6fe821-…`), `status=active`, creada `2026-10-09 12:19:07` (8 minutos después del signup del usuario, `2026-10-09 12:11`).
2. **La tienda de la membership pertenece a `Default Tenant`** (`stores.tenant_id = 5364ccf8-…`, tienda activa).
3. **`active_store_id` del perfil = la misma tienda** (coherencia adicional).
4. **0 contradicciones:** 0 memberships activas en tiendas de otros tenants.
5. Efecto esperado sobre accesos: **NINGUNO en modo latente** (el guard NULL-safe de `has_store_access` ya le da acceso a SU tienda; probado en vivo T3.1/T3.3 — acceso legítimo conservado, sin extras). En un futuro modo estricto le PERMITE conservar su acceso legítimo.

## 5. SQL propuesto (transacción única, idempotente, auditable)

Ejecutable vía `scripts/dt03_backfill_david9999_execute.js` (dry-run por defecto; ejecuta SOLO con `EXECUTE=1 I_CONFIRM_BACKFILL_DAVID9999=YES` + `SUPABASE_ACCESS_TOKEN`):

```sql
BEGIN;
UPDATE public.profiles
   SET tenant_id = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f',
       updated_at = now()
 WHERE id = '84ef824e-8066-4efa-afc7-102918c6c982'
   AND tenant_id IS NULL;                        -- idempotente: re-ejecutar = 0 filas
INSERT INTO public.audit_logs (user_id, table_name, record_id, action, old_data, new_data, metadata, created_at)
SELECT NULL, 'profiles', '84ef824e-8066-4efa-afc7-102918c6c982', 'dt03_backfill_tenant',
       '{"tenant_id": null}'::jsonb,
       '{"tenant_id": "5364ccf8-e6cd-4c38-aea8-b167b3b5576f"}'::jsonb,
       '{"authorized_by":"<propietario>","evidence":".../BACKFILL_DAVID9999_DOSSIER.md","reason":"pertenencia demostrable por membership activa","scope":"exactly 1 profile"}'::jsonb,
       now()
 WHERE NOT EXISTS (SELECT 1 FROM public.audit_logs
                   WHERE action = 'dt03_backfill_tenant'
                     AND record_id = '84ef824e-8066-4efa-afc7-102918c6c982');
COMMIT;
```

**Precondiciones verificadas en dry-run (2026-10-19):** perfil existe y activo ✓ · tenant_id aún NULL ✓ · tenant destino existe ✓ · membership activa demostrable ✓ · 0 contradicciones ✓. La ejecución re-verifica TODO antes de escribir y se niega si algo cambió. La fila de auditoría se inserta EN LA MISMA TRANSACCIÓN (atómica con el cambio).

## 6. Mecanismo de reversión (restaura el estado exacto previo)

```sql
BEGIN;
UPDATE public.profiles
   SET tenant_id = NULL,
       updated_at = '2026-10-09 12:11:09.313885+00'::timestamptz   -- valor previo exacto capturado
 WHERE id = '84ef824e-8066-4efa-afc7-102918c6c982'
   AND tenant_id = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f';
INSERT INTO public.audit_logs (user_id, table_name, record_id, action, old_data, new_data, metadata, created_at)
SELECT NULL, 'profiles', '84ef824e-8066-4efa-afc7-102918c6c982', 'dt03_backfill_tenant_reversal',
       '{"tenant_id": "5364ccf8-…"}'::jsonb, '{"tenant_id": null}'::jsonb,
       '{"authorized_by":"<propietario>","reason":"reversión del backfill dt03","restaura_updated_at_previo":true}'::jsonb,
       now()
 WHERE NOT EXISTS (SELECT 1 FROM public.audit_logs
                   WHERE action = 'dt03_backfill_tenant_reversal'
                     AND record_id = '84ef824e-8066-4efa-afc7-102918c6c982');
COMMIT;
```

- El campo `tenant_id` **no dispara cascadas** (verificado: ninguna FK referencia profiles.tenant_id; ninguna policy viva depende del valor para conceder — solo para restringir en modo estricto).
- La reversión es completa e idempotente; queda auditada como evento propio.

## 7. Qué se solicita exactamente

**Autorización escrita específica para ejecutar la transacción del §5** (una fila, auditada, reversible). Con su confirmación: (1) ejecutar `scripts/dt03_backfill_david9999_execute.js` con las banderas de confirmación; (2) verificación post-ejecución automática (perfil + audit_log en la respuesta); (3) evidencia de resultado commiteada en esta carpeta. **Sin su confirmación, nada se ejecuta.**
