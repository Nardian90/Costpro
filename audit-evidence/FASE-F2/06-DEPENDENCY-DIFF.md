# FASE F2 — 06 DEPENDENCY DIFF (diff exacto y atribución línea a línea)

**Fecha**: 2026-09-27 · `git diff package.json`, `git diff bun.lock`, `git diff package-lock.json` — revisados manualmente en su totalidad.

## Resumen

| Archivo | Cambio | Atribución |
|---|---|---|
| `package.json` | **+1 línea** (y coma en la línea anterior) | override `"nanoid@^3.3.16": "3.3.18"` |
| `bun.lock` | **3 cambios de versión + 1 re-serialización cosmética + 1 línea de metadatos** | ver desglose |
| `package-lock.json` | **0 cambios** (byte-idéntico) | el árbol npm ya estaba en 3.3.18 y cumple el override |

```text
$ git diff --stat
 bun.lock     | 7 ++++---
 package.json | 3 ++-
 2 files changed, 6 insertions(+), 4 deletions(-)
```

## package.json — diff completo

```diff
   "overrides": {
     "dompurify": "^3.4.13",
-    "js-yaml": "$js-yaml"
+    "js-yaml": "$js-yaml",
+    "nanoid@^3.3.16": "3.3.18"
   }
```

- Overrides existentes **intactos** (`dompurify ^3.4.13`, `js-yaml $js-yaml`).
- Ninguna dependencia/devDependency/script/engines adicional tocada.
- NO se ejecutaron `npm audit fix`, `npm update`, `bun update`, `bun upgrade` (mandato §7). Mecanismo único: edición declarativa + `bun install` en 2 pasos (ver 05) + `npm install --package-lock-only` (sin efecto).

## bun.lock — desglose de las 7 líneas

### 1. Metadatos (1 línea)

```diff
   "overrides": {
     "dompurify": "^3.4.13",
     "js-yaml": "4.3.2",
+    "nanoid@^3.3.16": "3.3.18",
   },
```

### 2. `postcss/nanoid`: 3.3.16 → 3.3.18 (CAMBIO REAL — cierra la instancia vulnerable)

```diff
-    "postcss/nanoid": ["nanoid@3.3.16", "", { "bin": "bin/nanoid.cjs" }, "sha512-bzlKTyNJ7+…"],
+    "postcss/nanoid": ["nanoid@3.3.18", "", { "bin": { "nanoid": "bin/nanoid.cjs" } }, "sha512-DTg4MJbGMWkfi6…"],
```

### 3. `next/postcss/nanoid`: 3.3.17 → 3.3.18 (CAMBIO REAL — cierra la instancia vulnerable)

```diff
-    "next/postcss/nanoid": ["nanoid@3.3.17", "", { "bin": "bin/nanoid.cjs" }, "sha512-xQLf0A3HOMlg…"],
+    "next/postcss/nanoid": ["nanoid@3.3.18", "", { "bin": { "nanoid": "bin/nanoid.cjs" } }, "sha512-DTg4MJbGMWkfi6…"],
```

### 4. `nanoid` raíz 5.1.16: re-serialización cosmética del campo bin (SIN cambio de versión ni integridad)

```diff
-    "nanoid": ["nanoid@5.1.16", "", { "bin": "bin/nanoid.js" }, "sha512-kVrnsrJqMR8+…"],
+    "nanoid": ["nanoid@5.1.16", "", { "bin": { "nanoid": "bin/nanoid.js" } }, "sha512-kVrnsrJqMR8+…"],
```

Mismo paquete, misma versión 5.1.16, mismo sha512. Es el formato canónico del escritor de bun.lock tras el ciclo de re-resolución (formato objeto en lugar de string). Sin efecto funcional ni de instalación.

### Cambios no relacionados detectados: NINGUNO

- 0 paquetes añadidos/eliminados del lock; 0 cambios de versión fuera de las 2 entradas nanoid v3; 0 integridades tocadas fuera de esas entradas.
- `docx@9.7.1`, `postcss@8.5.25`, `next/postcss@8.5.23`, `next@16.3.3`, `vite@8.2.0`, `@tailwindcss/postcss@4.3.3`, vitest 4.1.11, sharp 0.35.4, js-yaml 4.3.2, csv-parse 7.0.2 → **todas sus entradas idénticas old/new** (R-DEPS-1 NO reabierto).

## package-lock.json — 0 cambios (explicación)

- El árbol npm ya resolvía `postcss/node_modules/nanoid = 3.3.18` (instancia única deduplicada) — ver 03.
- El override `"nanoid@^3.3.16": "3.3.18"` se aplica en tiempo de resolución; la resolución existente ya cumple → `npm install --package-lock-only` regeneró un lockfile byte-idéntico (`git diff` vacío, exit 0).
- Consistencia verificada tras el cambio: `npm ci --dry-run` → exit 0 (lockfile suficiente y consistente con package.json incluido su override).
- Consecuencia: **npm audit permanece en 0 por construcción** y la paridad bun/npm de la instancia v3 queda en 3.3.18 == 3.3.18.

## Registro antes/después/motivo/advisory/impacto (mandato F1-style)

| Paquete (ruta) | Antes | Después | Motivo | Advisory cerrada | Impacto esperado |
|---|---|---|---|---|---|
| postcss/nanoid | 3.3.16 | **3.3.18** | fix mínima corregida vía override range-scoped | GHSA-2v37-7h3g-55p8 (instancia 1) | build-time; API `nanoid/non-secure nanoid(6)` idéntica |
| next/postcss/nanoid | 3.3.17 | **3.3.18** | idem (misma arista de spec `^3.3.16`) | GHSA-2v37-7h3g-55p8 (instancia 2) | build de next; postcss 8.5.23 intacta |
| nanoid raíz (docx) | 5.1.16 | 5.1.16 (sin cambio) | — (clave del override no alcanza `^5.1.3`) | — | runtime export-pdf intacto |
