# FASE F2 — 03 NANOID TREE (árbol real de todas las instancias)

**Fecha**: 2026-09-27 · Comandos: `rg nanoid bun.lock`, `rg nanoid package-lock.json`, inspección de `node_modules/*/package.json` con Node. Ejecutados en b10919d6 PRE-cambio.

## Instancias de nanoid en el árbol efectivo de Bun (autoridad CI)

| Ruta (bun.lock / node_modules) | Versión | Parent declarante | Runtime/build | Directa/transitiva | Vulnerable (<3.3.18 v3) |
|---|---|---|---|---|---|
| `nanoid` (raíz) | **5.1.16** | `docx@9.7.1` (spec `^5.1.3`) | runtime (export-pdf ofertas) | transitiva | **NO** (v5; fix v4/v5 = 5.1.6 → 5.1.16 ≥ fix) |
| `postcss/nanoid` | **3.3.16** | `postcss@8.5.25` (spec `^3.3.16`) — sirve a `@tailwindcss/postcss@4.3.3` y `vite@8.2.0` | build-time (Tailwind/Turbopack/vite) | transitiva | **SÍ** |
| `next/postcss/nanoid` | **3.3.17** | `next/postcss@8.5.23` (spec `^3.3.16`) — postcss fijada EXACTA por `next@16.3.3` (`dependencies.postcss = "8.5.23"`) | build-time (next build) | transitiva | **SÍ** |

Árbol solicitado por el mandato:

```text
costpro (package.json — SIN nanoid directa: `rg nanoid package.json` = 0)
├── docx@9.7.1
│   └── nanoid@5.1.16                      ← NO vulnerable (v5 ≥ 5.1.6)
├── @tailwindcss/postcss@4.3.3
│   └── postcss@8.5.25
│       └── nanoid@3.3.16                  ← VULNERABLE
├── vitest@4.1.11 › @vitest/mocker@4.1.11 › vite@8.2.0
│   └── (postcss@8.5.25 deduplicada en raíz)
│       └── nanoid@3.3.16                  ← VULNERABLE (misma entrada)
└── next@16.3.3
    └── postcss@8.5.23 (pin exacto "8.5.23")
        └── nanoid@3.3.17                  ← VULNERABLE
```

## Árbol npm (package-lock.json)

| Ruta | Versión | Observación |
|---|---|---|
| `node_modules/nanoid` | 5.1.16 | raíz (docx) |
| `node_modules/postcss/node_modules/nanoid` | **3.3.18** | ÚNICA instancia v3 — npm deduplica postcss (8.5.25 sirve también a next vía su spec) y ya había resuelto 3.3.18 |

## Por qué npm resolvió 3.3.18 y Bun conservaba 3.3.16/3.3.17

- **nanoid 3.3.18** se publicó 2026-08-07; **3.3.16** el 2026-07-12 y **3.3.17** el 2026-08-03 (`npm view nanoid time`).
- El `package-lock.json` fue regenerado en un momento en que npm re-resolvió la entrada dentro del rango `^3.3.16` llevándola a la entonces-latest 3.3.18; npm re-resuelve entradas transitivas en sus ciclos de regeneración.
- `bun.lock` se creó cuando 3.3.16/3.3.17 eran actuales y **Bun preserva entradas ya bloqueadas que satisfacen los rangos declarados** (`^3.3.16` es satisfecho por 3.3.16/3.3.17/3.3.18) — Bun no re-resuelve transitivas válidas por sí solo.
- Verificación de que la divergencia es histórica y no de F1: F1 (06-LOCKFILE-DIFF) ya registró `old == new` en estas entradas; re-verificado en F2 sobre b10919d6 antes de tocar nada.

## Por qué ambos lockfiles pueden coexistir sin falsos resultados de instalación

1. **Cada gestor instala exclusivamente desde su propio lockfile**: CI ejecuta `bun install --frozen-lockfile` (solo lee `bun.lock`); npm nunca instala en CI. No existe ningún flujo que mezcle árboles.
2. Ambos lockfiles son internamente consistentes (instalación determinista cada uno): `bun install --frozen-lockfile` exit 0 y `npm ci --dry-run` exit 0 en el baseline.
3. La consecuencia era solo de **observabilidad**: `npm audit` lee `package-lock.json` (3.3.18 → limpio) y `bun audit` lee `bun.lock` (3.3.16/3.3.17 → 1 high). Tras F2 ambos árboles quedan en 3.3.18 y ambos audits en 0 (ver 07).

## Verificación de que no existen otras instancias v3

```text
$ rg 'nanoid' bun.lock
→ 6 coincidencias: docx (spec ^5.1.3), nanoid 5.1.16, postcss (spec ^3.3.16) ×2,
  postcss/nanoid 3.3.16, next/postcss/nanoid 3.3.17
→ NO existe ningún otro declarante de nanoid v3 en el árbol (vite/tailwind llegan por
  postcss deduplicada; 0 dependencias "nanoid" en package.json raíz)
```
