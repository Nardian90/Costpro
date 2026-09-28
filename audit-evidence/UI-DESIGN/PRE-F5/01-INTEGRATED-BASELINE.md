# PRE-F5 — 01 INTEGRATED BASELINE (estado integrado F3+F4)

Fecha: 2026-09-29
Estado integrado local (pre-push): `e45efb62` (HEAD -> main)

---

## SHAs de la operación

| Rol | SHA | Notas |
|---|---|---|
| main antes (remoto, verificado) | `09ef9e979699e886aafdf6c148bb00f7593d38d5` | tip real de origin/main al iniciar (NO el `a63d4fe9` observado previamente) |
| F3 certificado (remoto, verificado) | `60dd04acdcbb41d00c41e1b4067f557b1d475a0f` | MATCH con lo esperado por la tarea |
| F4 certificado (remoto, verificado) | `55b399202684e7d3dd148f74883b0c6b31856472` | MATCH con lo esperado por la tarea |
| **Merge F3 en main** | `9a534d96` | `git merge --no-ff 60dd04ac` — 0 conflictos, 22 archivos +502/−42 |
| **Merge F4 en main** | `e45efb62` | `git merge --no-ff 55b39920` — 0 conflictos, 54 archivos +1076/−104 |
| Tag de recuperación pre-integración | `backup/pre-f5-main-09ef9e97` | apunta a `09ef9e97` (GATE 3) |

## Composición del main integrado

```text
main(e45efb62) =
  main previo (09ef9e97: PRs de seguridad #1330 + #1331)
  + F3 (60dd04ac, vía merge commit 9a534d96)
  + F4 (55b39920, vía merge commit e45efb62; F4 contiene F3 por construcción)
```

Verificaciones de composición:

```text
$ git merge-base --is-ancestor 09ef9e97 HEAD → PASS
$ git merge-base --is-ancestor 60dd04ac HEAD → PASS
$ git merge-base --is-ancestor 55b39920 HEAD → PASS
$ git status           → limpio (solo evidencia PRE-F5 untracked al momento)
$ git diff --check     → CLEAN
```

## Archivos afectados por la integración (delta total contra main previo)

```text
$ git diff 09ef9e97 e45efb62 --stat | tail -3
 76 files changed (22 de F3; 54 de F4 incl. evidencia y 28 PNG; 0 de main — seguridad intacta)
```

Intersección con archivos de seguridad de main: **VACÍA**
(ver 00-INTEGRATION-BASELINE.md §GATE 6 y 02-F3-F4-ANCESTRY.md §3).

## Validación resumida (detalle en 03-INTEGRATION-VALIDATION.md)

- tsc 0 errores · eslint 0 errores · vitest 2387/0 · smoke en vivo F1/F2/F3/F4 PASS.
- build local: limitación de infraestructura (exit 137 ×4, documentada con precedentes
  REM-V2-1/2/3); veredicto de build delegado al CI del PR de integración.
