# AUDIT-CHECKPOINT-20260828 — W6 Harness Parity Recovery Checkpoint

> **Naturaleza del commit: exclusivamente AUDIT / RECOVERY CHECKPOINT.**
> No contiene cambios funcionales, no modifica código de aplicación, no mezcla
> correcciones W6.1, no altera producción. Preserva la cadena de evidencia contra
> pérdida del sandbox efímero.

## 1. Repository

```text
repo:              https://github.com/Nardian90/Costpro
branch:            audit/w6-harness-parity-checkpoint-20260828
base_commit:       522a519e8d12499121df8e232731c7674ed1c002  (main)
base_tree_sha:     65713395c1a88cf5a2e2a39cccda453d2ff38312  (≡ lote auditado e9f466b1)
checkpoint_commit: (ver CHECKPOINT-COMMIT-RECORD.md en el commit siguiente + tag
                    audit-w6-harness-parity-20260828 + worklog; un commit no puede
                    contener su propio SHA — imposibilidad auto-referencial documentada)
checkpoint_tree:   (ídem; verificable con git rev-parse HEAD^{tree} sobre la rama)
```

Base verificado: `git merge-base --is-ancestor e9f466b1 522a519e` = TRUE y
`diff e9f466b1..522a519e` vacío → la rama parte del estado auditado exacto.

## 2. Evidence (tabla resumen — detalle íntegro en CHECKPOINT-INVENTORY-20260828.txt y SHA256SUMS)

| Artifact | SHA-256 | Provenance | Included |
| -------- | ------- | ---------- | -------- |
| RECONSTRUCTED-W6/ (59–67 + manifiesto, 10 archivos) | ver SHA256SUMS | RECONSTRUCTED | YES |
| RECOVERY-20260828/68-recovery-state-report.md | ver SHA256SUMS | GENERATED | YES |
| RECOVERY-20260828/69-custom-db-not-costpro-marker.md | ver SHA256SUMS | GENERATED | YES |
| RECOVERY-20260828/70-gate-parity-fail-stop.md | ver SHA256SUMS | GENERATED | YES |
| RECOVERY-20260828/71-production-schema-snapshot-manifest.md | 66a92bc1f10695d3766d5349b6186e71b5d8b7350cee52e6bedb8e44e5e329a7 | GENERATED | YES |
| RECOVERY-20260828/72-rharness-02-parity-gate-verdict.md | 9861d3ecaff715f9d71950a64060fd6a6f45da3648f80297e4d94a38ff9609f5 | GENERATED | YES |
| RECOVERY-20260828/PRODUCTION-SCHEMA-SNAPSHOT/ (snapshot + raw + queries log) | snapshot.sql = 351efa11be5f7f2962aa81dcd80385e7b1138ef417726d250c832613f295f3af | GENERATED (PRODUCTION-SCHEMA-SNAPSHOT-RECOVERY) | YES |
| R-HARNESS-02/ (fingerprint + replay + SHA256SUMS) | s1-vs-prod.diff = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 (vacío ≡ DIFF=0) | GENERATED | YES |
| scripts/ (extracción, carga, fingerprint, replay, inventario) | ver SHA256SUMS | GENERATED | YES |
| harness-logs/ (migration-ledger v1/v3 + errors v1/v3) | ver SHA256SUMS | GENERATED | YES |
| worklog.md (registro de sesión multi-agente) | ver SHA256SUMS | GENERATED | YES |
| CHECKPOINT-INVENTORY-20260828.txt (6.261 archivos censados) | ver SHA256SUMS | GENERATED | YES |
| .env (credenciales del dueño) | hash registrado en inventario §4 | ORIGINAL | **NO — SECRETO, jamás se commitea** |
| harness/pg (cluster 125 MB) | n/a | GENERATED | NO — reconstruible (snapshot DDL + shims + migraciones) |
| harness/client + harness/debs (91 MB) | n/a | GENERATED | NO — reproducibles (apt-get download postgresql-17) |
| harness/logs/pg.log | n/a | GENERATED | NO — runtime; outcomes en ledgers incluidos |
| WAC-DATAFLOW/ · W6-CANONICAL-DESIGN/ · DEFECT-REGISTER* | n/a | LOST (reinicio previo) | NOT-FOUND — historia forense; sustancia dentro de 59–67 |

## 3. Harness

```text
database:               costpro_audit_v2  (espejo exacto de producción; baselines: v1 virgen, v3 post-replay)
host:                   127.0.0.1 (loopback ONLY, aislado)
port:                   5433
postgres_version:       17.11 (Debian 17.11-0+deb13u1)  [prod: 17.6.1.063 — DEV-MINOR-VERSION-DEVIATION declarada]
snapshot_version:       production-schema-snapshot-20260828.sql (SHA-256 351efa11…f3af, congelado e inmutable)
fingerprint_dimensions: 15 (huella canónica S1 del catálogo)
fingerprint_result:     S1 DIFF = 0 → costpro_audit_v2 ≡ producción en las 15 dimensiones
migration_replay:       369 procesadas → 199 OK · 88 ERR (clasificados) · 10 SKIP
                        (v2 NO fue mutado por el replay; el replay se ejecutó sobre copia v3)
```

DEV-MINOR-VERSION-DEVIATION: objetivo histórico PostgreSQL 17.6 vs harness 17.11.
Estado: declarada, no disimulada. La huella exacta S1=0 demuestra que las dimensiones
comparadas no se ven afectadas; el análisis de release-notes 17.6→17.11 queda como
condición previa a cualquier certificación. No se representa 17.11 como 17.6.

## 4. Production

```text
Production mutation performed:    NO
Production data modified:         NO
Production schema modified:       NO
Production credentials changed:   NO
```

Únicas operaciones contra producción en toda la fase: SELECT de catálogo READ-ONLY
vía Management API (121 respuestas pristine, cada SQL registrado en
extraction-queries.log). Extracción schema-only: cero filas de negocio.

## 5. Provenance — declaración inequívoca

Los documentos de `RECONSTRUCTED-W6/` (59–67 + manifiesto de reconstrucción) fueron
**reconstruidos a partir de la transcripción de la sesión anterior** tras la pérdida
del sandbox. **NO son archivos originales recuperados**: son artefactos
`RECONSTRUCTED` con procedencia explícita (`RECONSTRUCTED-FROM-TRANSCRIPT` en cada
archivo + `00-RECONSTRUCTION-MANIFEST.md` con SHA-256 congelados). Ningún documento
reconstruido debe citarse como original.

El snapshot de producción es un artefacto **`PRODUCTION-SCHEMA-SNAPSHOT-RECOVERY`**
de fecha 20260828 con SHA-256 independiente. **NO equivale** al harness original ni
al baseline W0 (ambos: LOST, preservados como historia forense, no maquillados).

Fragmentos irrecuperables: marcados `INCONCLUSIVE/BLOCKED`; nunca inferidos.
La pérdida documentada en `68-recovery-state-report.md` se conserva como historia
forense; nada fue recreado simulando originalidad.

## 6. Regla de recuperación futura (desde este commit)

```text
1. git status                    → árbol limpio
2. git rev-parse HEAD            → igual al checkpoint_commit registrado
3. verificar checkpoint          → tag audit-w6-harness-parity-20260828
4. verificar manifest SHA        → sha256sum -c audit-evidence/20260828/SHA256SUMS
5. verificar harness             → pg_isready 127.0.0.1:5433 + S1 DIFF = 0
6. verificar producción READ-ONLY→ declaraciones §4 intactas
7. continuar                     → solo entonces A–F
```

Nunca asumir que el sandbox conserva el estado.
