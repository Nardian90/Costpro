# W7-16 — W7-D1 ACL REMEDIATION (orden GO · solo laboratorio)

Fecha: 2026-08-30 · Producción CONGELADA · Toda ejecución en clones efímeros locales (127.0.0.1:5433) derivados de la baseline verificada. Artefacto de parche: `w7-readiness/w7d1-acl-patch.sql` (3 líneas REVOKE + documentación). El paquete original W6.2 NO fue modificado.

## FASE 0 — Baseline

| Check | Resultado |
|---|---|
| Git | HEAD == origin/main == `b7b9decbb9ca57532cbf5a2de3e3d97c1d4f9c84`, branch `main`, tree limpio (0 líneas), tags `audit-w6-harness-parity-20260828` + `wac-w6.1-decision-gate-20260828` presentes. **Nota**: no existen tags W6.2/W7 (el trabajo W6.2/W7 se realizó fuera de Git por diseño) |
| PostgreSQL | 17.11 (Debian) :5433 LISTEN; bases `costpro_audit_v2`, `costpro_audit_v3`, `postgres` |
| Limpieza v3 | fingerprint S1(v3) == S1(v2) byte-idéntico → **v3 LIMPIO** (verificado, no asumido) |
| S1(v2) | 10.753 líneas F, DIFF=0 vs baseline producción, SHA `9e7cea9a…edc2` |
| Manifiestos | W6 237/237 · W6.1 9/9 · W6.2 10/14 (desviación P-1, ver W7-19) · W7 16/16 |

## FASE 1 — Confirmación forense (clon `w7d1_pre`, paquetes 01..09, sin parche)

```text
F1|IDENT|public.fn_recalc_wac(p_store_id uuid, p_product_id uuid, p_event text,
    p_qty_in numeric, p_uc_in numeric, p_source_ref jsonb)|ret=numeric|secdef=true
    |owner=postgres|search_path={"search_path=public, extensions"}
    |proacl==X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres
F1|OVERLOADS|count=1  →  REVOKE individual == REVOKE total; sin riesgo de firma genérica
F1|HFP|anon=true|authenticated=true|service_role=true|postgres(owner)=true   (PRE)
```

- Contraste ACL declarativa (routine_privileges: PUBLIC/anon/authenticated/service_role/postgres EXECUTE) vs efectiva (has_function_privilege) vs cruda (pg_proc.proacl): las tres coinciden pre-parche.
- **13 callers** internos (12 rutinas convertidas SECURITY DEFINER owner postgres + `w62_guard_wac_writer`).
- **4 wrappers con EXECUTE público**: `reverse_receipt_v2`, `void_closed_production_order`, `reverse_production_order` (rutas de negocio → writer canónico interno) y `w62_guard_wac_writer` (función de trigger — no invocable por RPC, probado en F6-e).

## FASE 2 — Reproducción del exploit (pre-parche, 6/6 PASS)

Producto 10 u @ WAC=100 (S=10); ataque `fn_recalc_wac(store, prod, 'manual_injected', 5, 999, NULL)`:

```text
ATTACK anon:          llamada ACEPTADA → WAC 100 → 399.6666666666666667  (X1-X4 PASS)
ATTACK authenticated: llamada ACEPTADA → WAC 100 → 399.6666666666666667  (X5-X6 PASS)
Bitácora wac_change_log registró el evento (trazable; la mutación preventiva falla igual)
Higiene: ROLLBACK; 0 productos residuales
```

La mutación es **realmente alcanzable por el rol** (no solo «la función existe»): la llamada se ejecuta y el WAC cambia. Evidencia: `tmp/w7d1-f2-exploit.out`.

## FASE 3 — Remediación (clon `w7d1_gate`)

```sql
REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb) FROM authenticated;
```

Post-parche (medido):

```text
proacl = postgres=X/postgres,service_role=X/postgres     (entradas =X, anon=, authenticated= ELIMINADAS)
routine_privileges: solo postgres + service_role
HFP|anon=false|authenticated=false|service_role=true|postgres(owner)=true
```

