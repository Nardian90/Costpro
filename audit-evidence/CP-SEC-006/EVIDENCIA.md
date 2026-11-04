# CP-SEC-006 — Evidencia de backlog de endpoints (T4)

Fecha: 2026-11-04. Solo lectura (verificador estático + git log + grep). Sin secretos.

## 1. Verificador re-ejecutado (T4.1)

`node scripts/ci-gate-ts-checks.js` → **0 hallazgos** (salida completa en
`verificador-20261104.txt`, exit 0):
- Check 4 (Zod en mutaciones): ✅ 0 endpoints sin Zod.
- Check 5 (auth middleware en mutaciones): ✅ 0 endpoints sin auth.

Comparación con el backlog de agosto (2026-08-02): 48 sin Zod / 18 sin auth / 52
endpoints (5 Alta, 21 Media, 26 Baja) → **hoy 0/0/0**. El backlog estaba completamente
obsoleto (las correcciones llegaron con `a4682b20b` 2026-10-09 "contratos Zod en
endpoints de mutación + gate de seguridad" y oleadas posteriores).

## 2. Alta: 5/5 retiradas con evidencia (T4.2)

| Endpoint | Commit | Prueba citada |
|---|---|---|
| stores/[id]/backup/restore | a4682b20b | backup-service.test.ts |
| stores/[id]/archive | a4682b20b + 13fc8e5a0 (CSRF) | commit-rollback-store-access.test.ts |
| stores/[id]/restore | a4682b20b + 13fc8e5a0 | ídem; ruta sin cuerpo (heurística REM-COSTPRO4-CI) |
| catalog/bulk-import | 34fbaecbe + 8d1f64ef3 | catalog-bulk-import-validation.test.ts |
| exchange-rates/bulk-upload | a4682b20b + 67f43a76f | exchange-rates-bulk-upload.test.ts |

## 3. Media: 21/21 ya corregidas en código (T4.3)

Ninguna requería cambios: todas tienen auth + validación (tabla completa con commits y
pruebas en docs/SECURITY_CI_GATE_FINDINGS_BACKLOG.md §3). Casos especiales documentados:
- `payments/[id]`: DELETE sin parseo de cuerpo → Zod no aplica (heurística documentada
  del verificador: solo se exige Zod cuando el endpoint consume body).
- `stores/[id]/restore`: solo path param → ídem.
- `cash-report/export` (entrada 26 del backlog original): ruta ELIMINADA del repo —
  nada que endurecer; retirada por eliminación previa del módulo.
- `inventory/ocr-receipt` y `store-rates` (antes sin auth): endurecidos por
  a3789fc31 (2026-09-27) con tests dedicados (sec-ts-02-*).
Por esto NO aplica "un commit por endpoint" en este PR: no hubo correcciones que hacer;
la remoción se documenta endpoint por endpoint con su commit histórico y prueba.

## 4. Baja: 26/26 resueltas o eliminadas

- Módulos ELIMINADOS del repo: academy/* (3), pick3/* (6), wallet/* (4).
- Restantes con auth+Zod o auth+webhook-signature verificadas hoy por grep de catálogo:
  ai/chat (botChatSchema), bot/chat (getServerSession + botChatSchema + CSRF +
  rate-limit), exchange-rates/* (refresh sin cuerpo), legal/incidents, logs,
  telegram/invitations/import, telegram/webhook (firma), usage/alerts, usage/flush
  (sin cuerpo), whatsapp/connect, whatsapp/disconnect.

## 5. Regla de compatibilidad (D4.2)

- `z.string().uuid()` en src/app/api: **0 ocurrencias** [MEDIDO]. El helper sustituto
  (uuidLoose/uuidRegex, CP-SEC-019) en uso (p. ej. telegram/*).

## 6. Anti-desincronización (T4.4)

Paso nuevo en el job `quality` de `.github/workflows/ci.yml`:
`node scripts/ci-gate-ts-checks.js` — rompe el CI si cualquier endpoint de mutación
pierde Zod/auth, aunque el backlog diga 0. Sin credenciales (estático).

## 7. Regla de remoción (queda escrita en el backlog §5)

Tres evidencias obligatorias: verificador en verde + commit de corrección citado +
prueba que cubre. Sin las tres, el endpoint permanece listado.
