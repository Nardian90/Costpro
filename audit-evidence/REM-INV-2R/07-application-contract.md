# 07 — APPLICATION CONTRACT (REM-INV-2R, fase 10)

## Búsqueda completa post-DDL

Método: `git grep` sobre árbol trackeado + rg en src/supabase/scripts/e2e.

```text
Código vivo (rutas, hooks, servicios, repos, stores, offline queue, replay, POS,
RPC maps, scripts, e2e): 0 apariciones
Única aparición fuera de audit-evidence:
  src/__tests__/integration/rem-inv-2-dynamic-reachability.test.ts  (pin permanente REM-INV-2)
Evidencia histórica: audit-evidence/** (permitida por mandato)
```

## Protección permanente actualizada (mandato: "receive_purchase does not exist")

1. **NUEVO pin de ausencia** — `src/__tests__/integration/rem-inv-2r-receive-purchase-retirement.test.ts`:
   - recorre `src/` y `supabase/` (incluidas migraciones .sql) buscando el token
     `receive_purchase`;
   - FALLA si aparece en cualquier archivo vivo o migración (reintroducción accidental);
   - los únicos archivos exentos son los propios pins del retirement (lista explícita);
   - segundo caso: los pins no pueden eliminarse (protección no removible).
   - Resultado: **2/2 PASS** (ejecutado 2026-09-13, `vitest run` aislado: 6/6 con el pin dinámico).

2. **Pin DB en contract test** — `scripts/security-contract-test.cjs` (CI gate):
   - nueva sección «REM-INV-2R: PERMANENT RETIREMENT PIN»;
   - consulta el catálogo (`pg_proc` × `pg_namespace`, SELECT-only como el resto del test);
   - si `receive_purchase` reaparece ⇒ violación CRITICAL `RETIRED_V1_FUNCTION_REINTRODUCED`
     ⇒ exit 1 ⇒ build bloqueado;
   - no se eliminó ninguna protección previa (134 funciones SECURITY DEFINER con escritura
     siguen verificándose: anti-spoofing guard, patrón IS NULL OR NOT, anon EXECUTE, search_path).

3. **Pin dinámico REM-INV-2 intacto** — `rem-inv-2-dynamic-reachability.test.ts` (4 casos):
   ningún workflow de recepción invoca receive_purchase. Sin cambios en este gate.

## Cobertura anti-reintroducción (3 capas)

| Capa | Detecta | Falla |
|---|---|---|
| Vitest ausencia (src+supabase) | call-site en código, migración que recree la función | `vitest` exit 1 |
| Contract test DB (CI) | reaparición de la función en el catálogo real | exit 1 → build bloqueado |
| Pin dinámico REM-INV-2 | workflow que invoque la RPC | `vitest` exit 1 |
