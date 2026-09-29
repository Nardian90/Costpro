# DARK PERFORMANCE MONOCHROME — 01 Referencia visual + 02 Auditoría

## 1. Referencia visual

La imagen adjunta por el usuario (`pasted_image_1790645926525.png`) NO llegó al
servidor (directorio `/home/z/my-project/upload/` contiene solo capturas
anteriores de la propia app y audits UX en markdown/zip). Se trabajó con la
**especificación escrita** del brief como fuente de dirección visual:

- Paleta: BLACK → DARK GRAYS → MID GRAYS → LIGHT GRAYS → WHITE.
- Verde: ausente como color dominante/decorativo; residual solo semántico.
- Sensación: sobria, silenciosa, técnica, extremadamente limpia.
- Preservar contraste, jerarquía, affordance, focus, estados y legibilidad.

**Limitación documentada**: sin la imagen, los valores exactos de gris se
calibraron contra los tokens neutros existentes del tema dark de CostPro
(#0a0a0a/#121212/#1a1a1a/#1e1e1e/#2a2a2a — ya coherentes con la dirección
monocromática) y la escala gray de tokens.css (zinc-like).

## 2. Auditoría read-only (GATE 2)

Herramientas: `scripts/audit-green.js` (inventario de clases), `audit-green-v2.js`
(hex por categoría/contexto), `audit-green-v3.js` (valores arbitrarios).

### Inventario cuantitativo

| Familia | Usos | Archivos |
|---|---|---|
| Clases Tailwind verdes crudas (green/emerald/lime-*) | ~570 (130 clases distintas) | 114 |
| Hex verdes en .tsx/.ts | ~340 `#22c55e` + otros | 40 |
| Hex verdes en .css (tokens/landing/modes/components/globals) | 108 | 5 |

Top clases: text-emerald-500 (93), text-green-400 (73), text-green-600 (45),
bg-green-500/10 (32), bg-green-500 (29), bg-emerald-500/10 (27).

Distribución por categoría: LANDING ~285 hex (fuera de alcance operacional),
CSS-LAYER 71, AUTH 34 (arbitrarias `text-[#22c55e]`, `from-[#15803d]`),
OPERATIONAL ~26 (SVG/recharts fill/stroke/stopColor + inline styles).

### Clasificación A–F

| Clase | Tratamiento |
|---|---|
| **A decorativo** | Barrido CSS a grayscale (clases crudas, glows, gradientes) |
| **B acción primaria** | Token `--primary` → blanco técnico #e4e4e7 (texto #0a0a0a) |
| **C estado semántico** | PRESERVADO: `--success/--warning/--danger/--destructive` |
| **D branding** | Tokens `--brand*` → blancos/grises; logo-stop-* a gris en dark+perf |
| **E funcional** | `#15803d` EXCLUIDO del barrido SVG (selector de color de etiquetas, CatalogExportModal) |
| **F legacy/drift** | Las clases crudas mismas — neutralizadas sin tocar componentes |
