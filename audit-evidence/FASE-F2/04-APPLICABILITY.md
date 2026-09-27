# FASE F2 — 04 APPLICABILITY (vulnerable según scanner ≠ explotable en CostPro)

**Fecha**: 2026-09-27 · Mandato §5: sin payloads, sin explotación real; separación explícita entre hallazgo del scanner y explotabilidad en el código real.

## Declaración

```text
vulnerable según scanner:  SÍ — bun audit 1 high (2 instancias v3: 3.3.16, 3.3.17)
explotable en CostPro:     NO — evidencia estructural abajo
```

## Evidencia de no explotabilidad

### 1. La precondición de la advisory es un mal uso del API, no input externo

CWE-835 (loop infinito): la condición se activa cuando el **desarrollador** crea un generador custom (`customAlphabet(...)` / `customRandom(...)`) y lo invoca con `size = 0`. No hay parsing de datos del usuario en el mecanismo: el "atacante" tendría que ser el propio código de la aplicación.

### 2. CostPro no usa nanoid en su propio código

```text
$ rg nanoid src/ server.ts   →  0 coincidencias (re-verificado en F2 sobre b10919d6)
```

Ningún código de producto importa nanoid directa o indirectamente; nadie puede invocar un generador custom con size 0 desde CostPro.

### 3. Las instancias vulnerables pertenecen a postcss, y postcss llama a nanoid de forma segura

```text
$ rg "nanoid" node_modules/postcss/lib/
lib/input.js:3:  let { nanoid } = require('nanoid/non-secure')
lib/input.js:80: this.id = '<input css ' + nanoid(6) + '>'
```

- Uso único en todo postcss: identificador interno de un Input CSS con **tamaño fijo 6** (`nanoid(6)`), mediante el generador **non-secure** de fábrica — no un generador custom del usuario, y nunca `size = 0`.
- Esa llamada corre exclusivamente en **build-time** (Turbopack/next build, Tailwind, vite), nunca en el runtime de producción: el `postcss/nanoid` y `next/postcss/nanoid` no se cargan en `next start`/server.ts.

### 4. La instancia runtime (docx) usa la línea v5, fuera del rango vulnerable

- `docx@9.7.1` declara `nanoid ^5.1.3` → resuelto **5.1.16**.
- OSV GHSA-2v37-7h3g-55p8 rango v4/v5: `[4.0.0, 5.1.6)` → **5.1.16 está corregido** (5.1.16 ≥ 5.1.6).
- La ruta `docx › nanoid` en la salida de `bun audit` es una agrupación de display del escáner (todas las rutas hacia el nombre nanoid), no una instancia vulnerable: versión + rangos OSV lo excluyen.

### 5. Superficies de exposición revisadas (mandato §5)

| Dimensión | Resultado |
|---|---|
| Uso directo de nanoid en src/ | 0 |
| Uso indirecto runtime | docx → nanoid 5.1.16 (versión corregida) |
| build-time | postcss ×2 → 3.3.16/3.3.17 (las únicas vulnerables; llamadas fijas `nanoid(6)`) |
| producción (runtime server) | sin nanoid v3 cargado |
| CI | build-time only (ubuntu-latest) |
| generación de IDs de negocio | ajena a nanoid (create_sale_v2/supervisor tokens usan crypto propio del stack) |
| entrada controlada por usuario → nanoid | inexistente (ningún dato de usuario alcanza a postcss en runtime; postcss no corre en runtime) |
| ¿puede el código real activar la condición? | NO — la condición requiere invocar generador custom con size 0; nadie lo invoca |

## Conclusión

El hallazgo es **real como estado del árbol** (debe cerrarse para que `bun audit` — el mecanismo de CI — quede limpio) pero **no explotable en CostPro**: impacto teórico de tooling (DoS de build por mal uso del API), cero camino de datos, cero uso en producto. Esta clasificación NO se usó como justificación para no remediar (mandato §6 prohíbe "build-only → ignorar" como única razón); la remediación se ejecutó igualmente (ver 05/06).
