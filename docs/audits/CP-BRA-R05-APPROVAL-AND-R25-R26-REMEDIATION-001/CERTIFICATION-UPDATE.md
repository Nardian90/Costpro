# CERTIFICATION-UPDATE — Elevación de certificación tras R-05 + R-25/R-26 (2026-11-27)

**Misión:** CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001 · **Estándar:** CP-BRA-001 (CERTIFICATION-POLICY.md §2)

---

## 1. Estado previo (heredado de CP-BRA-INV005-FIN011-CLOSURE-001)

- FIN-011: VERIFICADA — elevación BLOQUEADA por 2 defectos críticos abiertos en el alcance (R-25/R-26).
- INV-005 (R-05): RECHAZADA-pendiente de decisión del propietario (remediación preparada en PR #1723).
- Sello global: CONDICIONADO. Condiciones de cierre definidas: (1) decisión R-05 + implementación; (2) remediar F011-001/F011-002 con pins actualizados; (3) opcionales del propietario.

## 2. Ejecución de las condiciones (2026-11-27)

| Condición | Ejecución | Evidencia |
|---|---|---|
| (1) R-05 aprobado + implementado | Alternativa A APROBADA (misión §0.1) → revisión final §2.1 conforme → **PR #1723 FUSIONADO** (`819c0adca`) → **aplicación productiva §11g** (script gobernado, doble flag, 11/11 marcas, NOTIFY pgrst) → verificación productiva read-only (§2.4: caso histórico encargado compatible, 0 pendientes, ACL correcta) → surface re-certificado + allowlist retirada | R05-APPROVAL-AND-DEPLOY.md §2–4 |
| (2) R-25/R-26 remediar + pins | **PR #1728 FUSIONADO** (`8c3dbf815`): vías single de pagos OT vía cliente administrativo tras gate canManageStore (3 rutas; gates añadidos donde faltaban); batería API real 16/16 · **PR #1729 FUSIONADO** (`c9350fb421`): migración 20261127120000 (neteo de contra-filas en el pre-check del batch con el CASE del motor single); batería §4.4 A–H 11/11 · **pines N6/N7 → regresiones positivas** (negativos conservados) · suite FIN-011 16/16 | R25-R26-REMEDIATION.md §1–3 |
| (3) Re-ejecución verde del smoke set | CI de #1728: 7/7 success · CI de #1729: 9/9 success — incl. `E2E Aislado (project)` con fin011 en el smoke set | Runs de CI 2026-11-27 |

**Despliegue productivo de R-26 (§11g):** PRE body `c4fd6cc7` (idéntico al defecto de la aislada — sin drift) → aplicación UNA vez → 6/6 marcas POST → NOTIFY pgrst → POST body **`9ab5db94537d7152e9b38ffebd191558`** idéntico al de la aislada → histórico intacto (1 contra-fila, 4.415 fin_entries) → surface re-certificado (`d5975f5f…`) → ambas entradas allowlist retiradas.

## 3. Estados resultantes (política §2: «CERTIFICADO — no hay defectos críticos abiertos en el alcance»)

| Regla | Antes | Después | Fundamento |
|---|---|---|---|
| **FIN-011** | VERIFICADA | **CERTIFICADA** | Camino de elevación §1 de CERTIFICATION-UPDATE anterior EJECUTADO: E2E dedicado 16/16 + R-25/R-26 resueltos con evidencia de producción + smoke verde |
| **INV-005 (R-05)** | RECHAZADA-pendiente | **CERTIFICADA** | Aprobación expresa + fusión + despliegue gobernado + verificación productiva |
| **FIN-002** | CERTIFICADA | **CERTIFICADA consolidada** | Una sola fórmula de saldo pendiente (motor single = batch = trigger); canales alineados al patrón canónico |
| **RISK-REGISTER** | 3 críticos abiertos (R-05, R-25, R-26) | **0 críticos abiertos** | Los tres RESUELTOS con evidencia |

**Sello global: `COSTPRO — BUSINESS RULES COMPLIANCE: CERTIFIED`** (alcance: 16 reglas críticas + invariantes del alcance auditado; exclusiones en el encabezado de CERTIFICATION-MATRIX.md). Las decisiones reservadas al propietario (R-06 rol, R-11 tope POS, R-15 UNIQUE, identidad de proveedor de las recepciones «—», atomicidad multi-fila de pagos OT) son POLÍTICAS OPCIONALES, no defectos, y NO bloquean el sello según las condiciones documentadas.

## 4. Regresión general de cierre (2026-11-27)

Vitest 5.335 PASS / 0 FAIL (5 chunks) · ESLint 0 errores · ci-gate PASS · check-writers OK · security-contract 0 divergencias · replay MATCH (220) · guardrail net-zero ×3 (R-25, R-26, fin011 teardown) · PM2 online + /api/health 200 con .env principal.
