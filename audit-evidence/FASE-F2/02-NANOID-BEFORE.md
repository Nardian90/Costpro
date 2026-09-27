# FASE F2 — 02 NANOID BEFORE (reproducción PRE-FIX)

**Fecha**: 2026-09-27 · **Fuente**: `bun audit` (texto y `--json`) + `npm audit` ejecutados en HEAD b10919d6 **antes de modificar cualquier archivo**. Crudos: `scripts/f2-bun-audit-pre.txt`, `scripts/f2-bun-audit-pre.json`, `scripts/f2-npm-audit-post.txt` (side npm también capturado PRE).

## Hallazgo reproducido (exit 1)

```text
bun audit v1.3.14 (0d9b296a)
nanoid  <3.3.18
  docx › nanoid
  @tailwindcss/postcss › postcss › nanoid
  next › postcss › nanoid
  vitest › @vitest/mocker › vite › postcss › nanoid
  high: nanoid: custom generators can loop indefinitely when size is zero
        - https://github.com/advisories/GHSA-2v37-7h3g-55p8
1 vulnerabilities (1 high)
```

`bun audit --json` (estructura):

```json
{
  "nanoid": [{
    "id": 1139427,
    "url": "https://github.com/advisories/GHSA-2v37-7h3g-55p8",
    "title": "nanoid: custom generators can loop indefinitely when size is zero",
    "severity": "high",
    "vulnerable_versions": "<3.3.18",
    "cwe": ["CWE-835"],
    "cvss": { "score": 5.9, "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H" }
  }]
}
```

## Registro exigido por el mandato §3

| Campo | Valor |
|---|---|
| Advisory | GHSA-2v37-7h3g-55p8 (CVE asociado vía GitHub Advisory DB, revisada 2026-07) |
| Paquete | nanoid |
| Rango vulnerable | `<3.3.18` (DB de bun; OSV añade segundo rango v4/v5 — ver abajo) |
| Versión(es) instaladas afectadas | 3.3.16 (`postcss/nanoid`) y 3.3.17 (`next/postcss/nanoid`) |
| Padres reales | `postcss@8.5.25` (raíz) y `postcss@8.5.23` (anidada de `next@16.3.3`) — ambos declaran `nanoid: ^3.3.16` |
| Rutas reportadas | 4 (incluye `docx › nanoid`, que apunta a la versión NO vulnerable 5.1.16 — ruido de display del escáner, ver 03/04) |
| Severidad | HIGH (CVSS 5.9 — AV:N/AC:H/PR:N/UI:N — disponibilidad) |
| Mecanismo | CWE-835: los generadores custom (`customAlphabet`/`customRandom`) entran en bucle infinito si se invocan con `size = 0` (uso incorrecto por el desarrollador; no es un defecto del generador por defecto ni inyección de input) |
| Versión mínima corregida | **3.3.18** (línea v3); en línea v4/v5 el fix es **5.1.6** (OSV: `[4.0.0, 5.1.6)`) |
| ¿Bun considera fix disponible? | Sí — la salida sugiere `bun update` (prohibido por mandato §7); la vía autorizada es el override declarativo (mandato §6 Opción A) |

## Rangos oficiales del advisory (OSV.dev, GET-only, sin explotación)

```text
$ curl -s https://api.osv.dev/v1/vulns/GHSA-2v37-7h3g-55p8
affected:
  - npm/nanoid  ranges: [{introduced: 0},      {fixed: 3.3.18}]   ← aplica a las 2 instancias de CostPro
  - npm/nanoid  ranges: [{introduced: 4.0.0},  {fixed: 5.1.6}]    ← nanoid 5.1.16 (docx) está FUERA (5.1.16 ≥ 5.1.6)
```

**Doble verificación**: la línea `docx@9.7.1 › nanoid@5.1.16` NO satisface ninguno de los dos rangos vulnerables (`5.1.16 < 3.3.18` es falso en semver; `5.1.16 ∈ [4.0.0, 5.1.6)` es falso). Bun lista la ruta por agrupar todas las rutas al nombre del paquete; la única instancia materialmente vulnerable es la línea v3 (2 entradas del lock — ver 03).

## Estado npm (side paralelo)

```text
$ npm audit → found 0 vulnerabilities (exit 0)
```

El árbol npm ya resolvía `postcss/node_modules/nanoid = 3.3.18` (deduplicada a una sola instancia) — por eso npm no reportaba nada. **La discrepancia npm-vs-bun es de resolución de lockfiles histórica, no de datos del advisory** (ver 03).
