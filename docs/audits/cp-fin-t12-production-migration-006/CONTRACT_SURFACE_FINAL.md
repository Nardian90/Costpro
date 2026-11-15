# CONTRACT_SURFACE_FINAL.md — CP-FIN-T12-PR-CLOSE-007

Fecha: 2026-11-16 · Fase: revisión de la retirada de la excepción temporal (§5 de la misión) · Modo: **solo lectura**

## Veredicto

**La excepción temporal `source_of_truth_baseline` → `fin_post_document_annulment/2` fue retirada EXCLUSIVAMENTE, la función viva de producción coincide con el contract-surface regenerado, y el test estático pasa SIN la excepción.**

## 1. La rama elimina exclusivamente esa entrada

Diff de `ci-gate-allowlist.json` en el PR #1630 (3 commits → 4 con el fix del gate): la única eliminación es el bloque:

```json
{
  "function": "fin_post_document_annulment/2",
  "rules": [ "BODY_DRIFT_FROM_MIGRATION" ],
  "reason": "PR #1628 (CP-FIN-FINAL-CLOSE-005 §5): migración 20261115100000 redefine fin_post_document_annulment con el guard T12 … CON AUTORIZACIÓN PENDIENTE …",
  "added_by": "CP-FIN-FINAL-CLOSE-005 (PR #1628) 2026-11-15",
  "expires": "2026-12-31"
}
```

La otra excepción preexistente (`create_devolution_v2/12`, PR #1616) **no se toca** — sigue íntegra con su razón y su expiración. La entrada AÑADIDA por el PR (fix del gate, ver `SQL_DB_GATE_FINAL_EVIDENCE.md`) pertenece a otra sección (`security_definer_without_auth_check`) y no afecta a `source_of_truth_baseline`.

## 2. La función viva de producción coincide con el contract-surface generado

- `supabase/security-contract/contract-surface.sql` regenerado **en vivo desde producción** (`wthkddeleylijmonclxg`, «Captured: 2026-11-15T12:32:57.610Z») — contiene el cuerpo T12 del motor (`v_residual`, rama `ERR_PARTIAL_REVERSAL_PENDING`) exactamente como la migración aprobada.
- Re-verificación independiente de esta misión (m057, 26/26 PASS, `pr1630-premerge-evidence.json`):
  - C2: hash del cuerpo vivo de `fin_post_document_annulment(text, uuid)` = cuerpo de la migración aprobada `20261115100000`.
  - B2: hash del cuerpo vivo de `fin_entry_reversal_residual(uuid)` = cuerpo de la migración aprobada.
  - D2: hash del cuerpo vivo de la función trigger T12 = código aprobado.
- Misión 006 (m056): 22/22 PASS — misma conclusión inmediatamente tras la aplicación.

## 3. El test estático pasa SIN la excepción

`node scripts/security-contract-test-static.cjs` sobre la rama del PR (sin la excepción):

```
── Capa C — reconciliación source-of-truth (REM-INV-6): 208 funciones del surface
Representadas en migraciones: 208/208
Divergencias source-of-truth (bloqueantes): 0
⚠️ CONTRATO OK con 2 warning(s) MEDIUM/LOW (semántica idéntica al contract LIVE)
```

Los 2 warnings (`cancel_transfer/2` vs `/3`, `reset_store_data/2` vs `/3`) son **preexistentes en main** (verificados por contraste: main produce el mismo resultado con la excepción presente) y no guardan relación con el cambio del PR.

## 4. Sin otros consumidores de la excepción

Búsqueda en todo el repo: el único consumidor de la clave `source_of_truth_baseline` es `scripts/security-contract-test-static.cjs` (Capa C). Las menciones restantes son comentarios documentales en migraciones históricas. Ninguna otra maquinaria depende de la entrada retirada.

## 5. Integridad del archivo de allowlist

- JSON global válido tras ambas ediciones (retirada + adición).
- `sha256sum -c SHA256SUMS.txt` del expediente 006: **todas las entradas OK**, incluida la propia `ci-gate-allowlist.json` y `contract-surface.sql` (los archivos del PR no fueron modificados después de generar el manifiesto, salvo la allowlist en el fix del gate — el manifiesto se actualiza en el commit correspondiente; ver SHA256SUMS.txt).

## 6. Nota de frescura post-tercero (transparencia)

Después de capturarse el surface (12:32Z), la misión ajena **CP-VALUATION-NOMINAL-ACTIVATION-004** aplicó a producción dos migraciones propias (13:02Z, `20261115120000`/`20261115120100`, PR #1631). El surface de ESTA rama certifica el estado vivido por las migraciones del árbol de `main` (208 funciones, T12 incluida); las funciones de esas dos migraciones están siendo re-certificadas por su propio PR. Este desfase se documenta aquí por transparencia: no afecta a las funciones T12 ni a los invariantes financieros (re-verificados intactos hoy por m057: 26/26 PASS).
