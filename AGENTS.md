# AGENTS.md — Reglas para agentes de IA y automatizaciones (repo Costpro)

Reglas obligatorias para cualquier agente (IA u otro) que trabaje en este repositorio. **Versión completa y con contexto:** `docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md`.

## Supabase — lo no negociable

1. **Producción (CostproBD, ref `wthkddeleylijmonclxg`) no es banco de pruebas.** Pruebas, fixtures y seeds van a **CostproE2E** o a **Supabase local**. Regla completa: `docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md`.
2. **Todo script que escriba contra Supabase pasa por el guard** `scripts/lib/assert-not-production.{mjs,py,sh}`:
   - producción bloqueada por defecto (lectura Y escritura);
   - lectura solo con `ALLOW_PROD=read-only`;
   - escritura solo con el doble flag `ALLOW_PROD=read-only` + `ALLOW_PROD_WRITE=I_UNDERSTAND` (y expediente en `docs/audits/` aprobado por el propietario);
   - un script nuevo que escriba sin guard es bug de revisión (bloqueante en PR).
3. **Consultas a logs** (Logs Explorer): ventana ≤ 1 h, agregadas, LIMIT, sin bucles, **máximo 10 por tarea**. Sin PII en artefactos.
4. **Migraciones**: lote único verificado, nunca en bucle, nunca reaplicar el replay completo contra un remoto. Cada DDL genera logs de Postgres (cuota Free: 1 GB/ciclo).
5. **Prohibido** el polling a logs/analytics y los E2E contra producción.
6. Si encuentras datos de prueba en producción: **NO los borres** — reporta conteos + criterio de identificación y espera autorización.

## Presupuesto (plan Free, hasta que cambie)

- Log Ingestion: 1 GB/ciclo · objetivo ≤ 0,6 GB (20 MB/día por proyecto).
- Log Query: 100 GB/ciclo · Egress: 5 GB · BD: 500 MB · Storage: 1 GB · MAU: 50.000.
- Semáforos y ritual semanal: `docs/OPERATIONS/PRESUPUESTO_LIMITES_SUPABASE_FREE.md`. La facturación de logs se activa tras la gracia que termina al inicio de 2027.

## Medición antes/después

Toda afirmación sobre consumo lleva etiqueta [MEDIDO]/[ESTIMADO]/[INFERIDO]. Cómo medir: `docs/OPERATIONS/medir-logs.md`.
