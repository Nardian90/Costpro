# REM-INV-2 — 04: STATIC REACHABILITY de `receive_purchase`

Método: búsqueda textual exacta en TODO el árbol del repo (excluyendo solo `audit-evidence/`, `node_modules/`, `.next/`) + barrido estructural de la base de producción (solo SELECT). Cada vector de alcanzabilidad estático se clasifica con la taxonomía del protocolo.

## 1. Vectores estáticos censados

| # | Vector | Resultado | Clasificación |
|---|---|---|---|
| S1 | Referencias en `src/` (app, components, hooks, services, stores, lib, supabase) | **0** | DEAD |
| S2 | Imports (estáticos) que la mencionen | 0 | DEAD |
| S3 | Imports dinámicos (`import(…)`) / construcción dinámica de nombres RPC | 0 (barrido de patrones de REM-V2-3 sigue vigente: 0 construcción dinámica de nombres RPC en el repo) | DEAD |
| S4 | Strings RPC en API routes (`supabase.rpc('receive_purchase')`) | 0 | DEAD |
| S5 | RPC_MAP_V1 / RPC_MAP_V2 (`/api/reverse`) | No la contienen (solo rutas de reversión) | DEAD |
| S6 | Fallback branches / feature flags de recepción | No existen flags de recepción; no hay rama que resuelva a la V1 | DEAD |
| S7 | Offline queue / sync-replay (`sync-engine.ts`, `offline-storage.ts`) | entidad `reception` → `register_reception` (case explícito, sync/batch:151) | DEAD (ruta offline resuelve a canónica) |
| S8 | Server actions / hooks / stores (Zustand, TanStack) | 0 | DEAD |
| S9 | UI actions (botones, modales de recepción) | 0 — `ProductReceptionView`, `ReceptionExpressMode`, `ReceiveAgainstPOModal`, `useReceptionState` usan la familia canónica | DEAD |
| S10 | Scripts administrativos (`scripts/`) | 0 | DEAD |
| S11 | Tests / e2e / fixtures (`__tests__/`, `e2e/`) | 0 (pre-gate) | DEAD |
| S12 | Cron / workers / CLI | 0 | DEAD |
| S13 | Docs / knowledge (llamadores potenciales operativos) | 0 menciones | DEAD |
| S14 | Callers internos en DB (`pg_proc.prosrc` barrido exacto por palabra) | **0** funciones la invocan | DEAD |
| S15 | Triggers DB | **0** | DEAD |
| S16 | `pg_depend` (vistas, reglas, defaults) | **0** dependencias | DEAD |
| S17 | GRANT EXECUTE | `postgres`, `authenticated`, `service_role` = X | **REACHABLE (directo)** — único vector vivo |
| S18 | Wrapper/API que la exponga | Ninguna route la llama | DEAD |
| S19 | `purchase_items` (tabla que consume) — escritores | 0 writers de aplicación; RLS sin políticas INSERT/UPDATE/DELETE para authenticated (solo SELECT) → **nadie puede poblarla vía app** | DEAD (datos) |

## 2. Resumen de clasificación

```text
receive_purchase(p_purchase_id uuid)
  ├── App layer (S1–S13, S18)      : DEAD   — 0 referencias en todo el repo
  ├── DB internal (S14–S16)        : DEAD   — 0 callers, 0 triggers, 0 dependencias
  ├── Data layer (S19)             : DEAD   — tabla legacy vacía y no-poblatable vía app
  └── Direct EXECUTE surface (S17) : REACHABLE — authenticated puede invocarla directamente
                                     (misuse surface, no ruta de negocio)
```

**Estado global**: `DEAD-BUT-REACHABLE` (orfén con superficie de EXECUTE directo residual). "UI no aparece" NO se usó como evidencia de muerte: la muerte a nivel aplicación se probó por ausencia en cada vector estructural (código, maps, offline, replay, tests, DB interna), y la unicidad del vector S17 se demostró positivamente (ACL real leído de prod).

## 3. Consecuencia operacional

Ninguna ruta de negocio puede alcanzar `receive_purchase`; por tanto su retiro a nivel de aplicación **no requiere migración de callers** (no hay). El único retiro pendiente es la superficie S17 (REVOKE EXECUTE), cuya ejecución sobre producción es una operación ACL mutativa que este gate difiere (zero-touch / sin canal DDL autorizado) — ver 15-regression.md §remediación y VERDICT.md.
