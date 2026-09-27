# FASE F0 — 02 RISK MATRIX

**Fecha**: 2026-09-27 · **Clasificaciones permitidas**: OPEN / RESOLVED / PREEXISTING / ENVIRONMENTAL / TOOLING / DOCUMENTATION ONLY / REQUIRES BUSINESS DECISION (no se usa CLOSED sin evidencia actual)

## Matriz

| Riesgo | Estado histórico | Reproducible ahora | Impacto | Causa | Producción | Fase propuesta |
|---|---|---|---|---|---|---|
| **R-DEPS-1** (dependencias) | PREEXISTING (documentado desde C2R con 7 vulns; E-SEC 8 por advisory nueva; hoy 7) | **SÍ** — `npm audit` en HEAD reproduce 7 vulns (1 critical/3 high/3 moderate) | 2 advisories **RCE critical** sobre `next 16.3.0` (1 no aplicable: Windows; 1 condicionada: Image Optimization con storage público) + high sharp/js-yaml + moderate csv-parse/vitest | Drift del advisory DB upstream; el proyecto nunca tocó lockfiles | **SÍ** (next/sharp/js-yaml/csv-parse corren en runtime) | F1 — bump patch no-breaking (next 16.3.3, sharp 0.35.4, js-yaml 4.3.2, csv-parse 7.0.2, vitest 4.1.11) |
| **R-E2E-1** (suite E2E) | PREEXISTING + TOOLING (171/97 idéntico desde FASE D; nunca verde) | **SÍ** — 3 causas raíz reproducidas (RC-1 secrets CI→401 ×75; RC-2 fixture auth obsoleto→UI anónima ×77; RC-3 URL supabase ficticia→fetch failed ×4; verificado en log CI de cad8e446 y en repro local browser real) | Cero detección E2E fiable; job CI además cancelado por timeout; el flujo crítico venta/checkout **no tiene spec E2E propio** | Infraestructura de test (secrets no configurados, fixture `/auth/signin` 404 + usuario inexistente, fallback `test.supabase.co`), no bug de producto | No afecta runtime; afecta la confianza de regresión | F2 — restauración de infra E2E (env aislado + secrets + fixture + cobertura del flujo de venta) |
| **R-UX-DATE** (deadlock fecha) | PREEXISTING (documentado en E-SEC 10-browser; no introducido por fases recientes) | **SÍ** — repro determinista ejecutado en la ventana crítica (21:23 Havana / 01:23 UTC): HOY y HOY+1 ambos rechazados por el cliente | Operador no puede fijar fecha manual fiable; ventana 19:00–24:00 Cuba sin opción válida; workaround = vaciar campo (NOW()); riesgo menor de fecha de negocio futura si elige HOY+1 | **Combinación UI+TZ**: cliente implementa política forward-only ANTIGUA (y compara medianoche UTC vs timestamp completo) mientras el server ya usa business-date Havana (−6m/+1d, mig 20260817) | SÍ (checkout del catálogo, diario) | F3 — alinear validador cliente con política server vigente |
| **R-A11Y-1** (contraste) | PREEXISTING (residual documentado en FASE-D/08) | **SÍ** — cálculo exacto: warning #b45309 sobre bg-warning/10 = 4.19:1 (< 4.5 AA texto normal; pasa texto grande) | Accesibilidad menor; un solo combo afectado (badges/modales con texto warning sobre tinte 10%); dark mode amplio PASS (9.7–11.2:1) | Elección de tinte /10 en usos con texto encima; además tokens muertos `--color-warning/success` antiguos (0 usos) | Sí (visual) | Higiene — incluida en fase de UX/estilo (P3) |
| **Offline sync** (observación) | Observación de diseño E-SEC-FINAL (NO asumida como defecto) | **NO hay defecto** — flujo **ACTIVO** y con contrato definido (self-session RC-1, idempotente, replay vía `create_sale_v2`, D1–D5 aplican y fail-closed sin bypass) | Ninguno identificado como bug; mejora UX menor en conflicto de replay sin supervisor | — | SÍ (funcionalidad activa) | **NO BUG** — DOCUMENTATION ONLY |

## Clasificación final por riesgo

```text
R-DEPS-1     → OPEN · PREEXISTING · READY FOR REMEDIATION (fixes no-breaking; decisión formal de aceptación = BUSINESS DECISION si se prefiriera no remediarse)
R-E2E-1      → OPEN · PREEXISTING + TOOLING (0 bugs de producto detrás; 100% infraestructura de test)
R-UX-DATE    → OPEN · CONFIRMED (UI bug + timezone bug combinados; server NO es la causa primaria)
R-A11Y-1     → OPEN · CONFIRMED (menor, un combo, P3)
Offline sync → NO BUG · DOCUMENTATION ONLY (funcionalidad activa soportada)
```

Detalle completo por riesgo: 03-E2E-ANALYSIS.md · 04-DEPS-ANALYSIS.md · 05-UX-DATE-ANALYSIS.md · 06-A11Y-ANALYSIS.md · 07-OFFLINE-ANALYSIS.md
