# FASE F1 — 06 LOCKFILE DIFF

**Fecha**: 2026-09-27 · Diffs revisados manualmente: `git diff bun.lock` (112 líneas ±) y `git diff package-lock.json` (514 líneas ±). Comparación de árboles con script dedicado (`scripts/compare-locktrees.js`, fuera del repo).

## package-lock.json — resumen del árbol (old=HEAD 1272a32f vs new)

- **Cambios de versión: 49** — todos atribuibles:
  - familia next: `next 16.3.0→16.3.3`, `@next/env 16.3.3`, 8× `@next/swc-*` 16.3.3, `next/node_modules/@swc/helpers 0.5.15→0.5.23` (dependencia declarada por next@16.3.3 — `npm view next@16.3.3 dependencies`)
  - familia sharp: `sharp 0.35.3→0.35.4`, 26× `@img/sharp-*` 0.35.4, 10× `@img/sharp-libvips-*` 1.3.2→1.3.3 (optionalDependencies de sharp 0.35.4)
  - familia vitest: `vitest`, `@vitest/{mocker,expect,pretty-format,runner,snapshot,spy,utils,coverage-v8}` 4.1.10→4.1.11 (version-locked del monorepo vitest)
  - `csv-parse 7.0.1→7.0.2`, `js-yaml 4.3.1→4.3.2`
- **Añadidos: 6** — todos anidados bajo `node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/` (`@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`, `tslib`): normalización npm de opcionales wasm32-wasi; el paquete padre NO cambia (4.3.3 old == new) y no corre en linux-x64/CI/Vercel. Sin efecto runtime.
- **Eliminados: 0**.

## bun.lock — mismo conjunto 1:1

56 entradas modificadas por lado (±), idénticas en sustancia a las 49 de npm + metadatos `optionalPeers` de las entradas next/vitest al cambiar de versión. Entradas clave verificadas con grep sobre el diff: `next@16.3.3`, `sharp@0.35.4`, `js-yaml@4.3.2`, `csv-parse@7.0.2`, `vitest@4.1.11`, `@vitest/* 4.1.11`, `@next/env@16.3.3`, `@next/swc-*@16.3.3`, `@img/sharp-*@0.35.4`, `@img/sharp-libvips-*@1.3.3`, `next/@swc/helpers@0.5.23`.

## Divergencia bun vs npm (preexistente, no introducida por F1)

`package-lock.json` resuelve `postcss/node_modules/nanoid` = **3.3.18**; `bun.lock` resuelve `postcss/nanoid` = **3.3.16** y `next/postcss/nanoid` = **3.3.17**. Ambos lockfiles son idénticos en estas entradas antes y después de F1 (old == new) → divergencia de resolución histórica entre gestores, no efecto de F1. Consecuencia: `npm audit` (DB npm, nanoid limpio en 3.3.18) = 0 vulns; `bun audit` (DB bun, fix en ≥3.3.18) = 1 high. Ver análisis completo en 07-AUDIT-AFTER.md.

## Cambios no relacionados detectados: NINGUNO fuera de lo descrito arriba

- Integridades (`integrity`), resoluciones y versiones de TODOS los demás paquetes: sin cambios.
- Ningún paquete eliminado; ninguna dependencia de producto (src/) tocada — F1 solo modifica `package.json`, `bun.lock`, `package-lock.json`.
