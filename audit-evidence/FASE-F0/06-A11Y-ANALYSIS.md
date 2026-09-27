# FASE F0 — 06 A11Y ANALYSIS (R-A11Y-1)

**Fecha**: 2026-09-27 · **Método**: cálculo WCAG 2.x (luminancia relativa) con script reproducible (`scripts/f0_a11y_contrast.py`). Sin cambios visuales.

## Valores vigentes en tokens.css (verificados)

```text
:root  (light, líneas 172-176): --success: #047857 · --warning: #b45309   ← fixes FASE D aplicados
.dark  (líneas 254-257):        --success: #34d399 · --warning: #fbbf24
--background light: #f8fafc (línea 146)   --background dark: #121212 (línea 229)
```

## Cálculo de contraste (AA: ≥4.5 texto normal, ≥3.0 texto grande; AAA: ≥7.0 / ≥4.5)

| Combinación | Ratio | AA normal | AA grande | AAA |
|---|---|---|---|---|
| warning #b45309 sobre page #f8fafc | **4.80:1** | PASS | PASS | FAIL |
| success #047857 sobre page #f8fafc | **5.24:1** | PASS | PASS | FAIL |
| warning sobre bg-warning/5 (comp #f5f2f0) | **4.51:1** | PASS (margen 0.01) | PASS | FAIL |
| success sobre bg-success/5 (comp #ecf4f4) | **4.91:1** | PASS | PASS | FAIL |
| **warning sobre bg-warning/10 (comp #f1e9e4)** | **4.19:1** | **FAIL** | PASS | FAIL |
| success sobre bg-success/10 (comp #e0edec) | **4.57:1** | PASS (margen 0.07) | PASS | FAIL |
| warning dark #fbbf24 sobre #121212 | **11.22:1** | PASS | PASS | PASS |
| success dark #34d399 sobre #121212 | **9.74:1** | PASS | PASS | PASS |

Estados hover/focus usan los mismos tokens sobre los mismos tints (no se detectaron combos adicionales con texto warning encima de warning/10 más allá de los registrados).

## El riesgo residual R-A11Y-1 (confirmado, sin cambios)

- **Único combo AA-FAIL**: texto `warning` (#b45309) sobre fondo `bg-warning/10` → 4.19:1 < 4.5 (pasa como texto grande ≥3:1).
- **Componentes con `bg-warning/10` en el código** (superficie verificada por grep): `FCStatusBadge.tsx`, `DocumentStatusBadge.tsx`, `FCPreviewModal.tsx`, `ui/atomic/index.tsx`, `ipv/MovementsView.tsx` (+ el caso histórico de hover en `StoreCard` documentado en FASE-D/08).
- Recomendación ya registrada en FASE D, vigente: usar `bg-warning/5` en usos con texto encima, o endurecer el tono a `#92400e` si se requiere /10.

## Hallazgo adicional de higiene (sin riesgo real)

`tokens.css` líneas 36-37 mantienen `--color-success: #10b981` (2.42:1 FAIL) y `--color-warning: #f59e0b` (2.05:1 FAIL) en otra namespace (`--color-*`). **Verificado 0 usos** de `text-color-warning`/`text-color-success`/`bg-color-warning` en `src/` → CSS muerto. Acción futura de higiene: eliminar o alinear esa namespace para evitar uso accidental.

## Conclusión

- Modo claro: el sistema de tokens PASA AA salvo el combo puntual texto-warning-sobre-warning/10 (riesgo real pero contenido, con workaround de diseño ya propuesto).
- Modo oscuro: PASS amplio (9.7–11.2:1).
- R-A11Y-1 permanece **CONFIRMED OPEN** como deuda menor (P3): no afecta datos ni operación; es mejora de accesibilidad.
