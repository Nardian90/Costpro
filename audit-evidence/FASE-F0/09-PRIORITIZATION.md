# FASE F0 — 09 PRIORITIZATION

**Fecha**: 2026-09-27 · **Criterios** (del mandato, aplicados literalmente):

- **P0** = riesgo de corrupción de datos, pérdida financiera, bypass de seguridad, acceso indebido, daño irreversible.
- **P1** = riesgo significativo de operación comercial incorrecta, seguridad, integridad o bloqueo funcional importante.
- **P2** = problema funcional/UX relevante **con workaround**.
- **P3** = mejora, deuda técnica o higiene.

No se generan puntuaciones arbitrarias: cada asignación se justifica con el hallazgo factual que la sostiene.

## Asignación

### P0 — NINGUNO

- No se identificó bypass activo, corrupción de datos, pérdida financiera ni acceso indebido: E-SEC-FINAL intacto (08), política de precio fail-closed también en el camino offline (07), tiendas protegidas sin tocar.
- El RCE critical de `next` (GHSA-2xp9, Image Optimization) queda en **P1 y no P0** porque su explotación está condicionada (requiere contenido atacante controlado llegando al optimizer vía storage público; `remotePatterns` restringe a `*.supabase.co` propio) — riesgo significativo de seguridad, no vía de acceso demostrada hoy.

### P1 — 1 ítem

| Ítem | Justificación factual |
|---|---|
| **Bump de `next` → 16.3.3** (elimina 2 advisories **critical RCE**, GHSA-p293 + GHSA-2xp9) | severidad máxima conocida en runtime de producción; fix patch **no-breaking** disponible; el gate Security Audit de CI lleva rojo desde E-SEC por estas advisories; CostPro expone `next/image` con `remotePatterns` a storage público (superficie real). Criterio: «riesgo significativo de seguridad» |

### P2 — 3 ítems

| Ítem | Justificación factual |
|---|---|
| **R-E2E-1: restaurar infra E2E** (secrets CI o env aislado, fixture `authedPage`, URL Supabase de test, timeout de job) | «bloqueo funcional importante» para la confianza de regresión: 156–171 tests rojos por 3 causas de infraestructura, 0 de producto; el flujo crítico venta/checkout carece de spec E2E propio; sin esto, cualquier cambio futuro en precio/checkout se valida sólo con unit/integration |
| **R-UX-DATE: alinear validador de fecha cliente↔server** | «operación comercial incorrecta»: operadores diarios afectados (ventana 19:00–24:00 sin opción válida; warning permanente tras la primera venta del día); existe workaround (vaciar campo → NOW()) → P2, no P1; riesgo de fecha de negocio futura si el operador elige HOY+1 |
| **Bump sharp 0.35.4 / js-yaml 4.3.2 / csv-parse 7.0.2** (high×2 + moderate con superficie real: optimizer HEIF, DoS CPU YAML, prototype pollution en import CSV autenticado) | mismos criterios de seguridad que next pero con superficie más acotada y severidad menor; patch no-breaking; conviene misma ventana que F1 |

### P3 — 3 ítems

| Ítem | Justificación factual |
|---|---|
| **vitest → 4.1.11** (@vitest/mocker path traversal) | dev-only, no corre en producción; higiene |
| **R-A11Y-1: combo warning/10 → /5 (o #92400e) + limpiar tokens muertos `--color-*`** | accesibilidad menor (4.19:1 en un combo), sin impacto funcional; CSS muerto verificado con 0 usos |
| **Higiene E2E menor**: dar a `landing-page.spec.ts`/`security-headers.spec.ts` entorno estable (pasan local con chromium v1234), decidir skip explícito vs fallo cuando no haya credenciales (hoy fallan 401 en vez de saltarse) | higiene de test; reduce ruido del suite |

## Orden lógico de ejecución (dependencias, no puntuación)

```text
F1 (deps: next+sharp+js-yaml+csv-parse+vitest)  → cierra el gate rojo de Security Audit, toca lockfiles una sola vez
F2 (E2E infra)                                   → después de F1: los runs E2E quedan interpretables con CI verde
F3 (UX-DATE)                                     → independiente; puede paralelizar tras F1
(P3: higiene, en cualquier ventana futura)
```
