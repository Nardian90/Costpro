# W7-00 — BASELINE INTEGRITY (FASE 0)

Fecha: 2026-08-30 · Modo: SOLO LECTURA · Ejecutado al inicio de W7 MIGRATION READINESS REVIEW.

Ningún valor heredado del checkpoint W6.2 fue aceptado sin re-verificación en disco. Resultados:

## 1. Git

| Check | Esperado | Observado | Resultado |
|---|---|---|---|
| HEAD | b7b9decbb9ca57532cbf5a2de3e3d97c1d4f9c84 | idéntico | PASS |
| origin/main | b7b9decbb9ca57532cbf5a2de3e3d97c1d4f9c84 | idéntico | PASS |
| working tree | limpio | `git status --porcelain` = 0 líneas | PASS |
| tag W6 harness parity | audit-w6-harness-parity-20260828 | presente | PASS |
| tag W6.1 decision gate | wac-w6.1-decision-gate-20260828 | presente | PASS |
| commits recientes | b7b9dec (merge PR #1320) | b7b9dec ← 408757d ← 1dd3e6c ← b125152 ← f628e5e | PASS |

## 2. SHA256 de evidencia

| Artefacto | Esperado | Observado | Resultado |
|---|---|---|---|
| Manifest W6 (`audit-evidence/20260828/SHA256SUMS`) | 237/237 OK | 237 OK, 0 fallos | PASS |
| Manifest W6.1 (`audit-evidence/20260828-w6.1/SHA256SUMS`) | 9/9 OK | 9 OK, 0 fallos | PASS |
| Snapshot v6 producción (`production-schema-snapshot-20260828.sql`) | 351efa11be5f7f2962aa81dcd80385e7b1138ef417726d250c832613f295f3af | EXACT MATCH | PASS |
| Paquete W6.2 (`w62-remediation/SHA256SUMS`) | consistencia interna | 14/14 OK (`sha256sum -c` exit 0) | PASS |

## 3. Harness

| Check | Esperado | Observado | Resultado |
|---|---|---|---|
| PostgreSQL | 17.x local :5433 | PostgreSQL 17.11 (Debian 17.11-0+deb13u1), puerto 5433 LISTEN (pid 2826) | PASS |
| Bases existentes | v2 + v3 | `costpro_audit_v2` (20 MB), `costpro_audit_v3` (19 MB), `postgres` | PASS |
| Fingerprint binario | psql 17 en harness/client | presente y operativo | PASS |

## 4. S1(v2) vs baseline producción — RE-EJECUTADO

- Script: `scripts/fp-run-w62.js` (derivado byte-documentado de `fp-run.js` congelado; única diferencia `-d costpro_audit_v2`).
- Fingerprint SQL: `audit-evidence/20260828/scripts/fingerprint.sql` (19 stmts, sin comentarios).
- Ejecución fresca: `w7-readiness/tmp/s1-fresh-v2.txt` → **10.753 líneas F** (orden canónico).
- Baseline producción congelada: `audit-evidence/20260828/download/auditoria-multitienda/RECOVERY-20260828/PRODUCTION-SCHEMA-SNAPSHOT/fingerprint/prod-fingerprint.txt` (10.753 líneas).

```text
diff prod-fingerprint.txt s1-fresh-v2.txt  →  DIFF = 0 líneas
SHA256(s1-fresh-v2.txt)  = 9e7cea9a596de6f4aa96c353cdd4f743f574958767f211a21c8857c5cf19edc2
SHA256(prod-fingerprint) = 9e7cea9a596de6f4aa96c353cdd4f743f574958767f211a21c8857c5cf19edc2
```

**S1 DIFF = 0 — byte-idéntico.** La comparación se hizo contra el artefacto congelado de producción;
no se abrió ninguna conexión de escritura a producción.

## 5. Consistencia interna W6.2

| Check | Resultado |
|---|---|
| `W62-LAB-CHECKPOINT.md` | COMPLETADO; BASELINE-SHA 9e7cea9a…edc2 coincide con el S1 re-ejecutado hoy | PASS |
| `W62-22-S1-FINAL.txt` (749.247 B) | incluido en SHA256SUMS, verificado OK | PASS |
| `W62-23-S1-DIFF.txt` | vacío (0 bytes = DIFF 0), verificado OK | PASS |
| Paquetes `w62-remediation/sql/01..09` | 9 archivos presentes (01-df01 … 09-df04) | PASS |

## 6. Conclusión FASE 0

```text
GATE BASELINE = PASS
```

Ningún desvío. Autorizado a continuar a FASE 1 (auditoría de los 9 paquetes, sin ejecutar).

Evidencia generada esta fase (fuera de Git):
- `w7-readiness/tmp/s1-fresh-v2.txt` (S1 fresco, SHA 9e7cea9a…edc2)
- `w7-readiness/tmp/s1-fresh-vs-prod.diff` (0 líneas)
