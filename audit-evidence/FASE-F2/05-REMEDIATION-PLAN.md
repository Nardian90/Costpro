# FASE F2 — 05 REMEDIATION PLAN (opciones, semántica Bun y mecanismo elegido)

**Fecha**: 2026-09-27 · Mandato §6: evaluar únicamente Opción A (override), B (parent update) o C (no remediar), con justificación técnica verificable. Experimentos ejecutados en sandboxes fuera del repo (`/home/z/my-project/scripts/f2-ovtest/*`) y en el repo sobre rama `audit/f2-nanoid-security`.

## Opción A — override `nanoid → >=3.3.18` (ELEGIDA)

### Sintaxis candidatas y semántica real de Bun 1.3.14 (caracterizada empíricamente)

| # | Experimento (sandbox) | Config | Resultado | Conclusión |
|---|---|---|---|---|
| A | `a-nested` | `"overrides": {"postcss": {"nanoid": "3.3.18"}}` | `warn: Bun currently does not support nested "overrides"` + sin efecto | **Bun NO soporta overrides anidados** (npm sí — lockfile sandbox quedó en 3.3.18) |
| B | `b-range` | `"overrides": {"nanoid@^3.3.16": "3.3.18"}` (fresh) | resuelve **3.3.19** (latest del rango del padre) | valor actúa como piso, no como pin |
| C | `c-min3.3.8` | `"nanoid@^3.3.16": "3.3.8"` (fresh) | resuelve **3.3.19** | confirma: el valor NO fija la versión |
| D | `d-eq3.3.8` | `"nanoid@^3.3.16": "=3.3.8"` (fresh) | resuelve **3.3.19** | idem |
| F | `f-intersect` | `"nanoid@>=3.3.18 <3.3.19": "3.3.18"` (fresh) | resuelve **3.3.19** | el rango de resolución es el del PADRE, la clave solo filtra |
| R1 | **repo real** | override range-scoped añadido con lock existente (3.3.16/3.3.17) | `bun install` → "no changes"; bun.lock solo gana la línea de metadatos; **entradas NO re-resueltas**; `bun audit` sigue 1 high | **Bun graba la clave range-scoped en el lock pero NO invalida entradas ya bloqueadas** |
| G | `g-dance` | Paso 1: unscoped `"nanoid": "3.3.18"` sobre lock existente; Paso 2: revertir a range-scoped | Paso 1: **SÍ invalida y re-resuelve** (todas → 3.3.18); Paso 2: docx vuelve a 5.1.16, postcss queda 3.3.18; `bun install --frozen-lockfile` exit 0 | **Unscoped sí re-resuelve; range-scoped inerte → mecanismo de 2 pasos viable** |

**Semántica Bun 1.3.14 resumida**: (1) nested → no soportado; (2) range-scoped → se registra en bun.lock pero no re-resuelve locks existentes (y en resolución fresca actúa como piso tomando latest del rango del padre); (3) unscoped → invalida y re-resuelve.

### ¿Por qué NO el override unscoped como estado final?

`"nanoid": "3.3.18"` fuerza **TODAS** las aristas, incluida `docx@9.7.1 › nanoid ^5.1.3` (runtime, export-pdf): downgrade MAJOR 5.1.16 → 3.3.18 en una dependencia de producto = cambio funcional no autorizado. Rechazado como estado final; usado solo como **paso transitorio controlado** del mecanismo (ver abajo).

### Mecanismo implementado (100% declarativo, sin comandos prohibidos ni edición manual del lockfile)

```text
Paso 1: package.json con override temporal UNSCOPED "nanoid": "3.3.18" → bun install
        (fuerza re-resolución: postcss/nanoid 3.3.16→3.3.18, next/postcss/nanoid 3.3.17→3.3.18,
         docx/nanoid 5.1.16→3.3.18 transitoriamente)
Paso 2: package.json de vuelta al override QUIRÚRGICO "nanoid@^3.3.16": "3.3.18" → bun install
        (la arista docx ^5.1.3 deja de estar satisfecha por 3.3.18 → vuelve a 5.1.16;
         las aristas postcss ^3.3.16 quedan satisfechas en 3.3.18 → se conservan)
```

Ambos pasos son estados declarativos de package.json + `bun install`; el estado final es el override mínimo y el árbol queda exactamente en el objetivo. Verificación end-to-end previa en sandbox G (incluido `--frozen-lockfile` exit 0 del estado final).

## Opción B — actualización del parent (EVALUADA Y DESCARTADA, con evidencia)

- Upstream existe: `postcss@8.5.28` (latest) ya declara `nanoid: ^3.3.18` (`npm view postcss@latest dependencies`) — la raíz 8.5.25 (spec `^8.5.16` de @tailwindcss/postcss, `^8.5.23` de vite) podría moverse a 8.5.28.
- **Pero la instancia `next/postcss@8.5.23` es inmovable por esta vía**: `next@16.3.3` fija postcss **exactamente** (`"postcss": "8.5.23"` — verificado con `npm view next@16.3.3 dependencies.postcss`). Ninguna actualización de padres la cambia; forzarla requeriría un override SOBRE postcss, que además pelearía contra el pin exacto de next y cambiaría el pipeline de build de next — mayor radio de impacto que el paquete vulnerable.
- Conclusión: Opción B **no cierra** GHSA-2v37-7h3g-55p8 completa por sí sola (dejaría `next›postcss›nanoid@3.3.17` abierto → `bun audit` seguiría 1 high) y toca más paquetes que Opción A. Descartada.

## Opción C — no remediar (RECHAZADA)

El mandato prohíbe aceptar "es build-only" como única justificación. En F2 se verificó además que la remediación Opción A es trivial, quirúrgica (1 línea declarativa) y no rompe el árbol → no concurre ninguna de las 3 condiciones habilitantes de Opción C.

## Versión elegida: 3.3.18 (mínima corregida) — no 3.3.19

- El mecanismo de 2 pasos permite fijar exactamente la **versión mínima corregida** 3.3.18 en bun.lock.
- `3.3.19` (2026-09-10) también cerraría la advisory, pero F2 mantiene el principio de pin mínimo de F1 (16.3.3 siendo disponibles 16.3.4+): mínimo cambio auditable.
- **Paridad de lockfiles lograda**: bun.lock y package-lock.json quedan ambos en 3.3.18 para la única instancia v3 de npm (package-lock no cambió — ya estaba en 3.3.18).
- El override range-scoped `"nanoid@^3.3.16": "3.3.18"` documenta la intención: cualquier arista `nanoid ^3.3.x` (solo postcss la declara) debe resolver ≥3.3.18; la arista `^5.1.3` de docx queda explícitamente fuera de la clave.

## Compatibilidad verificada

- postcss declara `nanoid ^3.3.16` → 3.3.18 satisface (semver compatible, patch).
- API usada por postcss: `require('nanoid/non-secure').nanoid(6)` — estable en toda la línea 3.x (verificado en los fuentes instalados 3.3.16 vs 3.3.18: firma idéntica).
- docx (`^5.1.3` → 5.1.16) y next (pin postcss 8.5.23): **intactos** por diseño del override (ver 06 diff).
- Sin cambios en peers de react/vite/tailwind/next; cero paquetes actualizados fuera de nanoid v3.
