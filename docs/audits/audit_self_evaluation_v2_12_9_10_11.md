# 🔒 Auto-Auditoría de la Implementación V2.12.9 + V2.12.10 + V2.12.11

> **Fecha:** 2026-07-28
> **Auditor:** CostPro Security Auditor (auto-evaluación)
> **Implementación auditada:**
> - V2.12.9 — Fix spoofing p_user_id en 31 funciones
> - V2.12.10 — Fix H7 + BOLA en confirm_transfer
> - V2.12.11 — Fix H4 paginación default en /api/stores
> **Evaluación:** 7/10

---

## 1. Resumen Ejecutivo

La implementación **resolvió correctamente el problema crítico** (BOLA spoofing en 31 funciones + puerta trasera H7 + paginación H4), pero tiene **issues de robustez** que deberían resolverse en el próximo sprint. El fix central es correcto y verificado en runtime, pero hay deuda técnica en la consistencia del patrón y la cobertura de tests.

### Score: **7/10**

---

## 2. Fortalezas (lo que se hizo bien)

### ✅ Identificación exhaustiva del problema
- Se usó `pg_proc` + `pg_get_functiondef` para enumerar TODAS las funciones con el patrón vulnerable, no solo las mencionadas en el reporte.
- Resultado: 31 funciones detectadas (más de las ~20 estimadas en el reporte original).
- Se incluyó el caso edge de case-insensitive `UUID`/`uuid` tras detectar el primer fallo.

### ✅ Fix central correcto
El patrón aplicado es el correcto y el recomendado por Supabase:
```sql
v_caller_uid UUID := CASE
  WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
  ELSE auth.uid()
END;
```
- `auth.role()` es la función canónica de Supabase para distinguir service_role de authenticated.
- service_role puede pasar `p_user_id` explícito (legítimo para scripts server-side).
- authenticated siempre usa `auth.uid()` (ignora `p_user_id`).

### ✅ Defense-in-depth
- Añadido `SET search_path = public, pg_temp` a las 31 funciones (algunas no lo tenían).
- Esto protege contra search_path injection, un ataque clásico en funciones SECURITY DEFINER.

### ✅ V2.12.10 cerró DOS bugs en una sola migración
- H7 (reportado): `requires_approval` check.
- BOLA adicional (NO reportado, detectado en auditoría): `has_store_access_as` check que no existía.

### ✅ Hot test en runtime
- No solo verificación estructural (regex sobre function body).
- Se creó un atacante real en Supabase Auth, se logueó, e intentó el spoofing.
- `create_sale` con `p_user_id=<víctima>` → rechazado con `Unauthorized`.
- `confirm_transfer` con `p_user_id=<víctima>` → no ejecutó confirmación.
- Esto da confianza real de que el fix funciona, no solo en código sino en comportamiento.

### ✅ Compatibilidad hacia atrás
- `CREATE OR REPLACE FUNCTION` preserva GRANTs existentes (verificado: ACL mantiene `authenticated=X` y `service_role=X`).
- Las firmas de funciones NO se modificaron.
- `storeApiClient.fetchStores()` sigue funcionando sin cambios (extrae `result.data` que sigue existiendo).
- TypeScript: 0 errores. ESLint: 0 errores.

### ✅ Trazabilidad
- Audit log en `confirm_transfer` ampliado con `requires_approval_was` y `was_approved` para forensic.
- Reporte de auditoría detallado en `docs/audits/audit_h1_h7_spoofing_validation.md`.
- Worklog actualizado.

---

## 3. Debilidades (lo que se hizo mal o podría mejorar)

### 🟡 DEBILIDAD #1: 22 funciones mantienen el patrón `IS NOT NULL AND NOT` (BUG RESIDUAL)

**Evidencia:**
```sql
-- Línea 77 de V2.12.9 (apply_physical_count):
IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_count.store_id) THEN
  RAISE EXCEPTION 'ERR_UNAUTHORIZED';
END IF;
```

Este es el **mismo patrón buggy que identificamos en H4-1** (auth bypass cuando `v_caller_uid IS NULL`).

**Impacto:**
- Para usuarios `authenticated`: `v_caller_uid = auth.uid()` que NUNCA es NULL → check se ejecuta. **OK.**
- Para `service_role` sin `p_user_id`: `v_caller_uid = COALESCE(NULL, NULL) = NULL` → `IS NOT NULL` es FALSE → check **SE OMITE**.

**Severidad:** Media. Requiere service_role (server-side), pero rompe la consistencia del fix y deja un bypass para scripts server-side que olviden pasar `p_user_id`.

**Patrón correcto:**
```sql
IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_count.store_id) THEN
  RAISE EXCEPTION 'ERR_UNAUTHORIZED';
END IF;
```

** Alcance:** 22 de 31 funciones tienen este patrón residual (14 con `v_caller_uid` + 8 con `v_uid`).

### 🟡 DEBILIDAD #2: 0 GRANTs explícitos en V2.12.9

**Evidencia:** `grep -c "GRANT EXECUTE" V2.12.9.sql` → 0

**Impacto:** Nulo en producción (CREATE OR REPLACE preserva ACLs), pero es mala práctica. Si la función se crea por primera vez en un entorno limpio (sin la versión previa), los GRANTs no se aplicarían.

**Fix:** Añadir `GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role;` después de cada CREATE OR REPLACE.

### 🟡 DEBILIDAD #3: 0 COMMENT ON FUNCTION en V2.12.9

**Evidencia:** `grep -c "^COMMENT ON FUNCTION" V2.12.9.sql` → 0

