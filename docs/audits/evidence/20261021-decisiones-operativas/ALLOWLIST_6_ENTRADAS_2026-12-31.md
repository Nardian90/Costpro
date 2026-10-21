# ALLOWLIST `ci-gate-allowlist.json` — LAS 6 ENTRADAS CON VENCIMIENTO 2026-12-31

**Expediente:** CP-SEC-027 v5 · Fase 5 · **Fecha:** 2026-10-21
**Estado:** ANÁLISIS PREPARADO — 6 decisiones individuales PROPUESTAS. **NINGUNA entrada se renueva ni se retira automáticamente.**

---

## 1. Contexto verificado

- Allowlist v2 (F7, 20/10): **97 entradas** en `security_definer_without_auth_check` — 91 con `expires: 2027-06-30` + **6 con `expires: 2026-12-31`** (verificado por conteo directo el 21/10).
- **Qué pasa al vencer (verificado por lectura del código del job `Allowlist Review`, `.github/workflows/security-gate.yml:63-72`):** para cada entrada, si `item.expires && new Date(item.expires) < now` → `console.error('❌ Allowlist item expired: …')` + `process.exit(1)` → **el check `Allowlist Review` FALLA** (fail-closed). Efecto en cadena: cualquier PR o push que toque `supabase/migrations/**`, `src/app/api/**`, `ci-gate-allowlist.json` o `scripts/ci-gate-*.js` queda **bloqueado** hasta renovar o retirar la entrada. El 2027-06-31 (sic: 2027-06-30) las otras 91 harán lo mismo — la bomba original de CP-INFRA-004 se redujo y reprogramó, no se desactivó.
- Este análisis NO repite pruebas ya acreditadas: la lógica de vencimiento fue verificada por lectura directa del job (el código ES la evidencia); los permisos vivos provienen de las migraciones del repo (documental) y de la clasificación F7 (read-only del 20/10).

## 2. Fichas individuales — las 6 entradas que vencen el 2026-12-31

### 2.1 `check_bulk_ops_hourly_limit` — añadida por Iteración 9

- **Función:** límite horario de operaciones bulk (control anti-abuso de borrados masivos versionados).
- **Justificación registrada:** STABLE read-only; no modifica datos; REVOKE anon/PUBLIC aplicado.
- **Permisos (documental, migración `20260818000002_bulk_delete_functions_versioned.sql:203-204`):** `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` + `GRANT TO service_role` → **service_role-only** ✓.
- **Riesgo de retirarla de la allowlist:** el check 1 (`secdef_no_auth`) la marcaría como hallazgo no permitido → gate en rojo hasta añadir marcador `auth.uid()` semánticamente inapropiado para un helper interno.
- **Decisión propuesta: RENOVAR a `2027-06-30`** (alinear la ventana con las 91 restantes; revisión única semestral).

### 2.2 `get_table_writable_columns` — añadida por Iteración 7

- **Función:** helper de catálogo (columnas escribibles de una tabla) usado por flujos internos de validación.
- **Justificación registrada:** STABLE read-only helper; REVOKE anon/PUBLIC aplicado.
- **Permisos (documental, migración `20260817000001_vale_salida.sql:925-928`):** `REVOKE FROM PUBLIC, anon, authenticated` + `GRANT TO service_role` → **service_role-only** ✓ (comentario en la propia migración: "service_role only").
- **Riesgo de retirarla:** ídem 2.1 — falso positivo del check 1; exponer o añadir auth-uid a un helper de introspección de esquema no tiene sentido operativo.
- **Decisión propuesta: RENOVAR a `2027-06-30`.**

### 2.3 `validate_backup_registry_drift` — añadida por Iteración 7

- **Función:** validación read-only de deriva del registro de backups (dominio Backup/Restore, iteración 7 certificada).
- **Permisos (documental, migración `20260902000002_w9_f06_secdef_execute_hardening.sql:526-527`):** `REVOKE FROM authenticated` + `GRANT TO service_role`; (PUBLIC/anon revocados en iteraciones previas del dominio) → **service_role-only** ✓.
- **Riesgo de retirarla:** falso positivo del check 1 sobre un validador puro del subsistema de backups.
- **Decisión propuesta: RENOVAR a `2027-06-30`.**

### 2.4 `validate_post_restore` — añadida por Iteración 7