## FASE 4 — Mínimo privilegio

| Rol | EXECUTE | Justificación |
|---|---|---|
| PUBLIC | DENY | default de PostgreSQL jamás revocado — corregido |
| anon | DENY | identidad anónima de PostgREST; sin caso de uso |
| authenticated | DENY | el writer se invoca INTERNAMENTE por 12 rutinas SECURITY DEFINER (owner postgres): la cadena consumidor→writer no requiere EXECUTE directo (probado F5-P4..P6) |
| service_role | KEEP | rol de confianza server-side; GRANT ya emitido por pkg 01 L838; único uso externo legítimo (recalculo administrativo), según diseño W62-01 §6 |
| postgres | KEEP | owner (bypass intrínseco) |

No se concedió EXECUTE a ningún rol solo para pasar pruebas: se conservó exactamente el grant preexistente de pkg 01 a service_role.

## FASE 5 — Pruebas ACL (12/12 PASS, `tmp/w7d1-f5-acltests.out`)

| Assert | Prueba | Resultado |
|---|---|---|
| N1-N2 | anon → `DENIED(42501)`, WAC intacto (100) | PASS |
| N3-N4 | authenticated → `DENIED(42501)`, WAC intacto | PASS |
| N5-N6 | PUBLIC sin privilegio efectivo (heredero anon: false) | PASS |
| P1-P2 | service_role → EXECUTED, WAC mutado (autorizado por diseño) | PASS |
| P3 | postgres (owner) → EXECUTED | PASS |
| P4-P6 | **Consumidor real**: authenticated SIN EXECUTE directo ejecuta `confirm_pending_reception` → blend (10·100+5·125)/15 = 108.333333 exacto vía fn_recalc_wac interna + traza `reception_in` en wac_change_log | PASS |

## FASE 6 — No-bypass (3/3 asserts + 5 evidencias, `tmp/w7d1-f6-nobypass.out`)

| Ruta | Resultado |
|---|---|
| anon → create_sale_v2 (wrapper PUBLIC) | `ERR_UNAUTHORIZED` (identidad) — PASS |
| anon → create_devolution_v2 (wrapper PUBLIC) | `ERR_UNAUTHORIZED` — PASS |
| anon → reset_store_data (named, 2-arg) | `ERR_UNAUTHORIZED: Caller must be admin…` — PASS |
| authenticated-ADMIN → reset_store_data | `ERR:42703:column "store_id" does not exist` — **falla internamente ANTES de tocar WAC** (defecto interno preexistente de reset_store_data, fail-closed; hallazgo nuevo, NO se corrige en esta sesión) |
| authenticated → w62_guard_wac_writer() directa | `0A000: trigger functions can only be called as triggers` |
| Barrido escritores cost_average fuera de fn_recalc_wac/reset_store_data | **NINGUNO** |
| Forja de token app.wac_writer | solo fn_recalc_wac + guard (ningún RPC puede fijarlo) |
| restore machinery (dynamic SQL) | EXECUTE=false para authenticated (W7-02 §3.4) |
| Estado final tras todos los intentos | WAC = 100 (sin mutación) |

**Conclusión**: no existe ruta directa ni indirecta que muta WAC fuera de la política canónica. Dos salvedades documentadas: (a) `reset_store_data` es fail-closed por un defecto interno propio (42703) además del guard; (b) los wrappers públicos restantes ejecutan SOLO operaciones de negocio que atraviesan el writer canónico.

## Notas de laboratorio (transparencia)

- Los alias de `\gset` con mayúsculas (p. ej. `AS pidA`) se pliegan a minúsculas y `:'pidA'` no sustituye — los casos usan variables en minúscula/dígitos (causa de 2 re-ejecuciones; sin impacto en resultados).
- `reset_store_data(uuid,boolean)` es ambigua por DEFAULT en el overload 3-arg (42725 en llamada posicional); las pruebas usan notación named.
