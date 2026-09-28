# PRE-F5 — 02 F3 + F4 ANCESTRY (GATE 5, 10, 11)

Fecha: 2026-09-29 · Rama de trabajo: `main` local (estado integrado, pre-push)
Principio: NO squash, NO rebase, NO force — commits certificados preservados byte a byte.

---

## 1. Topología integrada resultante

```text
$ git log --oneline --decorate --graph -8
* e45efb62 (HEAD -> main) Merge F4 certified (55b39920): information architecture, navigation and nomenclature
* 9a534d96 Merge F3 certified (60dd04ac): interaction states, overlays and feedback
* | 55b39920 (origin/audit/f4-information-architecture) feat(ui): F4 information architecture — context, navigation consistency and nomenclature
* | 60dd04ac (origin/audit/f3-states-overlays-feedback) feat(ui): certify F3 interaction states and overlays
* | 09ef9e97 (tag: backup/pre-f5-main-09ef9e97, origin/main) Merge pull request #1331 (security/sec-ts-05-purge-snapshots)
* | ff307220 fix(security): fail closed purge snapshots cron auth
* | a63d4fe9 Merge pull request #1330 (security/sec-ts-04-real-residuals)
* | 41c2d539 fix(security): harden remaining import endpoint
|/
* 3af2ea5c Merge pull request #1329 (audit/f2-design-system-hierarchy)
```

## 2. Relación F3 → F4 preservada

```text
$ git merge-base --is-ancestor 60dd04ac 55b39920 → PASS (pre-existente: F4 fue cortado del tip de F3)
$ git merge-base --is-ancestor 60dd04ac HEAD     → PASS (post-integración)
$ git merge-base --is-ancestor 55b39920 HEAD     → PASS (post-integración)
```

La cadena de ancestros `3af2ea5c → 60dd04ac → 55b39920` queda intacta dentro de `main`:
F4 continúa conteniendo a F3, y ambos contienen la base común con `main`.

## 3. Commits de seguridad de main preservados (GATE 11.1)

```text
$ git merge-base --is-ancestor 09ef9e97 HEAD  → PASS  (tip de main previo, PR #1331)
$ git merge-base --is-ancestor a63d4fe9 HEAD  → PASS  (PR #1330)
$ git merge-base --is-ancestor 41c2d539 HEAD  → PASS  (fix(security): harden remaining import endpoint)
$ git merge-base --is-ancestor ff307220 HEAD  → PASS  (fix(security): fail closed purge snapshots cron auth)
$ git merge-base --is-ancestor f3a6e0aa HEAD  → PASS  (F2 visual hierarchy, PR #1329)
$ git merge-base --is-ancestor 8a15c55c HEAD  → PASS  (F1 mobile-first)
```

### Diferencia de archivos de seguridad: byte-idéntica

```text
$ git diff 09ef9e97 HEAD -- \
    src/app/api/cron/purge-snapshots/route.ts \
    src/app/api/wallet/import-trm/route.ts \
    src/validation/api-schemas.ts \
    src/__tests__/api/sec-ts-04-wallet-import-trm.test.ts \
    src/__tests__/api/sec-ts-05-purge-snapshots.test.ts
→ (salida VACÍA — los 5 archivos de seguridad NO fueron tocados por la integración)
```

Cadena completa de seguridad verificable en el historial de HEAD:
`8f3e2e43`(#1327) → `3c235768`(#1328) → `5e76b4db` → `a63d4fe9`(#1330) → `41c2d539` → `09ef9e97`(#1331) → `ff307220`,
más la herencia previa (`16cf6fcf`, `a3789fc3`, `a6cdfb38`, `8bccda80`, `0d660541`).

## 4. Estrategia ejecutada (GATE 8 y 10)

| Paso | Comando | Resultado |
|---|---|---|
| Merge F3 | `git merge --no-ff 60dd04ac` | exit 0, estrategia `ort`, **0 conflictos**, 22 archivos (+502/−42), merge commit `9a534d96` |
| Merge F4 | `git merge --no-ff 55b39920` | exit 0, estrategia `ort`, **0 conflictos**, 54 archivos (+1076/−104), merge commit `e45efb62` |

Los mensajes de merge documentan la operación PRE-F5 y su gate correspondiente.
Ningún conflicto apareció (predicción de NO OVERLAP de `00-INTEGRATION-BASELINE.md` confirmada).