- **Función:** validación post-restauración de una tienda (comprueba consistencia tras restore).
- **Permisos (documental, misma migración F06, líneas 529-530):** `REVOKE FROM authenticated` + `GRANT TO service_role` → **service_role-only** ✓.
- **Riesgo de retirarla:** igual clase que 2.3; además el dominio backup/restore es superficie sensible donde un gate en rojo falso invita a excepciones peligrosas.
- **Decisión propuesta: RENOVAR a `2027-06-30`.**

### 2.5 `validate_pre_restore_fk_integrity` — añadida por Iteración 7

- **Función:** chequeo de integridad FK previo a restaurar (protege contra restores corruptos).
- **Permisos (documental, misma migración F06, líneas 716-717):** `REVOKE FROM authenticated` + `GRANT TO service_role` → **service_role-only** ✓.
- **Riesgo de retirarla:** igual clase que 2.3/2.4.
- **Decisión propuesta: RENOVAR a `2027-06-30`.**

### 2.6 `validate_store_can_be_modified` — añadida por Iteración 9 ⚠ (única con matiz)

- **Función:** valida si una tienda puede modificarse/borrarse (bloqueo soft-delete de tiendas protegidas).
- **Justificación registrada:** STABLE read-only; REVOKE anon/PUBLIC aplicado.
- **Permisos (documental, migración `20260802000001_v2_12_41_fase0_remediacion.sql:127-129`):** `GRANT TO authenticated` **CONSERVADO** + `GRANT TO service_role` + `REVOKE FROM anon`. **Es la ÚNICA de las 6 con EXECUTE vivo para `authenticated`.**
- **Consumidor real (verificado en el árbol 21/10):** `src/app/api/stores/bulk/preview/route.ts:115` — invocada vía `getSupabaseAdminSafe()` = **service-role**. La clasificación F7 la registra como helper-interno con 1 uso en `src/`. **Ningún consumidor authenticated documentado.**
- **Riesgo de retirarla:** falso positivo del check 1. **Riesgo de renovarla tal cual:** perpetúa un grant a `authenticated` sin consumidor — perímetro mayor que sus 5 hermanas.
- **Decisión propuesta: ACCIÓN PRIMERO, RENOVACIÓN DESPUÉS** — (a) micro-migración `REVOKE EXECUTE ON FUNCTION public.validate_store_can_be_modified(uuid, text) FROM authenticated;` (1 línea; sin impacto en la app: el único caller usa service-role; homogeneiza el dominio con 2.1-2.5); (b) tras verificar el REVOKE en vivo, RENOVAR a `2027-06-30`. Si el propietario prefiere no tocar el grant, la alternativa es renovar documentando expresamente el matiz.

## 3. Resumen de decisiones propuestas (pendientes de autorización individual o por lote)

| Entrada | Permiso vivo hoy | Propuesta | Justificación en una línea |
|---|---|---|---|
| `check_bulk_ops_hourly_limit` | service_role-only | RENOVAR a 2027-06-30 | helper STABLE read-only sin exposición; retirarla = falso positivo permanente |
| `get_table_writable_columns` | service_role-only | RENOVAR a 2027-06-30 | idem |
| `validate_backup_registry_drift` | service_role-only | RENOVAR a 2027-06-30 | idem (dominio backup/restore certificado) |
| `validate_post_restore` | service_role-only | RENOVAR a 2027-06-30 | idem |
| `validate_pre_restore_fk_integrity` | service_role-only | RENOVAR a 2027-06-30 | idem |
| `validate_store_can_be_modified` | authenticated + service_role | **REVOKE authenticated primero** → RENOVAR a 2027-06-30 | único caller usa service-role; cerrar el grant huérfano antes de renovar |

**Nota de horizonte:** la renovación a 2027-06-30 unifica TODAS las 97 entradas en una sola fecha de revisión (30-06-2027). La bomba no desaparece: se difiere y agrupa. La solución definitiva (marcadores `auth.uid()` reales o conversión a `SECURITY INVOKER`) es la campaña de saneamiento ya planificada (CP-SEC-005/CP-INFRA-004).

**No se ejecuta ninguna renovación, retiro ni REVOKE en esta fase** — las seis quedan como PROPUESTAS para decisión del propietario.
