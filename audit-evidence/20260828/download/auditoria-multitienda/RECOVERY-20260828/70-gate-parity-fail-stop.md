# 70 · GATE R-HARNESS: INFORME DE PARIDAD — RESULTADO: FAIL → STOP

Fecha: 2026-08-28 · Autoridad: orden del dueño (R-RESTAURA → R-HARNESS → PARITY → CASES A–F → W6.1), gate explícito «SCHEMA / RPC / TRIGGER PARITY — FAIL → STOP».
Modo: LAB exclusivo. Producción: **cero conexiones, cero mutaciones** (no se emitió ni una consulta contra Supabase en esta fase).

---

## Estado de la cadena del dueño

```text
RECONSTRUCTED W6 .............. ✅ COMPLETO (9/9 docs + manifiesto SHA-256, congelados)
   ↓
HARNESS REBUILT ............... 🟡 PARCIAL (infraestructura OK; esquema NO alcanzó paridad)
   ↓
SCHEMA/RPC/TRIGGER PARITY ..... ❌ FAIL → STOP EJECUTADO (este informe)
   ↓
CANONICAL CASES A–F ........... ⛔ NO INICIADOS (bloqueados por el gate)
   ↓
W6.1 .......................... ⛔ NO INICIADO (regla del dueño: requiere cadena completa)
```

## 1. Lo que SÍ quedó construido y verificado

| Componente | Estado | Evidencia |
|---|---|---|
| PostgreSQL aislado de laboratorio | ✅ operativo | **PostgreSQL 17.11** (Debian) en `127.0.0.1:5433`, DB `costpro_audit`, socket en `harness/run`, auth trust, solo-loopback. **DESVIACIÓN DECLARADA vs «17.6»: Debian trixie no publica el minor 17.6; disponible 17.11-0+deb13u1.** Si el minor exacto es requisito, la vía es pgdg-archive (requiere su autorización; no se intentó) |
| Técnica de aprovisionamiento | ✅ | `apt-get download` + `dpkg -x` a `harness/client/` (misma arquitectura del harness perdido; binarios psql/initdb/pg_ctl/postgres con librerías resueltas) |
| Shims Supabase (LAB) | ✅ | `scripts/harness-shims.sql`: roles anon/authenticated/service_role/authenticator (NOLOGIN), schemas auth/storage/extensions, `auth.users` mínima, `auth.uid()/role()/jwt()`, `storage.buckets` mínima, btree_gist+pgcrypto. Todo DECLARADO como shim, nada editado del repo |
| Runner de migraciones | ✅ | `scripts/apply-migrations.sh`: aplica únicamente `.sql` timestamped del repo en orden cronológico; ledger por archivo en `harness/logs/migration-ledger.txt`; errores íntegros en `migration-errors.log`; 10 no-migraciones excluidas (DEMO_RESET_*, run_sql_checks.*, register_reception_rpc.sql sin fecha — duplicado del contenido datado) |
| Migraciones aplicadas limpias | ✅ 123 | Crearon 19 tablas (cash_sessions, exchange_rates, idempotency_registry, payment_transactions, pick3_*, usage_*, rss_*, wallet_*, user_audit_log, user_preferences, service_audit_log) y 422 rutinas públicas |
| R-RESTAURA | ✅ | `RECONSTRUCTED-W6/` congelado con manifiesto — custodia separada de la recuperación |
| custom.db | ✅ registrado | `RECOVERY-20260828/69-custom-db-not-costpro-marker.md` — NOT COSTPRO DATABASE / PLACEHOLDER DEMO, fuera de toda evidencia contable |

## 2. Causa raíz del FAIL (con evidencia, sin especulación)

Las migraciones del repo **no contienen el DDL del esquema base de negocio**: asumen un esquema preexistente (creado directamente en el proyecto Supabase antes de que existiera la carpeta `migrations/`). La primera migración de la cadena (2024-01) ya hace `CREATE POLICY` sobre `public.profiles`/`public.stores` que no existen aún en un cluster virgen.

