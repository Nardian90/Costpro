# SC-2-04 — Cuadrícula del Transportador en DOS filas (antes 3 filas)

**Fecha:** 2026-11-09 · **Rama:** `feat/sc204-transportador-dos-filas-20261109` · **Base:** `3aa5634` (main)
**Decisión del propietario:** estética — el bloque **Transportador** del SC-2-04 pasa de **3 filas × 2 columnas** a **2 filas × 3 columnas**.

## 1. Qué cambió (y qué NO)

| | ANTES (3 filas) | DESPUÉS (2 filas) |
|---|---|---|
| Fila 1 | Nombre · Chapa | Nombre · Chapa · **Guía aérea** |
| Fila 2 | Carné de identidad · Casilla | Carné de identidad · Casilla · **Firma** |
| Fila 3 | Firma · Guía aérea | — (eliminada) |

- `fieldsSection` del pie unificado (`drawRes11SignatureFooter`): `columns: 2` → `columns: 3` y reorden de campos. **No** cambia ninguna etiqueta, dato, fuente de datos, ni el alto de fila (7 mm); el pie queda 7 mm más compacto y la medición (`measureRes11SignatureFooterHeight`) se ajusta sola (invariante measure = draw).
- «Firma» sigue siendo un campo más de la cuadrícula con línea de cumplimentación; los valores se escriben SOBRE su línea.
- **Alcance verificado:** `sc204.ts` era el ÚNICO modelo con este formato. `sc212` usa el formato de línea corrida RES11 («DATOS DEL TRANSPORTISTA:» en una línea), que es distinto y no se tocó; sc201/208/209/213/216 no tienen cuadrícula de transportador. `rg fieldsSection src/` → solo sc204 + su fixture de test.
- **Sin cambios** en datos, consultas, RLS, ni en ningún otro PDF de COSTPRO.

## 2. Verificación

- **Unitarias:** 5 suites SC/res11 → **69/69 PASS**, incluida la nueva prueba estructural «cuadrícula en DOS filas × 3 columnas» (DOS alturas de fila exactas; extremo derecho de cada línea delata la columna: Guía aérea y Firma en la 3.ª celda) y asertos de orden de dibujo en `sc204-pdf-ux-004` (`indexOf('Guía aérea:') < indexOf('Carné de identidad:')`).
- **Typecheck:** `tsc --noEmit` limpio. **Lint:** sin errores en los 3 archivos tocados.

## 3. Evidencias PDF (generador de producción, sin mocks — `scripts/dev-sc-footer-evidence.ts`)

| Archivo | Contenido |
|---|---|
| `ANTES_transportador-3-filas.pdf` | Estado anterior (`3aa5634`): 3 filas × 2 columnas |
| `DESPUES_transportador-2-filas-con-datos.pdf` | Nueva cuadrícula con valores sobre sus líneas (Nombre/Chapa/Guía aérea · Carné/Casilla/Firma) |
| `DESPUES_transportador-2-filas-vacio.pdf` | Todo vacío: 6 líneas de cumplimentación en 2 filas |
| `DESPUES_transportador-2-filas-multipagina.pdf` | 42 líneas: el pie completo (firmas + transportador) viaja JUNTO a la última página |

Inspección visual (pdftoppm): sin solapes ni desbordes; columnas alineadas; valores y líneas correctas en los tres escenarios.
