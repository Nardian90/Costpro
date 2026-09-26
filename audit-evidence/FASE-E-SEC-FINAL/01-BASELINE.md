# FASE E-SEC-FINAL — 01 BASELINE

**Fecha**: 2026-09-26 · **Mandato**: E-SEC-FINAL (implementación D1–D5) · **Agente**: Super Z

## Verificación de baseline (obligatoria antes de modificar cualquier archivo)

```text
$ git rev-parse HEAD
b5b48491aa8d3aef933a8c9f3cd12db0f2292780
$ git rev-parse origin/main
b5b48491aa8d3aef933a8c9f3cd12db0f2292780
$ git status --short
(vacío — worktree limpio)
$ git diff --check
(limpio)
```

- HEAD == origin/main == **b5b48491** ✓ (commit de cierre de FASE E-SEC-R: "docs(audit): E-SEC-R — política definitiva de precio… veredicto CONDITIONAL, 5 decisiones pendientes documentadas")
- El mandato declara: "La FASE E-SEC-R ya terminó. No rehacer esa auditoría." — se cumple: E-SEC-R-DECISION-REQUIRED.md se LEYÓ como insumo (FASE 1, paso 2), no se reauditorió.
- Servidor: pm2 `costpro` online, HTTP 200 en http://localhost:3000 (bun server.ts + Next 16.1.1 dev).
- Evidencia de que el baseline coincide con el estado esperado del mandato: el commit HEAD es exactamente el cierre de E-SEC-R.

## Insumo de decisiones

`audit-evidence/FASE-E-SEC-R/E-SEC-R-DECISION-REQUIRED.md` (baseline dd1e6fb9, commiteado en b5b48491) listaba 5 decisiones pendientes. El mandato E-SEC-FINAL las resuelve explícitamente:

| Decisión | Resolución del mandato |
|---|---|
| D1 | Umbral POR LÍNEA (modelo A), ≥15% |
| D2 | `discount_reason` obligatorio cuando hay autorización; texto controlado; server-side |
| D3 | Token single-use, TTL 300 s, ligado a supervisor/operador/tienda/operación/línea(s); replay falla server-side |
| D4 | Snapshot por línea: `catalog_price_at_sale`, `price_at_sale`, `discount_value`, `discount_pct` (+ `authorized_by`/`discount_reason` en auditoría); cambio mínimo |
| D5 | Precio de línea y subtotal 2dp; total = Σ subtotales de línea redondeados; misma semántica cliente/servidor |