Búsqueda agotada en el repo (todas negativas): `supabase/` raíz (solo VERIFICATION_TESTS, remediation/repair SQL parciales), `supabase/tests/`, `supabase/scripts/` (reset_demo_data — muta datos, no crea esquema base), `docker-compose.yml` (sin init SQL), `e2e/` (Playwright, sin bootstrap DDL), patrón global `seed*.sql`/`*schema*.sql` (solo migraciones de sincronización parciales).

**El esquema base existe físicamente solo en producción Supabase.** El harness perdido lo había resuelto; su receta (probablemente pg_dump schema-only o volcado del dueño) se perdió con el sandbox.

## 3. Hueco cuantificado (censo 2026-08-28 contra `costpro_audit@5433`)

- **23 tablas core ausentes**: `stores, profiles, user_store_access, products, product_variants, inventory, inventory_history, stock_movements, receipts, receipt_items, transactions, transaction_items, kardex_entries, devolutions, devolution_items, production_orders, production_order_items, product_cost_sheets, customers, audit_logs, idempotency_keys, physical_counts, physical_count_items`
- **5 enums core ausentes**: `user_role, movement_type, payment_method, receipt_status, transaction_type` (+probables complementarios)
- **Trigger ancla ausente**: `trg_update_product_wac` = 0 (cadena receipts→update_product_wac incompleta)
- Las 422 rutinas creadas son inejecutables en su mayoría (cuerpos plpgsql referencian tablas inexistentes — creadas porque plpgsql no valida cuerpos al crear)

## 4. Por qué DETENGO aquí y no «reconstruyo» el esquema base

1. El gate del dueño es inequívoco: **FAIL → STOP**.
2. Inventar el DDL base desde inferencia (TypeScript types, cuerpos de RPC) produciría un esquema NO-idéntico a producción y falsificaría cualquier «paridad» posterior — exactamente lo que la gobernanza de esta auditoría prohíbe (antecedente: regla «no reconstruir como si fuera original»).
3. La vía correcta existe y es barata, pero requiere su autorización explícita porque toca metadatos de producción (solo lectura).

## 5. Opciones para desbloquear (decisión exclusiva del dueño)

| Opción | Contenido | Custodia | Costo |
|---|---|---|---|
| **A — Extracción de metadatos READ-ONLY** (recomendada) | Autorizar consultas `pg_catalog`/`information_schema` + `pg_dump --schema-only` (SIN datos) contra Supabase prod, misma clase de acceso read-only que el censo W0 autorizado | DDL byte-idéntico a prod; hash del dump queda en evidencia; cero riesgo de mutación | ~1 sesión |
| **B — Volcado provisto por el dueño** | El dueño entrega `pg_dump --schema-only` (o backup) por su cuenta | Cadena de custodia más limpia aún (artefacto del dueño) | Depende del dueño |
| C — Reconstrucción inferida | Ingeniería inversa desde código | ❌ NO recomendada: esquema aproximado, paridad sin sentido | Alto y defensable-no |

Con A o B: cargo el DDL base en el harness → reaplico la cadena de migraciones → paridad medible objeto-a-objeto → casos A–F → y solo entonces W6.1 documental.

## 6. Estado congelado para reanudación

- Cluster lab vivo (572.6 MB de datos de migraciones parciales): `harness/pg` — NO destruido; reanuda con `harness/client/usr/lib/postgresql/17/bin/pg_ctl -D harness/pg -l harness/logs/pg.log start` (LD_LIBRARY_PATH según `scripts/apply-migrations.sh`).
- Ledger completo de 369 migraciones aplicadas: `harness/logs/migration-ledger.txt` + `migration-errors.log`.
- R-RESTAURA congelado; producción intocada; W7 no autorizado; nada fue «maquillado»: el FAIL queda registrado como historia forense.