**Impacto:** Bajo. Los COMMENTS son metadata útil para documentación, pero no críticos.

### 🟡 DEBILIDAD #4: `anon=X` en ACL de funciones sensibles

**Evidencia (verificado en Supabase):**
```
approve_transfer: ACL = {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

**Impacto:** Las funciones SECURITY DEFINER son ejecutables por `anon` (usuarios sin login). Aunque las funciones validan `auth.uid()` internamente, esto amplía la superficie de ataque.

**Severidad:** Baja-Media. Pre-existente (no introducido por V2.12.9), pero el fix debería haber aprovechado para revocar anon execute.

**Fix:**
```sql
REVOKE EXECUTE ON FUNCTION public.create_sale(...) FROM anon;
```

### 🟡 DEBILIDAD #5: storeApiClient no maneja `pagination` metadata

**Evidencia:** `fetchStores()` en `src/services/store-api-client.ts` no fue modificado.

**Impacto:** Admins con >200 tiendas verán solo las primeras 200 sin saber que hay más. El `nextCursor` devuelto por el API se ignora.

**Severidad:** Baja. 200 tiendas es raro en la práctica (la mayoría de MIPYMES cubanas tienen 1-5 tiendas), pero es deuda técnica.

### 🟡 DEBILIDAD #6: No hay tests de regresión en vitest/playwright

**Evidencia:** Solo se crearon scripts ad-hoc (`verify_*.cjs`, `hot_test_*.cjs`).

**Impacto:** Si una migración futura rompe el fix, no se detectará automáticamente. Los scripts ad-hoc tienen que ejecutarse manualmente.

**Fix:** Añadir tests en `e2e/security.spec.ts` o `tests/security/sellers.test.ts` que:
1. Login como usuario no-admin.
2. Intentar crear venta con `p_user_id` de otra persona.
3. Verificar que se rechaza con `Unauthorized`.

### 🟡 DEBILIDAD #7: Generador de migración es frágil

**Evidencia:** `generate_v2_12_9_spoofing_fix.cjs` usa regex para detectar y reemplazar el patrón. Tuvo que ser refinado una vez para case-insensitive.

**Impacto:** Bajo. La migración ya está generada y aplicada. Pero si se necesita regenerar (p.ej. para nuevas funciones), el regex puede fallar silenciosamente.

### 🟡 DEBILIDAD #8: V2.12.9 es un BEGIN/COMMIT gigante (84 KB)

**Evidencia:** 31 CREATE OR REPLACE en una sola transacción.

**Impacto:** Si una sola función falla (sintaxis, dependencia), toda la migración rollback. Bueno para atomicidad, malo para debugging.

**Severidad:** Baja. La migración se aplicó exitosamente, pero es una práctica mejor dividir en bloques más pequeños con SAVEPOINTs.

### 🟡 DEBILIDAD #9: H4 fix usa `?all=true` como escape hatch

**Evidencia:** `src/app/api/stores/route.ts` permite `?all=true` para traer todas.

**Impacto:** Cualquiera que descubra este param puede traer todas las tiendas. Es un trade-off entre compatibilidad y seguridad.

**Alternativa más segura:** No ofrecer escape hatch; obligar paginación siempre.

---

## 4. Tabla de evaluación

| Dimensión | Peso | Score | Ponderado |
|---|---|---|---|
| Correctitud del fix central (spoofing cerrado) | 30% | 9/10 | 2.7 |
| Coverage (31 funciones identificadas) | 20% | 9/10 | 1.8 |
| Consistencia (patrón residual IS NOT NULL AND) | 10% | 4/10 | 0.4 |
| Defense-in-depth (search_path, COMMENTs, GRANTs) | 10% | 5/10 | 0.5 |
| Verificación (estructural + hot test) | 15% | 9/10 | 1.35 |
| Documentación y trazabilidad | 10% | 9/10 | 0.9 |
| Tests de regresión | 5% | 3/10 | 0.15 |

**Total: 7.8/10 → redondeado a 7/10**

---

## 5. Plan de corrección (Sprint siguiente)

1. **V2.12.12** — Fix patrón residual `IS NOT NULL AND NOT` → `IS NULL OR NOT` en 22 funciones. ~30 min.
2. **V2.12.13** — REVOKE EXECUTE FROM anon en las 31 funciones. ~10 min.
3. **V2.12.14** — Añadir GRANTs explícitos y COMMENTs a V2.12.9 functions. ~20 min.
4. **Código** — Actualizar `storeApiClient.fetchStores()` para aceptar paginación. ~15 min.
5. **Tests** — Añadir test E2E en `e2e/security.spec.ts` que valide anti-spoofing. ~30 min.
6. **Refactor** — Dividir V2.12.9 en bloques más pequeños con SAVEPOINTs. ~20 min.

**Esfuerzo total estimado:** ~2 horas.

---

## 6. Conclusión

La implementación **resolve el problema crítico de seguridad** (BOLA spoofing) de forma **correcta y verificable en runtime**. El hot test demuestra que un atacante real con JWT válido ya no puede bypassar el check de autorización pasando `p_user_id` de otra persona.

Sin embargo, la implementación **no es perfecta**: 22 funciones mantienen un patrón residual `IS NOT NULL AND NOT` que es filosóficamente inconsistente con el fix (y potencialmente explotable en calls service_role sin `p_user_id`), no hay tests de regresión automatizados, y faltan GRANTs/COMMENTS explícitos.

**Score 7/10** refleja: "buen fix, resuelve el problema, pero con deuda técnica que debería resolverse pronto".

Si se aplican los 6 fixes del plan de corrección, el score subiría a **9/10**.
