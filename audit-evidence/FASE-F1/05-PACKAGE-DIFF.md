# FASE F1 — 05 PACKAGE DIFF

**Fecha**: 2026-09-27 · `git diff package.json` (completo, verificado manualmente).

## Diff exacto — 6 líneas, todas declaradas en 04-UPDATE-PLAN.md

```diff
-    "csv-parse": "^7.0.0",
+    "csv-parse": "7.0.2",
-    "js-yaml": "^4.3.1",
+    "js-yaml": "4.3.2",
-    "next": "^16.1.1",
+    "next": "16.3.3",
-    "sharp": "^0.35.3",
+    "sharp": "0.35.4",
-    "@vitest/coverage-v8": "^4.1.5",
+    "@vitest/coverage-v8": "4.1.11",
-    "vitest": "^4.1.5",
+    "vitest": "4.1.11"
```

## Registro antes/después/motivo/advisory eliminado/impacto esperado

| Paquete | Antes | Después | Motivo | Advisory eliminado | Impacto esperado |
|---|---|---|---|---|---|
| next | ^16.1.1 (resuelta 16.3.0) | 16.3.3 | fix mínimo corregida | GHSA-p293-qw3h-jr36 + GHSA-2xp9-vwfh-vxw4 (2×CRITICAL) | optimizer/App Router sin cambio de API; sube `@swc/helpers` interno 0.5.15→0.5.23 (dep declarada por next 16.3.3, verificada con `npm view next@16.3.3 dependencies`) |
| sharp | ^0.35.3 (0.35.3) | 0.35.4 | fix patch | GHSA-rgj7-g3m4-5g8c | binarios `@img/*` 0.35.4 + libvips 1.3.3 (version-locked); API idéntica |
| js-yaml | ^4.3.1 (4.3.1) | 4.3.2 | fix patch | GHSA-2883-xcg3-v3hh + apaga flag de @mdxeditor/editor (override `$js-yaml` propaga 4.3.2 a todo el árbol) | API `load/dump` idéntica (smoke OK) |
| csv-parse | ^7.0.0 (7.0.1) | 7.0.2 | fix patch | GHSA-8cw4-87c7-c6xx | API `csv-parse/sync` idéntica (smoke OK) |
| vitest | ^4.1.5 (4.1.10) | 4.1.11 | fix patch | GHSA-82fw-gwwq-j7x9 | suite completa re-ejecutada (Gate A) |
| @vitest/coverage-v8 | ^4.1.5 (4.1.10) | 4.1.11 | peer EXACTO declarado por vitest@4.1.11 (`"@vitest/coverage-v8": "4.1.11"`) — coherencia del mismo ecosistema de la advisory | (ninguna propia) | coverage coherente con vitest |

## Cero cambios colaterales en package.json

- `overrides` intacto: `dompurify ^3.4.13`, `js-yaml $js-yaml` (este último ahora propaga 4.3.2).
- Ningún script, engines, dependencias ni devDependencies adicionales tocados.
- NO se ejecutaron `npm audit fix`, `npm update`, `bun update`, `bun upgrade` (prohibidos §4). El único mecanismo fue: edición declarativa de 6 versiones + `bun install` + `npm install --package-lock-only`.
