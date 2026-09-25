# FASE C2R — 04 FORENSIC COMPARISON · 0024c883 vs snapshot 6dd35833

Documento crítico: `0024c883-e1c5-4ecf-bcde-1ace98a27c20` (FC del usuario de prueba, sobrescrito+borrado y restaurado durante el E2E de C2 — incidente documentado en C2 07-security §3).

## 1. Referencia utilizada

El mandato señala el «snapshot previo 6dd35833». `6dd35833-1dc2-4b60-bce0-d1d7465ab4c9` es el **gemelo certificado por C1R (doc 04)**: C1R estableció que `0024c883` y `6dd35833` eran byte-idénticos (mismo nombre, misma ráfaga de sync 2026-09-21) ANTES del incidente, y C2 07-security §3 documenta que `6dd35833` permaneció intacto durante todo el incidente (los otros 6 FC + semilla conservaron hashes y timestamps). Por tanto la fila LIVE `6dd35833` constituye la referencia certificada del estado pre-incidente de `0024c883`, y la restauración se hizo «con los datos byte-idénticos del donante».

## 2. Comparación LIVE hoy (2026-09-25) — campo por campo

| Campo | 0024c883 (LIVE) | 6dd35833 (LIVE, referencia) | Igual |
|---|---|---|---|
| id | `0024c883-e1c5-…` | `6dd35833-1dc2-…` | — (son dos documentos distintos: ÚNICA diferencia esperable) |
| name | Ejemplo — Servicio de pintura y mantenimiento | ídem | **IGUAL** |
| description | null | null | **IGUAL** |
| category | FC Res148 | FC Res148 | **IGUAL** |
| created_by | a1111111-1111-1111-1111-111111111111 | ídem | **IGUAL** |
| created_at | 2026-09-21T11:27:52.136171+00:00 | ídem | **IGUAL** (precisión de microsegundos idéntica) |
| updated_at | 2026-09-21T11:27:52.136171+00:00 | ídem | **IGUAL** (precisión de microsegundos idéntica) |
| **data completo** (canónico) | `sha256 = 65739ac88ff0718ba2723284833846fdac506c51acb8d14c24c2ee823f0ead35` (6617 bytes) | `sha256 = 65739ac88ff0718ba2723284833846fdac506c51acb8d14c24c2ee823f0ead35` (6617 bytes) | **IGUAL** |

## 3. Comparación byte-a-byte (wire)

`GET /rest/v1/cost_sheets?select=data&id=eq.<id>` (una fila por consulta, cuerpo crudo):

| | 0024c883 | 6dd35833 |
|---|---|---|
| HTTP | 200 | 200 |
| Tamaño del cuerpo | 7270 bytes | 7270 bytes |
| SHA-256 del cuerpo | `26b28df14f442d3fa787c773819a39d453c5b054a39fdae9320a62e227b0517c` | `26b28df14f442d3fa787c773819a39d453c5b054a39fdae9320a62e227b0517c` |
| Inicio del cuerpo | `[{"data":{"ficha": {"id": "fmub5vc7qa6ch51", "meta": {"um": …` | idéntico byte a byte |

La serialización que devuelve PostgREST para la columna `data` de ambas filas es **idéntica byte a byte** (mismo hash SHA-256 sobre 7270 bytes). Esto incluye el orden de claves tal como lo normaliza jsonb (determinista), `data.ficha.id`, `data.ficha.meta`, `data.ficha.rows`, `data.header`, `data.meta2` — todo el contenido disponible.

## 4. Alcance exacto de la afirmación

- **PROBADO**: el `data` de `0024c883` es byte-idéntico (nivel wire y nivel canónico SHA-256) al `data` de su gemelo certificado `6dd35833`, que permaneció intacto durante el incidente; y todos los metadatos (name/description/category/created_by/created_at/updated_at) coinciden con precisión de microsegundos.
- **NO afirmando** identidad contra los archivos de snapshot C1R originales (perdidos — MISSING EVIDENCE). La cadena es: C1R certificó el par pre-incidente → gemelo intacto durante el incidente (verificado con hashes dentro de C2, evidencia commiteada) → hoy el par vuelve a ser byte-idéntico en LIVE.
- Nota de métrica: C1R registró «7229 bytes» para el payload del par; C2R mide 6617 bytes canónicos / 7270 bytes de cuerpo wire. Son métricas de serialización distintas (la de C1R se perdió con sus archivos); la comparación interna C2R es coherente y la identidad del par se demuestra por igualdad de hashes, no por coincidencia con cifras históricas.
- Nota sobre timestamps: la evidencia C2 (FINAL-REPORT §5.3) declaró restauración «a segundo»; LIVE muestra microsegundos idénticos al gemelo (`.136171`) → la restauración fue más fiel de lo documentado. Discrepancia documental a favor de la integridad, sin impacto.

## 5. Veredicto del documento

```text
0024c883 = snapshot (via gemelo certificado 6dd35833) → COINCIDE (wire byte-identical + canonical hash equal + metadata exacta)
```

**Sin BLOCKED.** El documento corresponde exactamente al snapshot previo disponible.
