# 18_GIT — §25/§26/§27

## Verificaciones pre-commit (ejecutadas en vivo)
- git status → únicamente: migración nueva (untracked) + evidence pack de este gate (untracked)
- git diff → VACÍO (0 modificaciones en archivos rastreados; src/ INTACTO)
- git diff --cached → tras staging: exclusivamente migración + evidencia REM-F4-06c
- Ningún .env, credencial, build o dump en el scope (secret scan: 23_SECRET_SCAN, ALL OK)

## Commit (§26)
fix(fiscal): repair fiscal close RPC wiring and persistence

Contenido (scope exclusivo del gate):
- supabase/migrations/20260909000004_rem_f4_06c_fiscal_close_rpc_contract.sql
- audit-evidence/20260909-rem-f4-06c/ (19 documentos + raw/ + SHA256SUMS)

Hash exacto del commit: vía `git rev-parse HEAD` en el momento del push (no incrustado
aquí para evitar autorreferencia de hashes — §24).

## Push (§27)
- `git push origin main` ejecutado tras el commit, SIN force push, fast-forward esperado
  (base 5c6239e0).
- Credenciales: provistas por el operador en la sesión previa para el push del gate; usadas
  SOLO como helper efímero en memoria (nunca en disco, .git/config, evidencia ni logs);
  purgadas del entorno tras el uso.
- Verificación LOCAL == REMOTE: `git rev-parse HEAD` == `git rev-parse origin/main` ==
  `git ls-remote origin main`; worktree limpio (0 ahead / 0 behind).
- RESULTADO DEL PUSH Y HASHES: documentados en worklog.md (raíz del proyecto) y en el
  reporte final del gate — patrón §24 anti-autorreferencia (idéntico a REM-F4-06b).

## Criterio (§28)
- TECHNICAL PASS: requiere todos los criterios técnicos — ver 19_FINAL_VERDICT.
- ADMINISTRATIVE CLOSED: solo si HEAD == origin/main verificado post-push (resultado en
  worklog/reporte final). Si el push hubiese fallado por credenciales: TECHNICAL PASS /
  ADMINISTRATIVE PENDING, sin solicitar credenciales por chat (no aplica: se usó la
  credencial ya otorgada por el operador para este fin).
